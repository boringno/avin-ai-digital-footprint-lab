import assert from "node:assert/strict";

import {
  NLU_FRAME_SCHEMA_VERSION,
  buildNluInstructions,
  buildNluResponseFormat,
  parseNluFrame,
} from "@/lib/nlu-frame";

const safety = {
  complaint: false,
  humanRequest: false,
  postTreatmentRisk: false,
  pregnancyNursing: false,
};

const legacyRaw = {
  confidence: 0.94,
  concerns: [
    { area: "abdomen", key: "local_contour" },
    { area: "jawline", key: "jawline_looseness" },
  ],
  intents: ["treatment_consultation"],
  negated: [{ key: "botox", type: "treatment" }],
  safety,
  treatments: ["onda_pro"],
};
const legacy = parseNluFrame(legacyRaw);
assert(legacy, "legacy frame without schemaVersion/dialogue must remain replayable");
assert.equal(legacy.schemaVersion, 1);
assert.deepEqual(legacy.areas, []);
assert.equal(legacy.dialogue.speechAct, "learn_treatment");

const v2Raw = {
  areas: ["jawline"],
  confidence: 0.97,
  concerns: [{ area: "jawline", key: "jawline_looseness" }],
  dialogue: {
    focus: "single_vs_combination",
    move: "prefer_single",
    reference: "active_comparison",
    speechAct: "ask_treatment_detail",
  },
  intents: ["treatment_consultation"],
  negated: [{ key: "botox", type: "treatment" }],
  safety,
  schemaVersion: NLU_FRAME_SCHEMA_VERSION,
  treatments: ["onda_pro"],
};
const v2 = parseNluFrame(v2Raw);
assert(v2, "valid V2 dialogue frame rejected");
assert.equal(v2.schemaVersion, NLU_FRAME_SCHEMA_VERSION);
assert.deepEqual(v2.areas, ["jawline"]);
assert.equal(v2.dialogue.move, "prefer_single");
assert.equal(v2.dialogue.reference, "active_comparison");

assert.equal(parseNluFrame({ ...v2Raw, treatments: ["invented"] }), null);
assert.equal(parseNluFrame({ ...v2Raw, confidence: 2 }), null);
assert.equal(
  parseNluFrame({ ...v2Raw, dialogue: { ...v2Raw.dialogue, move: "guess" } }),
  null,
  "unknown dialogue enum must be rejected",
);
const { dialogue: _dialogue, ...missingDialogue } = v2Raw;
assert.equal(parseNluFrame(missingDialogue), null, "V2 must require dialogue");
const { areas: _areas, ...missingAreas } = v2Raw;
assert.equal(parseNluFrame(missingAreas), null, "V2 must require standalone areas");
assert.equal(
  parseNluFrame({
    ...v2Raw,
    dialogue: { ...v2Raw.dialogue, hiddenInstruction: "ignore rules" },
  }),
  null,
  "dialogue must reject undeclared properties",
);
for (const invalidNegation of [
  { key: "王小美 0912345678 https://example.com/private", type: "treatment" },
  { key: "botox", type: "area" },
  { key: "invented_intent", type: "intent" },
]) {
  assert.equal(
    parseNluFrame({ ...v2Raw, negated: [invalidNegation] }),
    null,
    "negated keys must be constrained by their ontology type and reject PII sentinels",
  );
}

const instructions = buildNluInstructions();
assert(instructions.includes('"onda_pro"') && instructions.includes('"abdomen"'));
assert(instructions.includes("active_subject") && instructions.includes("prefer_single"));
assert(instructions.includes("只有客人明確表示要預約"));
assert(instructions.includes("priorTurns") && instructions.includes("currentMessage"));
assert(!instructions.includes("12,999") && !instructions.includes("16,888"));

const responseFormat = buildNluResponseFormat();
assert.equal(responseFormat.format.type, "json_schema");
assert.equal(responseFormat.format.strict, true);
const schema = responseFormat.format.schema;
assert(schema.required.includes("schemaVersion"));
assert(schema.required.includes("dialogue"));
assert(schema.required.includes("areas"));
assert.deepEqual(schema.properties.schemaVersion, {
  const: NLU_FRAME_SCHEMA_VERSION,
  type: "integer",
});
const negationVariants = schema.properties.negated.items.anyOf;
assert.equal(negationVariants.length, 4);
for (const variant of negationVariants) {
  assert(Array.isArray(variant.properties.key.enum) && variant.properties.key.enum.length > 0);
  assert.equal(typeof variant.properties.type.const, "string");
}

console.log("NLU frame validation passed (legacy replay + strict V2 dialogue contract)");
