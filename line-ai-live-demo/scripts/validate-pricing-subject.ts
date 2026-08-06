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

function assertOndaPrice(decision: RouterDecision, scenario: string) {
  assert(decision.decisionType === "pricing_auto_reply", `${scenario}: price questions must use the controlled pricing route`);
  assert(decision.matchedKey === "ONDA PRO", `${scenario}: ONDA must remain the pricing subject`);
  assert(decision.replyText.includes("16,888"), `${scenario}: ONDA must return its approved amount`);
  const replyPayload = JSON.stringify(decision.replyMessages ?? []);
  assert(!/VIO|皮秒|除毛/.test(replyPayload), `${scenario}: ONDA price must not attach unrelated treatment cards`);
}

async function getActiveOndaConsultation(userId: string) {
  return runTurns(["想了解ONDA", "雙下巴"], userId);
}

async function main() {
  const ondaExperience = await getActiveOndaConsultation("pricing-subject-ps1");
  const ps1 = await route("體驗價", ondaExperience.context);
  assertOndaPrice(ps1, "PS1");
  console.log("PASS: PS1 active ONDA consultation resolves 體驗價 to ONDA only");

  const ondaHowMuch = await getActiveOndaConsultation("pricing-subject-ps2");
  const ps2 = await route("多少錢", ondaHowMuch.context);
  assertOndaPrice(ps2, "PS2");
  console.log("PASS: PS2 active ONDA consultation resolves 多少錢 to ONDA only");

  const ps3 = await route("現在活動有哪些", createEmptyConversationContext("pricing-subject-ps3"));
  assert(ps3.matchedKey === "promotion_overview", "PS3: an explicit browse request must retain the promotion overview");
  console.log("PASS: PS3 empty context explicit browse request shows overview");

  const botoxThenBrowse = await runTurns(["想了解肉毒", "現在活動有哪些"], "pricing-subject-ps4");
  assert(botoxThenBrowse.decisions[1].matchedKey === "promotion_overview", "PS4: browse intent must override prior treatment context");
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
  console.log("PASS: PS7 explicitly named treatment overrides active consultation");

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
  const staleContext: ConversationContext = {
    ...staleOnda.context,
    lastSeenAt: new Date(NOW.getTime() - 21 * 60 * 1000).toISOString(),
  };
  const ps11 = await route("多少錢", staleContext);
  assert(ps11.matchedKey === "pricing_followup", "PS11: expired consultation context must not answer a generic price question");
  console.log("PASS: PS11 stale treatment context expires before generic price handling");

  console.log("pricing subject validation passed (11 scenarios)");
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
