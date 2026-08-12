import { appendRecentConversationTurns, createEmptyConversationContext, loadConversationContext, type ConversationContext } from "../src/lib/conversation-context";
import { buildCustomerServiceUserPrompt } from "../src/lib/ai-customer-policy";
import { processWebhookRequestBody } from "../src/lib/line-webhook";
import { routeCustomerMessage, type RouterDecision } from "../src/lib/router";

const NOW = new Date("2026-08-06T06:00:00.000Z");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function route(
  message: string,
  conversationContext: ConversationContext,
  now = NOW,
): Promise<RouterDecision> {
  return routeCustomerMessage({
    conversationContext,
    includePending: false,
    message,
    now,
  });
}

async function runTurns(messages: string[], userId: string) {
  let context = createEmptyConversationContext(userId);
  const decisions: RouterDecision[] = [];

  for (const message of messages) {
    const decision = await route(message, context);
    decisions.push(decision);
    context = decision.nextContext;
  }

  return { context, decisions };
}

async function validateConcernAccumulation() {
  const { context } = await runTurns(
    ["我想改善嘴邊肉", "也想改善雙下巴", "手臂也想要", "主要是雙下巴"],
    "conversation-flow-cf1",
  );
  const consultation = context.treatmentConsultation;

  assert(consultation?.treatmentKey === "onda_pro", "CF1: ONDA must remain the active consultation treatment");
  assert(
    consultation.concernKeys.includes("jawline_looseness") && consultation.concernKeys.includes("local_contour"),
    "CF1: jawline and local contour concerns must accumulate",
  );
  assert(consultation.primaryConcernKey === "jawline_looseness", "CF1: double chin must become the primary concern");
  assert(consultation.stage === "priority_selected", "CF1: selecting a primary concern must advance the consultation stage");
  console.log("PASS: CF1 multi-need consultation accumulates and converges");
}

async function validateBookingEscape() {
  const { context, decisions } = await runTurns(
    ["我想預約皮秒", "高雄館 王小美 0912345678 初診", "你好，我想了解ONDA"],
    "conversation-flow-cf2",
  );
  const decision = decisions[2];

  assert(decision.matchedKey === "treatment_intro:onda_pro", "CF2: a new ONDA inquiry must leave booking intake");
  assert(decision.nextContext.lastIntent === "treatment_intro:onda_pro", "CF2: the ONDA consultation must own the latest intent");
  assert(context.bookingDraft.treatment?.includes("皮秒"), "CF2: the earlier booking treatment must be preserved");
  console.log("PASS: CF2 new treatment inquiry escapes booking without losing the draft");
}

async function validatePromotionBrowsing() {
  const { decisions } = await runTurns(["想了解肉毒", "現在活動有哪些"], "conversation-flow-cf3");

  assert(decisions[1].matchedKey === "promotion_overview", "CF3: an explicit promotion browse request must show the overview");
  console.log("PASS: CF3 explicit promotion browsing is not trapped by treatment context");
}

async function validateExplicitTreatmentPrice() {
  const { decisions } = await runTurns(
    ["想了解ONDA", "雙下巴", "我想知道ONDA的價格"],
    "conversation-flow-cf4",
  );
  const priceDecision = decisions[2];

  assert(priceDecision.decisionType === "pricing_auto_reply", "CF4: an explicit ONDA price request must use the pricing route");
  assert(priceDecision.matchedKey === "ONDA PRO", "CF4: an explicit ONDA price request must keep ONDA as its subject");
  assert(priceDecision.replyText.includes("16,888"), "CF4: an explicit ONDA price request must return the approved amount");
  console.log("PASS: CF4 explicit treatment price remains treatment-specific");
}

async function validateSafetyPrecedence() {
  const pregnancy = await runTurns(
    ["想了解ONDA", "雙下巴", "我懷孕了想預約肉毒"],
    "conversation-flow-cf5-pregnancy",
  );
  assert(pregnancy.decisions[2].matchedKey === "pregnancy_caution", "CF5: pregnancy guidance must override consultation state");

  const postProcedure = await runTurns(
    ["想了解ONDA", "我打完很腫"],
    "conversation-flow-cf5-post-procedure",
  );
  assert(
    postProcedure.decisions[1].matchedKey === "post_procedure_issue",
    "CF5: post-procedure safety must override consultation state",
  );
  console.log("PASS: CF5 safety routing remains first in multi-turn conversations");
}

