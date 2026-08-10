import { clinicOntology } from "@/lib/clinic-ontology";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

assert(clinicOntology.treatments.length === 18, "ontology must expose all 18 configured treatments");
assert(clinicOntology.concerns.length === 9, "ontology must expose all 9 configured concerns");
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

console.log("clinic ontology validation passed");
