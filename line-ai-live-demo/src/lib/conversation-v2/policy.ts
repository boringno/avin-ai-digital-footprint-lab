import {
  isPureAwaitingSelectionAnswer,
  resolveAwaitingSelection,
} from "./selection";
import type {
  AwaitingState,
  BookingDraft,
  ConversationV2State,
  DeterministicReplyPlan,
  DialoguePolicyAction,
  DialoguePolicyResult,
  GeneratedReplyPlan,
  ReplyKnowledgeQuery,
  ReplyPlan,
  TurnUnderstanding,
} from "./types";

function keys(items: readonly { key: string }[]) {
  return Array.from(new Set(items.map((item) => item.key.trim()).filter(Boolean)));
}

function affirmedMentions<T extends { polarity: "affirmed" | "negated" }>(
  items: readonly T[],
) {
  return items.filter((item) => item.polarity === "affirmed");
}

function confirmedKeys(
  turn: TurnUnderstanding,
  items: readonly {
    confidence: number;
    key: string;
    polarity: "affirmed" | "negated";
    resolution: "resolved" | "underspecified";
  }[],
) {
  if (turn.confidence < 0.65) return [];
  return keys(
    items.filter(
      (item) =>
        item.confidence >= 0.65 &&
        item.polarity === "affirmed" &&
        item.resolution === "resolved",
    ),
  );
}

function activeSubjectKey(input: {
  areaKeys: string[];
  concernKeys: string[];
  taskKind: "learn_treatment" | "compare_treatments" | "answer_concern";
  treatmentKeys: string[];
}) {
  if (input.taskKind === "compare_treatments") {
    return `comparison:${[...input.treatmentKeys].sort().join("+")}`;
  }
  if (input.treatmentKeys.length > 0) {
    return `treatment:${[...input.treatmentKeys].sort().join("+")}`;
  }
  return `concern:${[...input.concernKeys, ...input.areaKeys].sort().join("+")}`;
}

function knowledgeModeForTurn(
  state: ConversationV2State,
  input: Parameters<typeof activeSubjectKey>[0],
) {
  if (input.taskKind === "compare_treatments") return "merge" as const;
  return state.activeTask.subjectKey === activeSubjectKey(input)
    ? "merge" as const
    : "replace_active_subject" as const;
}

function makeAwaiting(turn: TurnUnderstanding): AwaitingState | undefined {
  if (turn.clarification) {
    return {
      allowMultiple: turn.clarification.allowMultiple,
      expectedField: turn.clarification.slot,
      id: `${turn.turnId}:clarify:${turn.clarification.slot}`,
      options: turn.clarification.options.map((option) => ({ ...option })),
      prompt: turn.clarification.prompt,
    };
  }

  const affirmedTreatments = affirmedMentions(turn.treatments);
  const affirmedConcerns = affirmedMentions(turn.concerns);
  const affirmedAreas = affirmedMentions(turn.areas);
  const allMentions = [...affirmedTreatments, ...affirmedConcerns, ...affirmedAreas];
  if (allMentions.length === 0) return undefined;
  const uncertain = turn.confidence < 0.65 || allMentions.some(
    (mention) => mention.confidence < 0.65 || mention.resolution === "underspecified",
  );
  if (!uncertain) return undefined;

  const slot = affirmedTreatments.length > 0
    ? "treatment" as const
    : affirmedConcerns.length > 0
      ? "concern" as const
      : "area" as const;
  const prompts = {
    area: "想確認一下，您主要在意的是哪個部位呢？",
    concern: "想確認一下，您主要想改善哪一種困擾呢？",
    treatment: "想確認一下，您指的是哪一項療程呢？",
  };
  return {
    allowMultiple: false,
    expectedField: slot,
    id: `${turn.turnId}:uncertain:${slot}`,
    options: [],
    prompt: prompts[slot],
  };
}

function toKnowledgeQuery(
  state: ConversationV2State,
  input: Partial<ReplyKnowledgeQuery> = {},
): ReplyKnowledgeQuery {
  const unique = (values: readonly string[]) => Array.from(new Set(values.filter(Boolean)));
  return {
    approvedFactIds: unique([
      ...state.knowledge.approvedFactIds,
      ...(input.approvedFactIds ?? []),
    ]),
    areaKeys: unique([...state.knowledge.areaKeys, ...(input.areaKeys ?? [])]),
    concernKeys: unique([...state.knowledge.concernKeys, ...(input.concernKeys ?? [])]),
    treatmentKeys: unique([
      ...state.knowledge.treatmentKeys,
      ...(input.treatmentKeys ?? []),
    ]),
  };
}

