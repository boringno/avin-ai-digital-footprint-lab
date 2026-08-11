import { createEmptyConversationContext, type ConversationContext } from "../src/lib/conversation-context";
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

async function main() {
  await validateConcernAccumulation();
  await validateBookingEscape();
  await validatePromotionBrowsing();
  await validateExplicitTreatmentPrice();
  await validateSafetyPrecedence();
  await validateConsultationExpiry();
  console.log("conversation flow validation passed (6 scenarios)");
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
