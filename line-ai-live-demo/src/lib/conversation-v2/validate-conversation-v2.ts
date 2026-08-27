import assert from "node:assert/strict";

import { routeConversationTurnV2 } from "./engine";
import { evaluateDialoguePolicy } from "./policy";
import { createConversationV2State, reduceConversationV2State } from "./state";
import type {
  ConversationV2State,
  DialoguePolicyAction,
  DialoguePolicyResult,
  TurnUnderstanding,
} from "./types";

const AT = "2026-08-14T04:00:00.000Z";

function turn(
  input: Pick<TurnUnderstanding, "speechAct" | "text" | "turnId"> &
    Partial<Omit<TurnUnderstanding, "speechAct" | "text" | "turnId">>,
): TurnUnderstanding {
  const contextual = ["ask_price", "ask_treatment_detail"].includes(input.speechAct);
  const startsSubject = ["ask_concern", "learn_treatment"].includes(input.speechAct);
  return {
    areas: [],
    conversationMove: contextual ? "continue" : startsSubject ? "start" : "none",
    concerns: [],
    confidence: 1,
    dialogueReference: contextual ? "active_subject" : startsSubject ? "explicit" : "none",
    questionAspect: "none",
    receivedAt: AT,
    treatments: [],
    ...input,
  };
}

function entity(
  key: string,
  resolution: "resolved" | "underspecified" = "resolved",
  polarity: "affirmed" | "negated" = "affirmed",
) {
  return { confidence: 1, key, polarity, resolution } as const;
}

function expectAction<T extends DialoguePolicyAction["type"]>(
  result: DialoguePolicyResult,
  type: T,
): Extract<DialoguePolicyAction, { type: T }> {
  assert.equal(result.action.type, type);
  return result.action as Extract<DialoguePolicyAction, { type: T }>;
}

function apply(state: ConversationV2State, result: DialoguePolicyResult) {
  return reduceConversationV2State(state, result.action);
}

function validatePendingHandoffDoesNotOwnDialogue() {
  const initial = createConversationV2State({ episodeId: "episode-1", now: AT });
  const modelHallucinatedTreatment = evaluateDialoguePolicy(
    initial,
    turn({
      speechAct: "request_handoff",
      text: "我想問一些事情",
      treatments: [entity("botox")],
      turnId: "turn-hallucinated-handoff-treatment",
    }),
  );
  expectAction(modelHallucinatedTreatment, "queue_handoff");
  const hallucinatedPending = apply(initial, modelHallucinatedTreatment);
  assert.deepEqual(
    hallucinatedPending.bookingTask.draft.treatmentKeys,
    [],
    "a model-only treatment must never enter a handoff-created booking draft",
  );
  assert.equal(hallucinatedPending.bookingTask.expectedField, "treatment");

  const handoff = evaluateDialoguePolicy(
    initial,
    turn({ speechAct: "request_handoff", text: "我要找真人客服", turnId: "turn-1" }),
  );
  expectAction(handoff, "queue_handoff");
  const pending = apply(initial, handoff);
  assert.equal(pending.control.mode, "handoff_pending");
  assert.equal(pending.bookingTask.status, "collecting");
  assert.equal(pending.bookingTask.expectedField, "treatment");

  const treatmentInquiry = evaluateDialoguePolicy(
    pending,
    turn({
      speechAct: "learn_treatment",
      text: "我想了解 ONDA",
      treatments: [entity("onda_pro")],
      turnId: "turn-2",
    }),
  );
  expectAction(treatmentInquiry, "learn_treatment");
  assert.equal(treatmentInquiry.replyPlan.mode, "generated");

  const answered = apply(pending, treatmentInquiry);
  assert.equal(answered.activeTask.kind, "learn_treatment");
  assert.equal(answered.control.mode, "handoff_pending");
  assert.equal(
    answered.bookingTask.status,
    "suspended",
    "a new treatment question may pause the handoff-created intake, but AI remains active",
  );
}

function validateSafetyHandoffDoesNotStartSalesIntake() {
  const initial = createConversationV2State({ episodeId: "episode-safety", now: AT });
  const handoff = evaluateDialoguePolicy(
    initial,
    turn({
      handoffReason: "post_procedure_issue",
      speechAct: "request_handoff",
      text: "打完後腫得很厲害",
      turnId: "turn-safety",
    }),
  );
  expectAction(handoff, "queue_handoff");
  const pending = apply(initial, handoff);
  assert.equal(pending.control.mode, "handoff_pending");
  assert.equal(
    pending.bookingTask.status,
    "inactive",
    "a safety handoff must not turn an urgent customer into a sales intake",
  );
}

function validateOnlyExplicitBookingStartsCollection() {
  const initial = createConversationV2State({ episodeId: "episode-2", now: AT });
  const learn = evaluateDialoguePolicy(
    initial,
    turn({
      booking: { explicit: false, intent: "none" },
      speechAct: "learn_treatment",
      text: "想了解 ONDA",
      concerns: [entity("jawline")],
      treatments: [entity("onda_pro")],
      turnId: "turn-1",
    }),
  );
  expectAction(learn, "learn_treatment");
  const afterLearn = apply(initial, learn);
  assert.equal(afterLearn.bookingTask.status, "inactive");

  const strayBookingField = evaluateDialoguePolicy(
    afterLearn,
    turn({
      booking: { explicit: false, fields: { branch: "高雄館" }, intent: "none" },
      speechAct: "provide_booking_field",
      text: "高雄館",
      turnId: "turn-2",
    }),
  );
  expectAction(strayBookingField, "fallback_clarify");
  assert.equal(apply(afterLearn, strayBookingField).bookingTask.status, "inactive");

  const booking = evaluateDialoguePolicy(
    afterLearn,
    turn({
      booking: { explicit: true, fields: { treatmentKeys: ["onda_pro"] }, intent: "create" },
      speechAct: "book_consultation",
      text: "我要預約 ONDA 諮詢",
      treatments: [entity("onda_pro")],
      turnId: "turn-3",
    }),
  );
  expectAction(booking, "start_booking");
  const collecting = apply(afterLearn, booking);
  assert.equal(collecting.activeTask.kind, "booking");
  assert.equal(collecting.bookingTask.status, "collecting");
  assert.equal(collecting.bookingTask.intent, "create");
  assert.deepEqual(collecting.bookingTask.draft.treatmentKeys, ["onda_pro"]);
  assert.equal(collecting.bookingTask.expectedField, "branch");

  const branchWithWrongModelTreatment = evaluateDialoguePolicy(
    collecting,
    turn({
      booking: { explicit: false, fields: { branch: "高雄館" }, intent: "none" },
      speechAct: "provide_booking_field",
      text: "高雄館",
      treatments: [entity("botox")],
      turnId: "turn-branch-with-wrong-model-treatment",
    }),
  );
  expectAction(branchWithWrongModelTreatment, "capture_booking_fields");
  const afterBranch = apply(collecting, branchWithWrongModelTreatment);
  assert.equal(afterBranch.bookingTask.draft.branch, "高雄館");
  assert.deepEqual(afterBranch.bookingTask.draft.treatmentKeys, ["onda_pro"]);
  assert.equal(afterBranch.bookingTask.expectedField, "time_slots");

  const taskSwitch = evaluateDialoguePolicy(
    collecting,
    turn({
      speechAct: "ask_treatment_detail",
      text: "我是想先了解 ONDA 的原理",
      treatments: [entity("onda_pro")],
      turnId: "turn-4",
    }),
  );
  expectAction(taskSwitch, "learn_treatment");
  const suspended = apply(collecting, taskSwitch);
  assert.equal(suspended.activeTask.kind, "learn_treatment");
  assert.equal(suspended.bookingTask.status, "suspended");
  assert.deepEqual(suspended.bookingTask.draft.treatmentKeys, ["onda_pro"]);
}

