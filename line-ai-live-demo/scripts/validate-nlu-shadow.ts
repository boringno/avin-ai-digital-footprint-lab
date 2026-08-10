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
process.env.OPENAI_API_KEY = "test-key";
const defaultConfig = getRuntimeConfig();
if (defaultConfig.openAiNluMode !== "off") throw new Error("NLU mode must default to off");
if (defaultConfig.openAiNluSampleRate !== 0) throw new Error("NLU sample rate must default to zero");
const result = await runNluShadow("肚子", decision);
globalThis.fetch = originalFetch;

if (result !== null || fetchCalls !== 0) throw new Error("NLU shadow must be off and unsampled by default");
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
