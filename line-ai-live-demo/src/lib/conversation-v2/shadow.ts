import crypto from "node:crypto";

import { classifyBookingSpeechAct } from "@/lib/booking-speech-act";
import type { ClinicOntology } from "@/lib/clinic-ontology";
import type { NluFrame } from "@/lib/nlu-frame";

import { adaptNluFrameToConversationV2Turn } from "./nlu-adapter";
import {
  CONVERSATION_V2_REPLAY_RECORD_SCHEMA_VERSION,
  ConversationV2ReplayRepository,
  type ConversationV2ShadowRecord,
} from "./repository";
import { createConversationV2State } from "./state";
import type { ConversationV2NluSupplement } from "./nlu-adapter";
import type {
  BookingDraft,
  ConversationV2State,
  DialoguePolicyAction,
  ReplyPlan,
  TurnUnderstanding,
} from "./types";

export const CONVERSATION_V2_SHADOW_SCHEMA_VERSION = 2 as const;
export const CONVERSATION_V2_SHADOW_POLICY_VERSION = "conversation-v2-policy-v2";
export const CONVERSATION_V2_NLU_ADAPTER_VERSION = "nlu-frame-adapter-v2";

export type LegacyDecisionSnapshot = {
  conversationStatus?: string;
  decisionType: string;
  matchedKey: string;
  matchedType: string;
};

export type ConversationV2ShadowInputRecord = {
  frame: NluFrame;
  legacyDecision: LegacyDecisionSnapshot;
  lineMessageId?: string;
  lineTimestamp: number;
  /** Internal conversation_messages row id; used only to attach the result. */
  messageId: string;
  /** Recognition registry captured with this exact NLU frame. */
  ontology?: ClinicOntology;
  ontologySnapshotId?: string;
  sourceEventId?: string;
  text: string;
};

export type ConversationV2ActionFamily =
  | "booking"
  | "clinic_info"
  | "fallback"
  | "handoff"
  | "price"
  | "safety"
  | "silent"
  | "treatment";

type SafeMention = Pick<
  TurnUnderstanding["treatments"][number],
  "confidence" | "key" | "polarity" | "resolution"
>;

export type ConversationV2ShadowTurnRecord = {
  action: Record<string, unknown> | null;
  actionFamily: ConversationV2ActionFamily | null;
  divergenceCategories: string[];
  duplicate: boolean;
  legacyActionFamily: ConversationV2ActionFamily;
  messageId: string;
  ontologySnapshotId?: string;
  replyPlan: Record<string, unknown> | null;
  stateAfter: Record<string, unknown>;
  stateBefore: Record<string, unknown>;
  understanding: {
    areas: SafeMention[];
    booking?: {
      explicit: boolean;
      intent: string;
      suppliedFields: string[];
    };
    concerns: SafeMention[];
    confidence: number;
    conversationMove: string;
    dialogueReference: string;
    questionAspect: string;
    safetySignals: string[];
    sourceIntents: string[];
    speechAct: string;
    treatments: SafeMention[];
    turnId: string;
  };
};

export type ConversationV2ShadowReplay = {
  adapterVersion: string;
  conflicts: Array<{ identity: string; recordCount: number; variantCount: number }>;
  coverage: {
    complete: boolean;
    duplicateRecordCount: number;
    frameCount: number;
    totalCustomerMessages: number;
  };
  finalState: Record<string, unknown>;
  policyVersion: string;
  replayStatus: "complete" | "conflict";
  schemaVersion: typeof CONVERSATION_V2_SHADOW_SCHEMA_VERSION;
  turns: ConversationV2ShadowTurnRecord[];
};

function suppliedFieldNames(fields: Partial<BookingDraft> | undefined) {
  if (!fields) return [];
  return Object.entries(fields)
    .filter(([, value]) => Array.isArray(value) ? value.length > 0 : value !== undefined && value !== "")
    .map(([key]) => key)
    .sort();
}