function validateBookingFieldAndPricingOwnership() {
  const initial = createConversationV2State({ episodeId: "episode-price", now: AT });
  const booking = evaluateDialoguePolicy(
    initial,
    turn({
      booking: { explicit: true, intent: "create" },
      speechAct: "book_consultation",
      text: "我要預約諮詢",
      turnId: "turn-1",
    }),
  );
  const collecting = apply(initial, booking);
  assert.equal(collecting.bookingTask.expectedField, "treatment");

  const treatmentField = evaluateDialoguePolicy(
    collecting,
    turn({
      booking: {
        explicit: false,
        fields: { treatmentKeys: ["onda_pro"] },
        intent: "none",
      },
      speechAct: "provide_booking_field",
      text: "ONDA",
      treatments: [entity("onda_pro")],
      turnId: "turn-2",
    }),
  );
  expectAction(treatmentField, "capture_booking_fields");
  const withTreatment = apply(collecting, treatmentField);
  assert.deepEqual(withTreatment.bookingTask.draft.treatmentKeys, ["onda_pro"]);
  assert.equal(withTreatment.bookingTask.expectedField, "branch");

  const pricing = evaluateDialoguePolicy(
    withTreatment,
    turn({
      speechAct: "ask_price",
      text: "ONDA 價錢呢",
      treatments: [entity("onda_pro")],
      turnId: "turn-3",
    }),
  );
  expectAction(pricing, "answer_price");
  assert.equal(pricing.replyPlan.mode, "deterministic");
  assert.deepEqual(
    pricing.replyPlan.mode === "deterministic" ? pricing.replyPlan.pricingQuery?.treatmentKeys : [],
    ["onda_pro"],
  );
  const priced = apply(withTreatment, pricing);
  assert.equal(priced.activeTask.kind, "booking");
  assert.equal(priced.bookingTask.status, "collecting");
  assert.equal(priced.bookingTask.expectedField, "branch");
  assert.deepEqual(priced.bookingTask.draft.treatmentKeys, ["onda_pro"]);

  const effectFollowup = evaluateDialoguePolicy(
    priced,
    turn({
      speechAct: "ask_treatment_detail",
      text: "那效果呢",
      turnId: "turn-4",
    }),
  );
  expectAction(effectFollowup, "learn_treatment");
  assert.deepEqual(
    effectFollowup.replyPlan.mode === "generated"
      ? effectFollowup.replyPlan.knowledgeQuery.treatmentKeys
      : [],
    ["onda_pro"],
  );
  const effectState = apply(priced, effectFollowup);
  assert.equal(effectState.activeTask.kind, "learn_treatment");
  assert.equal(effectState.activeTask.subjectKey, "treatment:onda_pro");
  assert.deepEqual(effectState.knowledge.treatmentKeys, ["onda_pro"]);
}

