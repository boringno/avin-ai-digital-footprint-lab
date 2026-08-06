import {
  isHighConfidenceControlledIntent,
  parseControlledIntentOutput,
  shouldUseControlledIntentClassifier,
} from "@/lib/ai-intent-classifier";

const metadata = { model: "test-model", tokensIn: 10, tokensOut: 8 };
const valid = parseControlledIntentOutput(
  '{"intent":"doctor_schedule","branch":"高雄館","month":"current","confidence":0.96}',
  metadata,
);

const validTreatmentConsultation = parseControlledIntentOutput(
  '{"intent":"treatment_consultation","branch":null,"month":null,"treatment_key":"onda_pro","concern":"jawline_looseness","confidence":0.91}',
  metadata,
);

const cases = [
  {
    name: "valid schedule classification is accepted",
    passed: valid?.intent === "doctor_schedule" && valid.branch === "高雄館" && valid.month === "current",
  },
  {
    name: "high confidence gate accepts approved result",
    passed: valid !== null && isHighConfidenceControlledIntent(valid, 0.85),
  },
  {
    name: "low confidence result is not actionable",
    passed: valid !== null && !isHighConfidenceControlledIntent({ ...valid, confidence: 0.84 }, 0.85),
  },
  {
    name: "unknown intent is not actionable",
    passed:
      valid !== null &&
      !isHighConfidenceControlledIntent({ ...valid, intent: "unknown", confidence: 0.99 }, 0.85),
  },
  {
    name: "invalid intent is rejected",
    passed:
      parseControlledIntentOutput(
        '{"intent":"answer_customer","branch":null,"month":null,"confidence":0.99}',
        metadata,
      ) === null,
  },
  {
    name: "free-form answer is rejected",
    passed: parseControlledIntentOutput("肉毒可以改善動態紋路。", metadata) === null,
  },
  {
    name: "malformed branch is reduced to unknown branch",
    passed:
      parseControlledIntentOutput(
        '{"intent":"doctor_schedule","branch":"新竹館","month":"current","confidence":0.96}',
        metadata,
      )?.branch === null,
  },
  {
    name: "malformed month is reduced to null",
    passed:
      parseControlledIntentOutput(
        '{"intent":"doctor_schedule","branch":null,"month":"下週","confidence":0.96}',
        metadata,
      )?.month === null,
  },
  {
    name: "markdown output is rejected",
    passed:
      parseControlledIntentOutput(
        '```json\n{"intent":"doctor_schedule","branch":null,"month":"current","confidence":0.96}\n```',
        metadata,
      ) === null,
  },
  {
    name: "schedule-like message is eligible for classification",
    passed: shouldUseControlledIntentClassifier("想看高雄本月門診時間"),
  },
  {
    name: "generic fallback message skips classifier",
    passed: !shouldUseControlledIntentClassifier("我想了解你們的服務"),
  },
  {
    name: "semantic local-contour message is eligible for classification",
    passed: shouldUseControlledIntentClassifier("側臉很肉想改善"),
  },
  {
    name: "valid treatment consultation classification is accepted",
    passed:
      validTreatmentConsultation?.intent === "treatment_consultation" &&
      validTreatmentConsultation.treatmentKey === "onda_pro" &&
      validTreatmentConsultation.concern === "jawline_looseness",
  },
  {
    name: "unknown treatment concern is reduced to null",
    passed:
      parseControlledIntentOutput(
        '{"intent":"treatment_consultation","branch":null,"month":null,"treatment_key":"onda_pro","concern":"make_up_claim","confidence":0.91}',
        metadata,
      )?.concern === null,
  },
];

const failed = cases.filter((item) => !item.passed);
for (const item of cases) {
  console.log(`${item.passed ? "PASS" : "FAIL"}: ${item.name}`);
}

if (failed.length > 0) {
  process.exitCode = 1;
} else {
  console.log(`AI intent classifier validation passed: ${cases.length} cases`);
}