async function validateConsultationExpiry() {
  const initial = await runTurns(["想了解ONDA", "雙下巴", "主要是雙下巴"], "conversation-flow-cf6");
  const staleContext: ConversationContext = {
    ...initial.context,
    lastSeenAt: new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const restarted = await route("雙下巴", staleContext);

  assert(restarted.matchedKey === "treatment_consult:onda_pro", "CF6: a stale consultation must still route a known concern safely");
  assert(
    restarted.nextContext.treatmentConsultation?.stage === "priority_selected",
    "CF6: a stale consultation must discard the old stage and promote the newly stated concern",
  );
  assert(
    restarted.nextContext.treatmentConsultation?.primaryConcernKey === "jawline_looseness",
    "CF6: a stale consultation must use the newly stated concern instead of retaining hidden old needs",
  );
  console.log("PASS: CF6 stale consultation state is cleared before a new turn");
}

function validateRecentTurnsAndPrompt() {
  let context = createEmptyConversationContext("conversation-flow-cf7");
  context = appendRecentConversationTurns(context, [
    { role: "user", text: "想了解 ONDA" },
    { role: "assistant", text: "想改善哪個部位呢？" },
    { role: "user", text: "雙下巴" },
    { role: "assistant", text: "已確認雙下巴" },
    { role: "user", text: "脂肪" },
    { role: "assistant", text: "先從局部脂肪方向評估" },
    { role: "user", text: "那搭配呢，我電話 0912-345-678，網址 https://example.com" },
  ]);
  assert(context.recentTurns?.length === 6, "CF7: recent history must stay within six turns");
  assert(!JSON.stringify(context.recentTurns).includes("0912-345-678"), "CF7: recent history must mask phone numbers");
  assert(JSON.stringify(context.recentTurns).includes("[電話已提供]"), "CF7: phone masking must replace the number with an explicit safe marker");
  assert(!JSON.stringify(context.recentTurns).includes("https://"), "CF7: recent history must mask URLs");

  const prompt = buildCustomerServiceUserPrompt("那搭配呢", {
    focusAwaiting: "確認單做與搭配差異",
    focusGoal: "learn_treatment",
    recentTurns: context.recentTurns,
    treatmentFocus: "ONDA PRO",
  });
  assert(prompt.includes("最近對話") && prompt.includes("客人：雙下巴"), "CF7: reply model must receive recent dialogue evidence");
  assert(prompt.includes("禁止把同一個問題、選項或通用介紹再問一次"), "CF7: reply model must be told to advance instead of looping");
  assert(prompt.includes("2 至 4 個有功能的 emoji"), "CF7: natural emoji guidance must live in the reply layer");
  console.log("PASS: CF7 recent dialogue is bounded, masked, and supplied to the reply model");
}

async function validateWebhookPersistsVisibleTurn() {
  const userId = `conversation-flow-cf8-${Date.now()}`;
  const result = await processWebhookRequestBody(JSON.stringify({
    events: [{
      message: { id: "cf8-message", text: "可以刷卡嗎", type: "text" },
      replyToken: "cf8-reply-token",
      source: { type: "user", userId },
      type: "message",
      webhookEventId: "cf8-event",
    }],
  }), { includePending: false });
  const context = await loadConversationContext(userId);
  const recentTurns = context.recentTurns ?? [];
  const lastTwoTurns = recentTurns.slice(-2);
  const visibleReply = result.results[0]?.decision.replyText;

  assert(result.results.length === 1 && lastTwoTurns.length === 2, "CF8: the webhook must retain the customer turn and final visible reply");
  assert(lastTwoTurns[0]?.role === "user" && lastTwoTurns[0]?.text === "可以刷卡嗎", "CF8: the stored customer turn must match the inbound LINE message");
  assert(lastTwoTurns[1]?.role === "assistant" && lastTwoTurns[1]?.text === visibleReply, "CF8: the stored assistant turn must be the formatted customer-visible reply");
  console.log("PASS: CF8 webhook persists the final customer-visible turn for the next reply");
}

async function validateCorrectionReplacesFocus() {
  const { context, decisions } = await runTurns(
    ["想了解ONDA", "雙下巴", "不對，我是想改善肚子"],
    "conversation-flow-cf9",
  );
  const corrected = decisions[2];

  assert(corrected.replyText.includes("身體局部脂肪堆積"), "CF9: a correction must answer the newly stated body concern");
  assert(!corrected.replyText.includes("也想改善") && !corrected.replyText.includes("先以哪個部位為主"), "CF9: a correction must not merge the rejected concern into a multi-concern menu");
  assert(context.treatmentConsultation?.concernKeys.length === 1 && context.treatmentConsultation.concernKeys[0] === "local_contour", "CF9: corrected concern must replace the previous consultation focus");
  assert(context.activeFocus?.concernKeys.length === 1 && context.activeFocus.concernKeys[0] === "local_contour", "CF9: canonical focus must retain only the corrected concern");
  console.log("PASS: CF9 explicit correction replaces the old concern instead of accumulating it");
}

async function validateQuestionsDoNotReplaceFocus() {
  const { context, decisions } = await runTurns(
    ["想了解ONDA", "雙下巴", "ONDA 不是可以改善肚子嗎？"],
    "conversation-flow-cf10-question",
  );
  const question = decisions[2];

  assert(question.replyText.includes("也想改善"), "CF10: a question about another area must be treated as an additional need, not a correction");
  assert(context.treatmentConsultation?.concernKeys.includes("jawline_looseness"), "CF10: an interrogative negation must preserve the confirmed double-chin concern");
  assert(context.treatmentConsultation?.concernKeys.includes("local_contour"), "CF10: an interrogative negation may add the newly asked body concern");

  const explicitQuestion = await runTurns(
    ["想了解ONDA", "雙下巴", "我不是想改善肚子嗎？"],
    "conversation-flow-cf10-explicit-question",
  );
  assert(explicitQuestion.context.treatmentConsultation?.concernKeys.includes("jawline_looseness"), "CF10: question suffix must prevent a correction-shaped question from deleting the active concern");
  assert(explicitQuestion.context.treatmentConsultation?.concernKeys.includes("local_contour"), "CF10: correction-shaped question may still add the newly asked concern");

  const doubleNegation = await runTurns(
    ["想了解ONDA", "雙下巴", "我不是不想改善肚子"],
    "conversation-flow-cf10-double-negation",
  );
  assert(doubleNegation.context.treatmentConsultation?.concernKeys.includes("jawline_looseness"), "CF10: double negation must not silently discard the active concern");

  const corrected = await runTurns(
    ["想了解ONDA", "雙下巴", "其實主要是腹部"],
    "conversation-flow-cf10-correction",
  );
  assert(corrected.context.treatmentConsultation?.concernKeys.length === 1, "CF10: '其實主要是' must replace instead of accumulate");
  assert(corrected.context.treatmentConsultation?.concernKeys[0] === "local_contour", "CF10: '其實主要是腹部' must select the body concern");
  console.log("PASS: CF10 questions preserve focus while explicit corrections replace it");
}

async function validateBookingOwnsAmbiguousPrice() {
  const { context, decisions } = await runTurns(
    ["我想預約肉毒", "高雄館", "想了解 ONDA", "雙下巴", "我要改我的預約", "這個多少錢"],
    "conversation-flow-cf11",
  );
  const manageBooking = decisions[4];
  const price = decisions[5];

  assert(manageBooking.matchedKey === "booking_modify_request", "CF11: an explicit booking change must enter manage-booking mode");
  assert(manageBooking.nextContext.activeFocus?.goal === "manage_booking", "CF11: booking modification must own the active focus");
  assert(manageBooking.nextContext.bookingDraft.treatment === "肉毒", "CF11: managing an existing booking must not merge the parallel ONDA consultation into the draft");
  assert(price.matchedKey === "肉毒除皺", "CF11: an ambiguous price question in manage-booking mode must use the booked treatment");
  assert(price.replyText.includes("999") && !price.replyText.includes("12,999"), "CF11: booking-owned price must not leak the parallel ONDA combo");
  assert(context.bookingDraft.treatment === "肉毒", "CF11: the original booking treatment must remain stable after pricing");

  const bookingAfterInfo = createEmptyConversationContext("conversation-flow-cf11-active-focus");
  bookingAfterInfo.bookingDraft.campaignId = "promo-2026-07-09-botox-wrinkle";
  bookingAfterInfo.bookingDraft.treatment = "肉毒";
  bookingAfterInfo.lastIntent = "branch_hours:高雄館";
  bookingAfterInfo.lastSeenAt = NOW.toISOString();
  bookingAfterInfo.treatmentConsultation = {
    concernKeys: ["jawline_looseness"],
    primaryConcernKey: "jawline_looseness",
    stage: "priority_selected",
    treatmentKey: "onda_pro",
  };
  bookingAfterInfo.activeFocus = {
    answeredTopics: [],
    areaKeys: [],
    bookingExplicit: true,
    concernKeys: [],
    goal: "manage_booking",
  };
  const focusOwnedPrice = await route("這個多少錢", bookingAfterInfo);
  assert(focusOwnedPrice.matchedKey === "肉毒除皺", "CF11: canonical manage-booking focus must own price even after lastIntent changes");
  assert(!focusOwnedPrice.replyText.includes("12,999"), "CF11: stale consultation must not override canonical manage-booking focus");
  console.log("PASS: CF11 active booking management owns ambiguous price and stays isolated from consultation");
}

async function validateInitialBookingGoal() {
  const { decisions } = await runTurns(
    ["我想預約肉毒", "高雄館"],
    "conversation-flow-cf12",
  );
  assert(decisions[0].nextContext.activeFocus?.goal === "book_consultation", "CF12: a new booking must begin as book_consultation");
  assert(decisions[1].nextContext.activeFocus?.goal === "book_consultation", "CF12: collecting fields for a new booking must not be mislabeled manage_booking");
  console.log("PASS: CF12 initial booking collection preserves book-consultation goal");
}

async function main() {
  await validateConcernAccumulation();
  await validateBookingEscape();
  await validatePromotionBrowsing();
  await validateExplicitTreatmentPrice();
  await validateSafetyPrecedence();
  await validateConsultationExpiry();
  validateRecentTurnsAndPrompt();
  await validateWebhookPersistsVisibleTurn();
  await validateCorrectionReplacesFocus();
  await validateQuestionsDoNotReplaceFocus();
  await validateBookingOwnsAmbiguousPrice();
  await validateInitialBookingGoal();
  console.log("conversation flow validation passed (12 scenarios)");
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