function validateBookingIntentContracts() {
  const initial = createConversationV2State({ episodeId: "episode-contracts", now: AT });

  const modifyQuestion = evaluateDialoguePolicy(
    initial,
    turn({
      booking: {
        explicit: true,
        fields: {
          appointmentReference: "王小美 0912345678",
          changeRequest: "改到 8/28 晚上",
        },
        intent: "modify",
      },
      speechAct: "manage_booking",
      text: "我要改預約，王小美 0912-345-678 是否是我的資料",
      turnId: "modify-question",
    }),
  );
  const modifyQuestionAction = expectAction(modifyQuestion, "start_booking");
  assert.deepEqual(modifyQuestionAction.initialDraft, {});
  const afterModifyQuestion = apply(initial, modifyQuestion);
  assert.equal(afterModifyQuestion.bookingTask.expectedField, "appointment_reference");
  assert.equal(afterModifyQuestion.bookingTask.draft.appointmentReference, undefined);
  assert.equal(afterModifyQuestion.bookingTask.draft.changeRequest, undefined);

  const cancelQuestion = evaluateDialoguePolicy(
    initial,
    turn({
      booking: {
        explicit: true,
        fields: { appointmentReference: "王小美 0912345678" },
        intent: "cancel",
      },
      speechAct: "manage_booking",
      text: "我要取消預約，王小美 0912-345-678 是否是我的資料",
      turnId: "cancel-question",
    }),
  );
  const cancelQuestionAction = expectAction(cancelQuestion, "start_booking");
  assert.deepEqual(cancelQuestionAction.initialDraft, {});
  const afterCancelQuestion = apply(initial, cancelQuestion);
  assert.equal(afterCancelQuestion.bookingTask.expectedField, "appointment_reference");
  assert.equal(afterCancelQuestion.bookingTask.draft.appointmentReference, undefined);

  const startCreate = evaluateDialoguePolicy(
    initial,
    turn({
      booking: { explicit: true, intent: "create" },
      speechAct: "book_consultation",
      text: "我要預約諮詢",
      turnId: "create-1",
    }),
  );
  let creating = apply(initial, startCreate);
  assert.equal(creating.bookingTask.expectedField, "treatment");
  const createJourney: Array<[string, Partial<ConversationV2State["bookingTask"]["draft"]>, string | undefined]> = [
    ["create-2", { treatmentKeys: ["onda_pro"] }, "branch"],
    ["create-3", { branch: "高雄館" }, "time_slots"],
    ["create-4", { timeSlots: ["8/25 下午"] }, "first_visit"],
    ["create-5", { firstVisit: true }, "name"],
    ["create-6", { name: "王小美" }, "phone"],
    ["create-7", { phone: "0912345678" }, undefined],
  ];
  for (const [turnId, fields, nextExpected] of createJourney) {
    const result = evaluateDialoguePolicy(
      creating,
      turn({
        booking: { explicit: false, fields, intent: "none" },
        speechAct: "provide_booking_field",
        text: turnId,
        turnId,
      }),
    );
    expectAction(result, "capture_booking_fields");
    creating = apply(creating, result);
    assert.equal(creating.bookingTask.expectedField, nextExpected);
  }
  assert.equal(creating.bookingTask.status, "completed");

  const startModify = evaluateDialoguePolicy(
    initial,
    turn({
      booking: { explicit: true, intent: "modify" },
      speechAct: "manage_booking",
      text: "我要修改原預約",
      treatments: [entity("onda_pro")],
      turnId: "modify-1",
    }),
  );
  let modifying = apply(initial, startModify);
  assert.equal(modifying.bookingTask.intent, "modify");
  assert.equal(modifying.bookingTask.expectedField, "appointment_reference");
  assert.deepEqual(modifying.bookingTask.draft.treatmentKeys, []);
  assert.match(modifying.awaiting?.prompt ?? "", /原預約/u);

  const identifyModify = evaluateDialoguePolicy(
    modifying,
    turn({
      booking: {
        explicit: false,
        fields: { appointmentReference: "王小美 0912345678" },
        intent: "none",
      },
      speechAct: "provide_booking_field",
      text: "王小美 0912345678",
      turnId: "modify-2",
    }),
  );
  modifying = apply(modifying, identifyModify);
  assert.equal(modifying.bookingTask.expectedField, "change_request");
  assert.match(modifying.awaiting?.prompt ?? "", /更改/u);

  const describeChange = evaluateDialoguePolicy(
    modifying,
    turn({
      booking: {
        explicit: false,
        fields: { changeRequest: "改到 8/28 晚上" },
        intent: "none",
      },
      speechAct: "provide_booking_field",
      text: "改到 8/28 晚上",
      turnId: "modify-3",
    }),
  );
  modifying = apply(modifying, describeChange);
  assert.equal(modifying.bookingTask.status, "completed");
  assert.equal(modifying.bookingTask.expectedField, undefined);

  const startCancel = evaluateDialoguePolicy(
    initial,
    turn({
      booking: { explicit: true, intent: "cancel" },
      speechAct: "manage_booking",
      text: "我要取消預約",
      turnId: "cancel-1",
    }),
  );
  let cancelling = apply(initial, startCancel);
  assert.equal(cancelling.bookingTask.intent, "cancel");
  assert.equal(cancelling.bookingTask.expectedField, "appointment_reference");
  assert.notEqual(cancelling.bookingTask.expectedField, "treatment");
  assert.notEqual(cancelling.bookingTask.expectedField, "branch");
  assert.notEqual(cancelling.bookingTask.expectedField, "time_slots");
  assert.notEqual(cancelling.bookingTask.expectedField, "first_visit");

  const identifyCancel = evaluateDialoguePolicy(
    cancelling,
    turn({
      booking: {
        explicit: false,
        fields: { appointmentReference: "0912345678 8/25" },
        intent: "none",
      },
      speechAct: "provide_booking_field",
      text: "0912345678 8/25",
      turnId: "cancel-2",
    }),
  );
  cancelling = apply(cancelling, identifyCancel);
  assert.equal(cancelling.bookingTask.status, "completed");
  assert.equal(cancelling.bookingTask.expectedField, undefined);
  assert.deepEqual(cancelling.bookingTask.draft.treatmentKeys, []);
  assert.deepEqual(cancelling.bookingTask.draft.timeSlots, []);
  assert.equal(cancelling.bookingTask.draft.branch, undefined);
  assert.equal(cancelling.bookingTask.draft.firstVisit, undefined);
}

function validateTreatmentKnowledgeOwnershipAndTaskEpisodes() {
  const initial = createConversationV2State({ episodeId: "episode-knowledge", now: AT });
  const onda = evaluateDialoguePolicy(
    initial,
    turn({
      speechAct: "learn_treatment",
      text: "想了解 ONDA",
      concerns: [entity("jawline")],
      treatments: [entity("onda_pro")],
      turnId: "knowledge-1",
    }),
  );
  const ondaState = apply(initial, onda);
  const ondaTaskId = ondaState.activeTask.id;
  assert.deepEqual(
    onda.replyPlan.mode === "generated" ? onda.replyPlan.knowledgeQuery.treatmentKeys : [],
    ["onda_pro"],
  );

  const ondaFollowup = evaluateDialoguePolicy(
    ondaState,
    turn({
      speechAct: "ask_treatment_detail",
      text: "它的作用原理呢",
      turnId: "knowledge-2",
    }),
  );
  const ondaFollowupState = apply(ondaState, ondaFollowup);
  assert.equal(ondaFollowupState.activeTask.id, ondaTaskId);
  assert.deepEqual(
    ondaFollowup.replyPlan.mode === "generated"
      ? ondaFollowup.replyPlan.knowledgeQuery.concernKeys
      : [],
    ["jawline"],
  );
  assert.deepEqual(ondaFollowupState.knowledge.concernKeys, ["jawline"]);

  const fineLines = evaluateDialoguePolicy(
    ondaFollowupState,
    turn({
      clarification: {
        allowMultiple: false,
        options: [
          { entity: "area", id: "frown", label: "眉間／皺眉紋", value: "glabella" },
        ],
        prompt: "細紋主要在意哪個部位呢？",
        slot: "area",
      },
      concerns: [entity("fine_lines", "underspecified")],
      speechAct: "ask_concern",
      text: "那我想問細紋",
      turnId: "knowledge-fine-1",
    }),
  );
  expectAction(fineLines, "clarify");
  const fineLinesState = apply(ondaFollowupState, fineLines);
  assert.deepEqual(fineLinesState.knowledge.treatmentKeys, []);
  assert.deepEqual(fineLinesState.knowledge.concernKeys, []);
  assert.deepEqual(fineLinesState.awaiting?.pendingKnowledge?.concernKeys, ["fine_lines"]);
  const fineLinesSelection = evaluateDialoguePolicy(
    fineLinesState,
    turn({
      speechAct: "select_options",
      text: "眉間",
      turnId: "knowledge-fine-2",
    }),
  );
  expectAction(fineLinesSelection, "answer_selection");
  assert.deepEqual(
    fineLinesSelection.replyPlan.mode === "generated"
      ? fineLinesSelection.replyPlan.knowledgeQuery.treatmentKeys
      : [],
    [],
  );
  assert.deepEqual(
    fineLinesSelection.replyPlan.mode === "generated"
      ? fineLinesSelection.replyPlan.knowledgeQuery.concernKeys
      : [],
    ["fine_lines"],
  );
  assert.deepEqual(
    fineLinesSelection.replyPlan.mode === "generated"
      ? fineLinesSelection.replyPlan.knowledgeQuery.areaKeys
      : [],
    ["glabella"],
  );

  const botox = evaluateDialoguePolicy(
    ondaFollowupState,
    turn({
      speechAct: "learn_treatment",
      text: "改問肉毒",
      treatments: [entity("botox")],
      turnId: "knowledge-3",
    }),
  );
  assert.deepEqual(
    botox.replyPlan.mode === "generated" ? botox.replyPlan.knowledgeQuery.treatmentKeys : [],
    ["botox"],
  );
  const botoxState = apply(ondaFollowupState, botox);
  assert.notEqual(botoxState.activeTask.id, ondaTaskId);
  assert.deepEqual(botoxState.knowledge.treatmentKeys, ["botox"]);

  const comparison = evaluateDialoguePolicy(
    botoxState,
    turn({
      speechAct: "compare_treatments",
      text: "那跟 ONDA 有什麼差別",
      treatments: [entity("onda_pro")],
      turnId: "knowledge-4",
    }),
  );
  assert.deepEqual(
    comparison.replyPlan.mode === "generated"
      ? comparison.replyPlan.knowledgeQuery.treatmentKeys
      : [],
    ["botox", "onda_pro"],
  );
  const comparisonState = apply(botoxState, comparison);
  assert.equal(comparisonState.activeTask.subjectKey, "comparison:botox+onda_pro");
  const comparisonTaskId = comparisonState.activeTask.id;
  const comparisonFollowup = evaluateDialoguePolicy(
    comparisonState,
    turn({
      speechAct: "ask_treatment_detail",
      text: "那恢復期呢",
      turnId: "knowledge-5",
    }),
  );
  const comparisonFollowupState = apply(comparisonState, comparisonFollowup);
  assert.equal(comparisonFollowupState.activeTask.kind, "compare_treatments");
  assert.equal(comparisonFollowupState.activeTask.id, comparisonTaskId);
  assert.deepEqual(
    comparisonFollowup.replyPlan.mode === "generated"
      ? comparisonFollowup.replyPlan.knowledgeQuery.treatmentKeys
      : [],
    ["botox", "onda_pro"],
  );
}

