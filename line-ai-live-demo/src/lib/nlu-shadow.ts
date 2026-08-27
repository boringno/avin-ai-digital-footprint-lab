import { getRuntimeConfig } from "@/lib/live-demo-config";
import type { ClinicOntology } from "@/lib/clinic-ontology";
import { buildNluInstructions, buildNluResponseFormat, parseNluFrame } from "@/lib/nlu-frame";
import type { NluShadowObservation } from "@/lib/nlu-shadow-store";
import { storeNluShadowObservation } from "@/lib/nlu-shadow-store";
import { reportOperationalError } from "@/lib/monitoring";
import { extractOpenAiResponseText, type OpenAiResponsesPayload } from "@/lib/openai-responses";
import { evaluateNluDecisionGate } from "@/lib/nlu-decision-adapter";

const OPENAI_RESPONSES_API_URL = "https://api.openai.com/v1/responses";
export const NLU_PROMPT_VERSION = "nlu-v4-multi-aspect";
type DecisionSnapshot = NluShadowObservation["deterministicDecision"];

export type NluRecentTurn = {
  role: "assistant" | "user";
  text: string;
  turnId?: string;
};

export function selectNluPriorTurns(
  recentTurns: readonly NluRecentTurn[] = [],
  currentTurnIds: ReadonlySet<string> = new Set(),
) {
  return recentTurns
    .filter((turn) => !turn.turnId || !currentTurnIds.has(turn.turnId))
    .slice(-4)
    .map(({ role, text }) => ({ role, text }));
}

function sanitizeNluText(text: string) {
  return text
    .replace(/(?:\+?886[-\s]?)?0?9\d{2}[-\s]?\d{3}[-\s]?\d{3}/gu, "[電話已提供]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[Email 已提供]")
    .replace(/https?:\/\/\S+/giu, "[網址]")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 500);
}

export function buildNluRequestInput(message: string, recentTurns: readonly NluRecentTurn[] = []) {
  const priorTurns = selectNluPriorTurns(recentTurns)
    .map((turn) => ({ role: turn.role, text: sanitizeNluText(turn.text) }))
    .filter((turn) => Boolean(turn.text));
  return [
    `priorTurns=${JSON.stringify(priorTurns)}`,
    `currentMessage=${JSON.stringify(sanitizeNluText(message))}`,
  ].join("\n");
}

export async function requestNluFrame(
  message: string,
  context: {
    ontology?: ClinicOntology;
    recentTurns?: readonly NluRecentTurn[];
  } = {},
) {
  const config = getRuntimeConfig();
  if (!config.openAiApiKey) return null;

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("NLU shadow timed out")), config.openAiNluTimeoutMs);
  try {
    const response = await fetch(OPENAI_RESPONSES_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.openAiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        input: buildNluRequestInput(message, context.recentTurns),
        instructions: buildNluInstructions(context.ontology),
        max_output_tokens: 320,
        model: config.openAiModel,
        reasoning: { effort: "none" },
        text: buildNluResponseFormat(context.ontology),
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OpenAI NLU shadow error ${response.status}`);
    const payload = await response.json() as OpenAiResponsesPayload;
    const outputText = extractOpenAiResponseText(payload);
    const frame = outputText ? parseNluFrame(JSON.parse(outputText), context.ontology) : null;
    return {
      errorCode: frame ? null : "invalid_frame",
      frame,
      latencyMs: Date.now() - startedAt,
      model: config.openAiModel,
      promptVersion: NLU_PROMPT_VERSION,
      tokensIn: payload.usage?.input_tokens ?? 0,
      tokensOut: payload.usage?.output_tokens ?? 0,
    };
  } catch (error) {
    return { errorCode: controller.signal.aborted ? "timeout" : error instanceof SyntaxError ? "invalid_json" : "request_error", frame: null, latencyMs: Date.now() - startedAt, model: config.openAiModel, promptVersion: NLU_PROMPT_VERSION, tokensIn: 0, tokensOut: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runNluShadow(
  message: string,
  decision: DecisionSnapshot,
  context: {
    ontology?: ClinicOntology;
    recentTurns?: readonly NluRecentTurn[];
  } = {},
) {
  const config = getRuntimeConfig();
  if (config.openAiNluMode !== "shadow") return null;
  const gate = evaluateNluDecisionGate(`shadow:${message}`, { mode: "shadow", sampleRate: config.openAiNluSampleRate });
  if (!gate.eligible) return null;
  const result = await requestNluFrame(message, context);
  if (!result) return null;
  const divergenceCategories: string[] = [];
  if (!result.frame) divergenceCategories.push("invalid_frame");
  if (result.frame && Object.values(result.frame.safety).some(Boolean) && !["handoff_pending", "medical_guidance_reply"].includes(decision.decisionType)) divergenceCategories.push("safety_disagreement");
  return {
    confidence: result.frame?.confidence ?? null,
    deterministicDecision: decision,
    divergenceCategories,
    ...result,
  } satisfies Omit<NluShadowObservation, "messageId">;
}

export async function captureNluShadowObservation(
  input: {
    decision: DecisionSnapshot;
    message: string;
    messageId: string;
    ontology?: ClinicOntology;
    ontologySnapshotId?: string;
    recentTurns?: readonly NluRecentTurn[];
  },
  dependencies: {
    run?: typeof runNluShadow;
    store?: typeof storeNluShadowObservation;
  } = {},
) {
  try {
    const observation = await (dependencies.run ?? runNluShadow)(input.message, input.decision, {
      ontology: input.ontology,
      recentTurns: input.recentTurns,
    });
    if (observation) {
      const storedObservation = {
        ...observation,
        messageId: input.messageId,
        ...(input.ontology ? { ontology: input.ontology } : {}),
        ...(input.ontologySnapshotId ? { ontologySnapshotId: input.ontologySnapshotId } : {}),
      };
      await (dependencies.store ?? storeNluShadowObservation)(storedObservation);
      return storedObservation;
    }
    return null;
  } catch (error) {
    await reportOperationalError({ alert: false, error, source: "nlu_shadow_capture" });
    return null;
  }
}
