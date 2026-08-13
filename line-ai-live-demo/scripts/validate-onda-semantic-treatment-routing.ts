import { routeCustomerMessage } from "../src/lib/router";

const NOW = new Date("2026-08-10T04:00:00.000Z");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function routeSemanticConcern(concern: "jawline_looseness" | "local_contour") {
  return routeCustomerMessage({
    includePending: false,
    message: "側臉很肉想改善",
    now: NOW,
    semanticTreatmentConsultation: {
      concern,
      treatmentKey: "onda_pro",
    },
  });
}

async function main() {
  const jawline = await routeSemanticConcern("jawline_looseness");
  assert(jawline.matchedKey === "treatment_consult:onda_pro:semantic:jawline_looseness", "S1: must use the approved ONDA jawline scenario");
  assert(jawline.replyText.includes("ONDA Pro 超微波6分鐘"), "S1: must use approved ONDA face copy, not LLM-generated text");
  assert(!jawline.replyText.includes("很多在意下顎線的客人都會選擇這個組合"), "S1: a double-chin concern alone must not hard-sell Botox");
  assert(!jawline.replyText.includes("12,999元"), "S1: semantic concern routing must not quote before a price question");
  assert(jawline.nextContext.lastIntent !== "booking_intake", "S1: semantic concern routing must remain consultation");

  const body = await routeSemanticConcern("local_contour");
  assert(body.matchedKey === "treatment_consult:onda_pro:semantic:local_contour", "S2: must use the approved ONDA body scenario");
  assert(body.replyText.includes("身體局部脂肪堆積"), "S2: must use approved Xiaoying ONDA body copy");
  assert(!body.replyText.includes("體驗價 16,888"), "S2: semantic concern routing must not quote before a price question");

  const pregnancy = await routeCustomerMessage({
    includePending: false,
    message: "我懷孕了，側臉很肉想改善",
    now: NOW,
    semanticTreatmentConsultation: {
      concern: "jawline_looseness",
      treatmentKey: "onda_pro",
    },
  });
  assert(pregnancy.matchedKey === "pregnancy_caution", "S3: pregnancy safety must win over semantic treatment routing");

  console.log("ONDA semantic treatment routing validation passed: 3 cases");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