function validateUncertainUnderstandingMustClarify() {
  const initial = createConversationV2State({ episodeId: "episode-uncertain", now: AT });
  const lowConfidence = evaluateDialoguePolicy(
    initial,
    turn({
      confidence: 0.4,
      speechAct: "learn_treatment",
      text: "我好像想問那個肉毒",
      treatments: [{ ...entity("botox"), confidence: 0.4 }],
      turnId: "uncertain-1",
    }),
  );
  expectAction(lowConfidence, "clarify");
  const lowConfidenceState = apply(initial, lowConfidence);
  assert.deepEqual(lowConfidenceState.knowledge.treatmentKeys, []);
  assert.deepEqual(
    lowConfidenceState.awaiting?.pendingKnowledge?.treatmentKeys,
    ["botox"],
  );
  const priceAfterUnconfirmedCandidate = evaluateDialoguePolicy(
    lowConfidenceState,
    turn({
      speechAct: "ask_price",
      text: "那多少錢",
      turnId: "uncertain-price",
    }),
  );
  expectAction(priceAfterUnconfirmedCandidate, "fallback_clarify");

  const confirmedOnda = apply(
    initial,
    evaluateDialoguePolicy(
      initial,
      turn({
        speechAct: "learn_treatment",
        text: "ONDA",
        treatments: [entity("onda_pro")],
        turnId: "uncertain-seed",
      }),
    ),
  );
  const lowConfidenceDirectPrice = evaluateDialoguePolicy(
    confirmedOnda,
    turn({
      confidence: 0.4,
      speechAct: "ask_price",
      text: "肉毒多少錢",
      treatments: [{ ...entity("botox"), confidence: 0.4 }],
      turnId: "uncertain-direct-price",
    }),
  );
  // Superseded by the deterministic price-subject rule. "肉毒多少錢" names its treatment
  // and asks its price outright, so a low model confidence must not downgrade it into a
  // clarification -- that was the production failure this round exists to fix. The
  // resulting subject is asserted too, so this stays a contract rather than a loosened
  // expectation: the named treatment must win, not the previously active one.
  const lowConfidenceDirectPriceAction = expectAction(lowConfidenceDirectPrice, "answer_price");
  assert.deepEqual(
    lowConfidenceDirectPriceAction.treatmentKeys,
    ["botox"],
    "a treatment named outright must own its price question even at low confidence",
  );

  const lowConfidenceBooking = evaluateDialoguePolicy(
    initial,
    turn({
      booking: {
        explicit: true,
        fields: { branch: "高雄館", name: "不應採用", treatmentKeys: ["botox"] },
        intent: "create",
      },
      confidence: 0.4,
      speechAct: "book_consultation",
      text: "我要預約肉毒",
      treatments: [{ ...entity("botox"), confidence: 0.4 }],
      turnId: "uncertain-booking",
    }),
  );
  const emptyBooking = apply(initial, lowConfidenceBooking);
  assert.equal(emptyBooking.bookingTask.expectedField, "treatment");
  assert.deepEqual(emptyBooking.bookingTask.draft.treatmentKeys, []);
  assert.equal(emptyBooking.bookingTask.draft.branch, undefined);
  assert.equal(emptyBooking.bookingTask.draft.name, undefined);

  const underspecified = evaluateDialoguePolicy(
    initial,
    turn({
      speechAct: "learn_treatment",
      text: "我想問那個療程",
      treatments: [entity("unknown_treatment", "underspecified")],
      turnId: "uncertain-2",
    }),
  );
  expectAction(underspecified, "clarify");
}

