import { getRuntimeConfig } from "@/lib/live-demo-config";
import { clinicOntology } from "@/lib/clinic-ontology";
import {
  buildNluRequestInput,
  captureNluShadowObservation,
  NLU_PROMPT_VERSION,
  runNluShadow,
  selectNluPriorTurns,
} from "@/lib/nlu-shadow";

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
            areas: ["face"],
            confidence: 0.96,
            concerns: [{ area: "face", key: "dynamic_wrinkles" }],
            dialogue: {
              aspects: ["overview"],
              focus: "overview",
              move: "start",
              reference: "explicit",
              speechAct: "learn_treatment",
            },
            intents: ["treatment_consultation"],
            negated: [],
            safety: { complaint: false, humanRequest: false, postTreatmentRisk: false, pregnancyNursing: false },
            schemaVersion: 3,
            treatments: ["botox"],
          }),
        }],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 30 },
  }), { status: 200 });
};
const recentTurns = [
  { role: "user" as const, text: "最舊一輪不應送出" },
  { role: "assistant" as const, text: "第二舊一輪也不應送出" },
  { role: "user" as const, text: "電話 0912-345-678" },
  { role: "assistant" as const, text: "Email demo@example.com" },
  { role: "user" as const, text: "網址 https://example.com/private" },
  { role: "assistant" as const, text: "正在談肉毒" },
];
const selectedPriorTurns = selectNluPriorTurns(
  [
    ...recentTurns,
    { role: "user" as const, text: "目前訊息不可成為 prior turn", turnId: "user-current" },
    { role: "assistant" as const, text: "尚未送出的回答不可成為 prior turn", turnId: "assistant-current" },
  ],
  new Set(["user-current", "assistant-current"]),
);
if (selectedPriorTurns.length !== 4 || selectedPriorTurns.some((turn) => turn.text.includes("不可成為"))) {
  throw new Error("NLU prior-turn selection must exclude the current customer and unsent assistant turns");
}
const restPayloadResult = await runNluShadow("皺眉紋", decision, { recentTurns });
globalThis.fetch = originalFetch;
if (restPayloadResult?.frame?.concerns[0]?.key !== "dynamic_wrinkles") {
  throw new Error("NLU shadow must parse output[].content[] from the raw Responses REST payload");
}
if (restPayloadResult?.promptVersion !== "nlu-v4-multi-aspect" || NLU_PROMPT_VERSION !== "nlu-v4-multi-aspect") {
  throw new Error("NLU shadow must record the V2 dialogue prompt version");
}
if (restPayloadResult?.frame?.dialogue.speechAct !== "learn_treatment") {
  throw new Error("NLU shadow must retain structured dialogue semantics");
}
if (restPayloadResult?.frame?.dialogue.aspects?.join(",") !== "overview") {
  throw new Error("NLU shadow mock must exercise the current schema-v3 aspect contract");
}
const requestBody = capturedRequestBody as unknown as {
  input?: string;
  reasoning?: { effort?: string };
  text?: {
    format?: {
      schema?: Record<string, unknown>;
      type?: string;
      strict?: boolean;
    };
  };
} | null;
const responseFormat = requestBody?.text?.format;
if (responseFormat?.type !== "json_schema" || responseFormat.strict !== true) {
  throw new Error("NLU shadow must request strict structured output");
}
if (JSON.stringify(responseFormat.schema).includes('"uniqueItems"')) {
  throw new Error("NLU strict schema must not send unsupported uniqueItems to OpenAI");
}
if (requestBody?.reasoning?.effort !== "none") throw new Error("GPT-5.6 NLU must preserve none reasoning for latency");
const requestInput = requestBody?.input ?? "";
if (!requestInput.includes("priorTurns=") || !requestInput.includes('currentMessage="皺眉紋"')) {
  throw new Error("NLU request must separate prior turns from the current message");
}
if (requestInput.includes("最舊一輪") || requestInput.includes("第二舊一輪")) {
  throw new Error("NLU request must include at most the latest four prior turns");
}
for (const secret of ["0912-345-678", "demo@example.com", "https://example.com/private"]) {
  if (requestInput.includes(secret)) throw new Error("NLU recent context must redact customer identifiers");
}
if (!requestInput.includes("[電話已提供]") || !requestInput.includes("[Email 已提供]") || !requestInput.includes("[網址]")) {
  throw new Error("NLU recent context must retain redacted conversational placeholders");
}
if (buildNluRequestInput("目前問題", recentTurns) !== requestInput.replace('currentMessage="皺眉紋"', 'currentMessage="目前問題"')) {
  throw new Error("NLU request builder must be deterministic");
}

process.env.OPENAI_NLU_MODE = "decision";
let rejectedDecisionMode = false;
try {
  getRuntimeConfig();
} catch {
  rejectedDecisionMode = true;
}
if (!rejectedDecisionMode) throw new Error("unimplemented decision mode must be rejected");
delete process.env.OPENAI_NLU_MODE;

const futureOntology = {
  ...clinicOntology,
  treatments: [
    ...clinicOntology.treatments,
    { aliases: ["未來儀器"], category: "energy" as const, key: "future_device", name: "未來儀器" },
  ],
};
let storedOntologyKey = "";
let storedOntologySnapshotId = "";
await captureNluShadowObservation(
  {
    decision,
    message: "想了解未來儀器",
    messageId: "future-message",
    ontology: futureOntology,
    ontologySnapshotId: "catalog-future-v1",
  },
  {
    run: async () => ({ confidence: 0.9, deterministicDecision: decision, divergenceCategories: [], errorCode: null, frame: null, latencyMs: 1, model: "test", promptVersion: "test", tokensIn: 0, tokensOut: 0 }),
    store: async (value) => {
      storedOntologyKey = value.ontology?.treatments.at(-1)?.key ?? "";
      storedOntologySnapshotId = value.ontologySnapshotId ?? "";
    },
  },
);
if (storedOntologyKey !== "future_device" || storedOntologySnapshotId !== "catalog-future-v1") {
  throw new Error("shadow capture must bind the inference frame to its recognition snapshot");
}

let continuedAfterStoreFailure = false;
let capturedPriorTurn = "";
await captureNluShadowObservation(
  {
    decision,
    message: "術後很痛",
    messageId: "message-id",
    recentTurns: [{ role: "user", text: "剛做完療程" }],
  },
  {
    run: async (_message, _decision, context) => {
      capturedPriorTurn = context?.recentTurns?.[0]?.text ?? "";
      return { confidence: null, deterministicDecision: decision, divergenceCategories: [], errorCode: null, frame: null, latencyMs: 1, model: "test", promptVersion: "test", tokensIn: 0, tokensOut: 0 };
    },
    store: async () => { throw new Error("injected shadow store failure"); },
  },
);
continuedAfterStoreFailure = true;
if (!continuedAfterStoreFailure) throw new Error("shadow store failure interrupted post-processing");
if (capturedPriorTurn !== "剛做完療程") throw new Error("shadow capture must forward prior-turn context");
console.log("NLU shadow validation passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
