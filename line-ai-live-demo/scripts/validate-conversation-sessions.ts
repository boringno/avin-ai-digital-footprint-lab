import { createEmptyConversationContext, type ConversationContext } from "../src/lib/conversation-context";
import { routeCustomerMessage, type RouterDecision } from "../src/lib/router";

const NOW = new Date("2026-08-06T06:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function route(message: string, conversationContext: ConversationContext, now = NOW): Promise<RouterDecision> {
  return routeCustomerMessage({ conversationContext, includePending: false, message, now });
}

function bookingContext(lastActiveAt: Date) {
  const context = createEmptyConversationContext("conversation-session-booking");
  context.bookingDraft.treatment = "探索皮秒";
  context.lastIntent = "booking_intake";
  context.lastSeenAt = lastActiveAt.toISOString();
  context.bookingSession = { lastActiveAt: lastActiveAt.toISOString(), status: "collecting" };
  return context;
}

async function validateActiveBookingPriceSubject() {
  const decision = await route("多少錢", bookingContext(new Date(NOW.getTime() - 2 * HOUR)));

  assert(decision.matchedKey === "皮秒雷射+日式光纖", "CS1: an active booking must keep its treatment price subject");
  assert(decision.replyText.includes("2499"), "CS1: active booking must return the approved PICO price");
  console.log("PASS: CS1 active booking retains its subject");
}

async function validateStaleBookingIsCleared() {
  const decision = await route("多少錢", bookingContext(new Date(NOW.getTime() - 25 * HOUR)));

  assert(decision.matchedKey === "pricing_followup", "CS2: an abandoned booking must not answer with its old treatment price");
  assert(!decision.nextContext.bookingDraft.treatment, "CS2: an abandoned booking draft must be cleared");
  assert(decision.nextContext.bookingSession?.status === "stale", "CS2: the stale session must be recorded explicitly");
  console.log("PASS: CS2 abandoned booking cannot leak into a new price question");
}

async function validatePastAppointmentStartsFresh() {
  const context = bookingContext(new Date(NOW.getTime() - 2 * HOUR));
  context.bookingDraft.appointmentAt = new Date(NOW.getTime() - HOUR).toISOString();

  const decision = await route("我想了解ONDA", context);
  assert(decision.matchedKey === "treatment_intro:onda_pro", "CS3: a post-appointment enquiry must start a fresh treatment topic");
  assert(
    !decision.nextContext.bookingDraft.treatment,
    "CS3: past appointment data must be cleared and a new consultation must not populate booking",
  );
  assert(!decision.nextContext.bookingSession, "CS3: completed appointment must not leave an active booking session");
  console.log("PASS: CS3 past appointment starts a fresh conversation episode");
}

async function validateBookingSessionRefresh() {
  const context = bookingContext(new Date(NOW.getTime() - 2 * HOUR));
  const decision = await route("高雄館", context);

  assert(decision.matchedKey === "booking_intake", "CS4: booking detail must remain in the booking flow");
  assert(decision.nextContext.bookingSession?.status === "collecting", "CS4: a booking reply must keep collecting status");
  assert(decision.nextContext.bookingSession?.lastActiveAt === NOW.toISOString(), "CS4: booking activity timestamp must refresh");
  console.log("PASS: CS4 booking progress refreshes the episode timestamp");
}

async function main() {
  await validateActiveBookingPriceSubject();
  await validateStaleBookingIsCleared();
  await validatePastAppointmentStartsFresh();
  await validateBookingSessionRefresh();
  console.log("conversation session validation passed (4 scenarios)");
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