function validateAllSelectionUsesAwaitingOptions() {
  const initial = createConversationV2State({ episodeId: "episode-3", now: AT });
  const clarify = evaluateDialoguePolicy(
    initial,
    turn({
      clarification: {
        allowMultiple: true,
        options: [
          { entity: "concern", id: "fat", label: "脂肪堆積", value: "local_fat" },
          { entity: "concern", id: "loose", label: "輪廓鬆弛", value: "jawline_looseness" },
        ],
        prompt: "比較在意脂肪堆積，還是輪廓鬆弛？",
        slot: "concern",
      },
      concerns: [entity("jawline", "underspecified")],
      speechAct: "ask_concern",
      text: "雙下巴怎麼改善",
      turnId: "turn-1",
    }),
  );
  expectAction(clarify, "clarify");
  const awaiting = apply(initial, clarify);
  assert.equal(awaiting.awaiting?.allowMultiple, true);

  const priceQuestion = evaluateDialoguePolicy(
    awaiting,
    turn({
      speechAct: "ask_price",
      text: "ONDA 1堂多少錢",
      treatments: [entity("onda_pro")],
      turnId: "turn-price",
    }),
  );
  expectAction(priceQuestion, "answer_price");

  const clinicQuestion = evaluateDialoguePolicy(
    awaiting,
    turn({
      speechAct: "ask_clinic_info",
      text: "你們有1家店嗎",
      turnId: "turn-clinic",
    }),
  );
  expectAction(clinicQuestion, "answer_clinic_info");

  const pureIndex = evaluateDialoguePolicy(
    awaiting,
    turn({ speechAct: "unknown", text: "1", turnId: "turn-index" }),
  );
  assert.deepEqual(
    expectAction(pureIndex, "answer_selection").selectedOptions.map((option) => option.id),
    ["fat"],
  );

  const selectAll = evaluateDialoguePolicy(
    awaiting,
    turn({ speechAct: "select_options", text: "都能給我看看", turnId: "turn-2" }),
  );
  const action = expectAction(selectAll, "answer_selection");
  assert.deepEqual(
    action.selectedOptions.map((option) => option.id),
    ["fat", "loose"],
  );
  assert.equal(selectAll.replyPlan.mode, "generated");

  const resolved = apply(awaiting, selectAll);
  assert.equal(resolved.awaiting, undefined);
  assert.deepEqual(resolved.knowledge.concernKeys, [
    "jawline",
    "local_fat",
    "jawline_looseness",
  ]);
}

function validateUnderspecifiedFineLinesClarifies() {
  const initial = createConversationV2State({ episodeId: "episode-4", now: AT });
  const result = evaluateDialoguePolicy(
    initial,
    turn({
      clarification: {
        allowMultiple: false,
        options: [
          { entity: "area", id: "forehead", label: "額頭／抬頭紋", value: "forehead" },
          { entity: "area", id: "frown", label: "眉間／皺眉紋", value: "glabella" },
          { entity: "area", id: "eye", label: "眼周／魚尾紋", value: "eye_area" },
        ],
        prompt: "細紋比較在意額頭、眉間，還是眼周呢？",
        slot: "area",
      },
      concerns: [entity("fine_lines", "underspecified")],
      speechAct: "ask_concern",
      text: "我想知道細紋",
      turnId: "turn-1",
    }),
  );
  const action = expectAction(result, "clarify");
  assert.equal(action.awaiting.expectedField, "area");
  assert.equal(action.awaiting.options.length, 3);
  assert.equal(result.replyPlan.mode, "deterministic");
  assert.equal(result.replyPlan.dialogueAct, "clarify");

  const clarified = apply(initial, result);
  assert.deepEqual(clarified.knowledge.concernKeys, []);
  assert.deepEqual(clarified.awaiting?.pendingKnowledge?.concernKeys, ["fine_lines"]);
  const selected = evaluateDialoguePolicy(
    clarified,
    turn({ speechAct: "select_options", text: "眉間", turnId: "turn-2" }),
  );
  expectAction(selected, "answer_selection");
  assert.equal(selected.replyPlan.mode, "generated");
  assert.deepEqual(
    selected.replyPlan.mode === "generated" ? selected.replyPlan.knowledgeQuery.concernKeys : [],
    ["fine_lines"],
  );
  assert.deepEqual(
    selected.replyPlan.mode === "generated" ? selected.replyPlan.knowledgeQuery.areaKeys : [],
    ["glabella"],
  );
  const answered = apply(clarified, selected);
  assert.deepEqual(answered.knowledge.concernKeys, ["fine_lines"]);
  assert.deepEqual(answered.knowledge.areaKeys, ["glabella"]);
  assert.equal(answered.activeTask.subjectKey, "concern:fine_lines+glabella");
  const selectedTaskId = answered.activeTask.id;
  const followup = evaluateDialoguePolicy(
    answered,
    turn({
      speechAct: "ask_treatment_detail",
      text: "那原理呢",
      turnId: "turn-3",
    }),
  );
  const followedUp = apply(answered, followup);
  assert.equal(followedUp.activeTask.id, selectedTaskId);
  assert.equal(followedUp.activeTask.subjectKey, "concern:fine_lines+glabella");
}

