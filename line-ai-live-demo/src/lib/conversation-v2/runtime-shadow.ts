import { getRuntimeConfig } from "@/lib/live-demo-config";
import { reportOperationalError } from "@/lib/monitoring";
import {
  loadNluShadowConversationTimeline,
  patchNluShadowObservationDecision,
  type NluShadowConversationTimeline,
  type NluShadowObservation,
} from "@/lib/nlu-shadow-store";

import { replayConversationV2Shadow } from "./shadow";

const TENANT_ID = "tenant_001";

export type ConversationV2ShadowEnvelope = {
  adapterVersion: string;
  conflicts: Array<{ identity: string; recordCount: number; variantCount: number }>;
  coverage: {
    complete: boolean;
    duplicateRecordCount: number;
    frameCount: number;
    provisional: true;
    totalCustomerMessages: number;
  };
  errorCode: null | "current_turn_missing" | "replay_conflict";
  finalState: Record<string, unknown>;
  policyVersion: string;
  replayStatus: "complete" | "conflict";
  schemaVersion: number;
  turn: null | {
    action: Record<string, unknown> | null;
    actionFamily: string | null;
    legacyActionFamily: string;
    ontologySnapshotId?: string;
    replyPlan: Record<string, unknown> | null;
    stateAfter: Record<string, unknown>;
    stateBefore: Record<string, unknown>;
    understanding: Record<string, unknown>;
  };
};

type RuntimeShadowInput = {
  conversationId: string;
  episodeKey?: string;
  lineTimestamp?: number;
  observation: NluShadowObservation;
  sourceUserId: string;
};

type RuntimeShadowDependencies = {
  getMode?: () => "off" | "shadow";
  loadTimeline?: (input: {
    conversationId: string;
    episodeKey?: string;
    expectedUserId: string;
    promptVersion: string;
    tenantId?: string;
  }) => Promise<NluShadowConversationTimeline>;
  patch?: typeof patchNluShadowObservationDecision;
};

function baseNluDivergenceCategories(values: readonly string[]) {
  return values.filter((value) => !value.startsWith("v2_"));
}

function buildEnvelope(input: {
  replay: ReturnType<typeof replayConversationV2Shadow>;
  turn: ReturnType<typeof replayConversationV2Shadow>["turns"][number] | null;
  turnMissing?: boolean;
}): ConversationV2ShadowEnvelope {
  const errorCode = input.replay.replayStatus === "conflict"
    ? "replay_conflict" as const
    : input.turnMissing
      ? "current_turn_missing" as const
      : null;
  return {
    adapterVersion: input.replay.adapterVersion,
    conflicts: input.replay.conflicts,
    // Runtime after() callbacks have no durable ordering watermark. Even when
    // every currently visible message has a frame, this snapshot remains
    // provisional until an offline materializer confirms the settled window.
    coverage: {
      ...input.replay.coverage,
      complete: false,
      provisional: true,
    },
    errorCode,
    finalState: input.replay.finalState,
    policyVersion: input.replay.policyVersion,
    replayStatus: input.replay.replayStatus,
    schemaVersion: input.replay.schemaVersion,
    turn: input.turn
      ? {
          action: input.turn.action,
          actionFamily: input.turn.actionFamily,
          legacyActionFamily: input.turn.legacyActionFamily,
          ...(input.turn.ontologySnapshotId
            ? { ontologySnapshotId: input.turn.ontologySnapshotId }
            : {}),
          replyPlan: input.turn.replyPlan,
          stateAfter: input.turn.stateAfter,
          stateBefore: input.turn.stateBefore,
          understanding: input.turn.understanding,
        }
      : null,
  };
}

/**
 * Enriches the existing NLU observation with a PII-free V2 decision record.
 * It reuses the captured frame and never calls a model, renders a reply, sends
 * LINE output, or mutates live conversation/booking/handoff state.
 */
export async function captureConversationV2ShadowRecord(
  input: RuntimeShadowInput,
  dependencies: RuntimeShadowDependencies = {},
): Promise<ConversationV2ShadowEnvelope | null> {
  try {
    const mode = dependencies.getMode?.() ?? getRuntimeConfig().conversationV2Mode;
    if (mode !== "shadow") return null;
    if (!input.conversationId || !input.sourceUserId) return null;

    const timeline = await (dependencies.loadTimeline ?? loadNluShadowConversationTimeline)({
      conversationId: input.conversationId,
      episodeKey: input.episodeKey,
      expectedUserId: input.sourceUserId,
      promptVersion: input.observation.promptVersion,
      tenantId: TENANT_ID,
    });
    const episodeId = input.episodeKey
      ? `shadow:${input.episodeKey}`
      : `shadow:${input.conversationId}`;
    const replay = replayConversationV2Shadow({
      episodeId,
      records: timeline.records,
      tenantId: TENANT_ID,
      totalCustomerMessages: timeline.totalCustomerMessages,
      userId: input.sourceUserId,
    });
    const currentRecord = timeline.records.find((record) => record.messageId === input.observation.messageId);
    const currentTimestamp = input.lineTimestamp ?? currentRecord?.lineTimestamp;
    const patch = dependencies.patch ?? patchNluShadowObservationDecision;
    let currentEnvelope: ConversationV2ShadowEnvelope | null = null;

    // A late older event can change every later turn. Re-materialize the
    // current turn and all visible successors, not only the callback that just
    // finished, so an out-of-order after() eventually converges.
    for (const turn of replay.turns) {
      const record = timeline.records.find((candidate) => candidate.messageId === turn.messageId);
      if (!record || (currentTimestamp !== undefined && record.lineTimestamp < currentTimestamp)) continue;
      const envelope = buildEnvelope({ replay, turn });
      const divergenceCategories = Array.from(new Set([
        ...baseNluDivergenceCategories(record.divergenceCategories),
        ...turn.divergenceCategories,
        ...(replay.replayStatus === "conflict" ? ["v2_replay_conflict"] : []),
      ]));
      await patch({
        deterministicDecision: {
          ...record.legacyDecision,
          conversationV2: envelope,
        },
        divergenceCategories,
        messageId: record.messageId,
        promptVersion: input.observation.promptVersion,
        tenantId: TENANT_ID,
      });
      if (record.messageId === input.observation.messageId) currentEnvelope = envelope;
    }

    if (!currentEnvelope) {
      currentEnvelope = buildEnvelope({ replay, turn: null, turnMissing: true });
      await patch({
        deterministicDecision: {
          ...input.observation.deterministicDecision,
          conversationV2: currentEnvelope,
        },
        divergenceCategories: Array.from(new Set([
          ...baseNluDivergenceCategories(input.observation.divergenceCategories),
          "v2_current_turn_missing",
          ...(replay.replayStatus === "conflict" ? ["v2_replay_conflict"] : []),
        ])),
        messageId: input.observation.messageId,
        promptVersion: input.observation.promptVersion,
        tenantId: TENANT_ID,
      });
    }
    return currentEnvelope;
  } catch (error) {
    await reportOperationalError({
      alert: false,
      error,
      source: "conversation_v2_shadow_capture",
    });
    return null;
  }
}
