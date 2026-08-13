import { addBookingTreatment } from "@/lib/booking-state";
import type { BookingTreatmentAction } from "@/lib/conversation-behavior";
import {
  createEmptyConversationContext,
  type BookingDraft,
  type ConversationContext,
  type ConversationFocusGoal,
} from "@/lib/conversation-context";
import {
  closeConversation,
  markHumanTakeover,
  pauseConversationAi,
  recordHandoffPending,
  resumeConversationAi,
  type ConversationState,
  type ConversationStatus,
} from "@/lib/conversation-state";
import { findTreatmentByMessage } from "@/lib/clinic-config";
import { DIALOGUE_ACTS, type DialogueAct as ReplyDialogueAct } from "@/lib/reply-plan";

export const DIALOGUE_STATE_SCHEMA_VERSION = 1 as const;

export type DialogueTopic =
  | "none"
  | "treatment"
  | "booking"
  | "clinic_info"
  | "post_procedure"
  | "handoff";

/** `none` exists only before the first route; every routed turn uses ReplyPlan's canonical act. */
export type DialogueAct = "none" | ReplyDialogueAct;

export type BookingIntent = "none" | "create" | "modify" | "cancel";

export type DialogueAwaiting = {
  kind: "area" | "branch" | "combination" | "concern" | "priority" | "time" | "name" | "phone" | "first_visit";
  questionSummary: string;
};

export type KnownNeed = {
  key: string;
  kind: "area" | "concern" | "goal";
  source: "explicit" | "inferred";
};

export type DialogueState = {
  answeredTopics: string[];
  areaKeys: string[];
  awaiting?: DialogueAwaiting;
  bookingAction: BookingTreatmentAction | null;
  bookingIntent: BookingIntent;
  concernKeys: string[];
  dialogueAct: DialogueAct;
  episodeId: string;
  handoffStatus: ConversationStatus;
  knownNeeds: KnownNeed[];
  lastTransitionAt: string;
  primaryConcernKey?: string;
  schemaVersion: typeof DIALOGUE_STATE_SCHEMA_VERSION;
  topic: DialogueTopic;
  treatmentKeys: string[];
};

export type PersistedDialogueStateV1 = Omit<DialogueState, "handoffStatus">;

export type ConversationContextWithDialogueState = ConversationContext & {
  dialogueState?: PersistedDialogueStateV1;
};

export type DialogueRuntime = {
  dialogue: DialogueState;
  legacyContext: ConversationContextWithDialogueState;
  lifecycle: ConversationState;
};

type DialogueHydrationOptions = {
  forceNewEpisode?: boolean;
  episodeIdFactory?: (userId: string, at: string) => string;
  now?: Date;
};

type BookingFieldsCapturedAction = {
  at: string;
  branch?: string;
  isFirstVisit?: "no" | "unknown" | "yes";
  name?: string;
  phone?: string;
  requestedTimeSlots?: string[];
  timeSlots?: string[];
  type: "booking_fields_captured";
};

export type DialogueAction =
  | { at: string; type: "turn_received" }
  | {
      areaKeys?: string[];
      concernKeys?: string[];
      replaceTreatments?: boolean;
      source?: KnownNeed["source"];
      treatmentKeys?: string[];
      type: "entities_observed";
    }
  | {
      at: string;
      awaiting?: DialogueAwaiting;
      dialogueAct: DialogueAct;
      matchedKey: string;
      topic: DialogueTopic;
      type: "route_selected";
    }
  | { at: string; treatmentKey: string; type: "consultation_started" }
  | {
      aspectKey?: string;
      concernKey: string;
      primary?: boolean;
      treatmentKey: string;
      type: "consultation_concern_recorded";
    }
  | {
      concernKey: string;
      treatmentKey: string;
      type: "consultation_focus_corrected";
    }
  | {
      action: BookingTreatmentAction;
      at: string;
      inheritTreatmentKey?: string;
      inheritTreatmentName?: string;
      intent: Exclude<BookingIntent, "none">;
      treatmentKey?: string;
      treatmentName?: string;
      type: "booking_started";
    }
  | BookingFieldsCapturedAction
  | { at: string; type: "booking_session_expired" }
  | { at: string; type: "confirmed_appointment_expired" }
  | {
      assignedTo?: string;
      at: string;
      autoResumeAfterMinutes?: number;
      reason?: string;
      status: ConversationStatus;
      type: "handoff_transition";
    }
  | { answeredTopics?: string[]; at: string; type: "reply_committed" };

