import type { ConversationV2State } from "./types";

/**
 * A suspended create-booking task with the same treatment means the customer
 * has paused this consultation path.  Do not immediately repeat the booking
 * invitation; a different treatment remains eligible for its own journey.
 */
export function isConsultationInvitationPaused(
  state: ConversationV2State,
  treatmentKeys: readonly string[],
) {
  if (
    state.bookingTask.intent !== "create" ||
    state.bookingTask.status !== "suspended" ||
    treatmentKeys.length === 0
  ) {
    return false;
  }
  return treatmentKeys.every((key) => state.bookingTask.draft.treatmentKeys.includes(key));
}
