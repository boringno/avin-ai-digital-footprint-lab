import {
  appendRecentConversationTurns,
  createEmptyConversationContext,
  type ConversationContext,
} from "../src/lib/conversation-context";
import { parsePricingQuestionKind, type PricingQuestionKind } from "../src/lib/pricing-subject";
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

async function runTurnsWithPersistedHistory(messages: string[], userId: string) {
  let context = createEmptyConversationContext(userId);
  const decisions: RouterDecision[] = [];

  for (const message of messages) {
    const decision = await route(message, context);
    decisions.push(decision);
    context = appendRecentConversationTurns(decision.nextContext, [
      { role: "user", text: message },
      { role: "assistant", text: decision.replyText },
    ]);
  }

  return { context, decisions };
}

function assertContextualOndaPrices(decision: RouterDecision, scenario: string) {
  assert(decision.decisionType === "pricing_auto_reply", `${scenario}: price questions must use the controlled pricing route`);
  assert(decision.matchedKey === "ONDA PRO", `${scenario}: a double-chin concern alone must keep ONDA as the pricing subject`);
  assert(decision.replyText.includes("16,888"), `${scenario}: standalone ONDA must return its approved amount`);
  assert(decision.replyText.includes("12,999"), `${scenario}: the approved face-contour combination must also be explained`);
  assert(decision.replyText.includes("內容不同"), `${scenario}: two approved offers must never be presented as the same treatment content`);
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
  const pricingQuestionFamilies: Record<PricingQuestionKind, string[]> = {
    regular: [
      "原價是多少",
      "正常價格呢",
      "一般價格多少",
      "不是活動價的話呢",
      "非活動價怎麼算",
      "那平常怎麼算",
      "平常的價位呢",
      "非活動期間是多少",
    ],
    post_campaign: [
      "那之後正常價格的話呢",
      "活動結束後多少錢",
      "優惠結束之後會恢復多少",
      "這個方案過期後價格呢",
      "優惠沒了呢",
    ],
    alternate: [
      "還有其他價格嗎",
      "有沒有別的方案",
      "還有別的優惠嗎",
      "另一個價位呢",
    ],
    current_offer: [
      "多少錢",
      "體驗價呢",
      "目前價格",
      "這個優惠價多少",
      "現在有活動嗎",
    ],
    browse: [
      "目前活動有哪些",
      "有什麼優惠",
      "最近有什麼活動",
    ],
  };

  for (const [expectedKind, messages] of Object.entries(pricingQuestionFamilies) as Array<[
    PricingQuestionKind,
    string[],
  ]>) {
    for (const message of messages) {
      assert(
        parsePricingQuestionKind(message) === expectedKind,
        `PK-${expectedKind}: ${message} must classify as ${expectedKind}`,
      );
    }
  }

  for (const message of ["效果差在哪", "要先預約嗎", "活動後可以運動嗎", "這個方案適合我嗎"]) {
    assert(parsePricingQuestionKind(message) === null, `PK-none: ${message} must not be treated as a price question`);
  }
  console.log("PASS: pricing question semantic families distinguish regular/post-campaign/alternate/current/browse intents");

  const ondaExperience = await getActiveOndaConsultation("pricing-subject-ps1");
  const ps1 = await route("體驗價", ondaExperience.context);
  assertContextualOndaPrices(ps1, "PS1");
  console.log("PASS: PS1 active ONDA face consultation explains standalone and combination prices");

  const ondaHowMuch = await getActiveOndaConsultation("pricing-subject-ps2");
  const ps2 = await route("多少錢", ondaHowMuch.context);
  assertContextualOndaPrices(ps2, "PS2");
  console.log("PASS: PS2 active ONDA face consultation explains standalone and combination prices");

  for (const [scenario, preference] of [
    ["PS2a", "我不要肉毒，只想做ONDA"],
    ["PS2b", "先不考慮一起做"],
  ] as const) {
    const journey = await runTurnsWithPersistedHistory(
      ["想了解ONDA", "雙下巴", "想了解ONDA+肉毒的組合", preference, "多少錢"],
      `pricing-subject-${scenario.toLowerCase()}`,
    );
    const priceReply = journey.decisions.at(-1)?.replyText ?? "";
    assert(priceReply.includes("16,888"), `${scenario}: a standalone preference must retain the approved ONDA price`);
    assert(!priceReply.includes("12,999"), `${scenario}: a declined combination must not reappear in the next price reply`);
  }
  console.log("PASS: PS2a-PS2b persisted decline and standalone preferences suppress the combination price");

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
  assertContextualOndaPrices(ps9, "PS9");
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
  const expiredConsultation: ConversationContext = {
    ...staleOnda.context,
    lastSeenAt: new Date(NOW.getTime() - 21 * 60 * 1000).toISOString(),
  };
  const ps11a = await route("多少錢", expiredConsultation);
  assert(ps11a.matchedKey === "pricing_followup", "PS11a: an expired consultation must ask which treatment the customer means");
  console.log("PASS: PS11a consultation context expires without an implicit booking fallback");

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

  const ps12 = await runTurns(["我想了解肉毒", "1", "皺眉紋", "皺眉紋", "價錢"], "pricing-subject-ps12");
  assert(!ps12.decisions[2].replyText.includes("999"), "PS12: Botox wrinkle education must not quote without a price question");
  assert(ps12.decisions[4].replyText.includes("999"), "PS12: an explicit Botox price question must return the approved campaign");
  assertNoCustomerVisibleCampaignDate(ps12.decisions[2], "PS12 initial quote");
  assertNoCustomerVisibleCampaignDate(ps12.decisions[3], "PS12 repeated detail");
  assertNoCustomerVisibleCampaignDate(ps12.decisions[4], "PS12 explicit price");

  const legacyCampaignContext = ps12.context;
  legacyCampaignContext.bookingDraft.campaignName = "2026/07/09-08/31 盛夏光采";
  const ps13 = await route("我想改約", legacyCampaignContext);
  assert(ps13.replyText.includes("方案先記為 盛夏光采"), "PS13: legacy booking context must retain the campaign name without its dates");
  assertNoCustomerVisibleCampaignDate(ps13, "PS13 legacy booking context");
  console.log("PASS: PS12-PS13 campaign dates stay internal across consultation and legacy booking context");

  console.log("pricing subject validation passed (16 scenarios)");
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
