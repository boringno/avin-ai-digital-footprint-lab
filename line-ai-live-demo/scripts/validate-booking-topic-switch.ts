import { createEmptyConversationContext, type ConversationContext } from "../src/lib/conversation-context";
import { routeCustomerMessage } from "../src/lib/router";

const NOW = new Date("2026-08-10T08:00:00.000Z");

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
    lastSeenAt: NOW.toISOString(),
    bookingSession: {
      lastActiveAt: NOW.toISOString(),
      status: "collecting",
    },
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
  assert(newConcern.nextContext.lastIntent === "treatment_consult:onda_pro", "T2: understanding a concern must remain consultation, not booking");
  assert(newConcern.nextContext.bookingDraft.treatment === "肉毒", "T2: a parallel consultation must preserve but not modify the booking draft");
  assert(!newConcern.replyText.includes("12,999元"), "T2: a concern must not quote a campaign before the customer asks for price");

  const bookingNeedsTreatment = createActiveBookingContext();
  bookingNeedsTreatment.bookingDraft.treatment = undefined;
  const bookingContinuation = await route("肉毒", bookingNeedsTreatment);
  assert(bookingContinuation.matchedKey === "booking_intake", "T3: a bare treatment name can still fill a missing booking field");
  assert(bookingContinuation.nextContext.bookingDraft.treatment === "肉毒", "T3: booking intake must still collect the stated treatment");

  const explicitBooking = await route("我想預約 ONDA", activeBooking);
  assert(explicitBooking.matchedKey === "booking_intake", "T4: an explicit appointment request must remain in the booking flow");
  assert(explicitBooking.nextContext.bookingDraft.treatment?.includes("ONDA PRO"), "T4: an explicit appointment request may add its treatment to the booking request");

  const smallFace = await route("我想要肉毒瘦小臉", activeBooking);
  assert(smallFace.matchedKey === "treatment_consult:botox", "T5: a Botox small-face inquiry must escape an old booking");
  assert(smallFace.replyText.includes("肉毒小臉"), "T5: the customer must receive the approved small-face introduction");
  assert(smallFace.nextContext.lastIntent === "treatment_consult:botox", "T5: the consultation must own the current topic");
  assert(smallFace.nextContext.bookingDraft.treatment === "肉毒", "T5: the old booking draft must remain unchanged");
  assert(!smallFace.replyText.includes("預約重點") && !smallFace.replyText.includes("預約內容"), "T5: no booking summary may be repeated");

  const explicitCorrection = await route("我是想要了解 請你介紹 肉毒瘦小臉", smallFace.nextContext);
  assert(explicitCorrection.decisionType === "treatment_intro_reply", "T6: an explicit correction must stay in consultation");
  assert(explicitCorrection.nextContext.bookingDraft.name === "測試客人", "T6: '我是想要了解' must never overwrite the booking name");
  assert(explicitCorrection.nextContext.lastIntent !== "booking_intake", "T6: an information request must not reactivate booking");
  assert(!explicitCorrection.replyText.includes("預約重點") && !explicitCorrection.replyText.includes("預約內容"), "T6: the correction must not repeat the booking summary");

  const alternatives = await route("還有其他方案嗎", explicitCorrection.nextContext);
  assert(alternatives.decisionType === "treatment_intro_reply", "T7: asking for alternatives must remain a consultation");
  assert(alternatives.nextContext.lastIntent !== "booking_intake", "T7: asking for alternatives must not reactivate booking");
  assert(!alternatives.replyText.includes("預約重點") && !alternatives.replyText.includes("預約內容"), "T7: alternatives must not repeat an old booking summary");

  const bookingNeedsName = createActiveBookingContext();
  bookingNeedsName.bookingDraft.name = undefined;
  const naturalName = await route("我是王小明", bookingNeedsName);
  assert(naturalName.matchedKey === "booking_intake", "T8: a plausible self-introduction may fill the requested booking name");
  assert(naturalName.nextContext.bookingDraft.name === "王小明", "T8: a valid name must still be collected during booking");

  console.log("booking topic switch validation passed (25 checks)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
