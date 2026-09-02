import {
  clinicConfig,
  type ClinicConfig,
  type ConcernConfig,
  type TreatmentAreaConfig,
  type TreatmentConfig,
} from "@/lib/clinic-config";

export type ClinicOntology = {
  areas: TreatmentAreaConfig[];
  concerns: ConcernConfig[];
  treatments: Array<Pick<TreatmentConfig, "aliases" | "category" | "key" | "name" | "recognitionTerms">>;
};

function assertUniqueKeys(label: string, entries: Array<{ key: string }>) {
  const keys = entries.map((entry) => entry.key);
  if (new Set(keys).size !== keys.length) {
    throw new Error(`Clinic ontology contains duplicate ${label} keys`);
  }
}

export function buildClinicOntology(config: ClinicConfig): ClinicOntology {
  assertUniqueKeys("area", config.areaList);
  assertUniqueKeys("concern", config.concernList);
  assertUniqueKeys("treatment", config.treatmentList);

  const areaKeys = new Set(config.areaList.map((area) => area.key));
  const treatmentKeys = new Set(config.treatmentList.map((treatment) => treatment.key));

  for (const concern of config.concernList) {
    for (const areaKey of concern.areaKeys) {
      if (!areaKeys.has(areaKey)) {
        throw new Error(`Concern ${concern.key} references unknown area ${areaKey}`);
      }
    }
    for (const treatmentKey of concern.recommendedTreatmentKeys) {
      if (!treatmentKeys.has(treatmentKey)) {
        throw new Error(`Concern ${concern.key} references unknown treatment ${treatmentKey}`);
      }
    }
  }

  return {
    areas: config.areaList,
    concerns: config.concernList,
    treatments: config.treatmentList.map(({ aliases, category, key, name, recognitionTerms }) => ({
      aliases,
      category,
      key,
      name,
      recognitionTerms,
    })),
  };
}

export const clinicOntology = buildClinicOntology(clinicConfig);
