import crypto from "node:crypto";

import {
  loadClinicFactsSnapshot,
  runtimeClinicFactsProvider,
  type ClinicFactsProvider,
  type ClinicFactsSnapshot,
} from "@/lib/clinic-facts";
import {
  findAllTreatmentsByMessage,
} from "@/lib/clinic-config";
import {
  type ConversationContext,
  type RecentConversationTurn,
} from "@/lib/conversation-context";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { selectHigherPriorityHandoffReason } from "@/lib/handoff-priority";
import {
  extractExplicitPendingHandoffTopic,
  extractPendingHandoffTopicSuffix,
  getRepeatedHandoffAcknowledgement,
  isPendingMedicalContinuation,
} from "@/lib/handoff-continuation";
import { resolveDoctorScheduleDecision } from "@/lib/doctor-schedule";
import { reportOperationalError } from "@/lib/monitoring";
import { requestNluFrame } from "@/lib/nlu-shadow";
import { legacyDecisionToReplyPlan } from "@/lib/reply-plan";
import type { RouterDecision } from "@/lib/router";
import { runImmediateSafetyPreflight } from "@/lib/safety-preflight";

import { buildConversationV2BookingUnderstanding } from "./booking-adapter";
import {
  evaluateConversationV2CanaryGate,
  type ConversationV2CanaryGate,
} from "./canary-gate";
import {
  hydrateConversationV2ReplyPlan,
  type HydratedConversationV2Reply,
} from "./hydrate-reply-plan";
import { adaptNluFrameToConversationV2Turn } from "./nlu-adapter";
import { routeConversationTurnV2 } from "./engine";
import {
  cloneConversationV2State,
  createConversationV2State,
  nextMissingBookingField,
  recordConversationV2TurnReceipt,
} from "./state";
import type {
  ConversationV2State,
  TurnUnderstanding,
} from "./types";
import type { ConversationV2ToolRequest } from "./data-gap-policy";

const DEFAULT_TENANT_ID = "tenant_001";

export type ConversationV2LiveRouteInput = {
  context: ConversationContext;
  eventIdentity: string;
  message: string;
  now: Date;
  pendingHandoffReason?: null | string;
  recentTurns?: readonly RecentConversationTurn[];
  sourceType: string;
  sourceUserId: string;
  tenantId?: string;
};

export type ConversationV2LiveRouteResult =
  | {
      gate: ConversationV2CanaryGate;
      kind: "not_eligible";
    }
  | {
      aiModel?: string;
      aiTokensIn?: number;
      aiTokensOut?: number;
      dataStatus: HydratedConversationV2Reply["dataStatus"] | "preflight" | "unavailable";
      decision: RouterDecision;
      gate: ConversationV2CanaryGate;
      kind: "routed";
      snapshotId?: string;
      toolRequest?: ConversationV2ToolRequest;
    };

export type ConversationV2LiveDependencies = {
  factsProvider?: ClinicFactsProvider;
  getCanarySettings?: () => {
    allowlistedUserIds: readonly string[];
    mode: "canary" | "off" | "shadow";
  };
  requestFrame?: typeof requestNluFrame;
};

