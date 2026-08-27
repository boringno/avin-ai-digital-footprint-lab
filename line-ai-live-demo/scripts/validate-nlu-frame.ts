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
assert.deepEqual(legacy.dialogue.aspects, ["overview"]);

const v2Raw = {
  areas: ["jawline"],
  confidence: 0.97,
  concerns: [{ area: "jawline", key: "jawline_looseness" }],
  dialogue: {
    aspects: ["single_vs_combination", "price_campaign"],
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
assert.deepEqual(v2.dialogue.aspects, ["single_vs_combination", "price_campaign"]);

const fourAspects = parseNluFrame({
  ...v2Raw,
  dialogue: {
    ...v2Raw.dialogue,
    aspects: ["single_vs_combination", "price_campaign", "comfort_recovery", "suitability"],
  },
});
assert.deepEqual(
  fourAspects?.dialogue.aspects,
  ["single_vs_combination", "price_campaign", "comfort_recovery", "suitability"],
  "current schema must preserve up to four ordered current-message aspects",
);

const { aspects: _aspects, ...legacyV2Dialogue } = v2Raw.dialogue;
const compatibleV2 = parseNluFrame({
  ...v2Raw,
  dialogue: legacyV2Dialogue,
  schemaVersion: 2,
});
assert(compatibleV2, "schema V2 must remain replayable without dialogue.aspects");
assert.deepEqual(compatibleV2.dialogue.aspects, ["single_vs_combination"]);

assert.equal(parseNluFrame({ ...v2Raw, treatments: ["invented"] }), null);
assert.equal(parseNluFrame({ ...v2Raw, confidence: 2 }), null);
assert.equal(
  parseNluFrame({ ...v2Raw, dialogue: { ...v2Raw.dialogue, move: "guess" } }),
  null,
  "unknown dialogue enum must be rejected",
);
const { dialogue: _dialogue, ...missingDialogue } = v2Raw;
assert.equal(parseNluFrame(missingDialogue), null, "V2 must require dialogue");
const { aspects: _currentAspects, ...missingAspectsDialogue } = v2Raw.dialogue;
assert.equal(
  parseNluFrame({ ...v2Raw, dialogue: missingAspectsDialogue }),
  null,
  "current NLU schema must require all explicit question aspects",
);
assert.equal(
  parseNluFrame({
    ...v2Raw,
    dialogue: { ...v2Raw.dialogue, aspects: ["price_campaign", "single_vs_combination"] },
  }),
  null,
  "the first explicit aspect must equal dialogue.focus",
);
for (const [label, aspects] of [
  ["duplicate", ["single_vs_combination", "price_campaign", "price_campaign"]],
  ["none mixed in", ["single_vs_combination", "none"]],
  ["more than four", ["single_vs_combination", "price_campaign", "comfort_recovery", "suitability", "duration"]],
] as const) {
  assert.equal(
    parseNluFrame({ ...v2Raw, dialogue: { ...v2Raw.dialogue, aspects } }),
    null,
    `invalid aspect array must be rejected: ${label}`,
  );
}
assert.equal(
  parseNluFrame({
    ...v2Raw,
    dialogue: { ...v2Raw.dialogue, aspects: [], focus: "none" },
  })?.dialogue.aspects?.length,
  0,
  "focus=none must accept only an empty aspect array",
);
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
assert(instructions.includes("dialogue.aspects") && instructions.includes("最多 4 個"));
assert(instructions.includes("第一項固定等於 dialogue.focus") && instructions.includes("focus=none"));
assert(!instructions.includes("12,999") && !instructions.includes("16,888"));

const responseFormat = buildNluResponseFormat();
assert.equal(responseFormat.format.type, "json_schema");
assert.equal(responseFormat.format.strict, true);
const schema = responseFormat.format.schema;

const OPENAI_STRICT_SCHEMA_KEYWORDS = new Set([
  "additionalProperties",
  "anyOf",
  "const",
  "enum",
  "items",
  "maximum",
  "maxItems",
  "minimum",
  "minItems",
  "properties",
  "required",
  "type",
]);

function assertOpenAiStrictSchemaKeywords(value: unknown, path = "schema") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    assert(
      OPENAI_STRICT_SCHEMA_KEYWORDS.has(key),
      `unsupported OpenAI strict-schema keyword at ${path}.${key}`,
    );
    if (key === "properties") {
      for (const [propertyName, propertySchema] of Object.entries(child as Record<string, unknown>)) {
        assertOpenAiStrictSchemaKeywords(propertySchema, `${path}.properties.${propertyName}`);
      }
      continue;
    }
    if (key === "items") {
      assertOpenAiStrictSchemaKeywords(child, `${path}.items`);
      continue;
    }
    if (key === "anyOf" && Array.isArray(child)) {
      child.forEach((variant, index) => assertOpenAiStrictSchemaKeywords(variant, `${path}.anyOf[${index}]`));
    }
  }
}

assertOpenAiStrictSchemaKeywords(schema);
assert(schema.required.includes("schemaVersion"));
assert(schema.required.includes("dialogue"));
assert(schema.required.includes("areas"));
assert(schema.properties.dialogue.required.includes("aspects"));
assert.equal(
  Object.prototype.hasOwnProperty.call(schema.properties.dialogue.properties.aspects, "uniqueItems"),
  false,
  "OpenAI strict schemas do not support uniqueItems; duplicate rejection belongs in the parser",
);
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

console.log("NLU frame validation passed (V1/V2 replay + strict multi-aspect V3 contract)");
