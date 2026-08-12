import type { BookingDraft, ConversationContext } from "@/lib/conversation-context";
import type { BookingTreatmentAction } from "@/lib/conversation-behavior";

function createEmptyBookingDraft(): BookingDraft {
  return { requestedTimeSlots: [], timeSlots: [] };
}

export function addBookingTreatment(existingTreatment: string | undefined, nextTreatment: string) {
  const items = (existingTreatment ?? "")
    .split(/[、,，]/u)
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set([...items, nextTreatment])).join("、");
}

export function setBookingTreatment(
  context: ConversationContext,
  treatmentName: string,
  action: BookingTreatmentAction,
) {
  context.bookingDraft.treatment = action === "replace"
    ? treatmentName
    : addBookingTreatment(context.bookingDraft.treatment, treatmentName);
}

export function rememberBookingContact(
  context: ConversationContext,
  contact: { name?: string; phone?: string },
) {
  if (contact.name) {
    context.bookingDraft.name = contact.name;
  }
  if (contact.phone) {
    context.bookingDraft.phone = contact.phone;
  }
  if (contact.name || contact.phone) {
    context.customerProfile = { ...context.customerProfile, ...contact };
  }
}

export function beginReplacementBookingDraft(context: ConversationContext) {
  rememberBookingContact(context, {
    name: context.bookingDraft.name,
    phone: context.bookingDraft.phone,
  });
  context.bookingDraft = createEmptyBookingDraft();
}

export function markBookingSession(
  context: ConversationContext,
  now: Date,
  status: "collecting" | "stale",
  action: BookingTreatmentAction = context.bookingSession?.action ?? "use_current",
) {
  context.bookingSession = {
    action,
    lastActiveAt: now.toISOString(),
    status,
  };
}