function validateSelectionCommitsTreatmentSubjects() {
  const initial = createConversationV2State({ episodeId: "episode-selection-subject", now: AT });
  const treatmentClarify = evaluateDialoguePolicy(
    initial,
    turn({
      clarification: {
        allowMultiple: false,
        options: [
          { entity: "treatment", id: "botox", label: "肉毒", value: "botox" },
        ],
        prompt: "想確認您指的是肉毒嗎？",
        slot: "treatment",
      },
      speechAct: "learn_treatment",
      text: "我想問那個針",
      treatments: [entity("unknown_injection", "underspecified")],
      turnId: "treatment-select-1",
    }),
  );
  const treatmentAwaiting = apply(initial, treatmentClarify);
  const treatmentSelection = evaluateDialoguePolicy(
    treatmentAwaiting,
    turn({ speechAct: "select_options", text: "肉毒", turnId: "treatment-select-2" }),
  );
  const selectedTreatment = apply(treatmentAwaiting, treatmentSelection);
  assert.deepEqual(selectedTreatment.knowledge.treatmentKeys, ["botox"]);
  assert.equal(selectedTreatment.activeTask.subjectKey, "treatment:botox");

  const compareClarify = evaluateDialoguePolicy(
    initial,
    turn({
      clarification: {
        allowMultiple: true,
        options: [
          { entity: "treatment", id: "onda", label: "ONDA", value: "onda_pro" },
          { entity: "treatment", id: "botox", label: "肉毒", value: "botox" },
        ],
        prompt: "想比較哪兩項療程？",
        slot: "treatment",
      },
      speechAct: "compare_treatments",
      text: "兩個都想比較",
      turnId: "compare-select-1",
    }),
  );
  const compareAwaiting = apply(initial, compareClarify);
  const compareSelection = evaluateDialoguePolicy(
    compareAwaiting,
    turn({ speechAct: "select_options", text: "全部", turnId: "compare-select-2" }),
  );
  const selectedComparison = apply(compareAwaiting, compareSelection);
  assert.deepEqual(selectedComparison.knowledge.treatmentKeys, ["onda_pro", "botox"]);
  assert.equal(selectedComparison.activeTask.kind, "compare_treatments");
  assert.equal(selectedComparison.activeTask.subjectKey, "comparison:botox+onda_pro");

  const mixedCandidateClarify = evaluateDialoguePolicy(
    initial,
    turn({
      clarification: {
        allowMultiple: false,
        options: [
          { entity: "treatment", id: "onda", label: "ONDA", value: "onda_pro" },
        ],
        prompt: "另一項是想比較 ONDA 嗎？",
        slot: "treatment",
      },
      speechAct: "compare_treatments",
      text: "肉毒跟那台機器比較",
      treatments: [
        entity("botox"),
        entity("unknown_device", "underspecified"),
      ],
      turnId: "compare-candidate-1",
    }),
  );
  const mixedCandidateAwaiting = apply(initial, mixedCandidateClarify);
  assert.deepEqual(mixedCandidateAwaiting.awaiting?.pendingKnowledge?.treatmentKeys, ["botox"]);
  const mixedCandidateSelection = evaluateDialoguePolicy(
    mixedCandidateAwaiting,
    turn({ speechAct: "select_options", text: "ONDA", turnId: "compare-candidate-2" }),
  );
  const mixedCandidateSelected = apply(mixedCandidateAwaiting, mixedCandidateSelection);
  assert.deepEqual(mixedCandidateSelected.knowledge.treatmentKeys, ["botox", "onda_pro"]);
  assert.equal(
    mixedCandidateSelected.activeTask.subjectKey,
    "comparison:botox+onda_pro",
  );
  assert.deepEqual(
    mixedCandidateSelection.replyPlan.mode === "generated"
      ? mixedCandidateSelection.replyPlan.knowledgeQuery.treatmentKeys
      : [],
    ["botox", "onda_pro"],
  );
}

function validateNegatedEntitiesNeverOwnDialogueKnowledge() {
  const initial = createConversationV2State({ episodeId: "episode-negation", now: AT });
  const rejectedOnly = evaluateDialoguePolicy(
    initial,
    turn({
      speechAct: "unknown",
      text: "我不想打肉毒",
      treatments: [entity("botox", "resolved", "negated")],
      turnId: "negated-1",
    }),
  );
  expectAction(rejectedOnly, "fallback_clarify");
  const rejectedState = apply(initial, rejectedOnly);
  assert.deepEqual(rejectedState.knowledge.treatmentKeys, []);

  const corrected = evaluateDialoguePolicy(
    initial,
    turn({
      speechAct: "learn_treatment",
      text: "我不是問肉毒，我想了解 ONDA",
      treatments: [
        entity("botox", "resolved", "negated"),
        entity("onda_pro"),
      ],
      turnId: "negated-2",
    }),
  );
  const correctedAction = expectAction(corrected, "learn_treatment");
  assert.deepEqual(correctedAction.treatmentKeys, ["onda_pro"]);
  assert.deepEqual(apply(initial, corrected).knowledge.treatmentKeys, ["onda_pro"]);
}

