import { buildNluInstructions, parseNluFrame } from "@/lib/nlu-frame";

const valid = parseNluFrame({
  confidence: 0.94,
  concerns: [
    { area: "abdomen", key: "local_contour" },
    { area: "jawline", key: "jawline_looseness" },
  ],
  intents: ["treatment_consultation"],
  negated: [{ key: "botox", type: "treatment" }],
  safety: { complaint: false, humanRequest: false, postTreatmentRisk: false, pregnancyNursing: false },
  treatments: ["onda_pro"],
});
if (!valid || valid.concerns.length !== 2 || valid.negated[0]?.key !== "botox") throw new Error("valid multi-entity frame rejected");
if (parseNluFrame({ ...valid, treatments: ["invented"] }) !== null) throw new Error("unknown treatment accepted");
if (parseNluFrame({ ...valid, confidence: 2 }) !== null) throw new Error("invalid confidence accepted");

const instructions = buildNluInstructions();
if (!instructions.includes('"onda_pro"') || !instructions.includes('"abdomen"')) throw new Error("prompt is not generated from canonical ontology");
if (instructions.includes("12,999") || instructions.includes("16,888")) throw new Error("NLU prompt must not contain campaign facts");

console.log("NLU frame validation passed");
