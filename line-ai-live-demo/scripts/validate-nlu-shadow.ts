import { getRuntimeConfig } from "@/lib/live-demo-config";
import { captureNluShadowObservation, runNluShadow } from "@/lib/nlu-shadow";

async function main() {
const decision = { decisionType: "fallback_reply", matchedKey: "generic_fallback", matchedType: "generic_fallback" };
const originalFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  return new Response(JSON.stringify({ output_text: "{}" }), { status: 200 });
};

delete process.env.OPENAI_NLU_MODE;
delete process.env.OPENAI_NLU_SAMPLE_RATE;
delete process.env.OPENAI_MODEL;
process.env.OPENAI_API_KEY = "test-key";
const defaultConfig = getRuntimeConfig();
if (defaultConfig.openAiNluMode !== "off") throw new Error("NLU mode must default to off");
if (defaultConfig.openAiNluSampleRate !== 0) throw new Error("NLU sample rate must default to zero");
if (defaultConfig.openAiModel !== "gpt-5.6-luna") throw new Error("OpenAI model must default to gpt-5.6-luna");
const result = await runNluShadow("肚子", decision);
globalThis.fetch = originalFetch;

if (result !== null || fetchCalls !== 0) throw new Error("NLU shadow must be off and unsampled by default");

let capturedRequestBody: Record<string, unknown> | null = null;
process.env.OPENAI_NLU_MODE = "shadow";
process.env.OPENAI_NLU_SAMPLE_RATE = "1";
process.env.OPENAI_NLU_TIMEOUT_MS = "1000";
globalThis.fetch = async (_input, init) => {
  capturedRequestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
  return new Response(JSON.stringify({
    output: [
      { type: "reasoning", summary: [] },
      {
        type: "message",
        content: [{
          type: "output_text",
          text: JSON.stringify({
            confidence: 0.96,
            concerns: [{ area: "face", key: "dynamic_wrinkles" }],
            intents: ["treatment_consultation"],
            negated: [],
            safety: { complaint: false, humanRequest: false, postTreatmentRisk: false, pregnancyNursing: false },
            treatments: ["botox"],
          }),
        }],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 30 },
  }), { status: 200 });
};
const restPayloadResult = await runNluShadow("皺眉紋", decision);
globalThis.fetch = originalFetch;
if (restPayloadResult?.frame?.concerns[0]?.key !== "dynamic_wrinkles") {
  throw new Error("NLU shadow must parse output[].content[] from the raw Responses REST payload");
}
const requestBody = capturedRequestBody as unknown as { reasoning?: { effort?: string }; text?: { format?: { type?: string; strict?: boolean } } } | null;
const responseFormat = requestBody?.text?.format;
if (responseFormat?.type !== "json_schema" || responseFormat.strict !== true) {
  throw new Error("NLU shadow must request strict structured output");
}
if (requestBody?.reasoning?.effort !== "none") throw new Error("GPT-5.6 NLU must preserve none reasoning for latency");

process.env.OPENAI_NLU_MODE = "decision";
let rejectedDecisionMode = false;
try {
  getRuntimeConfig();
} catch {
  rejectedDecisionMode = true;
}
if (!rejectedDecisionMode) throw new Error("unimplemented decision mode must be rejected");
delete process.env.OPENAI_NLU_MODE;

let continuedAfterStoreFailure = false;
await captureNluShadowObservation(
  { decision, message: "術後很痛", messageId: "message-id" },
  {
    run: async () => ({ confidence: null, deterministicDecision: decision, divergenceCategories: [], errorCode: null, frame: null, latencyMs: 1, model: "test", promptVersion: "test", tokensIn: 0, tokensOut: 0 }),
    store: async () => { throw new Error("injected shadow store failure"); },
  },
);
continuedAfterStoreFailure = true;
if (!continuedAfterStoreFailure) throw new Error("shadow store failure interrupted post-processing");
console.log("NLU shadow validation passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
