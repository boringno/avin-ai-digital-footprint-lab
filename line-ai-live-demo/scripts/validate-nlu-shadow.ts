import { runNluShadow } from "@/lib/nlu-shadow";

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
const result = await runNluShadow("肚子", decision);
globalThis.fetch = originalFetch;

if (result !== null || fetchCalls !== 0) throw new Error("NLU shadow must be off and unsampled by default");
console.log("NLU shadow validation passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