function opaqueTurnId(identity: string) {
  return `turn_${crypto.createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
}

function newEpisodeId() {
  return `v2:${crypto.randomUUID()}`;
}

function timestamp(value: string | undefined) {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function initialState(input: ConversationV2LiveRouteInput) {
  const persistedV2State = input.context.conversationV2State;
  const latestLegacyActivity = Math.max(
    timestamp(input.context.lastSeenAt),
    timestamp(input.context.bookingSession?.lastActiveAt),
  );
  if (
    persistedV2State &&
    latestLegacyActivity <= timestamp(persistedV2State.updatedAt)
  ) {
    return cloneConversationV2State(persistedV2State);
  }

  // V1 keeps the opaque V2 blob while the canary is disabled. If V1 has
  // accepted a newer turn, the blob is stale and must not overwrite the newer
  // legacy booking/topic when the account re-enters the canary.
  const state = createConversationV2State({ episodeId: newEpisodeId(), now: input.now.toISOString() });
  if (persistedV2State) {
    state.processedTurnIds = [...persistedV2State.processedTurnIds];
    if (
      persistedV2State.lastProcessedTurnId &&
      state.processedTurnIds.includes(persistedV2State.lastProcessedTurnId)
    ) {
      state.lastProcessedTurnId = persistedV2State.lastProcessedTurnId;
    }
  }
  if (input.context.bookingSession?.status !== "collecting") return state;

  const legacy = input.context.bookingDraft;
  const intent = input.context.lastIntent === "booking_cancel_request"
    ? "cancel" as const
    : input.context.lastIntent === "booking_modify_request" || input.context.activeFocus?.goal === "manage_booking"
      ? "modify" as const
      : "create" as const;
  const treatmentKeys = legacy.treatment
    ? findAllTreatmentsByMessage(legacy.treatment).map((treatment) => treatment.key)
    : [];
  const timeSlots = Array.from(new Set([
    ...(legacy.timeSlots ?? []),
    ...(legacy.requestedTimeSlots ?? []),
  ].filter(Boolean)));
  const appointmentReference = [legacy.name, legacy.phone].filter(Boolean).join(" ") || undefined;
  const draft = intent === "create"
    ? {
        ...(legacy.branch ? { branch: legacy.branch } : {}),
        ...(legacy.isFirstVisit === "yes" ? { firstVisit: true } : {}),
        ...(legacy.isFirstVisit === "no" ? { firstVisit: false } : {}),
        ...(legacy.name ? { name: legacy.name } : {}),
        ...(legacy.phone ? { phone: legacy.phone } : {}),
        timeSlots,
        treatmentKeys,
      }
    : {
        ...(appointmentReference ? { appointmentReference } : {}),
        timeSlots: [],
        treatmentKeys: [],
      };
  const expectedField = nextMissingBookingField(draft, intent);
  state.activeTask = {
    id: `${state.episodeId}:legacy-booking`,
    kind: "booking",
    startedAt: input.context.lastSeenAt ?? input.now.toISOString(),
  };
  state.bookingTask = {
    draft,
    expectedField,
    id: `${state.episodeId}:legacy-booking`,
    intent,
    status: expectedField ? "collecting" : "completed",
  };
  state.knowledge.treatmentKeys = [...treatmentKeys];
  return state;
}

function focusGoal(state: ConversationV2State): NonNullable<ConversationContext["activeFocus"]>["goal"] {
  if (state.activeTask.kind === "compare_treatments") return "compare_options";
  if (state.activeTask.kind === "pricing") return "ask_price";
  if (state.activeTask.kind === "clinic_info") return "ask_clinic_info";
  if (state.activeTask.kind === "booking") {
    return state.bookingTask.intent === "create" ? "book_consultation" : "manage_booking";
  }
  if (state.activeTask.kind === "safety") return "post_procedure_help";
  if (["learn_treatment", "answer_concern"].includes(state.activeTask.kind)) return "learn_treatment";
  return "other";
}

function treatmentName(snapshot: ClinicFactsSnapshot, key: string) {
  return snapshot.ontology.treatments.find((treatment) => treatment.key === key)?.name ?? key;
}

function bookingProvidesExpectedField(
  booking: ReturnType<typeof buildConversationV2BookingUnderstanding>,
  expectedField: ConversationV2State["bookingTask"]["expectedField"],
) {
  const fields = booking?.fields;
  if (!fields || !expectedField) return false;
  switch (expectedField) {
    case "treatment": return Boolean(fields.treatmentKeys?.length);
    case "branch": return Boolean(fields.branch);
    case "time_slots": return Boolean(fields.timeSlots?.length);
    case "first_visit": return fields.firstVisit !== undefined;
    case "name": return Boolean(fields.name);
    case "phone": return Boolean(fields.phone);
    case "appointment_reference": return Boolean(fields.appointmentReference);
    // Arbitrary prose is populated as a changeRequest by the deterministic
    // adapter only after a modify task exists. It is not sufficient evidence
    // to release a pending medical continuation; an explicit modify speech act
    // must establish that topic instead.
    case "change_request": return false;
  }
}

function bookingProvidesNonSensitiveExpectedField(
  booking: ReturnType<typeof buildConversationV2BookingUnderstanding>,
  expectedField: ConversationV2State["bookingTask"]["expectedField"],
  message: string,
) {
  const normalized = message.replace(/\s+/gu, "");
  if (
    /[?？]/u.test(message) ||
    /(?:嗎|呢)$/u.test(normalized) ||
    /(?:副作用|效果|功效|價格|價錢|多少|介紹|了解|是什麼|怎麼|禁忌|恢復期|營業|停車|地址)/u.test(normalized)
  ) {
    return false;
  }
  return ["treatment", "branch", "time_slots", "first_visit"].includes(
    expectedField ?? "",
  ) && bookingProvidesExpectedField(booking, expectedField);
}

function isStrictBookingContactSubmission(input: {
  booking: ReturnType<typeof buildConversationV2BookingUnderstanding>;
  message: string;
  state: ConversationV2State;
}) {
  if (!input.booking?.fields?.name && !input.booking?.fields?.phone) return false;
  const normalized = input.message.replace(/\s+/gu, "");
  if (
    /[?？]/u.test(input.message) ||
    /(?:嗎|呢)$/u.test(normalized) ||
    /(?:查|查詢|確認|核對|誰|哪位|哪個人|哪個客人|對應|會員|紀錄|記錄|帳號|我的資料)/u.test(normalized)
  ) {
    return false;
  }
  if (input.booking.explicit) return true;
  if (/(?:姓名|名字|聯絡人|電話|手機|聯絡電話)\s*[：:]/u.test(input.message)) return true;
  return ["name", "phone", "appointment_reference"].includes(
    input.state.bookingTask.expectedField ?? "",
  );
}

function isClinicContactInquiry(message: string) {
  const normalized = message.replace(/\s+/gu, "");
  return (
    /(?:你們|診所|分店|分館|館別).{0,10}(?:電話|聯絡方式|怎麼聯絡)/u.test(normalized) ||
    /(?:電話|聯絡方式).{0,10}(?:是你們|是診所|是分店|是分館)/u.test(normalized)
  );
}

function projectStateToContext(input: {
  context: ConversationContext;
  matchedKey: string;
  snapshot: ClinicFactsSnapshot;
  state: ConversationV2State;
}) {
  const nextContext = structuredClone(input.context);
  const treatmentKeys = input.state.knowledge.treatmentKeys;
  const primaryTreatmentKey = treatmentKeys[0];
  nextContext.conversationV2State = cloneConversationV2State(input.state);
  nextContext.lastIntent = input.matchedKey;
  nextContext.lastSeenAt = input.state.updatedAt;
  if (primaryTreatmentKey) {
    nextContext.lastReferencedTreatment = treatmentName(input.snapshot, primaryTreatmentKey);
  }
  nextContext.activeFocus = {
    answeredTopics: [],
    areaKeys: [...input.state.knowledge.areaKeys],
    bookingExplicit: input.state.bookingTask.intent !== "none",
    concernKeys: [...input.state.knowledge.concernKeys],
    goal: focusGoal(input.state),
    ...(primaryTreatmentKey ? { treatmentKey: primaryTreatmentKey } : {}),
  };

  if (input.state.bookingTask.status !== "inactive") {
    const draft = input.state.bookingTask.draft;
    const previousBookingId = input.context.conversationV2State?.bookingTask.id;
    const startsNewBooking = Boolean(
      input.state.bookingTask.id && input.state.bookingTask.id !== previousBookingId,
    );
    if (input.state.bookingTask.intent === "create") {
      // A canonical V2 create draft is authoritative. Rebuilding it from
      // scratch prevents old customer/contact/branch fields from reappearing.
      nextContext.bookingDraft = {
        ...(draft.branch ? { branch: draft.branch } : {}),
        ...(draft.firstVisit !== undefined ? { isFirstVisit: draft.firstVisit ? "yes" : "no" } : {}),
        ...(draft.name ? { name: draft.name } : {}),
        ...(draft.phone ? { phone: draft.phone } : {}),
        requestedTimeSlots: [...draft.timeSlots],
        timeSlots: [...draft.timeSlots],
        ...(draft.treatmentKeys.length > 0
          ? { treatment: draft.treatmentKeys.map((key) => treatmentName(input.snapshot, key)).join("、") }
          : {}),
      };
    }
    nextContext.bookingSession = {
      action: input.state.bookingTask.intent === "create" && startsNewBooking
        ? "replace"
        : "use_current",
      lastActiveAt: input.state.updatedAt,
      status: input.state.bookingTask.status === "collecting" ? "collecting" : "stale",
    };
  }

  return nextContext;
}

function normalizeDecisionType(value: string): RouterDecision["decisionType"] {
  const allowed: RouterDecision["decisionType"][] = [
    "booking_intake_reply",
    "clinic_info_reply",
    "doctor_schedule_auto_reply",
    "fallback_reply",
    "faq_auto_reply",
    "handoff_pending",
    "medical_guidance_reply",
    "pricing_auto_reply",
    "treatment_intro_reply",
  ];
  return allowed.includes(value as RouterDecision["decisionType"])
    ? value as RouterDecision["decisionType"]
    : "fallback_reply";
}

function deterministicFallback(
  context: ConversationContext,
  state: ConversationV2State,
  reason: string,
  turnId: string,
  at: string,
): RouterDecision {
  const receivedState = recordConversationV2TurnReceipt(state, turnId, at);
  const replyText = "剛剛沒有完整理解您的問題，我先不亂猜。請再告訴我想了解的療程、部位或困擾，我會接著整理 😊";
  const replyPlan = legacyDecisionToReplyPlan(
    {
      decisionType: "fallback_reply",
      matchedKey: `conversation_v2_unavailable:${reason}`,
      matchedType: "guided_reply",
      replyText,
    },
    {
      dialogueAct: "clarify",
      fallbackText: replyText,
      renderMode: "deterministic",
    },
  );
  return {
    decisionType: "fallback_reply",
    matchedKey: replyPlan.matchedKey,
    matchedType: "guided_reply",
    nextContext: {
      ...context,
      conversationV2State: cloneConversationV2State(receivedState),
      lastIntent: replyPlan.matchedKey,
    },
    replyPlan,
    replyText,
  };
}

function preflightRoute(input: {
  bookingMessage?: string;
  context: ConversationContext;
  existingHandoffReason?: null | string;
  message: string;
  now: Date;
  state: ConversationV2State;
  turnId: string;
}) {
  const booking = buildConversationV2BookingUnderstanding({
    message: input.bookingMessage ?? input.message,
    state: input.state,
  });
  const preflight = runImmediateSafetyPreflight({
    message: input.message,
    now: input.now,
    // Name/phone supplied as booking fields are not an account lookup. Merely
    // having an active booking task is insufficient: "查我的會員紀錄" must
    // still reach the deterministic personal-data handoff before any model.
    skipCustomerAccountLookup: isClinicContactInquiry(input.message) ||
      isStrictBookingContactSubmission({
        booking,
        message: input.message,
        state: input.state,
      }),
  });
  if (!preflight) return null;

  let state = cloneConversationV2State(input.state);
  let effectiveHandoffReason = preflight.matchedKey;
  if (preflight.decisionType === "handoff_pending") {
    effectiveHandoffReason = selectHigherPriorityHandoffReason(
      input.existingHandoffReason ?? state.control.handoff?.reason ?? null,
      preflight.matchedKey,
    );
    const turn = adaptNluFrameToConversationV2Turn({
      frame: null,
      receivedAt: input.now.toISOString(),
      supplemental: {
        hardDecision: { reason: preflight.matchedKey, speechAct: "request_handoff" },
      },
      text: input.message,
      turnId: input.turnId,
    });
    const routed = routeConversationTurnV2(state, turn);
    if (!routed.duplicate && routed.result) {
      state = routed.nextState;
      if (state.control.handoff) state.control.handoff.reason = effectiveHandoffReason;
    } else {
      state = recordConversationV2TurnReceipt(
        state,
        input.turnId,
        input.now.toISOString(),
      );
    }
  } else {
    state = recordConversationV2TurnReceipt(
      state,
      input.turnId,
      input.now.toISOString(),
    );
  }

  const replyPlan = legacyDecisionToReplyPlan(preflight, {
    dialogueAct: preflight.decisionType === "handoff_pending" ? "handoff" : "answer_safety",
    fallbackText: preflight.replyText,
    handoffReason: preflight.decisionType === "handoff_pending" ? effectiveHandoffReason : undefined,
    renderMode: "deterministic",
    requiresHuman: preflight.decisionType === "handoff_pending",
  });
  return {
    decision: {
      ...preflight,
      nextContext: {
        ...input.context,
        conversationV2State: state,
        lastIntent: preflight.matchedKey,
      },
      replyPlan,
    } satisfies RouterDecision,
    state,
  };
}

export async function routeConversationV2Canary(
  input: ConversationV2LiveRouteInput,
  dependencies: ConversationV2LiveDependencies = {},
): Promise<ConversationV2LiveRouteResult> {
  const config = dependencies.getCanarySettings?.() ?? (() => {
    const runtime = getRuntimeConfig();
    return {
      allowlistedUserIds: runtime.conversationV2CanaryUserIds,
      mode: runtime.conversationV2Mode,
    };
  })();
  const gate = evaluateConversationV2CanaryGate({
    allowlistedUserIds: new Set(config.allowlistedUserIds),
    mode: config.mode,
    sourceType: input.sourceType,
    userId: input.sourceUserId,
  });
  if (!gate.eligible) return { gate, kind: "not_eligible" };

  const state = initialState(input);
  const turnId = opaqueTurnId(input.eventIdentity);
  if (state.processedTurnIds.includes(turnId)) {
    return {
      dataStatus: "ready",
      decision: {
        decisionType: "fallback_reply",
        matchedKey: "conversation_v2:duplicate_turn",
        matchedType: "guided_reply",
        nextContext: input.context,
        replyText: "",
        suppressAiFooter: true,
      },
      gate,
      kind: "routed",
    };
  }
  const connectorSuffix = input.pendingHandoffReason === "post_procedure_issue"
    ? extractPendingHandoffTopicSuffix(input.message)
    : null;
  let pendingTopicMessage = input.pendingHandoffReason === "post_procedure_issue"
    ? extractExplicitPendingHandoffTopic(input.message, {
        activeTreatmentKeys: state.knowledge.treatmentKeys,
      })
    : null;
  if (input.pendingHandoffReason === "post_procedure_issue" && !pendingTopicMessage) {
    const connectorBooking = connectorSuffix
      ? buildConversationV2BookingUnderstanding({
          allowBareExpectedName: ["name", "appointment_reference"].includes(
            state.bookingTask.expectedField ?? "",
          ),
          message: connectorSuffix,
          state,
        })
      : undefined;
    if (
      connectorSuffix &&
      bookingProvidesExpectedField(connectorBooking, state.bookingTask.expectedField)
    ) {
      pendingTopicMessage = connectorSuffix;
    }
  }
  let preflight = preflightRoute({
    ...(pendingTopicMessage ? { bookingMessage: pendingTopicMessage } : {}),
    context: input.context,
    existingHandoffReason: input.pendingHandoffReason,
    message: input.message,
    now: input.now,
    state,
    turnId,
  });
  if (
    connectorSuffix &&
    input.pendingHandoffReason === "post_procedure_issue" &&
    (!preflight || preflight.decision.matchedKey === "post_procedure_issue")
  ) {
    // A deterministic boundary in the new clause must not be hidden by the
    // unresolved symptom in the first clause. This is independent from topic
    // extraction: safety, account, complaint, and human-request preflights are
    // always evaluated on the complete connector suffix.
    const suffixPreflight = preflightRoute({
      bookingMessage: connectorSuffix,
      context: input.context,
      existingHandoffReason: input.pendingHandoffReason,
      message: connectorSuffix,
      now: input.now,
      state,
      turnId,
    });
    if (suffixPreflight) {
      preflight = suffixPreflight;
    } else if (pendingTopicMessage && preflight?.decision.matchedKey === "post_procedure_issue") {
      // The unresolved prefix is already owned by the pending handoff. It must
      // not replace a proven new suffix with the same old acknowledgement.
      preflight = null;
    }
  }
  if (preflight) {
    return {
      dataStatus: "preflight",
      decision: preflight.decision,
      gate,
      kind: "routed",
    };
  }
  if (!pendingTopicMessage && isPendingMedicalContinuation({
    activeTreatmentKeys: state.knowledge.treatmentKeys,
    handoffReason: input.pendingHandoffReason ?? null,
    message: input.message,
  })) {
    const receivedState = recordConversationV2TurnReceipt(state, turnId, input.now.toISOString());
    const handoffReason = input.pendingHandoffReason ?? "post_procedure_issue";
    receivedState.control = {
      handoff: receivedState.control.handoff ?? {
        id: `pending:${turnId}`,
        reason: handoffReason,
        requestedAt: input.now.toISOString(),
        status: "pending",
      },
      mode: "handoff_pending",
    };
    const replyText = getRepeatedHandoffAcknowledgement();
    const replyPlan = legacyDecisionToReplyPlan({
      decisionType: "handoff_pending",
      matchedKey: `handoff_continuation:${handoffReason}`,
      matchedType: "handoff_rule",
      replyText,
    }, {
      dialogueAct: "handoff",
      fallbackText: replyText,
      handoffReason,
      renderMode: "deterministic",
      requiresHuman: true,
    });
    return {
      dataStatus: "preflight",
      decision: {
        decisionType: "handoff_pending",
        matchedKey: replyPlan.matchedKey,
        matchedType: "handoff_rule",
        nextContext: {
          ...input.context,
          conversationV2State: receivedState,
          lastIntent: handoffReason,
        },
        replyPlan,
        replyText,
      },
      gate,
      kind: "routed",
    };
  }
  const routingMessage = pendingTopicMessage ?? input.message;
  try {
    const snapshot = await loadClinicFactsSnapshot(
      dependencies.factsProvider ?? runtimeClinicFactsProvider,
      {
        audienceKey: input.sourceUserId,
        now: input.now,
        tenantId: input.tenantId ?? DEFAULT_TENANT_ID,
      },
    );
    const nlu = await (dependencies.requestFrame ?? requestNluFrame)(routingMessage, {
      ontology: snapshot.ontology,
      recentTurns: input.recentTurns,
    });
    if (!nlu?.frame) {
      return {
        aiModel: nlu?.model,
        aiTokensIn: nlu?.tokensIn,
        aiTokensOut: nlu?.tokensOut,
        dataStatus: "unavailable",
        decision: deterministicFallback(
          input.context,
          state,
          nlu?.errorCode ?? "nlu_unavailable",
          turnId,
          input.now.toISOString(),
        ),
        gate,
        kind: "routed",
        snapshotId: snapshot.snapshotId,
      };
    }

    const parsedBooking = buildConversationV2BookingUnderstanding({
      allowBareExpectedName: nlu.frame.dialogue.speechAct === "provide_booking_field",
      message: routingMessage,
      state,
    });
    const booking = parsedBooking && (
      parsedBooking.explicit ||
      [
        "book_consultation",
        "manage_booking",
        "provide_booking_field",
      ].includes(nlu.frame.dialogue.speechAct) ||
      (
        nlu.frame.dialogue.speechAct === "unknown" &&
        bookingProvidesNonSensitiveExpectedField(
          parsedBooking,
          state.bookingTask.expectedField,
          routingMessage,
        )
      )
    )
      ? parsedBooking
      : undefined;
    const turn: TurnUnderstanding = adaptNluFrameToConversationV2Turn({
      frame: nlu.frame,
      ontology: snapshot.ontology,
      receivedAt: input.now.toISOString(),
      ...(booking ? { supplemental: { booking } } : {}),
      text: routingMessage,
      turnId,
    });
    const routed = routeConversationTurnV2(state, turn);
    if (routed.duplicate || !routed.result) {
      const replyText = "";
      return {
        aiModel: nlu.model,
        aiTokensIn: nlu.tokensIn,
        aiTokensOut: nlu.tokensOut,
        dataStatus: "ready",
        decision: {
          decisionType: "fallback_reply",
          matchedKey: "conversation_v2:duplicate_turn",
          matchedType: "guided_reply",
          nextContext: input.context,
          replyText,
          suppressAiFooter: true,
        },
        gate,
        kind: "routed",
        snapshotId: snapshot.snapshotId,
      };
    }

    const hydrated = await hydrateConversationV2ReplyPlan({
      nextState: routed.nextState,
      result: routed.result,
      snapshot,
      turn,
    }, {
      resolveDoctorSchedule: ({ message, now }) =>
        resolveDoctorScheduleDecision({ fallbackReply: "", message, today: now }),
    });
    const committedState = hydrated.stateCommit === "commit"
      ? routed.nextState
      : recordConversationV2TurnReceipt(state, turn.turnId, turn.receivedAt);
    const rendererPlan = hydrated.rendererPlan;
    if (!rendererPlan) {
      return {
        aiModel: nlu.model,
        aiTokensIn: nlu.tokensIn,
        aiTokensOut: nlu.tokensOut,
        dataStatus: hydrated.dataStatus,
        decision: {
          decisionType: "fallback_reply",
          matchedKey: "conversation_v2:silent",
          matchedType: "guided_reply",
          nextContext: {
            ...input.context,
            conversationV2State: cloneConversationV2State(committedState),
          },
          replyText: "",
          suppressAiFooter: true,
        },
        gate,
        kind: "routed",
        snapshotId: snapshot.snapshotId,
        ...(hydrated.toolRequest ? { toolRequest: hydrated.toolRequest } : {}),
      };
    }
    const nextContext = projectStateToContext({
      context: input.context,
      matchedKey: rendererPlan.matchedKey,
      snapshot,
      state: committedState,
    });
    return {
      aiModel: nlu.model,
      aiTokensIn: nlu.tokensIn,
      aiTokensOut: nlu.tokensOut,
      dataStatus: hydrated.dataStatus,
      decision: {
        decisionType: normalizeDecisionType(rendererPlan.decisionType),
        matchedKey: rendererPlan.matchedKey,
        matchedType: rendererPlan.matchedType as RouterDecision["matchedType"],
        nextContext,
        replyMessages: rendererPlan.richMessages,
        replyPlan: rendererPlan,
        replyText: rendererPlan.fallbackText,
        suppressAiFooter: rendererPlan.suppressAiFooter,
      },
      gate,
      kind: "routed",
      snapshotId: snapshot.snapshotId,
      ...(hydrated.toolRequest ? { toolRequest: hydrated.toolRequest } : {}),
    };
  } catch (error) {
    await reportOperationalError({
      alert: false,
      error,
      source: "conversation_v2_live_route",
    });
    return {
      dataStatus: "unavailable",
      decision: deterministicFallback(
        input.context,
        state,
        "runtime_error",
        turnId,
        input.now.toISOString(),
      ),
      gate,
      kind: "routed",
    };
  }
}
