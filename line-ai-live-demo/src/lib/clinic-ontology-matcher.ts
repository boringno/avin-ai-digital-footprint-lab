import { normalizeClinicText, type TreatmentAreaKey } from "@/lib/clinic-config";
import { clinicOntology } from "@/lib/clinic-ontology";

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

export function matchClinicOntology(message: string): OntologyMatchResult {
  const normalizedMessage = normalizeClinicText(message);
  const areas = collectMatches(
    message,
    clinicOntology.areas.map((area) => ({ key: area.key, terms: [area.label, ...area.keywords] })),
  );
  const directConcerns = collectMatches(
    message,
    clinicOntology.concerns.map((concern) => ({ key: concern.key, terms: concern.keywords })),
  );
  const inferredConcernKeys = areas.flatMap((area) => {
    const candidates = clinicOntology.concerns.filter((concern) => concern.areaKeys.includes(area.key as TreatmentAreaKey));
    return candidates.length === 1 ? [candidates[0].key] : [];
  });
  const concernsByKey = new Map(directConcerns.map((concern) => [concern.key, concern]));
  for (const concernKey of inferredConcernKeys) {
    if (!concernsByKey.has(concernKey)) {
      concernsByKey.set(concernKey, { key: concernKey, matchedTerms: [] });
    }
  }
  const concerns = [...concernsByKey.values()];
  const treatments = collectMatches(
    message,
    clinicOntology.treatments.map((treatment) => ({ key: treatment.key, terms: [treatment.name, ...treatment.aliases] })),
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
