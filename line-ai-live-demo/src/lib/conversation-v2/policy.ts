import { findAllTreatmentsByMessage, findTreatmentByMessage } from "@/lib/clinic-config";
import { isHedgedTreatmentReference, isPriceInquiry } from "@/lib/pricing-subject";
import { createOffResponseContract } from "@/lib/response-contract";

import {
  isPureAwaitingSelectionAnswer,
  resolveAwaitingSelection,
} from "./selection";
import {
  hasConversationEpisodeExpired,
  isExplicitTreatmentOverviewRestart,
} from "./episode-policy";
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
  TreatmentResponseContext,
  TurnUnderstanding,
} from "./types";

function keys(items: readonly { key: string }[]) {
  return Array.from(new Set(items.map((item) => item.key.trim()).filter(Boolean)));
}

/**
 * True when the sentence gestures at a treatment without committing to it
 * ("我好像想問那個肉毒多少").
 *
 * A bare hedge that names nothing ("那個多少錢") is ordinary anaphora and must still
 * inherit whatever the customer is already discussing. It is only when they gesture at
 * a *different* treatment that inheriting the active subject answers the wrong
 * question -- quoting ONDA's price to someone asking about botox.
 */
function hasHedgedTreatmentMention(text: string) {
  return Boolean(findTreatmentByMessage(text)) && isHedgedTreatmentReference(text);
}

function explicitPriceTreatmentKey(text: string) {
  if (!isPriceInquiry(text) || isHedgedTreatmentReference(text)) {
    return undefined;
  }
  // First match is arbitrary once a sentence names more than one treatment
  // ("不要肉毒，ONDA 價格呢？"), and guessing there can quote the price of the very
  // treatment the customer just declined. Defer to the model's entities instead.
  const named = findAllTreatmentsByMessage(text);
  return named.length === 1 ? named[0]?.key : undefined;
}

function affirmedMentions<T extends { polarity: "affirmed" | "negated" }>(
  items: readonly T[],
) {
  return items.filter((item) => item.polarity === "affirmed");
}

function negatedMentions<T extends {
  confidence: number;
  polarity: "affirmed" | "negated";
  resolution: "resolved" | "underspecified";
}>(turn: TurnUnderstanding, items: readonly T[]) {
  if (turn.confidence < 0.65) return [];
  return items.filter(
    (item) =>
      item.confidence >= 0.65 &&
      item.polarity === "negated" &&
      item.resolution === "resolved",
  );
}

