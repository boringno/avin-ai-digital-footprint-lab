import { normalizeClinicText, type TreatmentAreaKey } from "@/lib/clinic-config";
import { clinicOntology, type ClinicOntology } from "@/lib/clinic-ontology";

const NEGATION_PATTERNS = [
  /不(?:想|要|考慮|需要|接受|打|做|用)/u,
  /不要/u,
  /不是(?:想|要|在)(?:問|了解|考慮|打|做|用)?/u,
  /別(?:打|做|用|推薦)/u,
  /排除/u,
] as const;

export type OntologyEntityMatch = {
  key: string;
  matchedTerms: string[];
};

export type OntologyMatchResult = {
  areas: OntologyEntityMatch[];
  concerns: OntologyEntityMatch[];
  fastPathEligible: boolean;
  negated: boolean;
  treatments: OntologyEntityMatch[];
};

function collectMatches(message: string, entries: Array<{ key: string; terms: string[] }>) {
  const normalizedMessage = normalizeClinicText(message);

  return entries.flatMap((entry) => {
    const matchedTerms = entry.terms
      .filter((term) => normalizedMessage.includes(normalizeClinicText(term)))
      .sort((left, right) => normalizeClinicText(right).length - normalizeClinicText(left).length)
      .filter((term, index, terms) => {
        const normalizedTerm = normalizeClinicText(term);
        return !terms.slice(0, index).some((longerTerm) => normalizeClinicText(longerTerm).includes(normalizedTerm));
      });

    return matchedTerms.length > 0 ? [{ key: entry.key, matchedTerms }] : [];
  });
}

function collectTreatmentMatches(
  message: string,
  entries: Array<{ key: string; terms: string[] }>,
) {
  const normalizedMessage = normalizeClinicText(message);
  const candidates = entries.flatMap((entry, entryIndex) =>
    entry.terms.flatMap((term) => {
      const normalizedTerm = normalizeClinicText(term);
      const start = normalizedMessage.indexOf(normalizedTerm);
      return normalizedTerm && start >= 0
        ? [{
            end: start + normalizedTerm.length,
            entryIndex,
            key: entry.key,
            matchedTerm: term,
            start,
          }]
        : [];
    }),
  );

  const strongestByKey = new Map<string, typeof candidates[number]>();
  for (const candidate of candidates) {
    const current = strongestByKey.get(candidate.key);
    if (!current || candidate.end - candidate.start > current.end - current.start) {
      strongestByKey.set(candidate.key, candidate);
    }
  }
  const strongest = [...strongestByKey.values()];
  const selected = strongest
    .filter((candidate, index) => !strongest.some((other, otherIndex) => {
      if (index === otherIndex) return false;
      const overlaps = candidate.start < other.end && other.start < candidate.end;
      if (!overlaps) return false;
      const candidateLength = candidate.end - candidate.start;
      const otherLength = other.end - other.start;
      return otherLength > candidateLength ||
        // When a generic family and a later, approved product entry share the
        // same alias, prefer the more specific catalog entry.
        (otherLength === candidateLength && other.entryIndex > candidate.entryIndex);
    }));

  return selected.map((candidate) => ({
    key: candidate.key,
    // Preserve every alias from the winning treatment that appears in the
    // message.  Semantic-anchor residual checks need both "dyspot" and
    // "肉毒" removed from "dyspot是什麼肉毒"; keeping only the longest alias
    // made a clearly grounded question look unresolved.
    matchedTerms: [...new Set(candidates
      .filter((item) => item.key === candidate.key)
      .sort((left, right) => (right.end - right.start) - (left.end - left.start))
      .map((item) => item.matchedTerm))],
  }));
}

export function matchClinicOntology(
  message: string,
  sourceOntology: ClinicOntology = clinicOntology,
): OntologyMatchResult {
  const normalizedMessage = normalizeClinicText(message);
  const areas = collectMatches(
    message,
    sourceOntology.areas.map((area) => ({ key: area.key, terms: [area.label, ...area.keywords] })),
  );
  const directConcerns = collectMatches(
    message,
    sourceOntology.concerns.map((concern) => ({ key: concern.key, terms: concern.keywords })),
  );
  const inferredConcernKeys = areas.flatMap((area) => {
    const candidates = sourceOntology.concerns.filter((concern) => concern.areaKeys.includes(area.key as TreatmentAreaKey));
    return candidates.length === 1 ? [candidates[0].key] : [];
  });
  const concernsByKey = new Map(directConcerns.map((concern) => [concern.key, concern]));
  for (const concernKey of inferredConcernKeys) {
    if (!concernsByKey.has(concernKey)) {
      concernsByKey.set(concernKey, { key: concernKey, matchedTerms: [] });
    }
  }
  const concerns = [...concernsByKey.values()];
  const treatments = collectTreatmentMatches(
    message,
    sourceOntology.treatments.map((treatment) => ({
      key: treatment.key,
      terms: [treatment.name, ...treatment.aliases, ...(treatment.recognitionTerms ?? [])],
    })),
  );
  const negated = NEGATION_PATTERNS.some((pattern) => pattern.test(normalizedMessage));
  const hasMultipleEntities = treatments.length > 1 || concerns.length > 1 || areas.length > 1;

  return {
    areas,
    concerns,
    fastPathEligible:
      Boolean(normalizedMessage) &&
      treatments.length + concerns.length + areas.length > 0 &&
      !negated &&
      !hasMultipleEntities,
    negated,
    treatments,
  };
}
