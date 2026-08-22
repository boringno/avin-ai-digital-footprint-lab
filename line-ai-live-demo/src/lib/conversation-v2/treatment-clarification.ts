import { normalizeClinicText } from "@/lib/clinic-config";
import type { ClinicOntology } from "@/lib/clinic-ontology";
import { matchClinicOntology } from "@/lib/clinic-ontology-matcher";

import type { ClarificationNeed } from "./types";

const NON_CLARIFICATION_DOMAIN = /(?:分店|分館|館別|幾家|幾間|哪間|地址|營業|班表|醫師|停車|交通|聯絡|電話|客服|真人|人工|預約|約時間)/u;
const NEGATED_SUGGESTION = /(?:不要|不想|不考慮|不需要|不是|沒有要|沒要|排除|別)/u;

type FuzzyTreatmentCandidate = {
  distance: number;
  displayTerm: string;
  key: string;
  name: string;
};

function damerauLevenshtein(left: string, right: string) {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(columns).fill(0));
  for (let row = 0; row < rows; row += 1) matrix[row]![0] = row;
  for (let column = 0; column < columns; column += 1) matrix[0]![column] = column;

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row]![column] = Math.min(
        matrix[row - 1]![column]! + 1,
        matrix[row]![column - 1]! + 1,
        matrix[row - 1]![column - 1]! + cost,
      );
      if (
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        matrix[row]![column] = Math.min(
          matrix[row]![column]!,
          matrix[row - 2]![column - 2]! + cost,
        );
      }
    }
  }
  return matrix[left.length]![right.length]!;
}

function latinTokens(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").match(/[a-z0-9]+/giu) ?? [];
}

function latinTerms(value: string) {
  return latinTokens(value).filter((term) => term.length >= 4);
}

function displayTerm(source: string, treatmentName: string) {
  const latin = source.match(/[a-z0-9]+/iu)?.[0];
  if (!latin) return treatmentName;
  const canonical = latin.length <= 6 ? latin.toLocaleUpperCase("en-US") : latin;
  return normalizeClinicText(canonical) === normalizeClinicText(treatmentName)
    ? treatmentName
    : `${canonical}（${treatmentName}）`;
}

function fuzzyCandidates(message: string, ontology: ClinicOntology) {
  const tokens = latinTokens(message).filter((token) => token.length >= 3);
  if (tokens.length === 0) return [];

  const candidates = ontology.treatments.flatMap((treatment): FuzzyTreatmentCandidate[] => {
    let best: FuzzyTreatmentCandidate | undefined;
    for (const source of [treatment.name, ...treatment.aliases]) {
      for (const term of latinTerms(source)) {
        for (const token of tokens) {
          const distance = damerauLevenshtein(token, term);
          const maximumDistance = Math.max(token.length, term.length) >= 7 ? 2 : 1;
          if (distance === 0 || distance > maximumDistance) continue;
          if (distance / Math.max(token.length, term.length) > 0.25) continue;
          if (!best || distance < best.distance) {
            best = {
              distance,
              displayTerm: displayTerm(source, treatment.name),
              key: treatment.key,
              name: treatment.name,
            };
          }
        }
      }
    }
    return best ? [best] : [];
  });

  if (candidates.length === 0) return [];
  const bestDistance = Math.min(...candidates.map((candidate) => candidate.distance));
  return candidates
    .filter((candidate) => candidate.distance === bestDistance)
    .sort((left, right) => left.name.localeCompare(right.name, "zh-Hant"))
    .slice(0, 3);
}

/**
 * Suggests only a bounded, clinic-ontology treatment correction. It never
 * chooses a treatment, changes canonical knowledge, or supplies clinic facts.
 * Exact ontology hits are handled by the normal semantic path; arbitrary
 * Chinese similarity and open-ended semantic guessing intentionally remain out
 * of scope so a typo hint cannot become a false medical recommendation.
 */
export function resolveTreatmentClarification(input: {
  message: string;
  ontology: ClinicOntology;
  questionKind: "content" | "price";
}): ClarificationNeed | undefined {
  if (NON_CLARIFICATION_DOMAIN.test(input.message) || NEGATED_SUGGESTION.test(input.message)) {
    return undefined;
  }
  const exact = matchClinicOntology(input.message, input.ontology);
  if (exact.treatments.length > 0 || exact.negated) return undefined;

  const candidates = fuzzyCandidates(input.message, input.ontology);
  if (candidates.length === 0 || candidates.length > 2) return undefined;
  const options = candidates.map((candidate, index) => ({
    entity: "treatment" as const,
    id: `fuzzy-treatment:${candidate.key}:${index + 1}`,
    label: candidate.displayTerm,
    value: candidate.key,
  }));
  const labels = options.map((option) => option.label);
  const prompt = input.questionKind === "price"
    ? candidates.length === 1
      ? `想確認一下，您是想問 ${labels[0]} 的價格嗎？請回覆「${labels[0]}價格」，我就接著查目前核准價格。`
      : `想確認一下，您是想問 ${labels.join("，還是 ")} 的價格呢？請回覆「療程名稱＋價格」。`
    : candidates.length === 1
      ? `想確認一下，您是想了解 ${labels[0]} 嗎？可以直接回覆「${labels[0]}」。`
      : `想確認一下，您是想了解 ${labels.join("，還是 ")} 呢？可以直接回覆療程名稱。`;

  return {
    allowMultiple: false,
    // Price clarification intentionally has no selectable option: replying
    // "ONDA價格" must re-enter deterministic pricing instead of being consumed
    // as a generic treatment selection. The prompt still provides the exact
    // customer action to take.
    options: input.questionKind === "price" ? [] : options,
    prompt,
    slot: "treatment",
  };
}
