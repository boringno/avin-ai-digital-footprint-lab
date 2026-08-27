import type { ClinicConfig } from "@/lib/clinic-config";

/**
 * Clinic-owned ontology relationship used by both semantic routing and fact
 * hydration. Keeping it in the clinic-facts domain prevents either layer from
 * becoming the authority for which treatment can address a need.
 */
export function treatmentSupportsConcern(
  clinic: ClinicConfig,
  treatmentKey: string,
  concernKey: string,
) {
  const treatment = clinic.treatmentList.find((item) => item.key === treatmentKey);
  const concern = clinic.concernList.find((item) => item.key === concernKey);
  return Boolean(
    treatment?.consultationGuide?.concernReplies?.some((item) => item.concernKey === concernKey) ||
    concern?.recommendedTreatmentKeys.includes(treatmentKey),
  );
}

export function treatmentSupportsArea(
  clinic: ClinicConfig,
  treatmentKey: string,
  areaKey: string,
) {
  return clinic.concernList.some((concern) =>
    concern.areaKeys.includes(areaKey as (typeof concern.areaKeys)[number]) &&
    treatmentSupportsConcern(clinic, treatmentKey, concern.key));
}

export function treatmentSupportsExplicitNeeds(
  clinic: ClinicConfig,
  treatmentKey: string,
  concernKeys: readonly string[],
  areaKeys: readonly string[],
) {
  return concernKeys.every((key) => treatmentSupportsConcern(clinic, treatmentKey, key)) &&
    areaKeys.every((key) => treatmentSupportsArea(clinic, treatmentKey, key));
}
