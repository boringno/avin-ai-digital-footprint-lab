import { classifyBookingSpeechAct } from "@/lib/booking-speech-act";
import { buildTreatmentReplyAssets } from "@/lib/clinic-facts/treatment-reply-assets";
import {
  normalizeClinicText,
  type ClinicConfig,
} from "@/lib/clinic-config";
import type { ClinicOntology } from "@/lib/clinic-ontology";
import { matchClinicOntology } from "@/lib/clinic-ontology-matcher";
import type { DialogueSpeechAct } from "@/lib/dialogue-semantics";
import { isPriceInquiry } from "@/lib/pricing-subject";
import { isImmediateSafetyBoundaryMessage } from "@/lib/safety-preflight";

import type {
  ConversationV2State,
  DeterministicNegationGuard,
} from "./types";
import {
  hasNegativeIntentNominalComplement,
  isNegatedContentIntroPrefix,
  matchPositiveContentIntros,
} from "./content-intro";

const CONTENT_SPEECH_ACTS = new Set<DialogueSpeechAct>([
  "ask_concern",
  "ask_treatment_detail",
  "learn_treatment",
  "unknown",
]);
const CLINIC_INFO_TERMS = /(?:分店|分館|館別|幾家店|幾間店|哪間有|哪館有|哪裡有|地址|營業|班表|醫師|停車|交通|聯絡|電話|手機|客服)/u;
const REJECTION_PREDICATE_PATTERN = "(?:不要|不想(?:要)?|不考慮(?:選|選擇|要|做)?|不需要|不接受|不打算(?:選|選擇|要|做)?|不(?:會)?選(?:擇)?|不打|不做|不用|排除|別(?:打|做|用|推薦)?)";
const STRONG_NEGATION = new RegExp(REJECTION_PREDICATE_PATTERN, "u");
// `有沒有` and `是不是` are questions, not customer rejections. Negative
// look-behinds keep those yes/no forms out of the deterministic guard.
const FACTUAL_NEGATION = /(?:(?<!有)沒(?:有)?|(?<!有)無|並非|(?<!是)不是|(?<![是不])非)/u;
// Postfix rejection must be attached to the entity itself. Keep this narrower
// than generic factual wording: `ONDA 不是侵入式療程` and `ONDA 不用開刀`
// describe properties and must not exclude ONDA, while `ONDA 不是我想要的`
// and `ONDA 我不要` clearly reject it.
const POSTFIX_ENTITY_DESCRIPTOR = "(?:堆積|型|問題|困擾|部位|療程)?";
const POSTFIX_REJECTION_ADVERB = "(?:(?:也|就|真的|確實|肯定|一定|絕對))*";
const POSTFIX_STRONG_REJECTION = new RegExp(
  `^${POSTFIX_ENTITY_DESCRIPTOR}(?:我)?${POSTFIX_REJECTION_ADVERB}` +
  `${REJECTION_PREDICATE_PATTERN}(?:了|這個|這項|這種|它)?$`,
  "u",
);
const POSTFIX_FACTUAL_REJECTION = new RegExp(
  `^${POSTFIX_ENTITY_DESCRIPTOR}(?:(?:不是|並非)(?:我(?:想要|要|選擇)?的?|我的(?:困擾|問題)|想要的|要的)|` +
  "我(?:其實|也|真的)?(?:並沒有|並非|並不是|不是|沒有|沒|無)(?:這個|這項|這種)?)$",
  "u",
);
const QUESTION_END = /(?:嗎|呢|嘛|吧|[?？])\s*$/u;
const CLAUSE_BOUNDARIES = [
  "，",
  ",",
  "。",
  "！",
  "!",
  "？",
  "?",
  "、",
  "；",
  ";",
  "但是",
  "可是",
  "不過",
  "而是",
  "改成",
  "但",
] as const;

export type ResolveDeterministicNegationGuardInput = {
  candidateSpeechAct?: DialogueSpeechAct;
  clinic: ClinicConfig;
  message: string;
  ontology: ClinicOntology;
  state: ConversationV2State;
};