function generatedPlan(
  state: ConversationV2State,
  action: Extract<
    DialoguePolicyAction,
    { type: "learn_treatment" | "answer_selection" }
  >,
): GeneratedReplyPlan {
  if (action.type === "answer_selection") {
    const selectedAreaKeys = action.selectedOptions
      .filter((option) => option.entity === "area")
      .map((option) => option.value);
    const selectedConcernKeys = action.selectedOptions
      .filter((option) => option.entity === "concern")
      .map((option) => option.value);
    const selectedTreatmentKeys = action.selectedOptions
      .filter((option) => option.entity === "treatment")
      .map((option) => option.value);
    const pendingKnowledge = {
      areaKeys: [...action.areaKeys, ...selectedAreaKeys],
      concernKeys: [...action.concernKeys, ...selectedConcernKeys],
      treatmentKeys: action.taskKind === "compare_treatments"
        ? Array.from(new Set([...action.treatmentKeys, ...selectedTreatmentKeys]))
        : selectedTreatmentKeys.length > 0
          ? selectedTreatmentKeys
          : [...action.treatmentKeys],
    };
    return {
      action: action.type,
      dialogueAct: "answer_followup",
      knowledgeQuery: action.knowledgeMode === "replace_active_subject"
        ? { approvedFactIds: [], ...pendingKnowledge }
        : toKnowledgeQuery(state, pendingKnowledge),
      mode: "generated",
      objective: "承接客人選取的所有項目，逐項回答差異或適合方向，不重貼首輪介紹。",
      selectedOptions: action.selectedOptions.map((option) => ({ ...option })),
      sourceTurnId: action.turnId,
    };
  }

  const dialogueAct = action.taskKind === "compare_treatments"
    ? "compare_options"
    : action.taskKind === "answer_concern"
      ? "recommend_direction"
      : "introduce_treatment";
  return {
    action: action.type,
    dialogueAct,
    knowledgeQuery: action.knowledgeMode === "replace_active_subject"
      ? {
          approvedFactIds: [],
          areaKeys: [...action.areaKeys],
          concernKeys: [...action.concernKeys],
          treatmentKeys: [...action.treatmentKeys],
        }
      : toKnowledgeQuery(state, {
          areaKeys: action.areaKeys,
          concernKeys: action.concernKeys,
          treatmentKeys: action.treatmentKeys,
        }),
    mode: "generated",
    objective:
      dialogueAct === "introduce_treatment"
        ? "先用核准知識自然介紹療程價值，再問一個最有助於理解需求的問題。"
        : dialogueAct === "compare_options"
          ? "直接回答比較差異，說明各自處理方向，再推進一個選擇問題。"
          : "承接客人的困擾，說明可評估方向與理由，再問一個必要問題。",
    sourceTurnId: action.turnId,
  };
}