function responseContextForTurn(
  state: ConversationV2State,
  turn: TurnUnderstanding,
  implicitExclusions: {
    areaKeys?: readonly string[];
    concernKeys?: readonly string[];
    treatmentKeys?: readonly string[];
  } = {},
): TreatmentResponseContext {
  const affirmedAreaKeys = confirmedKeys(turn, turn.areas);
  const affirmedConcernKeys = confirmedKeys(turn, turn.concerns);
  const affirmedTreatmentKeys = confirmedKeys(turn, turn.treatments);
  const affirmedAreaKeySet = new Set(affirmedAreaKeys);
  const affirmedConcernKeySet = new Set(affirmedConcernKeys);
  const affirmedTreatmentKeySet = new Set(affirmedTreatmentKeys);
  const declinedTreatmentKeys = Array.from(new Set([
    ...keys(negatedMentions(turn, turn.treatments)),
    ...(implicitExclusions.treatmentKeys ?? []),
  ]));
  const effectiveTreatmentApproach = turn.conversationMove === "prefer_single"
    ? "single" as const
    : ["compare", "replace", "start"].includes(turn.conversationMove)
      ? "unspecified" as const
      : state.preferences.treatmentApproach;
  return {
    affirmedAreaKeys,
    affirmedConcernKeys,
    affirmedTreatmentKeys,
    conversationMove: turn.conversationMove,
    declinedTreatmentKeys,
    dialogueReference: turn.dialogueReference,
    excludedAreaKeys: Array.from(new Set([
      ...state.preferences.excludedAreaKeys,
      ...keys(negatedMentions(turn, turn.areas)),
      ...(implicitExclusions.areaKeys ?? []),
    ])).filter((key) => !affirmedAreaKeySet.has(key)),
    excludedConcernKeys: Array.from(new Set([
      ...state.preferences.excludedConcernKeys,
      ...keys(negatedMentions(turn, turn.concerns)),
      ...(implicitExclusions.concernKeys ?? []),
    ])).filter((key) => !affirmedConcernKeySet.has(key)),
    excludedTreatmentKeys: Array.from(new Set([
      ...state.preferences.excludedTreatmentKeys,
      ...declinedTreatmentKeys,
    ])).filter((key) => !affirmedTreatmentKeySet.has(key)),
    questionAspect: turn.questionAspect,
    treatmentApproach: effectiveTreatmentApproach,
  };
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

function subjectTreatmentKeys(subjectKey: string | undefined) {
  if (!subjectKey) return [];
  for (const prefix of ["treatment:", "comparison:"]) {
    if (subjectKey.startsWith(prefix)) {
      return subjectKey.slice(prefix.length).split("+").filter(Boolean);
    }
  }
  return [];
}

function contextualTreatmentKeys(
  state: ConversationV2State,
  reference: TurnUnderstanding["dialogueReference"],
) {
  if (reference === "active_comparison") {
    const comparisonKeys = state.activeTask.subjectKey?.startsWith("comparison:")
      ? subjectTreatmentKeys(state.activeTask.subjectKey)
      : [];
    return comparisonKeys.length >= 2
      ? comparisonKeys
      : state.knowledge.treatmentKeys.length >= 2
        ? [...state.knowledge.treatmentKeys]
        : [];
  }
  if (reference !== "active_subject") return [];
  if (state.activeTask.kind === "pricing" && state.pricingSubjectTreatmentKeys.length > 0) {
    return [...state.pricingSubjectTreatmentKeys];
  }
  if (state.awaiting?.pendingKnowledge) {
    // A candidate awaiting confirmation must never become the owner of a
    // subjectless price or follow-up question.
    return [];
  }
  const taskSubjectKeys = subjectTreatmentKeys(state.activeTask.subjectKey);
  if (taskSubjectKeys.length > 0) return taskSubjectKeys;
  if (
    state.bookingTask.status !== "inactive" &&
    state.bookingTask.draft.treatmentKeys.length > 0
  ) {
    return [...state.bookingTask.draft.treatmentKeys];
  }
  return state.knowledge.treatmentKeys.length === 1
    ? [...state.knowledge.treatmentKeys]
    : [];
}

type ImplicitPreferenceResolution = {
  ambiguous: boolean;
  areaKeys: string[];
  concernKeys: string[];
  treatmentKeys: string[];
};

function resolveImplicitPreferenceReference(
  state: ConversationV2State,
  turn: TurnUnderstanding,
): ImplicitPreferenceResolution {
  const empty = { ambiguous: false, areaKeys: [], concernKeys: [], treatmentKeys: [] };
  if (!["prefer_single", "reject"].includes(turn.conversationMove)) return empty;
  const explicitNegatedCount = [
    ...negatedMentions(turn, turn.treatments),
    ...negatedMentions(turn, turn.concerns),
    ...negatedMentions(turn, turn.areas),
  ].length;
  const affirmedTreatmentCount = confirmedKeys(turn, turn.treatments).length;
  if (explicitNegatedCount > 0) return empty;
  if (turn.conversationMove === "prefer_single" && affirmedTreatmentCount > 0) return empty;
  if (turn.confidence < 0.65 || turn.dialogueReference !== "active_subject") {
    return { ...empty, ambiguous: true };
  }

  const treatmentKeys = contextualTreatmentKeys(state, "active_subject");
  if (turn.conversationMove === "prefer_single") {
    return treatmentKeys.length === 1 ? empty : { ...empty, ambiguous: true };
  }
  if (treatmentKeys.length === 1) {
    return { ...empty, treatmentKeys };
  }
  if (treatmentKeys.length > 1) return { ...empty, ambiguous: true };

  const hasConcernSubject =
    state.activeTask.kind === "answer_concern" ||
    state.activeTask.subjectKey?.startsWith("concern:");
  if (hasConcernSubject && state.knowledge.concernKeys.length === 1) {
    return { ...empty, concernKeys: [...state.knowledge.concernKeys] };
  }
  if (
    hasConcernSubject &&
    state.knowledge.concernKeys.length === 0 &&
    state.knowledge.areaKeys.length === 1
  ) {
    return { ...empty, areaKeys: [...state.knowledge.areaKeys] };
  }
  return { ...empty, ambiguous: true };
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
  responseContext: TreatmentResponseContext,
) {
  if (responseContext.conversationMove === "replace") {
    return "replace_active_subject" as const;
  }
  if (responseContext.conversationMove === "prefer_single") {
    return "replace_active_subject" as const;
  }
  if (
    state.knowledge.treatmentKeys.length > 0 &&
    input.treatmentKeys.length > 0 &&
    (
      input.treatmentKeys.length !== state.knowledge.treatmentKeys.length ||
      input.treatmentKeys.some((key) => !state.knowledge.treatmentKeys.includes(key))
    )
  ) {
    // A newly named treatment owns the current answer. Historical interests
    // belong in customer history, not in the active reply query; merging them
    // here made a Botox brand question inherit ONDA concerns and instructions.
    // A follow-up that names the same subject still merges normally.
    return "replace_active_subject" as const;
  }
  if (
    input.taskKind === "compare_treatments" ||
    ["compare", "continue", "reject"].includes(responseContext.conversationMove)
  ) {
    return "merge" as const;
  }
  return state.activeTask.subjectKey === activeSubjectKey(input)
    ? "merge" as const
    : "replace_active_subject" as const;
}

const EXPLICIT_TREATMENT_OVERVIEW_PATTERN = /(?:想|希望|可以|要).{0,6}(?:了解|介紹|認識|問問|諮詢)/u;
const TREATMENT_OVERVIEW_REAFFIRMATION_PATTERN = /(?:還是|只是|(?:我)?是想|其實)/u;

/**
 * A direct request for a treatment overview, or a named overview after a long idle
 * period, starts a new consultation episode even when it names the stored subject.
 * Without this boundary, a customer returning with "想了解 ONDA" inherits stale
 * concerns and is answered as though they were continuing the old final question.
 */
function restartsConsultationEpisode(
  state: ConversationV2State,
  input: Parameters<typeof activeSubjectKey>[0],
  responseContext: TreatmentResponseContext,
  at: string,
  text: string,
) {
  const hasCurrentSubject =
    input.treatmentKeys.length + input.concernKeys.length + input.areaKeys.length > 0;
  if (!hasCurrentSubject) return false;

  // A direct restart is authoritative for one named treatment regardless of
  // the model's move/reference labels or the prior active subject.
  if (
    input.taskKind === "learn_treatment" &&
    input.treatmentKeys.length === 1 &&
    isExplicitTreatmentOverviewRestart(text)
  ) {
    return true;
  }

  // After inactivity, the first grounded consultation subject starts fresh.
  // Booking, handoff and safety actions are selected before this content path,
  // so their lifecycle remains independently owned.
  if (hasConversationEpisodeExpired(state, at)) return true;

  if (
    input.taskKind !== "learn_treatment" ||
    input.treatmentKeys.length === 0 ||
    responseContext.conversationMove !== "start" ||
    responseContext.questionAspect !== "overview"
  ) {
    return false;
  }

  const contextualTreatmentOwner = contextualTreatmentKeys(state, "active_subject");
  const sameTreatmentOwner =
    contextualTreatmentOwner.length === input.treatmentKeys.length &&
    input.treatmentKeys.every((key) => contextualTreatmentOwner.includes(key));
  if (!sameTreatmentOwner) return false;

  // A direct restart phrase is always authoritative. A normal overview request
  // restarts immediately only when the stored task already carries a narrower
  // concern/area; repeating the same request right after a correct introduction
  // must advance instead of replaying the introduction. A bare treatment name
  // does not take this path, so short answers can still continue the active task.
  if (
    EXPLICIT_TREATMENT_OVERVIEW_PATTERN.test(text) &&
    !TREATMENT_OVERVIEW_REAFFIRMATION_PATTERN.test(text) &&
    (state.knowledge.concernKeys.length > 0 || state.knowledge.areaKeys.length > 0)
  ) {
    return true;
  }

  return false;
}

/**
 * A treatment subject we can act on without asking the customer again.
 *
 * NLU confidence is not the only evidence available: the turn text itself may name a
 * treatment ("ONDA 有沒有活動價格"), and an active focus carries the treatment the
 * customer is already discussing. Either beats a low-confidence signal, otherwise we
 * ask "which treatment?" about a treatment the customer just named.
 */
function resolvableTreatmentSubject(
  turn: TurnUnderstanding,
  state: ConversationV2State,
) {
  // A hedged mention of another treatment disqualifies every source of subject, not
  // just this sentence, so the active subject cannot be inherited past it.
  if (hasHedgedTreatmentMention(turn.text)) return undefined;
  const namedInThisTurn = explicitPriceTreatmentKey(turn.text);
  if (namedInThisTurn) return namedInThisTurn;
  // `subjectKey` is prefixed ("treatment:onda_pro"), so reuse the existing decoder
  // rather than comparing raw keys.
  return subjectTreatmentKeys(state.activeTask.subjectKey)[0];
}

function makeAwaiting(
  turn: TurnUnderstanding,
  state: ConversationV2State,
): AwaitingState | undefined {
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
  // A price question owns its subject differently from an open treatment question.
  // "ONDA 有沒有活動價格" names the treatment outright, and "體驗價呢" inherits the
  // treatment the customer is already discussing, so asking "which treatment?" there
  // discards an answer we already hold. Hedged discovery turns ("我好像想問那個肉毒")
  // still clarify, because there the uncertainty is the point.
  if (
    turn.speechAct === "ask_price" &&
    affirmedConcerns.length === 0 &&
    affirmedAreas.length === 0 &&
    resolvableTreatmentSubject(turn, state)
  ) {
    return undefined;
  }

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
  options: {
    includeDeclinedTreatmentFacts?: boolean;
    includeState?: boolean;
    responseContext?: TreatmentResponseContext;
  } = {},
): ReplyKnowledgeQuery {
  const unique = (values: readonly string[]) => Array.from(new Set(values.filter(Boolean)));
  const includeState = options.includeState ?? true;
  const responseContext = options.responseContext;
  const excludedAreaKeys = new Set(responseContext?.excludedAreaKeys ?? []);
  const excludedConcernKeys = new Set(responseContext?.excludedConcernKeys ?? []);
  const excludedTreatmentKeys = new Set(responseContext?.excludedTreatmentKeys ?? []);
  const allowedDeclinedTreatmentKeys = new Set(
    options.includeDeclinedTreatmentFacts
      ? responseContext?.declinedTreatmentKeys ?? []
      : [],
  );
  return {
    approvedFactIds: unique([
      ...(includeState ? state.knowledge.approvedFactIds : []),
      ...(input.approvedFactIds ?? []),
    ]),
    areaKeys: unique([
      ...(includeState ? state.knowledge.areaKeys : []),
      ...(input.areaKeys ?? []),
    ]).filter((key) => !excludedAreaKeys.has(key)),
    concernKeys: unique([
      ...(includeState ? state.knowledge.concernKeys : []),
      ...(input.concernKeys ?? []),
    ]).filter((key) => !excludedConcernKeys.has(key)),
    treatmentKeys: unique([
      ...(includeState ? state.knowledge.treatmentKeys : []),
      ...(input.treatmentKeys ?? []),
    ]).filter(
      (key) => !excludedTreatmentKeys.has(key) || allowedDeclinedTreatmentKeys.has(key),
    ),
  };
}

function cloneResponseContext(context: TreatmentResponseContext): TreatmentResponseContext {
  return {
    ...context,
    affirmedAreaKeys: [...context.affirmedAreaKeys],
    affirmedConcernKeys: [...context.affirmedConcernKeys],
    affirmedTreatmentKeys: [...context.affirmedTreatmentKeys],
    declinedTreatmentKeys: [...context.declinedTreatmentKeys],
    excludedAreaKeys: [...context.excludedAreaKeys],
    excludedConcernKeys: [...context.excludedConcernKeys],
    excludedTreatmentKeys: [...context.excludedTreatmentKeys],
  };
}

function objectiveForTreatmentResponse(
  dialogueAct: GeneratedReplyPlan["dialogueAct"],
  context: TreatmentResponseContext,
) {
  if (context.conversationMove === "reject") {
    return "先確認不採用客人拒絕的項目，再以仍保留的需求或療程回答下一步；不得重新推薦已拒絕項目。";
  }
  if (context.conversationMove === "prefer_single") {
    return "直接回答單做與搭配的差異，說明何時才需要搭配，不強迫加購，並承接客人偏好單做。";
  }
  if (context.treatmentApproach === "single") {
    return "承接客人偏好單做，只回答目前追問，不重新推銷搭配療程；若客人主動改變需求再重新比較。";
  }
  const aspectObjectives: Partial<Record<TreatmentResponseContext["questionAspect"], string>> = {
    alternatives: "直接提供院內可評估的替代方向與差異，不重貼首輪介紹。",
    benefits: "直接回答客人想改善的效果方向，使用核准事實且不保證結果。",
    brand_difference: "直接比較核准品牌的定位與評估差異，不捏造院內未提供品牌。",
    combination_reason: "先說明為什麼可能評估搭配，再說清楚單做仍可依需求評估。",
    comfort_recovery: "直接回答舒適度與恢復期，未核准的時間或感受不得自行補充。",
    general_difference: "直接比較處理方向、適合困擾與差異，避免重複各自完整介紹。",
    mechanism: "把核准原理翻成人話，連回客人在意的改善方向。",
    side_effects: "提供一般衛教與需評估事項，不診斷、不把風險說死。",
    single_vs_combination: "直接回答單做與搭配的差異及搭配理由，不把組合說成必要。",
    suitability: "先依已知需求整理可評估方向，再補一個真正需要確認的問題。",
  };
  if (aspectObjectives[context.questionAspect]) return aspectObjectives[context.questionAspect]!;
  if (dialogueAct === "introduce_treatment") {
    return "先用核准知識自然介紹療程價值，再問一個最有助於理解需求的問題。";
  }
  if (dialogueAct === "compare_options") {
    return "直接回答比較差異，說明各自處理方向，再推進一個選擇問題。";
  }
  if (dialogueAct === "recommend_direction") {
    return "承接客人的困擾，說明可評估方向與理由，再問一個必要問題。";
  }
  return "直接承接本輪追問，只回答客人現在問的面向，不重貼首輪介紹。";
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
      knowledgeQuery: toKnowledgeQuery(state, pendingKnowledge, {
        includeState: action.knowledgeMode !== "replace_active_subject",
        responseContext: action.responseContext,
      }),
      mode: "generated",
      objective: "承接客人選取的所有項目，逐項回答差異或適合方向，不重貼首輪介紹。",
      responseContract: createOffResponseContract(),
      responseContext: cloneResponseContext(action.responseContext),
      selectedOptions: action.selectedOptions.map((option) => ({ ...option })),
      sourceTurnId: action.turnId,
    };
  }

  const activeSubjectTreatmentKeys = contextualTreatmentKeys(state, "active_subject");
  const repeatsKnownTreatment =
    action.taskKind === "learn_treatment" &&
    action.treatmentKeys.length > 0 &&
    action.treatmentKeys.length === activeSubjectTreatmentKeys.length &&
    action.treatmentKeys.every((key) => activeSubjectTreatmentKeys.includes(key));
  const repeatedActiveOverview =
    action.responseContext.conversationMove === "start" &&
    action.responseContext.questionAspect === "overview" &&
    !action.episodeRestart &&
    (state.activeTask.subjectKey === activeSubjectKey(action) || repeatsKnownTreatment);
  const dialogueAct: GeneratedReplyPlan["dialogueAct"] = ["prefer_single", "reject"].includes(
    action.responseContext.conversationMove,
  )
    ? "address_objection"
    : action.taskKind === "compare_treatments"
      ? "compare_options"
      // A bare concern ("雙下巴") asks for a direction even when the move is a
      // continuation, otherwise the customer is handed a generic menu after telling us
      // exactly what bothers them. Once they ask about a specific aspect (suitability,
      // benefits, recovery) it is a genuine follow-up and must be answered as one.
      : action.taskKind === "answer_concern" &&
        ["none", "overview"].includes(action.responseContext.questionAspect)
        ? "recommend_direction"
      : action.responseContext.conversationMove === "continue"
        ? "answer_followup"
        : repeatedActiveOverview
          ? "answer_followup"
          : action.responseContext.questionAspect === "overview" &&
            action.responseContext.conversationMove === "start"
          ? "introduce_treatment"
          : "answer_followup";
  const includeState = action.knowledgeMode !== "replace_active_subject" ||
    action.responseContext.conversationMove === "prefer_single";
  return {
    action: action.type,
    dialogueAct,
    knowledgeQuery: toKnowledgeQuery(
      state,
      {
        areaKeys: action.areaKeys,
        concernKeys: action.concernKeys,
        treatmentKeys: action.treatmentKeys,
      },
      {
        includeDeclinedTreatmentFacts: ["prefer_single", "reject"].includes(
          action.responseContext.conversationMove,
        ),
        includeState,
        responseContext: action.responseContext,
      },
    ),
    mode: "generated",
    objective: repeatedActiveOverview
      ? "承接客人重述的同一需求，補充一個尚未回答的重點並推進下一步；不得重貼完整首輪介紹。"
      : objectiveForTreatmentResponse(dialogueAct, action.responseContext),
    responseContract: createOffResponseContract(),
    responseContext: cloneResponseContext(action.responseContext),
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
        responseContract: createOffResponseContract(),
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
        responseContract: createOffResponseContract(),
        sourceTurnId: action.turnId,
        templateKey: action.type,
        templateVariables: {},
      };
    case "answer_clinic_info":
      return {
        action: action.type,
        dialogueAct: "answer_clinic_info",
        mode: "deterministic",
        responseContract: createOffResponseContract(),
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
          ...(action.priceApplicability
            ? { applicability: { ...action.priceApplicability } }
            : {}),
          kind: action.priceKind,
          treatmentKeys: [...action.treatmentKeys],
        },
        responseContract: createOffResponseContract(),
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
        responseContract: createOffResponseContract(),
        sourceTurnId: action.turnId,
        templateKey: "handoff_queued",
        templateVariables: {},
      };
    case "answer_safety":
      return {
        action: action.type,
        dialogueAct: "answer_safety",
        mode: "deterministic",
        responseContract: createOffResponseContract(),
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
        responseContract: createOffResponseContract(),
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
      responseContract: createOffResponseContract(),
      sourceTurnId: action.turnId,
    };
  }
  if (action.type === "learn_treatment" || action.type === "answer_selection") {
    return generatedPlan(state, action);
  }
  return deterministicPlan(action);
}