function opaqueShadowTurnId(value: string) {
  return `turn_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function bookingSupplement(text: string) {
  const bookingAct = classifyBookingSpeechAct(text);
  if (!["create", "modify", "cancel"].includes(bookingAct)) return undefined;
  return {
    explicit: true,
    intent: bookingAct as "create" | "modify" | "cancel",
  };
}

function safeMentions(mentions: TurnUnderstanding["treatments"]): SafeMention[] {
  return mentions.map(({ confidence, key, polarity, resolution }) => ({
    confidence,
    key,
    polarity,
    resolution,
  }));
}

function summarizeUnderstanding(
  turn: ReturnType<typeof adaptNluFrameToConversationV2Turn>,
): ConversationV2ShadowTurnRecord["understanding"] {
  const safetySignals = Object.entries(turn.safetySignals)
    .filter(([, active]) => active)
    .map(([key]) => key)
    .sort();
  return {
    areas: safeMentions(turn.areas),
    ...(turn.booking
      ? {
          booking: {
            explicit: turn.booking.explicit,
            intent: turn.booking.intent,
            suppliedFields: suppliedFieldNames(turn.booking.fields),
          },
        }
      : {}),
    concerns: safeMentions(turn.concerns),
    confidence: turn.confidence,
    conversationMove: turn.conversationMove,
    dialogueReference: turn.dialogueReference,
    questionAspect: turn.questionAspect,
    safetySignals,
    sourceIntents: [...turn.sourceIntents],
    speechAct: turn.speechAct,
    treatments: safeMentions(turn.treatments),
    turnId: opaqueShadowTurnId(turn.turnId),
  };
}

function summarizeState(state: ConversationV2State) {
  return {
    activeTask: {
      kind: state.activeTask.kind,
      subjectKey: state.activeTask.subjectKey ?? null,
    },
    awaiting: state.awaiting
      ? {
          continuationKind: state.awaiting.continuation?.kind ?? null,
          expectedField: state.awaiting.expectedField,
          optionValues: state.awaiting.options.map((option) => option.value),
        }
      : null,
    bookingTask: {
      expectedField: state.bookingTask.expectedField ?? null,
      intent: state.bookingTask.intent,
      status: state.bookingTask.status,
      suppliedFields: suppliedFieldNames(state.bookingTask.draft),
    },
    controlMode: state.control.mode,
    knowledge: {
      areaKeys: [...state.knowledge.areaKeys],
      concernKeys: [...state.knowledge.concernKeys],
      treatmentKeys: [...state.knowledge.treatmentKeys],
    },
    preferences: {
      excludedAreaKeys: [...state.preferences.excludedAreaKeys],
      excludedConcernKeys: [...state.preferences.excludedConcernKeys],
      excludedTreatmentKeys: [...state.preferences.excludedTreatmentKeys],
      treatmentApproach: state.preferences.treatmentApproach,
    },
    pricingSubjectTreatmentKeys: [...state.pricingSubjectTreatmentKeys],
    lastProcessedTurnId: state.lastProcessedTurnId
      ? opaqueShadowTurnId(state.lastProcessedTurnId)
      : null,
    revision: state.revision,
  };
}

function summarizeAction(action: DialoguePolicyAction) {
  const base = { turnId: opaqueShadowTurnId(action.turnId), type: action.type };
  switch (action.type) {
    case "learn_treatment":
    case "clarify":
      return {
        ...base,
        areaKeys: [...action.areaKeys],
        concernKeys: [...action.concernKeys],
        responseContext: { ...action.responseContext },
        taskKind: action.taskKind,
        treatmentKeys: [...action.treatmentKeys],
      };
    case "answer_selection":
      return {
        ...base,
        areaKeys: [...action.areaKeys],
        concernKeys: [...action.concernKeys],
        responseContext: { ...action.responseContext },
        selectedValues: action.selectedOptions.map((option) => option.value),
        taskKind: action.taskKind,
        treatmentKeys: [...action.treatmentKeys],
      };
    case "start_booking":
      return {
        ...base,
        intent: action.intent,
        suppliedFields: suppliedFieldNames(action.initialDraft),
      };
    case "capture_booking_fields":
      return { ...base, suppliedFields: suppliedFieldNames(action.fields) };
    case "answer_price":
      return {
        ...base,
        priceKind: action.priceKind,
        priceSubjectSource: action.priceSubjectSource ?? null,
        treatmentKeys: [...action.treatmentKeys],
      };
    case "answer_clinic_info":
      return { ...base, topic: action.topic ?? null };
    case "queue_handoff":
      return { ...base, reason: action.reason };
    case "answer_safety":
    case "do_not_reply":
    case "fallback_clarify":
      return { ...base, reason: "reason" in action ? action.reason : "clarification" };
  }
}

function summarizeReplyPlan(plan: ReplyPlan) {
  if (plan.mode === "silent") {
    return { action: plan.action, mode: plan.mode, reason: plan.reason };
  }
  if (plan.mode === "generated") {
    return {
      action: plan.action,
      dialogueAct: plan.dialogueAct,
      knowledgeQuery: {
        areaKeys: [...plan.knowledgeQuery.areaKeys],
        concernKeys: [...plan.knowledgeQuery.concernKeys],
        treatmentKeys: [...plan.knowledgeQuery.treatmentKeys],
      },
      mode: plan.mode,
      responseContext: { ...plan.responseContext },
    };
  }
  return {
    action: plan.action,
    dialogueAct: plan.dialogueAct,
    mode: plan.mode,
    pricingQuery: plan.pricingQuery
      ? {
          kind: plan.pricingQuery.kind,
          treatmentKeys: [...plan.pricingQuery.treatmentKeys],
        }
      : undefined,
    pricingSubjectSource: plan.pricingSubjectSource ?? null,
    templateKey: plan.templateKey,
  };
}

export function legacyActionFamily(
  decision: LegacyDecisionSnapshot,
): ConversationV2ActionFamily {
  if (["human_active", "ai_paused", "closed"].includes(decision.conversationStatus ?? "")) {
    return "silent";
  }
  if (decision.decisionType === "conversation_state_blocked" || decision.decisionType === "group_source_ignored") {
    return "silent";
  }
  if (decision.decisionType === "handoff_pending") return "handoff";
  if (decision.decisionType === "medical_guidance_reply") return "safety";
  if (decision.decisionType === "booking_intake_reply") return "booking";
  if (decision.decisionType === "pricing_auto_reply") return "price";
  if (["clinic_info_reply", "doctor_schedule_auto_reply"].includes(decision.decisionType)) return "clinic_info";
  if (["treatment_intro_reply", "faq_auto_reply", "ai_auto_reply"].includes(decision.decisionType)) return "treatment";
  return "fallback";
}

export function v2ActionFamily(action: DialoguePolicyAction): ConversationV2ActionFamily {
  switch (action.type) {
    case "start_booking":
    case "capture_booking_fields":
      return "booking";
    case "answer_clinic_info":
      return "clinic_info";
    case "answer_price":
      return "price";
    case "queue_handoff":
      return "handoff";
    case "answer_safety":
      return "safety";
    case "do_not_reply":
      return "silent";
    case "learn_treatment":
    case "answer_selection":
      return "treatment";
    case "clarify":
    case "fallback_clarify":
      return "fallback";
  }
}

function replayIdentity(record: ConversationV2ShadowInputRecord) {
  return record.lineMessageId
    ? `message:${record.lineMessageId}`
    : record.sourceEventId
      ? `event:${record.sourceEventId}`
      : `message:${record.messageId}`;
}

function deterministicHardDecision(
  decision: LegacyDecisionSnapshot,
): ConversationV2NluSupplement["hardDecision"] | undefined {
  if (decision.matchedKey === "post_procedure_emergency") {
    return {
      reason: "deterministic_post_procedure_emergency",
      speechAct: "urgent_safety",
    };
  }
  if (
    decision.decisionType === "handoff_pending" ||
    [
      "human_request",
      "plastic_surgery_scope",
      "post_procedure_issue",
      "pregnancy_caution",
      "serious_complaint",
    ].includes(decision.matchedKey)
  ) {
    return {
      reason: `deterministic_${decision.matchedKey}`,
      speechAct: "request_handoff",
    };
  }
  return undefined;
}

/**
 * Replays captured turns in stable event order. This function never performs
 * I/O, renders text, sends LINE messages, or mutates live booking/handoff data.
 */
export function replayConversationV2Shadow(input: {
  episodeId: string;
  records: readonly ConversationV2ShadowInputRecord[];
  tenantId: string;
  totalCustomerMessages?: number;
  userId: string;
}) : ConversationV2ShadowReplay {
  const adaptedByIdentity = new Map<string, ReturnType<typeof adaptNluFrameToConversationV2Turn>>();
  const inputByIdentity = new Map<string, ConversationV2ShadowInputRecord>();
  const replayRecords: ConversationV2ShadowRecord[] = input.records.map((record) => {
    const booking = bookingSupplement(record.text);
    const hardDecision = deterministicHardDecision(record.legacyDecision);
    const supplemental = booking || hardDecision
      ? {
          ...(booking ? { booking } : {}),
          ...(hardDecision ? { hardDecision } : {}),
        }
      : undefined;
    const turn = adaptNluFrameToConversationV2Turn({
      frame: record.frame,
      ...(record.ontology ? { ontology: record.ontology } : {}),
      receivedAt: new Date(record.lineTimestamp).toISOString(),
      ...(supplemental ? { supplemental } : {}),
      text: record.text,
      turnId: record.sourceEventId || record.messageId,
    });
    const identity = replayIdentity(record);
    adaptedByIdentity.set(identity, turn);
    inputByIdentity.set(identity, record);
    return {
      episodeId: input.episodeId,
      lineTimestamp: record.lineTimestamp,
      messageId: record.lineMessageId || (!record.sourceEventId ? record.messageId : undefined),
      schemaVersion: CONVERSATION_V2_REPLAY_RECORD_SCHEMA_VERSION,
      tenantId: input.tenantId,
      turn,
      userId: input.userId,
      webhookEventId: record.sourceEventId,
    };
  });
  const repository = new ConversationV2ReplayRepository({
    now: () => new Date(0).toISOString(),
  });
  const replay = repository.replay({
    episodeId: input.episodeId,
    records: replayRecords,
    tenantId: input.tenantId,
    userId: input.userId,
  });
  const totalCustomerMessages = input.totalCustomerMessages ?? input.records.length;
  const complete = input.records.length === totalCustomerMessages && replay.status === "complete";
  const firstAt = replay.steps[0]
    ? new Date(replay.steps[0].lineTimestamp).toISOString()
    : new Date(0).toISOString();
  let stateBefore = createConversationV2State({ episodeId: replay.episodeId, now: firstAt });
  const turns: ConversationV2ShadowTurnRecord[] = replay.steps.flatMap((step) => {
    const record = inputByIdentity.get(step.identity);
    const adapted = adaptedByIdentity.get(step.identity);
    if (!record || !adapted) return [];
    const turn = {
      ...adapted,
      receivedAt: new Date(step.lineTimestamp).toISOString(),
      turnId: step.identity,
    };
    const legacyFamily = legacyActionFamily(record.legacyDecision);
    const actionFamily = v2ActionFamily(step.result.action);
    const divergenceCategories = [
      ...(!complete ? ["v2_incomplete_history"] : []),
      ...(replay.status === "conflict" ? ["v2_replay_conflict"] : []),
      ...(actionFamily !== legacyFamily ? ["v2_action_disagreement"] : []),
    ];
    const summarized: ConversationV2ShadowTurnRecord = {
      action: summarizeAction(step.result.action),
      actionFamily,
      divergenceCategories,
      duplicate: false,
      legacyActionFamily: legacyFamily,
      messageId: record.messageId,
      ...(record.ontologySnapshotId ? { ontologySnapshotId: record.ontologySnapshotId } : {}),
      replyPlan: summarizeReplyPlan(step.result.replyPlan),
      stateAfter: summarizeState(step.state),
      stateBefore: summarizeState(stateBefore),
      understanding: summarizeUnderstanding(turn),
    };
    stateBefore = step.state;
    return [summarized];
  });

  return {
    adapterVersion: CONVERSATION_V2_NLU_ADAPTER_VERSION,
    conflicts: replay.conflicts.map((conflict) => ({
      ...conflict,
      identity: opaqueShadowTurnId(conflict.identity),
    })),
    coverage: {
      complete,
      duplicateRecordCount: replay.duplicateRecordCount,
      frameCount: input.records.length,
      totalCustomerMessages,
    },
    finalState: summarizeState(replay.state),
    policyVersion: CONVERSATION_V2_SHADOW_POLICY_VERSION,
    replayStatus: replay.status,
    schemaVersion: CONVERSATION_V2_SHADOW_SCHEMA_VERSION,
    turns,
  };
}