function validateBookingEpisodesDoNotLeakDrafts() {
  const initial = createConversationV2State({ episodeId: "episode-booking-reset", now: AT });
  const oldBooking = evaluateDialoguePolicy(
    initial,
    turn({
      booking: {
        explicit: true,
        fields: {
          branch: "高雄館",
          firstVisit: true,
          name: "王小美",
          phone: "0912345678",
          timeSlots: ["8/20 下午"],
          treatmentKeys: ["onda_pro"],
        },
        intent: "create",
      },
      speechAct: "book_consultation",
      text: "我要預約 ONDA",
      treatments: [entity("onda_pro")],
      turnId: "old-booking",
    }),
  );
  expectAction(oldBooking, "start_booking");
  const completed = apply(initial, oldBooking);
  assert.equal(completed.bookingTask.status, "completed");

  const newBooking = evaluateDialoguePolicy(
    completed,
    turn({
      booking: { explicit: true, fields: { treatmentKeys: ["botox"] }, intent: "create" },
      speechAct: "book_consultation",
      text: "我要改預約肉毒諮詢",
      treatments: [entity("botox")],
      turnId: "new-booking",
    }),
  );
  expectAction(newBooking, "start_booking");
  const reset = apply(completed, newBooking);
  assert.deepEqual(reset.bookingTask.draft.treatmentKeys, ["botox"]);
  assert.deepEqual(reset.bookingTask.draft.timeSlots, []);
  assert.equal(reset.bookingTask.draft.branch, undefined);
  assert.equal(reset.bookingTask.draft.name, undefined);
  assert.equal(reset.bookingTask.draft.phone, undefined);
  assert.notEqual(reset.bookingTask.id, completed.bookingTask.id);

  const partialBooking = evaluateDialoguePolicy(
    initial,
    turn({
      booking: {
        explicit: true,
        fields: { branch: "林口館", name: "陳小姐", treatmentKeys: ["onda_pro"] },
        intent: "create",
      },
      speechAct: "book_consultation",
      text: "我要預約 ONDA",
      treatments: [entity("onda_pro")],
      turnId: "partial-booking",
    }),
  );
  const collecting = apply(initial, partialBooking);
  const bookingId = collecting.bookingTask.id;

  const collectingQuestion = evaluateDialoguePolicy(
    collecting,
    turn({
      booking: {
        explicit: true,
        fields: {
          branch: "桃園館",
          name: "王小美",
          phone: "0912345678",
          treatmentKeys: ["onda_pro"],
        },
        intent: "create",
      },
      speechAct: "book_consultation",
      text: "我要預約 ONDA，王小美 0912-345-678 是否是我的資料",
      treatments: [entity("onda_pro")],
      turnId: "collecting-explicit-question",
    }),
  );
  const collectingQuestionAction = expectAction(collectingQuestion, "capture_booking_fields");
  assert.deepEqual(
    collectingQuestionAction.fields,
    {},
    "an explicit question must resume the booking without persisting mentioned fields",
  );
  const afterCollectingQuestion = apply(collecting, collectingQuestion);
  assert.equal(afterCollectingQuestion.bookingTask.draft.branch, "林口館");
  assert.equal(afterCollectingQuestion.bookingTask.draft.name, "陳小姐");
  assert.equal(afterCollectingQuestion.bookingTask.draft.phone, undefined);

  const crossTreatmentQuestion = evaluateDialoguePolicy(
    collecting,
    turn({
      booking: {
        explicit: true,
        fields: {
          branch: "桃園館",
          name: "王小美",
          phone: "0912345678",
          treatmentKeys: ["botox"],
        },
        intent: "create",
      },
      speechAct: "book_consultation",
      text: "我要預約肉毒，王小美 0912-345-678 是否是我的資料",
      treatments: [entity("botox")],
      turnId: "collecting-cross-treatment-question",
    }),
  );
  const crossTreatmentAction = expectAction(crossTreatmentQuestion, "start_booking");
  assert.deepEqual(crossTreatmentAction.initialDraft, {
    branch: undefined,
    firstVisit: undefined,
    name: undefined,
    phone: undefined,
    timeSlots: undefined,
    treatmentKeys: ["botox"],
  });
  const afterCrossTreatmentQuestion = apply(collecting, crossTreatmentQuestion);
  assert.deepEqual(afterCrossTreatmentQuestion.bookingTask.draft.treatmentKeys, ["botox"]);
  assert.equal(afterCrossTreatmentQuestion.bookingTask.draft.branch, undefined);
  assert.equal(afterCrossTreatmentQuestion.bookingTask.draft.name, undefined);
  assert.equal(afterCrossTreatmentQuestion.bookingTask.draft.phone, undefined);

  const contradictoryHint = evaluateDialoguePolicy(
    collecting,
    turn({
      booking: {
        continuation: true,
        explicit: true,
        fields: { treatmentKeys: ["botox"] },
        intent: "create",
      } as unknown as NonNullable<TurnUnderstanding["booking"]>,
      speechAct: "book_consultation",
      text: "我要預約肉毒",
      treatments: [entity("botox")],
      turnId: "contradictory-continuation",
    }),
  );
  expectAction(contradictoryHint, "start_booking");
  const contradictoryReset = apply(collecting, contradictoryHint);
  assert.deepEqual(contradictoryReset.bookingTask.draft.treatmentKeys, ["botox"]);
  assert.equal(contradictoryReset.bookingTask.draft.branch, undefined);
  assert.equal(contradictoryReset.bookingTask.draft.name, undefined);
  assert.deepEqual(contradictoryReset.bookingTask.draft.timeSlots, []);

  const conflictingField = evaluateDialoguePolicy(
    collecting,
    turn({
      booking: {
        explicit: false,
        fields: { timeSlots: ["8/22 下午"], treatmentKeys: ["botox"] },
        intent: "none",
      },
      speechAct: "provide_booking_field",
      text: "肉毒改成 8/22 下午",
      treatments: [entity("botox")],
      turnId: "conflicting-field",
    }),
  );
  assert.notEqual(
    conflictingField.action.type,
    "capture_booking_fields",
    "a different treatment was captured into the current ONDA booking",
  );

  const continuation = evaluateDialoguePolicy(
    collecting,
    turn({
      booking: {
        explicit: false,
        fields: { timeSlots: ["8/21 晚上"] },
        intent: "none",
      },
      speechAct: "provide_booking_field",
      text: "時間可以 8/21 晚上",
      turnId: "continue-booking",
    }),
  );
  expectAction(continuation, "capture_booking_fields");
  const continued = apply(collecting, continuation);
  assert.equal(continued.bookingTask.id, bookingId);
  assert.equal(continued.bookingTask.draft.branch, "林口館");
  assert.equal(continued.bookingTask.draft.name, "陳小姐");
  assert.deepEqual(continued.bookingTask.draft.treatmentKeys, ["onda_pro"]);
  assert.deepEqual(continued.bookingTask.draft.timeSlots, ["8/21 晚上"]);

  const detour = evaluateDialoguePolicy(
    continued,
    turn({
      speechAct: "ask_treatment_detail",
      text: "我先了解作用",
      treatments: [entity("onda_pro")],
      turnId: "detour",
    }),
  );
  const suspended = apply(continued, detour);
  assert.equal(suspended.bookingTask.status, "suspended");
  const suspendedQuestion = evaluateDialoguePolicy(
    suspended,
    turn({
      booking: {
        explicit: true,
        fields: {
          branch: "桃園館",
          name: "王小美",
          phone: "0912345678",
          treatmentKeys: ["onda_pro"],
        },
        intent: "create",
      },
      speechAct: "book_consultation",
      text: "我要預約 ONDA，王小美 0912-345-678 是否是我的資料",
      treatments: [entity("onda_pro")],
      turnId: "suspended-explicit-question",
    }),
  );
  const suspendedQuestionAction = expectAction(suspendedQuestion, "capture_booking_fields");
  assert.deepEqual(
    suspendedQuestionAction.fields,
    {},
    "a suspended booking question must resume without persisting mentioned fields",
  );
  const afterSuspendedQuestion = apply(suspended, suspendedQuestion);
  assert.equal(afterSuspendedQuestion.bookingTask.draft.branch, "林口館");
  assert.equal(afterSuspendedQuestion.bookingTask.draft.name, "陳小姐");
  assert.equal(afterSuspendedQuestion.bookingTask.draft.phone, undefined);
  const suspendedCrossTreatmentQuestion = evaluateDialoguePolicy(
    suspended,
    turn({
      booking: {
        explicit: true,
        fields: {
          branch: "桃園館",
          name: "王小美",
          phone: "0912345678",
          treatmentKeys: ["botox"],
        },
        intent: "create",
      },
      speechAct: "book_consultation",
      text: "我要預約肉毒，王小美 0912-345-678 是否是我的資料",
      treatments: [entity("botox")],
      turnId: "suspended-cross-treatment-question",
    }),
  );
  const suspendedCrossTreatmentAction =
    expectAction(suspendedCrossTreatmentQuestion, "start_booking");
  assert.deepEqual(suspendedCrossTreatmentAction.initialDraft, {
    branch: undefined,
    firstVisit: undefined,
    name: undefined,
    phone: undefined,
    timeSlots: undefined,
    treatmentKeys: ["botox"],
  });
  const afterSuspendedCrossTreatmentQuestion = apply(suspended, suspendedCrossTreatmentQuestion);
  assert.deepEqual(afterSuspendedCrossTreatmentQuestion.bookingTask.draft.treatmentKeys, ["botox"]);
  assert.equal(afterSuspendedCrossTreatmentQuestion.bookingTask.draft.branch, undefined);
  assert.equal(afterSuspendedCrossTreatmentQuestion.bookingTask.draft.name, undefined);
  assert.equal(afterSuspendedCrossTreatmentQuestion.bookingTask.draft.phone, undefined);
  const afterSuspension = evaluateDialoguePolicy(
    suspended,
    turn({
      booking: { explicit: true, fields: { treatmentKeys: ["botox"] }, intent: "create" },
      speechAct: "book_consultation",
      text: "我要預約肉毒",
      treatments: [entity("botox")],
      turnId: "booking-after-suspension",
    }),
  );
  expectAction(afterSuspension, "start_booking");
  const resetSuspended = apply(suspended, afterSuspension);
  assert.deepEqual(resetSuspended.bookingTask.draft.treatmentKeys, ["botox"]);
  assert.equal(resetSuspended.bookingTask.draft.branch, undefined);
  assert.equal(resetSuspended.bookingTask.draft.name, undefined);
  assert.deepEqual(resetSuspended.bookingTask.draft.timeSlots, []);

}

