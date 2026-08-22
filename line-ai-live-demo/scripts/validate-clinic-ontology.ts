import { clinicOntology } from "@/lib/clinic-ontology";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

assert(clinicOntology.treatments.length === 42, "ontology must expose all 42 normalized treatment families");
assert(
  clinicOntology.treatments.some((treatment) => treatment.key === "phoenix_thermage" && treatment.name === "鳳凰電波"),
  "Phoenix Thermage must be part of the canonical treatment ontology",
);
assert(
  !clinicOntology.treatments.some((treatment) => treatment.key === "hydrafacial_elite" || treatment.name === "海菲秀"),
  "unavailable Hydrafacial Elite must not appear in the canonical treatment ontology",
);
for (const requiredKey of [
  "plt_growth_factor",
  "fat_dissolving_injection",
  "prp",
  "vivabella",
  "sculptra",
  "radiesse",
  "mounjaro",
  "dermapen4",
  "m22_ipl",
  "lumecca",
  "laser_toning",
  "clear_silk_laser",
  "fractional_laser",
  "miradry",
  "emfemme",
  "emface",
  "embody",
  "pelvic_floor_chair",
  "ilib",
  "coolsculpting",
]) {
  assert(
    clinicOntology.treatments.some((treatment) => treatment.key === requiredKey),
    `normalized clinic inventory is missing ${requiredKey}`,
  );
}
const packageOrDosePattern = /\d+\s*(?:u|c\.?c\.?|發|堂|瓶|支)/iu;
for (const treatment of clinicOntology.treatments) {
  assert(!packageOrDosePattern.test(treatment.name), `public treatment name must not contain SKU detail: ${treatment.name}`);
  for (const alias of treatment.aliases) {
    assert(!packageOrDosePattern.test(alias), `public treatment alias must not contain SKU detail: ${alias}`);
  }
}
assert(clinicOntology.concerns.length === 11, "ontology must expose all 11 configured concerns");
assert(clinicOntology.areas.some((area) => area.key === "arm" && area.keywords.includes("掰掰肉")), "arm aliases must be canonical");
assert(clinicOntology.areas.some((area) => area.key === "abdomen" && area.keywords.includes("小肚肚")), "abdomen aliases must be canonical");
assert(
  clinicOntology.concerns.find((concern) => concern.key === "local_contour")?.areaKeys.includes("abdomen"),
  "local contour must reference its canonical areas",
);
assert(
  clinicOntology.concerns.some((concern) => concern.key === "masseter_contour" && concern.keywords.includes("咀嚼肌")),
  "Botox masseter contour must be a canonical concern instead of a prompt-only option",
);
assert(
  clinicOntology.concerns.some((concern) => concern.key === "muscle_contour" && concern.areaKeys.includes("shoulder")),
  "Botox shoulder/calf contour must be canonical data",
);
assert(
  clinicOntology.concerns.some((concern) => concern.key === "localized_sweating" && concern.areaKeys.includes("armpit")),
  "Botox sweating concerns must be canonical data",
);

console.log("clinic ontology validation passed");