const TOPICS: DialogueTopic[] = ["none", "treatment", "booking", "clinic_info", "post_procedure", "handoff"];
const DIALOGUE_STATE_ACTS: DialogueAct[] = ["none", ...DIALOGUE_ACTS];
const BOOKING_INTENTS: BookingIntent[] = ["none", "create", "modify", "cancel"];
const BOOKING_ACTIONS: BookingTreatmentAction[] = ["add", "replace", "use_current"];
const AWAITING_KINDS: DialogueAwaiting["kind"][] = [
  "area",
  "branch",
  "combination",
  "concern",
  "priority",
  "time",
  "name",
  "phone",
  "first_visit",
];

function uniqueStrings(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return Array.from(new Set(items.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())));
}

function uniqueNeeds(items: KnownNeed[]): KnownNeed[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const identity = `${item.kind}:${item.key}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function normalizeKnownNeeds(value: unknown): KnownNeed[] {
  if (!Array.isArray(value)) return [];
  return uniqueNeeds(
    value.filter((item): item is KnownNeed =>
      Boolean(
        item &&
        typeof item === "object" &&
        ["area", "concern", "goal"].includes(String((item as KnownNeed).kind)) &&
        typeof (item as KnownNeed).key === "string" &&
        (item as KnownNeed).key.trim() &&
        ["explicit", "inferred"].includes(String((item as KnownNeed).source)),
      ),
    ),
  );
}

function normalizeAwaiting(value: unknown): DialogueAwaiting | undefined {
  if (!value || typeof value !== "object") return undefined;
  const awaiting = value as Partial<DialogueAwaiting>;
  if (!AWAITING_KINDS.includes(awaiting.kind as DialogueAwaiting["kind"]) || typeof awaiting.questionSummary !== "string") {
    return undefined;
  }
  return { kind: awaiting.kind as DialogueAwaiting["kind"], questionSummary: awaiting.questionSummary };
}

function normalizeIso(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  return Number.isFinite(new Date(value).getTime()) ? value : fallback;
}

function defaultEpisodeId(userId: string, at: string) {
  return `dialogue:${encodeURIComponent(userId || "anonymous")}:${at}`;
}

function inferTopic(context: ConversationContext): DialogueTopic {
  if (["booking_intake", "booking_modify_request", "booking_cancel_request"].includes(context.lastIntent ?? "")) {
    return "booking";
  }
  switch (context.activeFocus?.goal) {
    case "book_consultation":
    case "manage_booking":
      return "booking";
    case "ask_clinic_info":
      return "clinic_info";
    case "post_procedure_help":
      return "post_procedure";
    case "learn_treatment":
    case "compare_options":
    case "ask_price":
      return "treatment";
    default:
      return context.treatmentConsultation ? "treatment" : "none";
  }
}

function inferDialogueAct(context: ConversationContext): DialogueAct {
  const intent = context.lastIntent ?? "";
  if (intent === "booking_intake") return "collect_booking";
  if (intent === "booking_modify_request" || intent === "booking_cancel_request") return "manage_booking";
  if (intent.startsWith("treatment_intro:")) return "introduce_treatment";
  if (intent.includes(":behavior:combination_comparison")) return "explain_combination";
  if (intent.includes(":behavior:combination_declined") || intent.includes(":behavior:single_treatment_preference")) {
    return "handle_objection";
  }
  if (context.activeFocus?.goal === "ask_price") return "quote_approved_price";
  if (context.activeFocus?.goal === "compare_options") return "compare_options";
  if (context.activeFocus?.goal === "learn_treatment") {
    return context.activeFocus.awaiting ? "discover_need" : "answer_followup";
  }
  return "none";
}

function inferBookingIntent(context: ConversationContext): BookingIntent {
  if (context.lastIntent === "booking_cancel_request") return "cancel";
  if (context.lastIntent === "booking_modify_request") return "modify";
  if (context.lastIntent === "booking_intake" || context.activeFocus?.goal === "book_consultation") return "create";
  if (context.activeFocus?.goal === "manage_booking") return "modify";
  if (context.bookingSession?.status === "collecting") return "create";
  return "none";
}

function resolveTreatmentKey(label: string | undefined) {
  return label ? findTreatmentByMessage(label)?.key : undefined;
}

function inferTreatmentKeys(context: ConversationContext, topic: DialogueTopic) {
  if (topic === "booking") {
    return treatmentKeysFromDraft(context.bookingDraft);
  }
  return uniqueStrings([
    context.treatmentConsultation?.treatmentKey,
    context.activeFocus?.treatmentKey,
    resolveTreatmentKey(context.lastReferencedTreatment),
  ]);
}

function treatmentKeysFromDraft(draft: BookingDraft) {
  return uniqueStrings(
    draft.treatment
      ?.split(/[、,，]/u)
      .map((label) => resolveTreatmentKey(label))
      .filter(Boolean),
  );
}

function inferKnownNeeds(areaKeys: string[], concernKeys: string[]): KnownNeed[] {
  return uniqueNeeds([
    ...areaKeys.map((key) => ({ key, kind: "area" as const, source: "inferred" as const })),
    ...concernKeys.map((key) => ({ key, kind: "concern" as const, source: "inferred" as const })),
  ]);
}

function normalizePersistedDialogueState(value: unknown, fallback: DialogueState): DialogueState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PersistedDialogueStateV1>;
  if (candidate.schemaVersion !== DIALOGUE_STATE_SCHEMA_VERSION || typeof candidate.episodeId !== "string" || !candidate.episodeId) {
    return null;
  }

  const areaKeys = uniqueStrings(candidate.areaKeys);
  const concernKeys = uniqueStrings(candidate.concernKeys);
  return {
    answeredTopics: uniqueStrings(candidate.answeredTopics),
    areaKeys,
    awaiting: normalizeAwaiting(candidate.awaiting),
    bookingAction: BOOKING_ACTIONS.includes(candidate.bookingAction as BookingTreatmentAction)
      ? candidate.bookingAction as BookingTreatmentAction
      : null,
    bookingIntent: BOOKING_INTENTS.includes(candidate.bookingIntent as BookingIntent)
      ? candidate.bookingIntent as BookingIntent
      : "none",
    concernKeys,
    dialogueAct: DIALOGUE_STATE_ACTS.includes(candidate.dialogueAct as DialogueAct)
      ? candidate.dialogueAct as DialogueAct
      : "none",
    episodeId: candidate.episodeId,
    handoffStatus: fallback.handoffStatus,
    knownNeeds: normalizeKnownNeeds(candidate.knownNeeds),
    lastTransitionAt: normalizeIso(candidate.lastTransitionAt, fallback.lastTransitionAt),
    primaryConcernKey: typeof candidate.primaryConcernKey === "string" ? candidate.primaryConcernKey : undefined,
    schemaVersion: DIALOGUE_STATE_SCHEMA_VERSION,
    topic: TOPICS.includes(candidate.topic as DialogueTopic) ? candidate.topic as DialogueTopic : "none",
    treatmentKeys: uniqueStrings(candidate.treatmentKeys),
  };
}

export function hydrateDialogueState(
  context: ConversationContextWithDialogueState,
  lifecycle: ConversationState,
  options: DialogueHydrationOptions = {},
): DialogueState {
  const now = options.now ?? new Date();
  const at = normalizeIso(
    context.bookingSession?.lastActiveAt ?? context.lastSeenAt ?? lifecycle.updatedAt,
    now.toISOString(),
  );
  const topic = inferTopic(context);
  const areaKeys = uniqueStrings(context.activeFocus?.areaKeys);
  const concernKeys = uniqueStrings(context.treatmentConsultation?.concernKeys ?? context.activeFocus?.concernKeys);
  const answeredTopics = uniqueStrings(
    context.treatmentConsultation?.answeredAspectKeys ?? context.activeFocus?.answeredTopics,
  );
  const fallback: DialogueState = {
    answeredTopics,
    areaKeys,
    awaiting: normalizeAwaiting(context.activeFocus?.awaiting),
    bookingAction: context.bookingSession?.action ?? null,
    bookingIntent: inferBookingIntent(context),
    concernKeys,
    dialogueAct: inferDialogueAct(context),
    episodeId: (options.episodeIdFactory ?? defaultEpisodeId)(context.userId, at),
    handoffStatus: lifecycle.status,
    knownNeeds: inferKnownNeeds(areaKeys, concernKeys),
    lastTransitionAt: at,
    primaryConcernKey: context.treatmentConsultation?.primaryConcernKey,
    schemaVersion: DIALOGUE_STATE_SCHEMA_VERSION,
    topic,
    treatmentKeys: inferTreatmentKeys(context, topic),
  };
  const persisted = normalizePersistedDialogueState(context.dialogueState, fallback);
  if (!persisted) return fallback;

  return {
    ...persisted,
    handoffStatus: lifecycle.status,
  };
}

function cloneBookingDraft(draft: BookingDraft): BookingDraft {
  return {
    ...draft,
    requestedTimeSlots: [...(draft.requestedTimeSlots ?? [])],
    timeSlots: [...(draft.timeSlots ?? [])],
  };
}

function cloneLegacyContext(context: ConversationContextWithDialogueState): ConversationContextWithDialogueState {
  return {
    ...context,
    activeFocus: context.activeFocus
      ? {
          ...context.activeFocus,
          answeredTopics: [...context.activeFocus.answeredTopics],
          areaKeys: [...context.activeFocus.areaKeys],
          awaiting: context.activeFocus.awaiting ? { ...context.activeFocus.awaiting } : undefined,
          concernKeys: [...context.activeFocus.concernKeys],
        }
      : undefined,
    bookingDraft: cloneBookingDraft(context.bookingDraft),
    bookingSession: context.bookingSession ? { ...context.bookingSession } : undefined,
    confirmedAppointment: context.confirmedAppointment ? { ...context.confirmedAppointment } : undefined,
    customerProfile: context.customerProfile ? { ...context.customerProfile } : undefined,
    dialogueState: context.dialogueState
      ? {
          ...context.dialogueState,
          answeredTopics: [...context.dialogueState.answeredTopics],
          areaKeys: [...context.dialogueState.areaKeys],
          awaiting: context.dialogueState.awaiting ? { ...context.dialogueState.awaiting } : undefined,
          concernKeys: [...context.dialogueState.concernKeys],
          knownNeeds: context.dialogueState.knownNeeds.map((need) => ({ ...need })),
          treatmentKeys: [...context.dialogueState.treatmentKeys],
        }
      : undefined,
    recentTurns: context.recentTurns?.map((turn) => ({ ...turn })),
    treatmentConsultation: context.treatmentConsultation
      ? {
          ...context.treatmentConsultation,
          answeredAspectKeys: [...(context.treatmentConsultation.answeredAspectKeys ?? [])],
          concernKeys: [...context.treatmentConsultation.concernKeys],
        }
      : undefined,
  };
}

function cloneDialogueState(state: DialogueState): DialogueState {
  return {
    ...state,
    answeredTopics: [...state.answeredTopics],
    areaKeys: [...state.areaKeys],
    awaiting: state.awaiting ? { ...state.awaiting } : undefined,
    concernKeys: [...state.concernKeys],
    knownNeeds: state.knownNeeds.map((need) => ({ ...need })),
    treatmentKeys: [...state.treatmentKeys],
  };
}

function toPersistedDialogueState(state: DialogueState): PersistedDialogueStateV1 {
  const { handoffStatus: _handoffStatus, ...persisted } = cloneDialogueState(state);
  return persisted;
}

/**
 * Transitional adapter used while legacy context fields are still persisted.
 * It derives one canonical snapshot after routing without projecting stale
 * canonical values back over the legacy decision that just won the turn.
 */
export function synchronizeDialogueStateFromLegacy(
  context: ConversationContextWithDialogueState,
  lifecycle: ConversationState,
  options: DialogueHydrationOptions = {},
) {
  const previous = context.dialogueState
    ? hydrateDialogueState(context, lifecycle, options)
    : null;
  const derived = hydrateDialogueState(
    { ...context, dialogueState: undefined },
    lifecycle,
    options,
  );
  const sameTreatmentEpisode = Boolean(
    !options.forceNewEpisode &&
    previous &&
      previous.topic === derived.topic &&
      previous.bookingIntent === derived.bookingIntent &&
      previous.treatmentKeys[0] === derived.treatmentKeys[0],
  );
  const dialogue = {
    ...derived,
    episodeId: options.forceNewEpisode
      ? `${derived.episodeId}:restart`
      : sameTreatmentEpisode && previous
        ? previous.episodeId
        : derived.episodeId,
    treatmentKeys: sameTreatmentEpisode && previous
      ? uniqueStrings([...previous.treatmentKeys, ...derived.treatmentKeys])
      : derived.treatmentKeys,
  };
  return {
    ...context,
    dialogueState: toPersistedDialogueState(dialogue),
  } satisfies ConversationContextWithDialogueState;
}

function goalFromDialogueState(state: DialogueState): ConversationFocusGoal {
  if (state.topic === "booking") {
    return state.bookingIntent === "create" ? "book_consultation" : "manage_booking";
  }
  if (state.topic === "clinic_info") return "ask_clinic_info";
  if (state.topic === "post_procedure") return "post_procedure_help";
  if (state.dialogueAct === "quote_approved_price") return "ask_price";
  if (state.topic === "treatment") return "learn_treatment";
  return "other";
}

export function projectDialogueState(
  dialogue: DialogueState,
  context: ConversationContextWithDialogueState,
  lifecycle: ConversationState,
): DialogueRuntime {
  const legacyContext = cloneLegacyContext(context);
  const projectedDialogue = { ...cloneDialogueState(dialogue), handoffStatus: lifecycle.status };
  legacyContext.dialogueState = toPersistedDialogueState(projectedDialogue);

  if (["treatment", "booking", "clinic_info", "post_procedure"].includes(projectedDialogue.topic)) {
    legacyContext.activeFocus = {
      answeredTopics: [...projectedDialogue.answeredTopics],
      areaKeys: [...projectedDialogue.areaKeys],
      awaiting: projectedDialogue.awaiting
        ? {
            kind: ["name", "phone", "first_visit"].includes(projectedDialogue.awaiting.kind)
              ? "priority"
              : projectedDialogue.awaiting.kind,
            questionSummary: projectedDialogue.awaiting.questionSummary,
          } as NonNullable<ConversationContext["activeFocus"]>["awaiting"]
        : undefined,
      bookingExplicit: projectedDialogue.bookingIntent !== "none",
      concernKeys: [...projectedDialogue.concernKeys],
      goal: goalFromDialogueState(projectedDialogue),
      requestedInfo: projectedDialogue.dialogueAct === "quote_approved_price" ? "price" : undefined,
      treatmentKey: projectedDialogue.treatmentKeys[0],
    };
  }

  if (projectedDialogue.topic === "treatment" && projectedDialogue.treatmentKeys[0]) {
    legacyContext.treatmentConsultation = {
      answeredAspectKeys: [...projectedDialogue.answeredTopics],
      concernKeys: [...projectedDialogue.concernKeys],
      primaryConcernKey: projectedDialogue.primaryConcernKey,
      stage: projectedDialogue.primaryConcernKey ? "priority_selected" : "needs_discovery",
      treatmentKey: projectedDialogue.treatmentKeys[0],
    };
  }

  if (projectedDialogue.bookingAction) {
    legacyContext.bookingSession = {
      action: projectedDialogue.bookingAction,
      lastActiveAt: legacyContext.bookingSession?.lastActiveAt ?? projectedDialogue.lastTransitionAt,
      status: legacyContext.bookingSession?.status ?? "collecting",
    };
  }

  return {
    dialogue: projectedDialogue,
    legacyContext,
    lifecycle: { ...lifecycle },
  };
}

export function createDialogueRuntime(
  context: ConversationContextWithDialogueState,
  lifecycle: ConversationState,
  options: DialogueHydrationOptions = {},
): DialogueRuntime {
  return projectDialogueState(hydrateDialogueState(context, lifecycle, options), context, lifecycle);
}

function addNeeds(state: DialogueState, kind: KnownNeed["kind"], keys: string[], source: KnownNeed["source"]) {
  return uniqueNeeds([
    ...state.knownNeeds,
    ...keys.map((key) => ({ key, kind, source })),
  ]);
}

export function reduceDialogueState(state: DialogueState, action: DialogueAction): DialogueState {
  const next = cloneDialogueState(state);

  switch (action.type) {
    case "turn_received":
      return { ...next, lastTransitionAt: action.at };
    case "entities_observed": {
      const source = action.source ?? "explicit";
      const areaKeys = uniqueStrings([...next.areaKeys, ...(action.areaKeys ?? [])]);
      const concernKeys = uniqueStrings([...next.concernKeys, ...(action.concernKeys ?? [])]);
      return {
        ...next,
        areaKeys,
        concernKeys,
        knownNeeds: addNeeds(
          { ...next, knownNeeds: addNeeds(next, "area", action.areaKeys ?? [], source) },
          "concern",
          action.concernKeys ?? [],
          source,
        ),
        treatmentKeys: action.replaceTreatments
          ? uniqueStrings(action.treatmentKeys ?? [])
          : uniqueStrings([...next.treatmentKeys, ...(action.treatmentKeys ?? [])]),
      };
    }
    case "route_selected":
      return {
        ...next,
        awaiting: action.awaiting ? { ...action.awaiting } : undefined,
        dialogueAct: action.dialogueAct,
        lastTransitionAt: action.at,
        topic: action.topic,
      };
    case "consultation_started":
      return {
        ...next,
        answeredTopics: [],
        areaKeys: [],
        awaiting: { kind: "concern", questionSummary: "確認想改善的部位或困擾" },
        concernKeys: [],
        dialogueAct: "introduce_treatment",
        knownNeeds: [],
        lastTransitionAt: action.at,
        primaryConcernKey: undefined,
        topic: "treatment",
        treatmentKeys: [action.treatmentKey],
      };
    case "consultation_concern_recorded": {
      const treatmentChanged = next.treatmentKeys[0] !== action.treatmentKey;
      const concernKeys = uniqueStrings([
        ...(treatmentChanged ? [] : next.concernKeys),
        action.concernKey,
      ]);
      const answeredTopics = uniqueStrings([
        ...(treatmentChanged ? [] : next.answeredTopics),
        ...(action.aspectKey ? [action.aspectKey] : []),
      ]);
      return {
        ...next,
        answeredTopics,
        awaiting: { kind: "priority", questionSummary: "確認最在意的改善方向" },
        concernKeys,
        dialogueAct: "answer_followup",
        knownNeeds: uniqueNeeds([
          ...(treatmentChanged ? [] : next.knownNeeds.filter((need) => need.kind !== "concern")),
          { key: action.concernKey, kind: "concern", source: "explicit" },
        ]),
        primaryConcernKey: action.primary
          ? action.concernKey
          : treatmentChanged
            ? action.concernKey
            : next.primaryConcernKey ?? (concernKeys.length === 1 ? action.concernKey : undefined),
        topic: "treatment",
        treatmentKeys: [action.treatmentKey],
      };
    }
    case "consultation_focus_corrected":
      return {
        ...next,
        answeredTopics: [],
        areaKeys: [],
        awaiting: { kind: "priority", questionSummary: "依客人更正後的困擾繼續說明" },
        concernKeys: [action.concernKey],
        dialogueAct: "discover_need",
        knownNeeds: [{ key: action.concernKey, kind: "concern", source: "explicit" }],
        primaryConcernKey: action.concernKey,
        topic: "treatment",
        treatmentKeys: [action.treatmentKey],
      };
    case "booking_started": {
      const selectedTreatmentKey = action.treatmentKey ?? action.inheritTreatmentKey;
      return {
        ...next,
        awaiting: { kind: "branch", questionSummary: "收集預約所需資料" },
        bookingAction: action.action,
        bookingIntent: action.intent,
        dialogueAct: action.intent === "create" ? "collect_booking" : "manage_booking",
        lastTransitionAt: action.at,
        topic: "booking",
        treatmentKeys: action.action === "add"
          ? uniqueStrings([...next.treatmentKeys, selectedTreatmentKey])
          : selectedTreatmentKey
            ? [selectedTreatmentKey]
            : next.treatmentKeys,
      };
    }
    case "booking_fields_captured":
      return { ...next, lastTransitionAt: action.at };
    case "booking_session_expired":
      return {
        ...next,
        awaiting: undefined,
        bookingAction: null,
        bookingIntent: "none",
        dialogueAct: next.topic === "booking" ? "none" : next.dialogueAct,
        lastTransitionAt: action.at,
        topic: next.topic === "booking" ? "none" : next.topic,
        treatmentKeys: next.topic === "booking" ? [] : next.treatmentKeys,
      };
    case "confirmed_appointment_expired":
      return {
        ...next,
        awaiting: undefined,
        bookingAction: null,
        bookingIntent: "none",
        dialogueAct: "none",
        lastTransitionAt: action.at,
        topic: "none",
        treatmentKeys: [],
      };
    case "handoff_transition":
      return {
        ...next,
        handoffStatus: action.status,
        lastTransitionAt: action.at,
      };
    case "reply_committed":
      return {
        ...next,
        answeredTopics: uniqueStrings([...next.answeredTopics, ...(action.answeredTopics ?? [])]),
        lastTransitionAt: action.at,
      };
    default:
      return next;
  }
}

function freshBookingDraft(): BookingDraft {
  return cloneBookingDraft(createEmptyConversationContext("").bookingDraft);
}

function applyBookingStartToLegacy(context: ConversationContextWithDialogueState, action: Extract<DialogueAction, { type: "booking_started" }>) {
  const treatmentName = action.treatmentName ?? action.inheritTreatmentName;
  if (action.action === "replace") {
    const previousDraft = context.bookingDraft;
    if (previousDraft.name || previousDraft.phone) {
      context.customerProfile = {
        ...context.customerProfile,
        ...(previousDraft.name ? { name: previousDraft.name } : {}),
        ...(previousDraft.phone ? { phone: previousDraft.phone } : {}),
      };
    }
    context.bookingDraft = freshBookingDraft();
    if (treatmentName) context.bookingDraft.treatment = treatmentName;
  } else if (action.action === "add" && treatmentName) {
    context.bookingDraft.treatment = addBookingTreatment(context.bookingDraft.treatment, treatmentName);
  } else if (action.treatmentName) {
    context.bookingDraft.treatment = addBookingTreatment(context.bookingDraft.treatment, action.treatmentName);
  }

  context.bookingSession = {
    action: action.action,
    lastActiveAt: action.at,
    status: "collecting",
  };
}

function applyBookingFieldsToLegacy(context: ConversationContextWithDialogueState, dialogue: DialogueState, action: BookingFieldsCapturedAction) {
  if (action.branch) context.bookingDraft.branch = action.branch;
  if (action.isFirstVisit) context.bookingDraft.isFirstVisit = action.isFirstVisit;
  if (action.name) {
    context.bookingDraft.name = action.name;
    context.customerProfile = { ...context.customerProfile, name: action.name };
  }
  if (action.phone) {
    context.bookingDraft.phone = action.phone;
    context.customerProfile = { ...context.customerProfile, phone: action.phone };
  }

  const suppliedTimes = uniqueStrings(action.timeSlots);
  const suppliedRequestedTimes = uniqueStrings(action.requestedTimeSlots);
  if (dialogue.bookingIntent === "modify") {
    const requested = suppliedRequestedTimes.length > 0 ? suppliedRequestedTimes : suppliedTimes;
    if (requested.length > 0) context.bookingDraft.requestedTimeSlots = requested.slice(0, 3);
  } else if (suppliedTimes.length > 0) {
    context.bookingDraft.timeSlots = uniqueStrings([...context.bookingDraft.timeSlots, ...suppliedTimes]).slice(0, 3);
  }

  if (context.bookingSession) {
    context.bookingSession = { ...context.bookingSession, lastActiveAt: action.at, status: "collecting" };
  }
}

function applyHandoffToLifecycle(lifecycle: ConversationState, action: Extract<DialogueAction, { type: "handoff_transition" }>) {
  switch (action.status) {
    case "handoff_pending":
      return recordHandoffPending(lifecycle, action.reason ?? lifecycle.handoffReason ?? "handoff", action.at);
    case "human_active":
      return markHumanTakeover(lifecycle, {
        assignedTo: action.assignedTo,
        autoResumeAfterMinutes: action.autoResumeAfterMinutes,
        sentAt: action.at,
      });
    case "ai_paused":
      return pauseConversationAi(lifecycle, action.at);
    case "closed":
      return closeConversation(lifecycle, action.at);
    case "ai_active":
      return resumeConversationAi(lifecycle, action.at);
    default:
      return lifecycle;
  }
}

export function reduceDialogueRuntime(runtime: DialogueRuntime, action: DialogueAction): DialogueRuntime {
  let legacyContext = cloneLegacyContext(runtime.legacyContext);
  let lifecycle = { ...runtime.lifecycle };
  let dialogue = reduceDialogueState(runtime.dialogue, action);

  switch (action.type) {
    case "route_selected":
      legacyContext.lastIntent = action.matchedKey;
      break;
    case "booking_started":
      applyBookingStartToLegacy(legacyContext, action);
      dialogue = { ...dialogue, treatmentKeys: treatmentKeysFromDraft(legacyContext.bookingDraft) };
      break;
    case "booking_fields_captured":
      applyBookingFieldsToLegacy(legacyContext, dialogue, action);
      break;
    case "booking_session_expired":
      legacyContext.bookingDraft = freshBookingDraft();
      legacyContext.bookingSession = {
        action: runtime.dialogue.bookingAction ?? "use_current",
        lastActiveAt: action.at,
        status: "stale",
      };
      if (["booking_intake", "booking_modify_request", "booking_cancel_request"].includes(legacyContext.lastIntent ?? "")) {
        delete legacyContext.lastIntent;
      }
      break;
    case "confirmed_appointment_expired":
      legacyContext.bookingDraft = freshBookingDraft();
      delete legacyContext.bookingSession;
      delete legacyContext.confirmedAppointment;
      delete legacyContext.lastIntent;
      delete legacyContext.lastReferencedBranch;
      delete legacyContext.lastReferencedTreatment;
      delete legacyContext.locationPreference;
      delete legacyContext.preferredBranch;
      delete legacyContext.pregnancyRiskFlag;
      delete legacyContext.treatmentConsultation;
      break;
    case "handoff_transition":
      lifecycle = applyHandoffToLifecycle(lifecycle, action);
      dialogue = { ...dialogue, handoffStatus: lifecycle.status };
      break;
    default:
      break;
  }

  return projectDialogueState(dialogue, legacyContext, lifecycle);
}

function topicForDialogueAct(dialogueAct: DialogueAct, currentTopic: DialogueTopic): DialogueTopic {
  if (dialogueAct === "handoff") return "handoff";
  if (dialogueAct === "collect_booking" || dialogueAct === "manage_booking") return "booking";
  if (dialogueAct === "answer_clinic_info") return "clinic_info";
  if (dialogueAct === "answer_safety") return currentTopic === "post_procedure" ? "post_procedure" : currentTopic;
  if (dialogueAct === "quote_approved_price") return currentTopic === "booking" ? "booking" : "treatment";
  if (
    [
      "introduce_treatment",
      "discover_need",
      "answer_followup",
      "compare_options",
      "explain_combination",
      "handle_objection",
      "recommend_direction",
      "invite_consultation",
    ].includes(dialogueAct)
  ) {
    return "treatment";
  }
  return currentTopic;
}

function awaitingFromReplyPlan(
  dialogueAct: DialogueAct,
  nextQuestion: string | undefined,
  current: DialogueAwaiting | undefined,
): DialogueAwaiting | undefined {
  if (!nextQuestion?.trim()) return current ? { ...current } : undefined;

  const questionSummary = nextQuestion.trim();
  const normalized = questionSummary.normalize("NFKC").replace(/\s+/gu, "");
  if (/(?:搭配|組合|單做).{0,12}(?:差|不同|比較)|(?:差異|差別).{0,12}(?:搭配|組合|單做)/u.test(normalized)) {
    return { kind: "combination", questionSummary };
  }
  if (/(?:館別|哪一館|哪個館|分館)/u.test(normalized)) {
    return { kind: "branch", questionSummary };
  }
  if (/(?:日期|時段|平日|假日|白天|晚上)/u.test(normalized)) {
    return { kind: "time", questionSummary };
  }
  if (/(?:姓名|名字)/u.test(normalized)) {
    return { kind: "name", questionSummary };
  }
  if (/(?:電話|手機|聯絡方式)/u.test(normalized)) {
    return { kind: "phone", questionSummary };
  }
  if (/(?:初診|第一次來)/u.test(normalized)) {
    return { kind: "first_visit", questionSummary };
  }
  if (/(?:部位|困擾|想改善哪|哪一種)/u.test(normalized)) {
    return { kind: "concern", questionSummary };
  }
  if (["answer_followup", "compare_options", "explain_combination", "handle_objection", "recommend_direction"].includes(dialogueAct)) {
    return { kind: "priority", questionSummary };
  }
  return current ? { ...current } : undefined;
}

/** Commit the policy's single winning act through the canonical reducer. */
export function commitDialogueRouteSelection(
  context: ConversationContextWithDialogueState,
  lifecycle: ConversationState,
  input: {
    dialogueAct: DialogueAct;
    matchedKey: string;
    nextQuestion?: string;
    now?: Date;
    replaceTreatmentContext?: boolean;
    treatmentKeys?: string[];
  },
) {
  const at = (input.now ?? new Date()).toISOString();
  const current = hydrateDialogueState(context, lifecycle, { now: input.now });
  const shouldObserveTreatments = input.treatmentKeys !== undefined && (
    input.treatmentKeys.length > 0 || input.replaceTreatmentContext === true
  );
  const withTreatments = shouldObserveTreatments
    ? reduceDialogueState(current, {
        replaceTreatments: input.replaceTreatmentContext,
        treatmentKeys: input.treatmentKeys,
        type: "entities_observed",
      })
    : current;
  const dialogue = reduceDialogueState(withTreatments, {
    at,
    awaiting: awaitingFromReplyPlan(input.dialogueAct, input.nextQuestion, withTreatments.awaiting),
    dialogueAct: input.dialogueAct,
    matchedKey: input.matchedKey,
    topic: topicForDialogueAct(input.dialogueAct, withTreatments.topic),
    type: "route_selected",
  });
  return {
    ...context,
    dialogueState: toPersistedDialogueState(dialogue),
  } satisfies ConversationContextWithDialogueState;
}
