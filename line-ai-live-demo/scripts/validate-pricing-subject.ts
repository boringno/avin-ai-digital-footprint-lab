import { createEmptyConversationContext, type ConversationContext } from "../src/lib/conversation-context";
import { routeCustomerMessage, type RouterDecision } from "../src/lib/router";

const NOW = new Date("2026-08-06T06:00:00.000Z");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function route(message: string, conversationContext: ConversationContext, now = NOW): Promise<RouterDecision> {
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

function assertOndaFaceComboPrice(decision: RouterDecision, scenario: string) {
  assert(decision.decisionType === "pricing_auto_reply", `${scenario}: price questions must use the controlled pricing route`);
  assert(decision.matchedKey === "臉部輪廓組合", `${scenario}: the selected ONDA face combo must remain the pricing subject`);
  assert(decision.replyText.includes("12,999元"), `${scenario}: the selected face combo must return its approved amount`);
  const replyPayload = JSON.stringify(decision.replyMessages ?? []);
  assert(!/VIO|皮秒|除毛/.test(replyPayload), `${scenario}: ONDA price must not attach unrelated treatment cards`);
  assertNoCustomerVisibleCampaignDate(decision, scenario);
}

const CUSTOMER_VISIBLE_CAMPAIGN_DATE = /(?:19|20)\d{2}(?:[/.年-]\d{1,2})?|\d{1,2}[/.月]\d{1,2}日?/u;

function collectCustomerVisibleText(value: unknown, key = ""): string[] {
  if (typeof value === "string") {
    return ["text", "title", "subtitle", "priceText", "altText"].includes(key) ? [value] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectCustomerVisibleText(item, key));
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.entries(value).flatMap(([childKey, childValue]) => collectCustomerVisibleText(childValue, childKey));
}

function assertNoCustomerVisibleCampaignDate(decision: RouterDecision, scenario: string) {
  const visibleText = [decision.replyText, ...collectCustomerVisibleText(decision.replyMessages ?? [])].join("\n");
  assert(
    !CUSTOMER_VISIBLE_CAMPAIGN_DATE.test(visibleText),
    `${scenario}: campaign dates are internal metadata and must not appear in customer-visible text: ${visibleText}`,
  );
}

async function getActiveOndaConsultation(userId: string) {
  return runTurns(["想了解ONDA", "雙下巴"], userId);
}

async function main() {
  const ondaExperience = await getActiveOndaConsultation("pricing-subject-ps1");
  const ps1 = await route("體驗價", ondaExperience.context);
  assertOndaFaceComboPrice(ps1, "PS1");
  console.log("PASS: PS1 active ONDA face consultation resolves 體驗價 to its combo only");

  const ondaHowMuch = await getActiveOndaConsultation("pricing-subject-ps2");
  const ps2 = await route("多少錢", ondaHowMuch.context);
  assertOndaFaceComboPrice(ps2, "PS2");
  console.log("PASS: PS2 active ONDA face consultation resolves 多少錢 to its combo only");

  const ps3 = await route("現在活動有哪些", createEmptyConversationContext("pricing-subject-ps3"));
  assert(ps3.matchedKey === "promotion_overview", "PS3: an explicit browse request must retain the promotion overview");
  assertNoCustomerVisibleCampaignDate(ps3, "PS3");
  console.log("PASS: PS3 empty context explicit browse request shows overview");

  const botoxThenBrowse = await runTurns(["想了解肉毒", "現在活動有哪些"], "pricing-subject-ps4");
  assert(botoxThenBrowse.decisions[1].matchedKey === "promotion_overview", "PS4: browse intent must override prior treatment context");
  assertNoCustomerVisibleCampaignDate(botoxThenBrowse.decisions[1], "PS4");
  console.log("PASS: PS4 explicit browse request is not polluted by prior treatment");

  const ps5 = await route("多少錢", createEmptyConversationContext("pricing-subject-ps5"));
  assert(ps5.matchedKey === "pricing_followup", "PS5: an empty-context price question must request a treatment subject");
  assert((ps5.replyMessages?.length ?? 0) === 0, "PS5: an empty-context price question must not attach any campaign card");
  console.log("PASS: PS5 empty context 多少錢 asks for the treatment without cards");

  const ps6 = await route("體驗價", createEmptyConversationContext("pricing-subject-ps6"));
  assert(ps6.matchedKey === "pricing_followup", "PS6: an empty-context 體驗價 question must request a treatment subject");
  assert((ps6.replyMessages?.length ?? 0) === 0, "PS6: an empty-context 體驗價 question must not attach any campaign card");
  console.log("PASS: PS6 empty context 體驗價 asks for the treatment without cards");

  const ondaThenBotox = await getActiveOndaConsultation("pricing-subject-ps7");
  const ps7 = await route("肉毒多少錢", ondaThenBotox.context);
  assert(ps7.matchedKey.includes("肉毒"), "PS7: an explicit treatment must override an active consultation subject");
  assert(!ps7.replyText.includes("16,888"), "PS7: an explicit Botox price request must not return ONDA pricing");
  assertNoCustomerVisibleCampaignDate(ps7, "PS7");
  console.log("PASS: PS7 explicitly named treatment overrides active consultation");

  const ondaThenHours = await getActiveOndaConsultation("pricing-subject-ps9");
  const ps9Hours = await route("高雄館營業時間", ondaThenHours.context);
  assert(ps9Hours.matchedKey.startsWith("branch_hours:"), "PS9: an intervening clinic-info question must replace the latest intent");
  const ps9 = await route("多少錢", ps9Hours.nextContext);
  assertOndaFaceComboPrice(ps9, "PS9");
  assertNoCustomerVisibleCampaignDate(ps9, "PS9");
  console.log("PASS: PS9 active consultation survives an intervening clinic-info question for pricing");

  const booking = await runTurns(["我想預約皮秒"], "pricing-subject-ps8-booking");
  const ps8a = await route("多少錢", booking.context);
  assert(ps8a.matchedKey.includes("皮秒"), "PS8a: an active booking flow may retain its booking treatment as the price subject");

  const bookingThenHours = await runTurns(["我想預約皮秒", "營業時間"], "pricing-subject-ps8-after-hours");
  const ps8b = await route("多少錢", bookingThenHours.context);
  assert(ps8b.matchedKey === "pricing_followup", "PS8b: after leaving booking mode, an old draft must not answer a generic price question");
  console.log("PASS: PS8 booking treatment only applies while booking mode remains active");

  const ps10a = await route("有什麼優惠", createEmptyConversationContext("pricing-subject-ps10-browse"));
  assert(ps10a.matchedKey === "promotion_overview", "PS10a: enumerative promotion wording must browse approved campaigns");
  const ps10b = await route("有優惠嗎", createEmptyConversationContext("pricing-subject-ps10-clarify"));
  assert(ps10b.matchedKey === "pricing_followup", "PS10b: non-enumerative promotion wording must ask for the treatment subject");
  console.log("PASS: PS10 browse and clarify promotion wording remain intentionally distinct");

  const staleOnda = await getActiveOndaConsultation("pricing-subject-ps11");
  const expiredConsultationActiveBooking: ConversationContext = {
    ...staleOnda.context,
    lastSeenAt: new Date(NOW.getTime() - 21 * 60 * 1000).toISOString(),
  };
  const ps11a = await route("多少錢", expiredConsultationActiveBooking);
  assertOndaFaceComboPrice(ps11a, "PS11a");
  console.log("PASS: PS11a active booking preserves its quoted combo after consultation context expires");

  const staleContext: ConversationContext = {
    ...staleOnda.context,
    bookingSession: staleOnda.context.bookingSession
      ? {
          ...staleOnda.context.bookingSession,
          lastActiveAt: new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString(),
        }
      : undefined,
    lastSeenAt: new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString(),
  };
  const ps11 = await route("多少錢", staleContext);
  assert(ps11.matchedKey === "pricing_followup", "PS11: expired consultation context must not answer a generic price question");
  console.log("PASS: PS11 stale treatment and booking context expire before generic price handling");

  const ps12 = await runTurns(["我想了解肉毒", "1", "皺眉紋", "皺眉紋"], "pricing-subject-ps12");
  assert(ps12.decisions[2].replyText.includes("盛夏光采：999"), "PS12: Botox wrinkle flow must keep the campaign label and price");
  assertNoCustomerVisibleCampaignDate(ps12.decisions[2], "PS12 initial quote");
  assertNoCustomerVisibleCampaignDate(ps12.decisions[3], "PS12 repeated detail");

  const legacyCampaignContext = ps12.context;
  legacyCampaignContext.bookingDraft.campaignName = "2026/07/09-08/31 盛夏光采";
  const ps13 = await route("我想改約", legacyCampaignContext);
  assert(ps13.replyText.includes("方案先記為 盛夏光采"), "PS13: legacy booking context must retain the campaign name without its dates");
  assertNoCustomerVisibleCampaignDate(ps13, "PS13 legacy booking context");
  console.log("PASS: PS12-PS13 campaign dates stay internal across consultation and legacy booking context");

  console.log("pricing subject validation passed (14 scenarios)");
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