function initialDraft(
  state: ConversationV2State,
  turn: TurnUnderstanding,
): Partial<BookingDraft> {
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
  const contextualBookingTreatments =
    turn.booking?.intent === "create" &&
    turn.dialogueReference === "active_subject"
      ? contextualTreatmentKeys(state, turn.dialogueReference)
      : undefined;
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
        : fields.treatmentKeys?.length
          ? fields.treatmentKeys
          : contextualBookingTreatments,
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
    !["collecting", "suspended"].includes(state.bookingTask.status) ||
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
    // `booking.fields.treatmentKeys` comes from the deterministic booking
    // adapter and is ontology-validated before policy. A low-confidence model
    // echo must not veto the exact short answer the booking flow requested.
    treatment: Boolean(fields.treatmentKeys?.length),
  };
  return supplied[state.bookingTask.expectedField];
}

function priceKindForTurn(turn: TurnUnderstanding) {
  if (turn.questionAspect === "price_campaign") return "campaign" as const;
  if (turn.questionAspect === "price_regular") return "regular" as const;
  return "unspecified" as const;
}

function priceApplicabilityForTurn(
  state: ConversationV2State,
  turn: TurnUnderstanding,
) {
  const branch =
    turn.priceApplicability?.branch?.trim() ||
    turn.booking?.fields?.branch?.trim() ||
    state.bookingTask.draft.branch?.trim();
  const applicability = {
    ...turn.priceApplicability,
    ...(branch ? { branch } : {}),
  };
  return Object.values(applicability).some(
    (value) => value !== undefined && value !== "",
  )
    ? applicability
    : undefined;
}

