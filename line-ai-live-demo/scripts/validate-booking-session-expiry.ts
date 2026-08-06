import { createEmptyConversationContext } from "../src/lib/conversation-context";
import { routeCustomerMessage } from "../src/lib/router";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function createBookedContext(appointmentAt: string) {
  const context = createEmptyConversationContext("booking-session-expiry-test");
  context.bookingDraft = {
    appointmentAt,
    branch: "高雄館",
    isFirstVisit: "yes",
    name: "王小美",
    phone: "0912345678",
    timeSlots: ["8/10 15:00"],
    treatment: "肉毒、ONDA PRO",
  };
  context.lastIntent = "booking_intake";
  context.lastReferencedBranch = "高雄館";
  context.lastReferencedTreatment = "ONDA PRO";
  context.locationPreference = "高雄";
  context.preferredBranch = "高雄館";
  context.treatmentConsultation = {
    concernKeys: ["jawline_looseness"],
    stage: "priority_selected",
    treatmentKey: "onda_pro",
  };
  return context;
}

async function route(message: string, context: ReturnType<typeof createBookedContext>, now: string) {
  return routeCustomerMessage({
    conversationContext: context,
    includePending: false,
    message,
    now: new Date(now),
  });
}

async function main() {
  const appointmentAt = "2026-08-10T07:00:00.000Z";

  const beforeAppointment = await route("我想預約", createBookedContext(appointmentAt), "2026-08-10T06:59:59.000Z");
  assert(beforeAppointment.nextContext.bookingDraft.treatment === "肉毒、ONDA PRO", "T1: a future appointment must keep the current booking session");
  assert(beforeAppointment.nextContext.bookingDraft.phone === "0912345678", "T1: a future appointment must retain the existing contact draft");

  const afterAppointment = await route("我想預約", createBookedContext(appointmentAt), "2026-08-10T07:00:01.000Z");
  assert(!afterAppointment.nextContext.bookingDraft.appointmentAt, "T2: an expired appointment must clear its session marker");
  assert(!afterAppointment.nextContext.bookingDraft.treatment, "T2: an expired appointment must not carry previous treatments into a new booking");
  assert(!afterAppointment.nextContext.bookingDraft.branch, "T2: an expired appointment must not carry the previous branch into a new booking");
  assert(!afterAppointment.nextContext.bookingDraft.phone, "T2: an expired appointment must not carry personal contact details into a new booking");
  assert(afterAppointment.nextContext.lastIntent === "booking_intake", "T2: a new appointment request must begin a fresh booking intake");
  assert(!afterAppointment.nextContext.treatmentConsultation, "T2: an expired appointment must not preserve the prior consultation flow");

  const invalidDate = await route("我想預約", createBookedContext("not-a-date"), "2026-08-11T07:00:00.000Z");
  assert(invalidDate.nextContext.bookingDraft.treatment === "肉毒、ONDA PRO", "T3: an invalid confirmed time must not erase a booking draft");

  console.log("booking session expiry validation passed (9 checks)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
