import { createEmptyConversationContext, type ConversationContext } from "../src/lib/conversation-context";
import { routeCustomerMessage, type RouterDecision } from "../src/lib/router";

const NOW = new Date("2026-08-12T07:29:00.000Z");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function route(message: string, context: ConversationContext) {
  return routeCustomerMessage({ conversationContext: context, includePending: false, message, now: NOW });
}

async function runTurns(messages: string[], context = createEmptyConversationContext("customer-journey")) {
  const decisions: RouterDecision[] = [];
  for (const message of messages) {
    const decision = await route(message, context);
    decisions.push(decision);
    context = decision.nextContext;
  }
  return { context, decisions };
}

function oldBookingContext() {
  const context = createEmptyConversationContext("old-booking");
  context.bookingDraft = {
    branch: "高雄館",
    campaignId: "promo-2026-08-05-onda-pro",
    campaignName: "盛夏光采",
    isFirstVisit: "yes",
    name: "阿溫",
    phone: "0945621565",
    timeSlots: ["8月18號下午"],
    treatment: "ONDA PRO",
  };
  context.lastIntent = "booking_intake";
  context.lastReferencedTreatment = "ONDA PRO";
  context.treatmentConsultation = {
    answeredAspectKeys: ["concern:jawline_looseness:overview"],
    concernKeys: ["jawline_looseness"],
    primaryConcernKey: "jawline_looseness",
    stage: "priority_selected",
    treatmentKey: "onda_pro",
  };
  return context;
}

async function validateSingleTreatmentPreferenceFamily() {
  const variants = [
    "我只想做 ONDA",
    "我單獨做 ONDA 就好",
    "可以先做 ONDA 嗎",
    "我不要搭肉毒",
    "先不考慮一起做",
  ];

  for (const [index, variant] of variants.entries()) {
    const { decisions } = await runTurns(["想了解 ONDA", "雙下巴", variant]);
    const reply = decisions[2];
    assert(reply.matchedKey.includes(":behavior:"), `CJ1-${index + 1}: preference must use behavior routing`);
    assert(reply.replyText.includes("ONDA PRO") && !/(?:肉毒|咀嚼肌)/u.test(reply.replyText), `CJ1-${index + 1}: reply must honor the ONDA-only preference without re-pushing Botox`);
    assert(!reply.replyText.includes("目前醫美界非常熱門"), `CJ1-${index + 1}: reply must not replay the ONDA intro`);
  }
}

async function validateCombinationQuestionSurvivesBookingState() {
  const { decisions } = await runTurns(
    ["想了解 ONDA", "雙下巴", "我想預約肉毒", "ONDA 為什麼要搭配肉毒", "一定要一起做嗎"],
    oldBookingContext(),
  );
  const reply = decisions[3];
  assert(reply.matchedKey.includes(":behavior:combination_comparison"), "CJ2: comparison must survive booking state");
  assert(reply.replyText.includes("局部脂肪") && reply.replyText.includes("咀嚼肌"), "CJ2: comparison must explain roles");
  assert(!reply.replyText.includes("目前醫美界非常熱門"), "CJ2: comparison must not replay the first treatment intro");
  assert(decisions[4].replyText !== reply.replyText, "CJ2: repeated comparison behavior must advance instead of repeating verbatim");
  assert(!decisions[4].replyText.includes("目前醫美界非常熱門"), "CJ2: repeated comparison must not restart the intro");
}

async function validateExplicitNewBookingOwnsItsDraft() {
  const decision = await route("我想預約肉毒", oldBookingContext());
  assert(decision.matchedKey === "booking_intake", "CJ3: explicit appointment must start booking intake");
  assert(decision.nextContext.bookingDraft.treatment === "肉毒", "CJ3: explicit treatment must replace the old treatment");
  assert(!decision.nextContext.bookingDraft.branch, "CJ3: a new booking must not inherit the old branch");
  assert(!decision.nextContext.bookingDraft.campaignId, "CJ3: a new booking must not inherit the old campaign");
  assert(decision.nextContext.bookingDraft.timeSlots.length === 0, "CJ3: a new booking must not inherit old times");
  assert(!decision.nextContext.bookingDraft.name && !decision.nextContext.bookingDraft.phone, "CJ3: a new draft must not silently reuse contact data");
  assert(decision.nextContext.customerProfile?.name === "阿溫", "CJ3: known customer identity may remain separate from the draft");
  assert(decision.nextContext.bookingSession?.action === "replace", "CJ3: downstream stores must know this booking replaces the active lead draft");

  const branch = await route("高雄館", decision.nextContext);
  assert(branch.nextContext.bookingDraft.treatment === "肉毒", "CJ3: booking follow-up must not re-add the previous ONDA consultation");
  assert(branch.nextContext.bookingDraft.branch === "高雄館", "CJ3: booking follow-up must collect the requested branch");
  assert(branch.nextContext.bookingSession?.action === "replace", "CJ3: replacement ownership must survive booking follow-ups");
}

async function validateExplicitAdditionKeepsBothTreatments() {
  const context = oldBookingContext();
  const decision = await route("我也想加做肉毒", context);
  assert(decision.nextContext.bookingDraft.treatment === "ONDA PRO、肉毒", "CJ4: explicit addition must preserve both treatments");
  assert(decision.nextContext.bookingDraft.branch === "高雄館", "CJ4: addition must keep the current booking fields");
  assert(decision.nextContext.bookingSession?.action === "add", "CJ4: addition must be explicit downstream");
}

async function validateGenericAppointmentStartsFreshDraft() {
  const decision = await route("我想預約諮詢", oldBookingContext());
  assert(decision.nextContext.bookingDraft.treatment === "ONDA PRO", "CJ5: generic appointment may inherit only the active treatment");
  assert(!decision.nextContext.bookingDraft.branch, "CJ5: generic appointment must not inherit the old branch");
  assert(!decision.nextContext.bookingDraft.campaignId, "CJ5: generic appointment must not inherit the old campaign");
  assert(decision.nextContext.bookingDraft.timeSlots.length === 0, "CJ5: generic appointment must not inherit old times");
  assert(decision.nextContext.bookingSession?.action === "replace", "CJ5: generic appointment must start a fresh draft");
}

async function validatePricesRemainOwnedByTheirSubject() {
  const { decisions } = await runTurns(["想了解 ONDA", "雙下巴", "我想預約肉毒", "多少錢", "ONDA 的價格呢"]);
  assert(decisions[3].replyText.includes("999"), "CJ5: ambiguous price in active Botox booking must belong to Botox");
  assert(decisions[4].replyText.includes("16,888"), "CJ5: explicit ONDA price must override booking focus");
}

async function main() {
  await validateSingleTreatmentPreferenceFamily();
  await validateCombinationQuestionSurvivesBookingState();
  await validateExplicitNewBookingOwnsItsDraft();
  await validateExplicitAdditionKeepsBothTreatments();
  await validateGenericAppointmentStartsFreshDraft();
  await validatePricesRemainOwnedByTheirSubject();
  console.log("customer journey state validation passed (6 scenario families)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
