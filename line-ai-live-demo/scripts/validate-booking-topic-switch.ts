import { createEmptyConversationContext, type ConversationContext } from "../src/lib/conversation-context";
import { routeCustomerMessage } from "../src/lib/router";

const NOW = new Date("2026-08-06T08:00:00.000Z");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function createActiveBookingContext(): ConversationContext {
  return {
    ...createEmptyConversationContext("booking-topic-switch"),
    bookingDraft: {
      branch: "高雄館",
      isFirstVisit: "yes",
      name: "測試客人",
      phone: "0912345678",
      timeSlots: ["下週二 15:00", "下週三 19:30", "下週五 14:00"],
      treatment: "肉毒",
    },
    lastIntent: "booking_intake",
    lastReferencedTreatment: "肉毒",
  };
}

async function route(message: string, conversationContext: ConversationContext) {
  return routeCustomerMessage({
    conversationContext,
    includePending: false,
    message,
    now: NOW,
  });
}

async function main() {
  const activeBooking = createActiveBookingContext();

  const newTreatment = await route("你好，我想了解 ONDA", activeBooking);
  assert(newTreatment.decisionType === "treatment_intro_reply", "T1: a clear new treatment inquiry must not repeat the booking summary");
  assert(newTreatment.matchedKey === "treatment_intro:onda_pro", "T1: a clear ONDA inquiry must use the ONDA introduction");
  assert(newTreatment.nextContext.lastIntent === "treatment_intro:onda_pro", "T1: the new consultation must own the current conversation intent");
  assert(newTreatment.nextContext.bookingDraft.treatment === "肉毒", "T1: a new consultation must preserve the existing booking treatment");
  assert(!newTreatment.replyText.includes("預約需求"), "T1: a clear new treatment inquiry must not show an old booking summary");

  const newConcern = await route("我想改善雙下巴", activeBooking);
  assert(newConcern.decisionType === "treatment_intro_reply", "T2: a new concern must not be treated as booking data");
  assert(newConcern.matchedKey === "treatment_consult:onda_pro", "T2: a double-chin concern must enter the ONDA consultation path");
  assert(newConcern.nextContext.lastIntent === "treatment_consult:onda_pro", "T2: a new concern must replace the stale booking intent");
  assert(newConcern.nextContext.bookingDraft.treatment === "肉毒", "T2: a new concern must not overwrite the existing booking");

  const bookingNeedsTreatment = createActiveBookingContext();
  bookingNeedsTreatment.bookingDraft.treatment = undefined;
  const bookingContinuation = await route("肉毒", bookingNeedsTreatment);
  assert(bookingContinuation.matchedKey === "booking_intake", "T3: a bare treatment name can still fill a missing booking field");
  assert(bookingContinuation.nextContext.bookingDraft.treatment === "肉毒", "T3: booking intake must still collect the stated treatment");

  const explicitBooking = await route("我想預約 ONDA", activeBooking);
  assert(explicitBooking.matchedKey === "booking_intake", "T4: an explicit appointment request must remain in the booking flow");
  assert(explicitBooking.nextContext.bookingDraft.treatment?.includes("ONDA PRO"), "T4: an explicit appointment request may add its treatment to the booking request");

  console.log("booking topic switch validation passed (12 checks)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