function validateReducerIsPureAndPolicyIsSingular() {
  const initial = createConversationV2State({ episodeId: "episode-5", now: AT });
  const snapshot = JSON.stringify(initial);
  const result = evaluateDialoguePolicy(
    initial,
    turn({
      speechAct: "learn_treatment",
      text: "想了解肉毒",
      treatments: [entity("botox")],
      turnId: "turn-1",
    }),
  );
  assert.equal(Array.isArray(result.action), false);
  assert.equal(result.replyPlan.action, result.action.type);
  const reduced = apply(initial, result);
  assert.equal(JSON.stringify(initial), snapshot, "reducer mutated its input state");
  assert.notEqual(reduced, initial);
  assert.equal(reduced.revision, initial.revision + 1);
}

function validateConsultedTreatmentsAreSeparateFromBookingOwnership() {
  const initial = createConversationV2State({ episodeId: "episode-consulted", now: AT });
  const onda = apply(initial, evaluateDialoguePolicy(
    initial,
    turn({
      speechAct: "learn_treatment",
      text: "想了解 ONDA",
      treatments: [entity("onda_pro")],
      turnId: "consulted-onda",
    }),
  ));
  assert.deepEqual(onda.knowledge.treatmentKeys, ["onda_pro"]);
  assert.deepEqual(onda.knowledge.consultedTreatmentKeys, ["onda_pro"]);

  const botox = apply(onda, evaluateDialoguePolicy(
    onda,
    turn({
      speechAct: "learn_treatment",
      text: "也想了解肉毒",
      treatments: [entity("botox")],
      turnId: "consulted-botox",
    }),
  ));
  assert.deepEqual(botox.knowledge.treatmentKeys, ["botox"]);
  assert.deepEqual(
    botox.knowledge.consultedTreatmentKeys,
    ["onda_pro", "botox"],
    "switching the active treatment must retain the current episode's consultation history",
  );

  const booking = apply(botox, evaluateDialoguePolicy(
    botox,
    turn({
      booking: { explicit: true, fields: { treatmentKeys: ["botox"] }, intent: "create" },
      speechAct: "book_consultation",
      text: "我要預約肉毒",
      treatments: [entity("botox")],
      turnId: "consulted-booking",
    }),
  ));
  assert.deepEqual(
    booking.bookingTask.draft.treatmentKeys,
    ["botox"],
    "the booking draft must continue to own only the treatment being booked",
  );
  assert.deepEqual(booking.knowledge.consultedTreatmentKeys, ["onda_pro", "botox"]);

  const restartedResult = evaluateDialoguePolicy(
    booking,
    turn({
      receivedAt: "2026-08-14T04:31:00.000Z",
      speechAct: "learn_treatment",
      text: "想了解 ONDA",
      treatments: [entity("onda_pro")],
      turnId: "consulted-new-episode",
    }),
  );
  const restartedAction = expectAction(restartedResult, "learn_treatment");
  assert.equal(restartedAction.episodeRestart, true);
  const restarted = apply(booking, restartedResult);
  assert.deepEqual(
    restarted.knowledge.consultedTreatmentKeys,
    ["onda_pro"],
    "a new 30-minute episode must start a fresh consultation summary",
  );
}

function validateEngineIdempotency() {
  const initial = createConversationV2State({ episodeId: "episode-idempotency", now: AT });
  const input = turn({
    speechAct: "learn_treatment",
    text: "想了解 ONDA",
    treatments: [entity("onda_pro")],
    turnId: "stable-turn-id",
  });
  const first = routeConversationTurnV2(initial, input);
  assert.equal(first.duplicate, false);
  assert.ok(first.result);
  assert.equal(first.nextState.lastProcessedTurnId, "stable-turn-id");

  const duplicate = routeConversationTurnV2(first.nextState, input);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.result, null);
  assert.equal(duplicate.nextState, first.nextState);

  const secondInput = turn({
    speechAct: "ask_clinic_info",
    text: "你們有幾家店",
    turnId: "second-turn-id",
  });
  const second = routeConversationTurnV2(first.nextState, secondInput);
  assert.equal(second.duplicate, false);
  const replayAfterAnotherTurn = routeConversationTurnV2(second.nextState, input);
  assert.equal(replayAfterAnotherTurn.duplicate, true, "A,B,A replay was not deduplicated");
  assert.deepEqual(second.nextState.processedTurnIds, ["stable-turn-id", "second-turn-id"]);

  let bounded = createConversationV2State({ episodeId: "episode-bounded", now: AT });
  for (let index = 0; index < 70; index += 1) {
    bounded = reduceConversationV2State(bounded, {
      at: AT,
      prompt: "clarify",
      turnId: `bounded-${index}`,
      type: "fallback_clarify",
    });
  }
  assert.equal(bounded.processedTurnIds.length, 64);
  assert.equal(bounded.processedTurnIds[0], "bounded-6");
  assert.equal(bounded.processedTurnIds.at(-1), "bounded-69");
}

validatePendingHandoffDoesNotOwnDialogue();
validateSafetyHandoffDoesNotStartSalesIntake();
validateOnlyExplicitBookingStartsCollection();
validateBookingFieldAndPricingOwnership();
validateBookingIntentContracts();
validateTreatmentKnowledgeOwnershipAndTaskEpisodes();
validateUncertainUnderstandingMustClarify();
validateAllSelectionUsesAwaitingOptions();
validateUnderspecifiedFineLinesClarifies();
validateSelectionCommitsTreatmentSubjects();
validateNegatedEntitiesNeverOwnDialogueKnowledge();
validateBookingEpisodesDoNotLeakDrafts();
validateConsultedTreatmentsAreSeparateFromBookingOwnership();
validateReducerIsPureAndPolicyIsSingular();
validateEngineIdempotency();

console.log("PASS: conversation-v2 core policy and reducer validation");