function clinicTopicForTurn(turn: TurnUnderstanding) {
  const topics = {
    branch_address: "address",
    branch_hours: "hours",
    branch_list: "branches",
    clinic_contact: "contact",
    doctor_schedule: "doctor_schedule",
    booking_policy: "booking_policy",
  } as const;
  return turn.questionAspect in topics
    ? topics[turn.questionAspect as keyof typeof topics]
    : "general";
}

/**
 * Chooses one and only one action for a customer turn. Handoff lifecycle,
 * dialogue task, and booking state are deliberately evaluated independently.
 */
export function evaluateDialoguePolicy(
  state: ConversationV2State,
  turn: TurnUnderstanding,
): DialoguePolicyResult {
  const implicitPreference = resolveImplicitPreferenceReference(state, turn);
  const turnPreferenceContext = responseContextForTurn(state, turn, implicitPreference);
  const hasTurnPreferenceSignal =
    turnPreferenceContext.affirmedAreaKeys.length > 0 ||
    turnPreferenceContext.affirmedConcernKeys.length > 0 ||
    turnPreferenceContext.affirmedTreatmentKeys.length > 0 ||
    turnPreferenceContext.excludedAreaKeys.length > state.preferences.excludedAreaKeys.length ||
    turnPreferenceContext.excludedConcernKeys.length > state.preferences.excludedConcernKeys.length ||
    turnPreferenceContext.excludedTreatmentKeys.length > state.preferences.excludedTreatmentKeys.length ||
    turn.conversationMove === "prefer_single";
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
      initialDraft: initialDraft(state, turn),
      intent: turn.booking.intent,
      turnId: turn.turnId,
      type: "start_booking",
    };
  } else if (implicitPreference.ambiguous) {
    action = {
      at: turn.receivedAt,
      prompt: turn.conversationMove === "prefer_single"
        ? "想確認一下，您想單做哪一項療程呢？"
        : "想確認一下，您說不要的是哪一項療程或困擾呢？",
      turnId: turn.turnId,
      type: "fallback_clarify",
    };
  } else if (turn.speechAct === "ask_price") {
    const negatedTreatmentKeys = new Set(keys(negatedMentions(turn, turn.treatments)));
    const namedInText = explicitPriceTreatmentKey(turn.text);
    // A treatment the customer just declined must never own the price, even when it is
    // the only one their sentence names.
    const deterministicExplicitTreatment =
      namedInText && !negatedTreatmentKeys.has(namedInText) ? namedInText : undefined;
    const confirmedTreatments = confirmedKeys(turn, turn.treatments);
    const hasUnconfirmedTreatmentMention =
      !deterministicExplicitTreatment &&
      turn.treatments.length > 0 && confirmedTreatments.length === 0;
    // Suppressing `awaiting` is not enough on its own: this branch resolves the price
    // subject independently, so a hedged mention has to be blocked from inheriting the
    // active subject here too, otherwise the customer is quoted the wrong price.
    const contextualPriceTreatmentKeys = hasHedgedTreatmentMention(turn.text)
      ? []
      : contextualTreatmentKeys(state, turn.dialogueReference);
    // Confirmed entities already account for negation and rewording, so they outrank
    // the raw text scan. The deterministic key exists only to rescue the case where low
    // model confidence left nothing confirmed at all.
    const treatmentKeys = confirmedTreatments.length > 0
      ? confirmedTreatments
      : deterministicExplicitTreatment
        ? [deterministicExplicitTreatment]
        : contextualPriceTreatmentKeys.length > 0
          ? contextualPriceTreatmentKeys
          : [];
    action = hasUnconfirmedTreatmentMention || treatmentKeys.length === 0
      ? {
          at: turn.receivedAt,
          prompt: "想確認一下，您要詢問哪一項療程的價格呢？",
          turnId: turn.turnId,
          type: "fallback_clarify",
        }
      : {
          at: turn.receivedAt,
          priceApplicability: priceApplicabilityForTurn(state, turn),
          priceKind: priceKindForTurn(turn),
          treatmentKeys,
          turnId: turn.turnId,
          type: "answer_price",
        };
  } else if (turn.speechAct === "ask_clinic_info") {
    action = {
      at: turn.receivedAt,
      topic: clinicTopicForTurn(turn),
      turnId: turn.turnId,
      type: "answer_clinic_info",
    };
  } else {
    const affirmedTreatments = affirmedMentions(turn.treatments);
    const affirmedConcerns = affirmedMentions(turn.concerns);
    const affirmedAreas = affirmedMentions(turn.areas);
    const negatedTreatments = negatedMentions(turn, turn.treatments);
    const negatedConcerns = negatedMentions(turn, turn.concerns);
    const negatedAreas = negatedMentions(turn, turn.areas);
    const hasAffirmedEntity =
      affirmedTreatments.length > 0 ||
      affirmedConcerns.length > 0 ||
      affirmedAreas.length > 0;
    const hasNegatedEntity =
      negatedTreatments.length > 0 ||
      negatedConcerns.length > 0 ||
      negatedAreas.length > 0 ||
      implicitPreference.treatmentKeys.length > 0 ||
      implicitPreference.concernKeys.length > 0 ||
      implicitPreference.areaKeys.length > 0;
    const hasActionableNegation =
      hasNegatedEntity && turn.conversationMove === "reject";
    const contextualTurnTreatmentKeys = contextualTreatmentKeys(
      state,
      turn.dialogueReference,
    );
    const hasCanonicalTreatmentKnowledge =
      contextualTurnTreatmentKeys.length > 0 ||
      state.knowledge.treatmentKeys.length > 0 ||
      state.knowledge.concernKeys.length > 0 ||
      state.knowledge.areaKeys.length > 0;
    const isContextualDetailFollowup =
      turn.speechAct === "ask_treatment_detail" &&
      ["active_subject", "active_comparison"].includes(turn.dialogueReference) &&
      hasCanonicalTreatmentKnowledge;
    const hasActiveComparison =
      state.activeTask.kind === "compare_treatments" &&
      state.knowledge.treatmentKeys.length >= 2;
    const isContextualComparison =
      turn.speechAct === "compare_treatments" &&
      ((turn.dialogueReference === "active_comparison" && hasActiveComparison) ||
        (turn.dialogueReference === "active_subject" &&
          state.knowledge.treatmentKeys.length > 0));
    const invalidActiveComparisonReference =
      turn.speechAct === "compare_treatments" &&
      turn.dialogueReference === "active_comparison" &&
      !hasActiveComparison;
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
        responseContext: state.awaiting?.responseContext ?? turnPreferenceContext,
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
    } else if (invalidActiveComparisonReference) {
      action = {
        at: turn.receivedAt,
        prompt: "想確認一下，您要比較哪兩項療程呢？",
        turnId: turn.turnId,
        type: "fallback_clarify",
      };
    } else if (
      Boolean(turn.clarification) ||
      hasAffirmedEntity ||
      (hasActionableNegation && hasCanonicalTreatmentKnowledge) ||
      isContextualDetailFollowup ||
      isContextualComparison
    ) {
      const awaiting = makeAwaiting(turn, state);
      const responseContext = turnPreferenceContext;
      let taskKind: "learn_treatment" | "compare_treatments" | "answer_concern" = turn.speechAct === "compare_treatments"
        ? "compare_treatments" as const
        // A concern remains the customer's requested task even when the turn also
        // carries its treatment owner. Trusted semantic anchors intentionally add
        // the active treatment so facts stay scoped; treating that contextual owner
        // as a new introduction loses the approved concern reply and falls back to
        // a generic menu after the customer already told us what bothers them.
        : (turn.speechAct === "ask_concern" || affirmedConcerns.length > 0) &&
            (
              affirmedTreatments.length === 0 ||
              (
                turn.semanticEvidence === "exact_ontology" &&
                turn.dialogueReference === "active_subject"
              )
            )
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
      if (
        noNewEntities &&
        (isContextualDetailFollowup ||
          isContextualComparison ||
          (turn.speechAct === "learn_treatment" &&
            ["active_subject", "active_comparison"].includes(turn.dialogueReference))) &&
        hasCanonicalTreatmentKnowledge
      ) {
        taskKind = turn.speechAct === "compare_treatments"
          ? "compare_treatments"
          : activeTreatmentTask
            ? state.activeTask.kind as typeof taskKind
            : contextualTurnTreatmentKeys.length > 0 || state.knowledge.treatmentKeys.length > 0
              ? "learn_treatment"
              : "answer_concern";
        treatmentKeys = contextualTurnTreatmentKeys.length > 0
          ? contextualTurnTreatmentKeys
          : [...state.knowledge.treatmentKeys];
        concernKeys = [...state.knowledge.concernKeys];
        areaKeys = [...state.knowledge.areaKeys];
      } else if (taskKind === "compare_treatments" && treatmentKeys.length < 2) {
        const comparisonOwnerKeys = contextualTurnTreatmentKeys.length > 0
          ? contextualTurnTreatmentKeys
          : state.knowledge.treatmentKeys;
        treatmentKeys = Array.from(
          new Set([...comparisonOwnerKeys, ...treatmentKeys]),
        );
      }
      if (taskKind === "compare_treatments" && treatmentKeys.length < 2 && !awaiting) {
        action = {
          at: turn.receivedAt,
          prompt: "想確認一下，您要比較哪兩項療程呢？",
          turnId: turn.turnId,
          type: "fallback_clarify",
        };
      } else {
        const actionSubject = {
          areaKeys,
          concernKeys,
          taskKind,
          treatmentKeys,
        };
        const episodeRestart = restartsConsultationEpisode(
            state,
            actionSubject,
            responseContext,
            turn.receivedAt,
            turn.text,
          );
        const effectiveResponseContext = episodeRestart
          ? {
              ...responseContext,
              conversationMove: "start" as const,
              dialogueReference: "explicit" as const,
              questionAspect: "overview" as const,
            }
          : responseContext;
        const knowledgeMode = episodeRestart
          ? "replace_active_subject" as const
          : knowledgeModeForTurn(state, actionSubject, effectiveResponseContext);
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
                responseContext: effectiveResponseContext,
              },
              concernKeys,
              knowledgeMode,
              responseContext: effectiveResponseContext,
              taskKind,
              treatmentKeys,
              turnId: turn.turnId,
              type: "clarify",
            }
          : {
              areaKeys,
              at: turn.receivedAt,
              concernKeys,
              episodeRestart,
              knowledgeMode,
              responseContext: effectiveResponseContext,
              taskKind,
              treatmentKeys,
              turnId: turn.turnId,
              type: "learn_treatment",
            };
      }
    } else {
      action = {
        at: turn.receivedAt,
        prompt: "想先了解哪項療程、在意的部位，或館別資訊呢？",
        turnId: turn.turnId,
        type: "fallback_clarify",
      };
    }
  }

  if (hasTurnPreferenceSignal && action.type !== "do_not_reply") {
    action = { ...action, preferenceContext: cloneResponseContext(turnPreferenceContext) };
  }
  return { action, replyPlan: planForAction(state, action) };
}