function unique(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function activeTreatmentKeys(state: ConversationV2State) {
  const subjectKey = state.activeTask.subjectKey;
  for (const prefix of ["treatment:", "comparison:"]) {
    if (subjectKey?.startsWith(prefix)) {
      return unique(subjectKey.slice(prefix.length).split("+"));
    }
  }
  return unique(state.knowledge.treatmentKeys);
}

/** Keeps clause punctuation while removing spacing and normalizing width/case. */
function compactCustomerText(text: string) {
  return text.normalize("NFKC").replace(/\s+/gu, "").trim().toLocaleLowerCase("en-US");
}

function hasClinicInfoWording(message: string, clinic: ClinicConfig) {
  const normalizedMessage = normalizeClinicText(message);
  return CLINIC_INFO_TERMS.test(normalizedMessage) || clinic.branches.some((branch) =>
    [branch.name, branch.city, ...branch.aliases]
      .map(normalizeClinicText)
      .filter(Boolean)
      .some((term) => normalizedMessage.includes(term)),
  );
}

function isContentDomain(input: ResolveDeterministicNegationGuardInput) {
  return input.state.control.mode === "ai_active" &&
    input.state.bookingTask.status !== "collecting" &&
    (!input.candidateSpeechAct || CONTENT_SPEECH_ACTS.has(input.candidateSpeechAct)) &&
    !isPriceInquiry(input.message) &&
    classifyBookingSpeechAct(input.message) === "none" &&
    !hasClinicInfoWording(input.message, input.clinic) &&
    !isImmediateSafetyBoundaryMessage(input.message);
}

function clauseBefore(message: string, index: number) {
  const prefix = message.slice(0, index);
  let boundaryIndex = -1;
  let boundaryLength = 0;
  for (const boundary of CLAUSE_BOUNDARIES) {
    const candidate = prefix.lastIndexOf(boundary);
    if (candidate > boundaryIndex) {
      boundaryIndex = candidate;
      boundaryLength = boundary.length;
    }
  }
  // Spoken LINE messages often omit punctuation between a negative/meta
  // self-description and a clear positive request. Treat only a non-negated
  // content-intro phrase as a soft clause boundary, so `我不想了解ONDA`
  // remains a rejection while `我沒有做過醫美想了解ONDA` keeps ONDA.
  for (const match of matchPositiveContentIntros(prefix)) {
    const candidate = match.index;
    if (candidate === undefined) continue;
    const beforeCandidate = prefix.slice(0, candidate);
    if (
      candidate > boundaryIndex &&
      !isNegatedContentIntroPrefix(beforeCandidate) &&
      !hasNegativeIntentNominalComplement(beforeCandidate)
    ) {
      boundaryIndex = candidate;
      boundaryLength = 0;
    }
  }
  return prefix.slice(boundaryIndex < 0 ? 0 : boundaryIndex + boundaryLength);
}

function clauseAfter(message: string, index: number) {
  const suffix = message.slice(index);
  let boundaryIndex = suffix.length;
  for (const boundary of CLAUSE_BOUNDARIES) {
    const candidate = suffix.indexOf(boundary);
    if (candidate >= 0 && candidate < boundaryIndex) {
      boundaryIndex = candidate;
    }
  }
  return suffix.slice(0, boundaryIndex);
}

function postfixExplicitlyRejectsEntity(suffix: string) {
  return POSTFIX_STRONG_REJECTION.test(suffix) || POSTFIX_FACTUAL_REJECTION.test(suffix);
}

function termIsExplicitlyNegated(message: string, term: string) {
  const normalizedMessage = compactCustomerText(message);
  const normalizedTerm = compactCustomerText(term);
  if (!normalizedTerm) return false;
  let from = 0;
  while (from <= normalizedMessage.length) {
    const index = normalizedMessage.indexOf(normalizedTerm, from);
    if (index < 0) return false;
    const prefix = clauseBefore(normalizedMessage, index);
    const suffix = clauseAfter(normalizedMessage, index + normalizedTerm.length);
    if (
      STRONG_NEGATION.test(prefix) ||
      (
        !QUESTION_END.test(normalizedMessage) &&
        (FACTUAL_NEGATION.test(prefix) || postfixExplicitlyRejectsEntity(suffix))
      )
    ) {
      return true;
    }
    from = index + normalizedTerm.length;
  }
  return false;
}

function negatedKeys(
  message: string,
  matches: readonly { key: string; matchedTerms: string[] }[],
) {
  return unique(matches.flatMap((match) =>
    match.matchedTerms.some((term) => termIsExplicitlyNegated(message, term))
      ? [match.key]
      : [],
  ));
}

function affirmedKeys(
  message: string,
  matches: readonly { key: string; matchedTerms: string[] }[],
) {
  return unique(matches.flatMap((match) =>
    match.matchedTerms.some((term) => !termIsExplicitlyNegated(message, term))
      ? [match.key]
      : [],
  ));
}

/**
 * Returns current-text negation evidence for treatment-content turns only.
 *
 * This is intentionally separate from the positive semantic anchor. A clear
 * negation with no resolvable entity still returns an empty guard so the NLU's
 * positive echo is discarded instead of becoming canonical conversation state.
 */
export function resolveDeterministicNegationGuard(
  input: ResolveDeterministicNegationGuardInput,
): DeterministicNegationGuard | undefined {
  if (!isContentDomain(input)) {
    return undefined;
  }

  const ontologyMatch = matchClinicOntology(input.message, input.ontology);
  const ontologyTerms = [
    ...ontologyMatch.areas.flatMap((item) => item.matchedTerms),
    ...ontologyMatch.concerns.flatMap((item) => item.matchedTerms),
    ...ontologyMatch.treatments.flatMap((item) => item.matchedTerms),
  ];
  const normalizedMessage = normalizeClinicText(input.message);
  const replyAssets = buildTreatmentReplyAssets(input.clinic);
  const approvedAssetTerms = replyAssets
    // Only terms explicitly tied to a concern are entity-like aliases. Generic
    // quick/detail terms such as `恢復期` describe a treatment property and must never make
    // `ONDA 不需要恢復期` look like rejection of either ONDA or a concern.
    .filter((asset) => asset.concernKey)
    .flatMap((asset) => asset.terms)
    .map(normalizeClinicText)
    .filter((term) => term && normalizedMessage.includes(term));
  const hasAttachedDomainNegation = unique([...ontologyTerms, ...approvedAssetTerms])
    .some((term) => termIsExplicitlyNegated(input.message, term));
  if (!hasAttachedDomainNegation) return undefined;

  const areaKeys = negatedKeys(input.message, ontologyMatch.areas);
  const concernKeys = negatedKeys(input.message, ontologyMatch.concerns);
  const treatmentKeys = negatedKeys(input.message, ontologyMatch.treatments);
  const affirmedAreaKeys = affirmedKeys(input.message, ontologyMatch.areas);
  const affirmedConcernKeys = affirmedKeys(input.message, ontologyMatch.concerns);
  const affirmedTreatmentKeys = affirmedKeys(input.message, ontologyMatch.treatments);

  const activeTreatments = new Set(activeTreatmentKeys(input.state));
  const activeConcerns = new Set(input.state.knowledge.concernKeys);
  for (const asset of replyAssets) {
    if (
      !asset.concernKey ||
      !activeTreatments.has(asset.treatmentKey) ||
      !activeConcerns.has(asset.concernKey) ||
      !asset.terms.some((term) => termIsExplicitlyNegated(input.message, term))
    ) {
      continue;
    }
    concernKeys.push(asset.concernKey);
  }

  // Some concerns are inferred from an exact area and therefore have no own
  // matched term. If that negated area maps to only one concern, retaining the
  // inferred concern as negated is deterministic as well.
  for (const concern of ontologyMatch.concerns) {
    if (
      concern.matchedTerms.length === 0 &&
      input.ontology.concerns
        .find((item) => item.key === concern.key)
        ?.areaKeys.some((key) => areaKeys.includes(key))
    ) {
      concernKeys.push(concern.key);
    }
  }

  return {
    affirmedAreaKeys,
    affirmedConcernKeys,
    affirmedTreatmentKeys,
    areaKeys: unique(areaKeys),
    concernKeys: unique(concernKeys),
    treatmentKeys: unique(treatmentKeys),
  };
}
