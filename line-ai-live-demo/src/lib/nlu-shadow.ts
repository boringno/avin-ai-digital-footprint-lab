import { getRuntimeConfig } from "@/lib/live-demo-config";
import { buildNluInstructions, parseNluFrame } from "@/lib/nlu-frame";
import type { NluShadowObservation } from "@/lib/nlu-shadow-store";
import { storeNluShadowObservation } from "@/lib/nlu-shadow-store";
import { reportOperationalError } from "@/lib/monitoring";

const OPENAI_RESPONSES_API_URL = "https://api.openai.com/v1/responses";
export const NLU_PROMPT_VERSION = "nlu-v1";
type DecisionSnapshot = NluShadowObservation["deterministicDecision"];

export async function runNluShadow(message: string, decision: DecisionSnapshot) {
  const config = getRuntimeConfig();
  if (config.openAiNluMode !== "shadow" || !config.openAiApiKey || Math.random() >= config.openAiNluSampleRate) return null;

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("NLU shadow timed out")), config.openAiNluTimeoutMs);
  try {
    const response = await fetch(OPENAI_RESPONSES_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.openAiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: `請解析這則客人訊息：\n${message}`, instructions: buildNluInstructions(), max_output_tokens: 320, model: config.openAiModel }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OpenAI NLU shadow error ${response.status}`);
    const payload = await response.json() as { output_text?: string; usage?: { input_tokens?: number; output_tokens?: number } };
    const frame = payload.output_text ? parseNluFrame(JSON.parse(payload.output_text)) : null;
    const divergenceCategories: string[] = [];
    if (!frame) divergenceCategories.push("invalid_frame");
    if (frame && Object.values(frame.safety).some(Boolean) && !["handoff_pending", "medical_guidance_reply"].includes(decision.decisionType)) divergenceCategories.push("safety_disagreement");

    return { confidence: frame?.confidence ?? null, deterministicDecision: decision, divergenceCategories, errorCode: frame ? null : "invalid_frame", frame, latencyMs: Date.now() - startedAt, model: config.openAiModel, promptVersion: NLU_PROMPT_VERSION, tokensIn: payload.usage?.input_tokens ?? 0, tokensOut: payload.usage?.output_tokens ?? 0 } satisfies Omit<NluShadowObservation, "messageId">;
  } catch (error) {
    return { confidence: null, deterministicDecision: decision, divergenceCategories: [], errorCode: controller.signal.aborted ? "timeout" : error instanceof SyntaxError ? "invalid_json" : "request_error", frame: null, latencyMs: Date.now() - startedAt, model: config.openAiModel, promptVersion: NLU_PROMPT_VERSION, tokensIn: 0, tokensOut: 0 } satisfies Omit<NluShadowObservation, "messageId">;
  } finally {
    clearTimeout(timeout);
  }
}

export async function captureNluShadowObservation(
  input: { decision: DecisionSnapshot; message: string; messageId: string },
  dependencies: {
    run?: typeof runNluShadow;
    store?: typeof storeNluShadowObservation;
  } = {},
) {
  try {
    const observation = await (dependencies.run ?? runNluShadow)(input.message, input.decision);
    if (observation) {
      await (dependencies.store ?? storeNluShadowObservation)({ ...observation, messageId: input.messageId });
    }
  } catch (error) {
    await reportOperationalError({ alert: false, error, source: "nlu_shadow_capture" });
  }
}
