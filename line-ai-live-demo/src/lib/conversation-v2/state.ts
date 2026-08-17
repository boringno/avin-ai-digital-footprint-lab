import {
  CONVERSATION_V2_SCHEMA_VERSION,
  type ActiveTask,
  type AwaitingOption,
  type AwaitingState,
  type BookingDraft,
  type BookingField,
  type BookingIntent,
  type ConversationV2State,
  type DialoguePolicyAction,
  type KnowledgeContext,
  type TreatmentResponseContext,
} from "./types";

function unique(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function cloneDraft(draft: BookingDraft): BookingDraft {
  return {
    ...draft,
    timeSlots: [...draft.timeSlots],
    treatmentKeys: [...draft.treatmentKeys],
  };
}

function cloneAwaiting(awaiting: AwaitingState | undefined): AwaitingState | undefined {
  return awaiting
    ? {
        ...awaiting,
        options: awaiting.options.map((option) => ({ ...option })),
        pendingKnowledge: awaiting.pendingKnowledge
          ? {
              areaKeys: [...awaiting.pendingKnowledge.areaKeys],
              concernKeys: [...awaiting.pendingKnowledge.concernKeys],
              treatmentKeys: [...awaiting.pendingKnowledge.treatmentKeys],
            }
          : undefined,
        responseContext: awaiting.responseContext
          ? {
              ...awaiting.responseContext,
              affirmedAreaKeys: [...awaiting.responseContext.affirmedAreaKeys],
              affirmedConcernKeys: [...awaiting.responseContext.affirmedConcernKeys],
              affirmedTreatmentKeys: [...awaiting.responseContext.affirmedTreatmentKeys],
              declinedTreatmentKeys: [...awaiting.responseContext.declinedTreatmentKeys],
              excludedAreaKeys: [...awaiting.responseContext.excludedAreaKeys],
              excludedConcernKeys: [...awaiting.responseContext.excludedConcernKeys],
              excludedTreatmentKeys: [...awaiting.responseContext.excludedTreatmentKeys],
            }
          : undefined,
      }
    : undefined;
}

function cloneKnowledge(knowledge: KnowledgeContext): KnowledgeContext {
  return {
    approvedFactIds: [...knowledge.approvedFactIds],
    areaKeys: [...knowledge.areaKeys],
    concernKeys: [...knowledge.concernKeys],
    treatmentKeys: [...knowledge.treatmentKeys],
  };
}

export function cloneConversationV2State(state: ConversationV2State): ConversationV2State {
  return {
    ...state,
    activeTask: { ...state.activeTask },
    awaiting: cloneAwaiting(state.awaiting),
    bookingTask: {
      ...state.bookingTask,
      draft: cloneDraft(state.bookingTask.draft),
    },
    control: {
      ...state.control,
      handoff: state.control.handoff ? { ...state.control.handoff } : undefined,
    },
    knowledge: cloneKnowledge(state.knowledge),
    pricingSubjectTreatmentKeys: [...state.pricingSubjectTreatmentKeys],
    preferences: {
      ...state.preferences,
      excludedAreaKeys: [...state.preferences.excludedAreaKeys],
      excludedConcernKeys: [...state.preferences.excludedConcernKeys],
      excludedTreatmentKeys: [...state.preferences.excludedTreatmentKeys],
    },
    processedTurnIds: [...state.processedTurnIds],
  };
}

export function createConversationV2State(input: {
  episodeId: string;
  now: string;
}): ConversationV2State {
  return {
    activeTask: { id: `${input.episodeId}:idle`, kind: "idle", startedAt: input.now },
    bookingTask: {
      draft: { timeSlots: [], treatmentKeys: [] },
      intent: "none",
      status: "inactive",
    },
    control: { mode: "ai_active" },
    episodeId: input.episodeId,
    knowledge: {
      approvedFactIds: [],
      areaKeys: [],
      concernKeys: [],
      treatmentKeys: [],
    },
    pricingSubjectTreatmentKeys: [],
    processedTurnIds: [],
    preferences: {
      excludedAreaKeys: [],
      excludedConcernKeys: [],
      excludedTreatmentKeys: [],
      treatmentApproach: "unspecified",
    },
    revision: 0,
    schemaVersion: CONVERSATION_V2_SCHEMA_VERSION,
    updatedAt: input.now,
  };
}

/**
 * Records an accepted event without applying a fact-dependent policy action.
 * A held turn must still be idempotent: the same LINE event cannot mutate the
 * conversation later merely because the clinic data source changed meanwhile.
 */
export function recordConversationV2TurnReceipt(
  state: ConversationV2State,
  turnId: string,
  at: string,
): ConversationV2State {
  const next = cloneConversationV2State(state);
  if (next.processedTurnIds.includes(turnId)) return next;
  return {
    ...next,
    lastProcessedTurnId: turnId,
    processedTurnIds: [...next.processedTurnIds, turnId].slice(-PROCESSED_TURN_ID_LIMIT),
    revision: next.revision + 1,
    updatedAt: at,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Treat persisted V2 state as untrusted JSON. This intentionally validates the
 * state envelope and every array cloned by the reducer; malformed or older
 * payloads start a fresh V2 episode instead of crashing the LINE webhook.
 */
export function parsePersistedConversationV2State(value: unknown): ConversationV2State | null {
  if (!isRecord(value) || value.schemaVersion !== CONVERSATION_V2_SCHEMA_VERSION) return null;
  const activeTask = value.activeTask;
  const bookingTask = value.bookingTask;
  const control = value.control;
  const knowledge = value.knowledge;
  const preferences = value.preferences;
  if (
    !isRecord(activeTask) ||
    typeof activeTask.id !== "string" ||
    typeof activeTask.kind !== "string" ||
    typeof activeTask.startedAt !== "string" ||
    !isRecord(bookingTask) ||
    !isRecord(bookingTask.draft) ||
    !isStringArray(bookingTask.draft.timeSlots) ||
    !isStringArray(bookingTask.draft.treatmentKeys) ||
    !["none", "create", "modify", "cancel"].includes(String(bookingTask.intent)) ||
    !["inactive", "collecting", "suspended", "completed"].includes(String(bookingTask.status)) ||
    !isRecord(control) ||
    !["ai_active", "handoff_pending", "human_active", "ai_paused", "closed"].includes(String(control.mode)) ||
    typeof value.episodeId !== "string" || !value.episodeId ||
    !isRecord(knowledge) ||
    !isStringArray(knowledge.approvedFactIds) ||
    !isStringArray(knowledge.areaKeys) ||
    !isStringArray(knowledge.concernKeys) ||
    !isStringArray(knowledge.treatmentKeys) ||
    !isStringArray(value.pricingSubjectTreatmentKeys) ||
    !isStringArray(value.processedTurnIds) ||
    !isRecord(preferences) ||
    !isStringArray(preferences.excludedAreaKeys) ||
    !isStringArray(preferences.excludedConcernKeys) ||
    !isStringArray(preferences.excludedTreatmentKeys) ||
    !["single", "unspecified"].includes(String(preferences.treatmentApproach)) ||
    !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  try {
    return cloneConversationV2State(value as unknown as ConversationV2State);
  } catch {
    return null;
  }
}

export const PROCESSED_TURN_ID_LIMIT = 64;

function appendProcessedTurnId(state: ConversationV2State, turnId: string) {
  return [...state.processedTurnIds, turnId].slice(-PROCESSED_TURN_ID_LIMIT);
}

function nextTask(
  state: ConversationV2State,
  kind: ActiveTask["kind"],
  at: string,
  turnId: string,
  subjectKey?: string,
): ActiveTask {
  return state.activeTask.kind === kind && state.activeTask.subjectKey === subjectKey
    ? { ...state.activeTask }
    : { id: `${state.episodeId}:${turnId}:${kind}`, kind, startedAt: at, subjectKey };
}

function mergeKnowledge(
  state: ConversationV2State,
  values: Partial<Pick<KnowledgeContext, "areaKeys" | "concernKeys" | "treatmentKeys">>,
  mode: "merge" | "replace_active_subject" = "merge",
  responseContext?: TreatmentResponseContext,
): KnowledgeContext {
  const base = mode === "replace_active_subject"
    ? { approvedFactIds: [], areaKeys: [], concernKeys: [], treatmentKeys: [] }
    : cloneKnowledge(state.knowledge);
  const excludedAreaKeys = new Set(responseContext?.excludedAreaKeys ?? []);
  const excludedConcernKeys = new Set(responseContext?.excludedConcernKeys ?? []);
  const excludedTreatmentKeys = new Set(responseContext?.excludedTreatmentKeys ?? []);
  return {
    approvedFactIds: [...base.approvedFactIds],
    areaKeys: unique([...base.areaKeys, ...(values.areaKeys ?? [])]).filter(
      (key) => !excludedAreaKeys.has(key),
    ),
    concernKeys: unique([...base.concernKeys, ...(values.concernKeys ?? [])]).filter(
      (key) => !excludedConcernKeys.has(key),
    ),
    treatmentKeys: unique([...base.treatmentKeys, ...(values.treatmentKeys ?? [])]).filter(
      (key) => !excludedTreatmentKeys.has(key),
    ),
  };
}

function updatePreferences(
  state: ConversationV2State,
  responseContext: TreatmentResponseContext,
  selectedKnowledge: Partial<Pick<KnowledgeContext, "areaKeys" | "concernKeys" | "treatmentKeys">> = {},
) {
  const affirmedAreas = new Set([
    ...responseContext.affirmedAreaKeys,
    ...(selectedKnowledge.areaKeys ?? []),
  ]);
  const affirmedConcerns = new Set([
    ...responseContext.affirmedConcernKeys,
    ...(selectedKnowledge.concernKeys ?? []),
  ]);
  const affirmedTreatments = new Set([
    ...responseContext.affirmedTreatmentKeys,
    ...(selectedKnowledge.treatmentKeys ?? []),
  ]);
  const treatmentApproach = responseContext.conversationMove === "prefer_single"
    ? "single" as const
    : ["compare", "replace", "start"].includes(responseContext.conversationMove)
      ? "unspecified" as const
      : state.preferences.treatmentApproach;
  return {
    excludedAreaKeys: unique([
      ...state.preferences.excludedAreaKeys,
      ...responseContext.excludedAreaKeys,
    ]).filter((key) => !affirmedAreas.has(key)),
    excludedConcernKeys: unique([
      ...state.preferences.excludedConcernKeys,
      ...responseContext.excludedConcernKeys,
    ]).filter((key) => !affirmedConcerns.has(key)),
    excludedTreatmentKeys: unique([
      ...state.preferences.excludedTreatmentKeys,
      ...responseContext.excludedTreatmentKeys,
    ]).filter((key) => !affirmedTreatments.has(key)),
    treatmentApproach,
  };
}

function suspendBooking(state: ConversationV2State) {
  return state.bookingTask.status === "collecting"
    ? { ...state.bookingTask, draft: cloneDraft(state.bookingTask.draft), status: "suspended" as const }
    : { ...state.bookingTask, draft: cloneDraft(state.bookingTask.draft) };
}

export const BOOKING_FIELDS_BY_INTENT: Record<Exclude<BookingIntent, "none">, BookingField[]> = {
  cancel: ["appointment_reference"],
  create: ["treatment", "branch", "time_slots", "first_visit", "name", "phone"],
  modify: ["appointment_reference", "change_request"],
};

export function nextMissingBookingField(
  draft: BookingDraft,
  intent: Exclude<BookingIntent, "none">,
): BookingField | undefined {
  const completed: Record<BookingField, boolean> = {
    appointment_reference: Boolean(draft.appointmentReference),
    branch: Boolean(draft.branch),
    change_request: Boolean(draft.changeRequest),
    first_visit: typeof draft.firstVisit === "boolean",
    name: Boolean(draft.name),
    phone: Boolean(draft.phone),
    time_slots: draft.timeSlots.length > 0,
    treatment: draft.treatmentKeys.length > 0,
  };
  return BOOKING_FIELDS_BY_INTENT[intent].find((field) => !completed[field]);
}

function bookingFieldPrompt(field: BookingField) {
  const prompts: Record<BookingField, string> = {
    appointment_reference: "請提供原預約的姓名、電話或預約日期，方便辨識原預約。",
    branch: "請問較方便前往哪個館別？",
    change_request: "這次想更改哪項內容？例如日期時段、館別或療程。",
    first_visit: "請問是第一次到診嗎？",
    name: "請問怎麼稱呼您？",
    phone: "請留下方便聯絡的電話。",
    time_slots: "請提供三個方便的日期與時段。",
    treatment: "想預約了解哪一項療程或困擾呢？",
  };
  return prompts[field];
}

function bookingAwaiting(turnId: string, field: BookingField): AwaitingState {
  return {
    allowMultiple: field === "time_slots",
    expectedField: field,
    id: `${turnId}:booking:${field}`,
    options: [],
    prompt: bookingFieldPrompt(field),
  };
}

function treatmentSubjectKey(action: Extract<DialoguePolicyAction, { type: "learn_treatment" | "clarify" }>) {
  if (action.taskKind === "compare_treatments") {
    return `comparison:${[...action.treatmentKeys].sort().join("+")}`;
  }
  if (action.treatmentKeys.length > 0) {
    return `treatment:${[...action.treatmentKeys].sort().join("+")}`;
  }
  return `concern:${[...action.concernKeys, ...action.areaKeys].sort().join("+")}`;
}

function knowledgeSubjectKey(
  kind: "learn_treatment" | "compare_treatments" | "answer_concern",
  knowledge: KnowledgeContext,
) {
  if (kind === "compare_treatments") {
    return `comparison:${[...knowledge.treatmentKeys].sort().join("+")}`;
  }
  if (knowledge.treatmentKeys.length > 0) {
    return `treatment:${[...knowledge.treatmentKeys].sort().join("+")}`;
  }
  return `concern:${[...knowledge.concernKeys, ...knowledge.areaKeys].sort().join("+")}`;
}

function knowledgeFromOptions(options: AwaitingOption[]) {
  return {
    areaKeys: options.filter((option) => option.entity === "area").map((option) => option.value),
    concernKeys: options.filter((option) => option.entity === "concern").map((option) => option.value),
    treatmentKeys: options.filter((option) => option.entity === "treatment").map((option) => option.value),
  };
}

/** Pure reducer: it never mutates the input state and performs no I/O. */
export function reduceConversationV2State(
  state: ConversationV2State,
  action: DialoguePolicyAction,
): ConversationV2State {
  let next = cloneConversationV2State(state);
  if (state.processedTurnIds.includes(action.turnId)) {
    return next;
  }
  if (action.preferenceContext) {
    const excludedPricingSubjects = new Set(action.preferenceContext.excludedTreatmentKeys);
    const clinicTreatmentKeys = action.type === "answer_clinic_info"
      ? action.preferenceContext.affirmedTreatmentKeys
      : [];
    const clinicOwnsExplicitTreatment = clinicTreatmentKeys.length > 0;
    const shouldUpdateOpenCreateBooking =
      next.bookingTask.intent === "create" &&
      ["collecting", "suspended"].includes(next.bookingTask.status);
    const bookingDraft = shouldUpdateOpenCreateBooking
      ? {
          ...next.bookingTask.draft,
          treatmentKeys: next.bookingTask.draft.treatmentKeys.filter(
            (key) => !excludedPricingSubjects.has(key),
          ),
        }
      : next.bookingTask.draft;
    const bookingExpectedField = shouldUpdateOpenCreateBooking
      ? nextMissingBookingField(bookingDraft, "create")
      : next.bookingTask.expectedField;
    next = {
      ...next,
      bookingTask: shouldUpdateOpenCreateBooking
        ? {
            ...next.bookingTask,
            draft: bookingDraft,
            expectedField: bookingExpectedField,
          }
        : next.bookingTask,
      knowledge: mergeKnowledge(
        next,
        {
          areaKeys: action.preferenceContext.affirmedAreaKeys,
          concernKeys: action.preferenceContext.affirmedConcernKeys,
          treatmentKeys: clinicTreatmentKeys,
        },
        clinicOwnsExplicitTreatment ? "replace_active_subject" : "merge",
        action.preferenceContext,
      ),
      preferences: updatePreferences(next, action.preferenceContext),
      pricingSubjectTreatmentKeys: next.pricingSubjectTreatmentKeys.filter(
        (key) => !excludedPricingSubjects.has(key),
      ),
    };
  }
  const common = {
    lastProcessedTurnId: action.turnId,
    processedTurnIds: appendProcessedTurnId(state, action.turnId),
    revision: state.revision + 1,
    updatedAt: action.at,
  };

  switch (action.type) {
    case "learn_treatment": {
      const knowledge = mergeKnowledge(
        next,
        action,
        action.knowledgeMode,
        action.responseContext,
      );
      const taskKind = action.taskKind === "compare_treatments" && knowledge.treatmentKeys.length < 2
        ? knowledge.treatmentKeys.length > 0
          ? "learn_treatment" as const
          : "answer_concern" as const
        : action.taskKind;
      const subjectKey = knowledgeSubjectKey(taskKind, knowledge);
      return {
        ...next,
        ...common,
        activeTask: nextTask(next, taskKind, action.at, action.turnId, subjectKey),
        awaiting: undefined,
        bookingTask: suspendBooking(next),
        knowledge,
        preferences: updatePreferences(next, action.responseContext),
      };
    }
    case "clarify": {
      const subjectKey = treatmentSubjectKey(action);
      return {
        ...next,
        ...common,
        activeTask: nextTask(next, action.taskKind, action.at, action.turnId, subjectKey),
        awaiting: cloneAwaiting({ ...action.awaiting, responseContext: action.responseContext }),
        bookingTask: suspendBooking(next),
        knowledge: action.knowledgeMode === "replace_active_subject"
          ? mergeKnowledge(next, {}, "replace_active_subject", action.responseContext)
          : mergeKnowledge(next, {}, "merge", action.responseContext),
        preferences: updatePreferences(next, action.responseContext),
      };
    }
    case "answer_selection": {
      const selectedKnowledge = knowledgeFromOptions(action.selectedOptions);
      const treatmentKeys = action.taskKind === "compare_treatments"
        ? unique([...action.treatmentKeys, ...selectedKnowledge.treatmentKeys])
        : selectedKnowledge.treatmentKeys.length > 0
          ? selectedKnowledge.treatmentKeys
          : action.treatmentKeys;
      const knowledge = mergeKnowledge(
        next,
        {
          areaKeys: [...action.areaKeys, ...selectedKnowledge.areaKeys],
          concernKeys: [...action.concernKeys, ...selectedKnowledge.concernKeys],
          treatmentKeys,
        },
        action.knowledgeMode,
        action.responseContext,
      );
      return {
        ...next,
        ...common,
        activeTask: {
          ...next.activeTask,
          kind: action.taskKind,
          subjectKey: knowledgeSubjectKey(action.taskKind, knowledge),
        },
        awaiting: undefined,
        bookingTask: suspendBooking(next),
        knowledge,
        preferences: updatePreferences(next, action.responseContext, selectedKnowledge),
      };
    }
    case "start_booking": {
      const previousDraft = { timeSlots: [], treatmentKeys: [] };
      const supplied = action.initialDraft;
      const draft: BookingDraft = {
        ...previousDraft,
        ...supplied,
        timeSlots: unique(supplied.timeSlots ?? previousDraft.timeSlots),
        treatmentKeys: unique(supplied.treatmentKeys ?? previousDraft.treatmentKeys),
      };
      const expectedField = nextMissingBookingField(draft, action.intent);
      return {
        ...next,
        ...common,
        activeTask: nextTask(next, "booking", action.at, action.turnId),
        awaiting: expectedField ? bookingAwaiting(action.turnId, expectedField) : undefined,
        bookingTask: {
          draft,
          expectedField,
          id: `${next.episodeId}:${action.turnId}:booking`,
          intent: action.intent,
          status: expectedField ? "collecting" : "completed",
        },
      };
    }
    case "capture_booking_fields": {
      const supplied = action.fields;
      const draft: BookingDraft = {
        ...next.bookingTask.draft,
        ...supplied,
        timeSlots: unique(supplied.timeSlots ?? next.bookingTask.draft.timeSlots),
        treatmentKeys: unique(
          supplied.treatmentKeys ?? next.bookingTask.draft.treatmentKeys,
        ),
      };
      const bookingIntent = next.bookingTask.intent;
      const expectedField = bookingIntent === "none"
        ? undefined
        : nextMissingBookingField(draft, bookingIntent);
      return {
        ...next,
        ...common,
        awaiting: expectedField ? bookingAwaiting(action.turnId, expectedField) : undefined,
        bookingTask: {
          ...next.bookingTask,
          draft,
          expectedField,
          status: expectedField ? "collecting" : "completed",
        },
      };
    }
    case "answer_clinic_info": {
      const clinicTreatmentKeys = action.preferenceContext?.affirmedTreatmentKeys ?? [];
      const subjectKey = clinicTreatmentKeys.length > 0
        ? `treatment:${[...clinicTreatmentKeys].sort().join("+")}`
        : undefined;
      return {
        ...next,
        ...common,
        activeTask: nextTask(next, "clinic_info", action.at, action.turnId, subjectKey),
        awaiting: undefined,
        bookingTask: suspendBooking(next),
      };
    }
    case "answer_price":
      return {
        ...next,
        ...common,
        activeTask: nextTask(next, "pricing", action.at, action.turnId),
        awaiting: undefined,
        bookingTask: suspendBooking(next),
        pricingSubjectTreatmentKeys: [...action.treatmentKeys],
      };
    case "queue_handoff":
      return {
        ...next,
        ...common,
        control: {
          handoff: {
            id: action.handoffId,
            reason: action.reason,
            requestedAt: action.at,
            status: "pending",
          },
          mode: "handoff_pending",
        },
      };
    case "answer_safety":
      return {
        ...next,
        ...common,
        activeTask: nextTask(next, "safety", action.at, action.turnId),
        awaiting: undefined,
        bookingTask: suspendBooking(next),
      };
    case "do_not_reply":
    case "fallback_clarify":
      return { ...next, ...common };
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}
