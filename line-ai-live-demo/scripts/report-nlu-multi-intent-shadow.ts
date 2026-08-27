import type { QuestionAspect } from "@/lib/dialogue-semantics";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { requestNluFrame } from "@/lib/nlu-shadow";
import { CONVERSATION_V2_MULTI_INTENT_ACCEPTANCE_CASES } from "./fixtures/conversation-v2-multi-intent-acceptance";

type NluLiveReportRow = {
  actualAspects: QuestionAspect[];
  actualTreatments: string[];
  confidence: number | null;
  errorCode: string | null;
  expectedAspects: readonly QuestionAspect[];
  expectedTreatment: string;
  id: string;
  latencyMs: number | null;
  missingAspects: QuestionAspect[];
  text: string;
  treatmentMatched: boolean;
  unexpectedAspects: QuestionAspect[];
};

function buildRow(input: {
  actualAspects: QuestionAspect[];
  actualTreatments: string[];
  confidence: number | null;
  errorCode: string | null;
  expectedAspects: readonly QuestionAspect[];
  expectedTreatment: string;
  id: string;
  latencyMs: number | null;
  text: string;
}): NluLiveReportRow {
  const expected = [...input.expectedAspects];
  return {
    actualAspects: input.actualAspects,
    actualTreatments: input.actualTreatments,
    confidence: input.confidence,
    errorCode: input.errorCode,
    expectedAspects: input.expectedAspects,
    expectedTreatment: input.expectedTreatment,
    id: input.id,
    latencyMs: input.latencyMs,
    missingAspects: expected.filter((aspect) => !input.actualAspects.includes(aspect)),
    text: input.text,
    treatmentMatched: input.actualTreatments.includes(input.expectedTreatment),
    unexpectedAspects: input.actualAspects.filter((aspect) => !expected.includes(aspect)),
  };
}

async function main() {
  // This report spends model tokens. It is explicit opt-in, stays out of CI,
  // and does not store a database record or send a LINE reply.
  if (process.env.RUN_LIVE_NLU_MULTI_INTENT_REPORT !== "1") {
    console.log("Skipped live NLU report. Set RUN_LIVE_NLU_MULTI_INTENT_REPORT=1 with OPENAI_API_KEY configured to run it.");
    return;
  }
  if (!getRuntimeConfig().openAiApiKey) {
    console.log("Skipped live NLU report: OPENAI_API_KEY is not available to this process.");
    return;
  }

  const rows: NluLiveReportRow[] = [];
  for (const testCase of CONVERSATION_V2_MULTI_INTENT_ACCEPTANCE_CASES) {
    const result = await requestNluFrame(testCase.text);
    rows.push(buildRow({
      actualAspects: result?.frame?.dialogue.aspects ?? [],
      actualTreatments: result?.frame?.treatments ?? [],
      confidence: result?.frame?.confidence ?? null,
      errorCode: result?.errorCode ?? "missing_api_key",
      expectedAspects: testCase.aspects,
      expectedTreatment: testCase.treatmentKey,
      id: testCase.id,
      latencyMs: result?.latencyMs ?? null,
      text: testCase.text,
    }));
  }

  const exact = rows.filter((row) => row.treatmentMatched && row.missingAspects.length === 0 && row.unexpectedAspects.length === 0);
  const parsed = rows.filter((row) => row.errorCode === null);
  console.log(JSON.stringify({
    promptVersion: "nlu-v4-multi-aspect",
    summary: {
      exact: exact.length,
      parsed: parsed.length,
      total: rows.length,
      treatmentMatched: rows.filter((row) => row.treatmentMatched).length,
    },
    rows,
  }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