function deterministicPlan(
  action: Exclude<DialoguePolicyAction, { type: "learn_treatment" | "answer_selection" | "do_not_reply" }>,
): DeterministicReplyPlan {
  switch (action.type) {
    case "clarify":
      return {
        action: action.type,
        dialogueAct: "clarify",
        mode: "deterministic",
        nextQuestion: action.awaiting.prompt,
        sourceTurnId: action.turnId,
        templateKey: "clarify_with_options",
        templateVariables: {
          options: action.awaiting.options.map((option) => option.label),
          prompt: action.awaiting.prompt,
        },
      };
    case "start_booking":
    case "capture_booking_fields":
      return {
        action: action.type,
        dialogueAct:
          action.type === "start_booking" && action.intent !== "create"
            ? "manage_booking"
            : "collect_booking",
        mode: "deterministic",
        sourceTurnId: action.turnId,
        templateKey: action.type,
        templateVariables: {},
      };
    case "answer_clinic_info":
      return {
        action: action.type,
        dialogueAct: "answer_clinic_info",
        mode: "deterministic",
        sourceTurnId: action.turnId,
        templateKey: "clinic_info",
        templateVariables: { topic: action.topic ?? "general" },
      };
    case "answer_price":
      return {
        action: action.type,
        dialogueAct: "answer_price",
        mode: "deterministic",
        pricingQuery: {
          kind: action.priceKind,
          treatmentKeys: [...action.treatmentKeys],
        },
        sourceTurnId: action.turnId,
        templateKey: "approved_price_lookup",
        templateVariables: {
          priceKind: action.priceKind,
          treatmentKeys: [...action.treatmentKeys],
        },
      };
    case "queue_handoff":
      return {
        action: action.type,
        dialogueAct: "handoff",
        mode: "deterministic",
        sourceTurnId: action.turnId,
        templateKey: "handoff_queued",
        templateVariables: {},
      };
    case "answer_safety":
      return {
        action: action.type,
        dialogueAct: "answer_safety",
        mode: "deterministic",
        sourceTurnId: action.turnId,
        templateKey: "urgent_safety",
        templateVariables: {},
      };
    case "fallback_clarify":
      return {
        action: action.type,
        dialogueAct: "clarify",
        mode: "deterministic",
        nextQuestion: action.prompt,
        sourceTurnId: action.turnId,
        templateKey: "fallback_clarify",
        templateVariables: { prompt: action.prompt },
      };
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

function planForAction(state: ConversationV2State, action: DialoguePolicyAction): ReplyPlan {
  if (action.type === "do_not_reply") {
    return {
      action: action.type,
      mode: "silent",
      reason: action.reason,
      sourceTurnId: action.turnId,
    };
  }
  if (action.type === "learn_treatment" || action.type === "answer_selection") {
    return generatedPlan(state, action);
  }
  return deterministicPlan(action);
}

function initialDraft(turn: TurnUnderstanding): Partial<BookingDraft> {
  if (turn.confidence < 0.65) return {};
  const fields = turn.booking?.fields ?? {};
  const treatmentKeys = confirmedKeys(turn, turn.treatments);
  if (turn.booking?.intent === "cancel") {
    return { appointmentReference: fields.appointmentReference };
  }
  if (turn.booking?.intent === "modify") {
    return {
      appointmentReference: fields.appointmentReference,
      changeRequest: fields.changeRequest,
    };
  }
  return {
    branch: fields.branch,
    firstVisit: fields.firstVisit,
    name: fields.name,
    phone: fields.phone,
    timeSlots: fields.timeSlots,
    treatmentKeys: treatmentKeys.length > 0
      ? treatmentKeys
      : turn.treatments.length > 0
        ? undefined
        : fields.treatmentKeys,
  };
}

function sameTreatmentTask(state: ConversationV2State, turn: TurnUnderstanding) {
  if (state.bookingTask.intent !== "create") return true;
  const current = state.bookingTask.draft.treatmentKeys;
  const confirmedTreatments = confirmedKeys(turn, turn.treatments);
  const incoming = confirmedTreatments.length > 0
    ? confirmedTreatments
    : turn.treatments.length > 0
      ? []
      : turn.booking?.fields?.treatmentKeys ?? [];
  if (incoming.length === 0) return true;
  if (current.length === 0) return state.bookingTask.expectedField === "treatment";
  return (
    current.length === incoming.length &&
    current.every((treatmentKey) => incoming.includes(treatmentKey))
  );
}

function suppliesExpectedBookingField(state: ConversationV2State, turn: TurnUnderstanding) {
  if (
    turn.confidence < 0.65 ||
    turn.speechAct !== "provide_booking_field" ||
    state.bookingTask.status !== "collecting" ||
    !state.bookingTask.expectedField ||
    !turn.booking?.fields ||
    !["none", state.bookingTask.intent].includes(turn.booking.intent) ||
    !sameTreatmentTask(state, turn)
  ) {
    return false;
  }

  const fields = turn.booking.fields;
  const supplied: Record<NonNullable<typeof state.bookingTask.expectedField>, boolean> = {
    appointment_reference: Boolean(fields.appointmentReference),
    branch: Boolean(fields.branch),
    change_request: Boolean(fields.changeRequest),
    first_visit: typeof fields.firstVisit === "boolean",
    name: Boolean(fields.name),
    phone: Boolean(fields.phone),
    time_slots: Boolean(fields.timeSlots?.length),
    treatment: Boolean(
      fields.treatmentKeys?.length &&
        (turn.treatments.length === 0 || confirmedKeys(turn, turn.treatments).length > 0),
    ),
  };
  return supplied[state.bookingTask.expectedField];
}

/**
 * Chooses one and only one action for a customer turn. Handoff lifecycle,
 * dialogue task, and booking state are deliberately evaluated independently.
 */
export function evaluateDialoguePolicy(
  state: ConversationV2State,
  turn: TurnUnderstanding,
): DialoguePolicyResult {
  let action: DialoguePolicyAction;

  if (state.processedTurnIds.includes(turn.turnId)) {
    action = {
      at: turn.receivedAt,
      reason: "duplicate_turn",
      turnId: turn.turnId,
      type: "do_not_reply",
    };
  } else if (["human_active", "ai_paused", "closed"].includes(state.control.mode)) {
    action = {
      at: turn.receivedAt,
      reason: state.control.mode as "human_active" | "ai_paused" | "closed",
      turnId: turn.turnId,
      type: "do_not_reply",
    };
  } else if (turn.speechAct === "urgent_safety") {
    action = {
      at: turn.receivedAt,
      reason: "urgent_safety",
      turnId: turn.turnId,
      type: "answer_safety",
    };
  } else if (turn.speechAct === "request_handoff") {
    action = {
      at: turn.receivedAt,
      handoffId: `${state.episodeId}:${turn.turnId}:handoff`,
      reason: "customer_requested_human",
      turnId: turn.turnId,
      type: "queue_handoff",
    };
  } else if (
    turn.booking?.explicit === true &&
    turn.booking.intent !== "none" &&
    ["book_consultation", "manage_booking"].includes(turn.speechAct)
  ) {
    action = {
      at: turn.receivedAt,
      initialDraft: initialDraft(turn),
      intent: turn.booking.intent,
      turnId: turn.turnId,
      type: "start_booking",
    };
  } else if (turn.speechAct === "ask_price") {
    const confirmedTreatments = confirmedKeys(turn, turn.treatments);
    const hasUnconfirmedTreatmentMention =
      turn.treatments.length > 0 && confirmedTreatments.length === 0;
    action = hasUnconfirmedTreatmentMention
      ? {
          at: turn.receivedAt,
          prompt: "想確認一下，您要詢問哪一項療程的價格呢？",
          turnId: turn.turnId,
          type: "fallback_clarify",
        }
      : {
          at: turn.receivedAt,
          priceKind: "unspecified",
          treatmentKeys: confirmedTreatments.length > 0
            ? confirmedTreatments
            : [...state.knowledge.treatmentKeys],
          turnId: turn.turnId,
          type: "answer_price",
        };
  } else if (turn.speechAct === "ask_clinic_info") {
    action = {
      at: turn.receivedAt,
      topic: "general",
      turnId: turn.turnId,
      type: "answer_clinic_info",
    };
  } else {
    const affirmedTreatments = affirmedMentions(turn.treatments);
    const affirmedConcerns = affirmedMentions(turn.concerns);
    const affirmedAreas = affirmedMentions(turn.areas);
    const hasAffirmedEntity =
      affirmedTreatments.length > 0 ||
      affirmedConcerns.length > 0 ||
      affirmedAreas.length > 0;
    const isContextualDetailFollowup =
      turn.speechAct === "ask_treatment_detail" &&
      (state.knowledge.treatmentKeys.length > 0 ||
        state.knowledge.concernKeys.length > 0 ||
        state.knowledge.areaKeys.length > 0);
    const selectionEligible = Boolean(
      state.awaiting &&
        (turn.speechAct === "select_options" ||
          isPureAwaitingSelectionAnswer({ awaiting: state.awaiting, text: turn.text })),
    );
    const selectedOptions = state.awaiting && selectionEligible
      ? resolveAwaitingSelection({
          awaiting: state.awaiting,
          selection: turn.selection,
          text: turn.text,
        })
      : [];

    if (selectedOptions.length > 0) {
      const pendingKnowledge = state.awaiting?.pendingKnowledge ?? {
        areaKeys: [],
        concernKeys: [],
        treatmentKeys: [],
      };
      const activeTaskKind = [
        "learn_treatment",
        "compare_treatments",
        "answer_concern",
      ].includes(state.activeTask.kind)
        ? state.activeTask.kind as "learn_treatment" | "compare_treatments" | "answer_concern"
        : "learn_treatment";
      action = {
        areaKeys: [...pendingKnowledge.areaKeys],
        at: turn.receivedAt,
        concernKeys: [...pendingKnowledge.concernKeys],
        knowledgeMode: state.awaiting?.knowledgeMode ?? "merge",
        selectedOptions,
        taskKind: activeTaskKind,
        treatmentKeys: [...pendingKnowledge.treatmentKeys],
        turnId: turn.turnId,
        type: "answer_selection",
      };
    } else if (
      suppliesExpectedBookingField(state, turn) &&
      turn.booking?.fields
    ) {
      action = {
        at: turn.receivedAt,
        fields: turn.booking.fields,
        turnId: turn.turnId,
        type: "capture_booking_fields",
      };
    } else if (
      Boolean(turn.clarification) ||
      hasAffirmedEntity ||
      isContextualDetailFollowup
    ) {
      const awaiting = makeAwaiting(turn);
      let taskKind: "learn_treatment" | "compare_treatments" | "answer_concern" = turn.speechAct === "compare_treatments"
        ? "compare_treatments" as const
        : affirmedConcerns.length > 0 && affirmedTreatments.length === 0
          ? "answer_concern" as const
          : "learn_treatment" as const;
      // Only resolved, affirmed treatments may own pricing or comparison state.
      // Broader concern/area categories may stay pending until the customer
      // selects the specific option offered by the policy.
      let treatmentKeys = taskKind === "compare_treatments"
        ? confirmedKeys(turn, affirmedTreatments)
        : keys(affirmedTreatments);
      let concernKeys = keys(affirmedConcerns);
      let areaKeys = keys(affirmedAreas);
      const noNewEntities = treatmentKeys.length === 0 && concernKeys.length === 0 && areaKeys.length === 0;
      const activeTreatmentTask = [
        "learn_treatment",
        "compare_treatments",
        "answer_concern",
      ].includes(state.activeTask.kind);
      const hasCanonicalTreatmentKnowledge =
        state.knowledge.treatmentKeys.length > 0 ||
        state.knowledge.concernKeys.length > 0 ||
        state.knowledge.areaKeys.length > 0;
      if (
        noNewEntities &&
        turn.speechAct === "ask_treatment_detail" &&
        hasCanonicalTreatmentKnowledge
      ) {
        taskKind = activeTreatmentTask
          ? state.activeTask.kind as typeof taskKind
          : state.knowledge.treatmentKeys.length > 0
            ? "learn_treatment"
            : "answer_concern";
        treatmentKeys = [...state.knowledge.treatmentKeys];
        concernKeys = [...state.knowledge.concernKeys];
        areaKeys = [...state.knowledge.areaKeys];
      } else if (taskKind === "compare_treatments" && treatmentKeys.length < 2) {
        treatmentKeys = Array.from(
          new Set([...state.knowledge.treatmentKeys, ...treatmentKeys]),
        );
      }
      const knowledgeMode = knowledgeModeForTurn(state, {
        areaKeys,
        concernKeys,
        taskKind,
        treatmentKeys,
      });
      action = awaiting
        ? {
            at: turn.receivedAt,
            areaKeys,
            awaiting: {
              ...awaiting,
              knowledgeMode,
              pendingKnowledge: {
                areaKeys: [...areaKeys],
                concernKeys: [...concernKeys],
                treatmentKeys: [...treatmentKeys],
              },
            },
            concernKeys,
            knowledgeMode,
            taskKind,
            treatmentKeys,
            turnId: turn.turnId,
            type: "clarify",
          }
        : {
            areaKeys,
            at: turn.receivedAt,
            concernKeys,
            knowledgeMode,
            taskKind,
            treatmentKeys,
            turnId: turn.turnId,
            type: "learn_treatment",
          };
    } else {
      action = {
        at: turn.receivedAt,
        prompt: "想先了解哪項療程、在意的部位，或館別資訊呢？",
        turnId: turn.turnId,
        type: "fallback_clarify",
      };
    }
  }

  return { action, replyPlan: planForAction(state, action) };
}
