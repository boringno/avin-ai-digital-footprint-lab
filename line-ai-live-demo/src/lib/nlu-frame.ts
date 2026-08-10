import { CONTROLLED_INTENTS, type ControlledIntent } from "@/lib/ai-intent-classifier";
import { clinicOntology } from "@/lib/clinic-ontology";

export type NluSafetyFrame = {
  complaint: boolean;
  humanRequest: boolean;
  postTreatmentRisk: boolean;
  pregnancyNursing: boolean;
};

export type NluFrame = {
  confidence: number;
  concerns: Array<{ area: string | null; key: string }>;
  intents: ControlledIntent[];
  negated: Array<{ key: string; type: "area" | "concern" | "intent" | "treatment" }>;
  safety: NluSafetyFrame;
  treatments: string[];
};

function uniqueStrings(values: unknown, allowed: Set<string>) {
  if (!Array.isArray(values) || !values.every((value) => typeof value === "string" && allowed.has(value))) {
    return null;
  }
  return [...new Set(values as string[])];
}

export function parseNluFrame(value: unknown): NluFrame | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const confidence = record.confidence;
  if (typeof confidence !== "number" || confidence < 0 || confidence > 1) return null;

  const intentKeys = new Set<string>(CONTROLLED_INTENTS);
  const treatmentKeys = new Set(clinicOntology.treatments.map((item) => item.key));
  const concernKeys = new Set(clinicOntology.concerns.map((item) => item.key));
  const areaKeys = new Set<string>(clinicOntology.areas.map((item) => item.key));
  const intents = uniqueStrings(record.intents, intentKeys) as ControlledIntent[] | null;
  const treatments = uniqueStrings(record.treatments, treatmentKeys);
  if (!intents || !treatments || !Array.isArray(record.concerns) || !Array.isArray(record.negated)) return null;

  const concerns = record.concerns.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const concern = item as Record<string, unknown>;
    if (typeof concern.key !== "string" || !concernKeys.has(concern.key)) return [];
    if (concern.area !== null && (typeof concern.area !== "string" || !areaKeys.has(concern.area))) return [];
    return [{ area: concern.area as string | null, key: concern.key }];
  });
  if (concerns.length !== record.concerns.length) return null;

  const validNegationTypes = new Set(["area", "concern", "intent", "treatment"]);
  const negated = record.negated.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const negation = item as Record<string, unknown>;
    if (typeof negation.key !== "string" || typeof negation.type !== "string" || !validNegationTypes.has(negation.type)) return [];
    return [{ key: negation.key, type: negation.type as NluFrame["negated"][number]["type"] }];
  });
  if (negated.length !== record.negated.length) return null;

  const safety = record.safety as Record<string, unknown> | undefined;
  if (!safety || !["complaint", "humanRequest", "postTreatmentRisk", "pregnancyNursing"].every((key) => typeof safety[key] === "boolean")) return null;

  return { confidence, concerns, intents, negated, safety: safety as NluSafetyFrame, treatments };
}

export function buildNluInstructions() {
  const ontology = {
    areas: clinicOntology.areas.map(({ key, keywords, label }) => ({ key, keywords, label })),
    concerns: clinicOntology.concerns.map(({ areaKeys, key, keywords }) => ({ areaKeys, key, keywords })),
    treatments: clinicOntology.treatments.map(({ aliases, key, name }) => ({ aliases, key, name })),
  };

  return [
    "你只把客人訊息解析成語意框架，不回答客人、不推薦療程、不產生價格或療效內容。",
    "保留所有同時出現的意圖、療程、困擾與部位；否定項目放入 negated，不可當成肯定需求。",
    `intents 只能使用：${CONTROLLED_INTENTS.join(", ")}。`,
    `ontology=${JSON.stringify(ontology)}`,
    '只輸出 JSON：{"intents":[],"treatments":[],"concerns":[],"negated":[],"safety":{"pregnancyNursing":false,"postTreatmentRisk":false,"complaint":false,"humanRequest":false},"confidence":0}',
  ].join("\n");
}

export function buildNluResponseFormat() {
  const treatmentKeys = clinicOntology.treatments.map((item) => item.key);
  const concernKeys = clinicOntology.concerns.map((item) => item.key);
  const areaKeys = clinicOntology.areas.map((item) => item.key);

  return {
    format: {
      name: "clinic_nlu_frame",
      schema: {
        additionalProperties: false,
        properties: {
          confidence: { maximum: 1, minimum: 0, type: "number" },
          concerns: {
            items: {
              additionalProperties: false,
              properties: {
                area: { anyOf: [{ enum: areaKeys, type: "string" }, { type: "null" }] },
                key: { enum: concernKeys, type: "string" },
              },
              required: ["key", "area"],
              type: "object",
            },
            type: "array",
          },
          intents: { items: { enum: CONTROLLED_INTENTS, type: "string" }, type: "array" },
          negated: {
            items: {
              additionalProperties: false,
              properties: {
                key: { type: "string" },
                type: { enum: ["area", "concern", "intent", "treatment"], type: "string" },
              },
              required: ["key", "type"],
              type: "object",
            },
            type: "array",
          },
          safety: {
            additionalProperties: false,
            properties: {
              complaint: { type: "boolean" },
              humanRequest: { type: "boolean" },
              postTreatmentRisk: { type: "boolean" },
              pregnancyNursing: { type: "boolean" },
            },
            required: ["pregnancyNursing", "postTreatmentRisk", "complaint", "humanRequest"],
            type: "object",
          },
          treatments: { items: { enum: treatmentKeys, type: "string" }, type: "array" },
        },
        required: ["intents", "treatments", "concerns", "negated", "safety", "confidence"],
        type: "object",
      },
      strict: true,
      type: "json_schema",
    },
  } as const;
}
