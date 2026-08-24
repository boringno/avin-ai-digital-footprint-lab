import { normalizeClinicText } from "@/lib/clinic-config";

import type { ConversationV2State } from "./types";

export const CONVERSATION_EPISODE_IDLE_MS = 30 * 60 * 1000;

const EXPLICIT_RESTART_PATTERN =
  /(?:重新|從頭).{0,6}(?:了解|介紹|認識|說明|問問|諮詢)|再(?:幫我|請)?(?:介紹|說明)(?:一次)?/u;
const NEGATED_RESTART_PATTERN =
  /(?:不要|不用|不必|不想|別|無需).{0,8}(?:重新|從頭|再)/u;

/**
 * A customer-authored request to hear a treatment overview again.
 *
 * This is deliberately separate from ordinary "想了解" wording: a restart
 * overrides anti-repeat progress immediately, while an ordinary repeated
 * overview may still be a continuation inside the same episode.
 */
export function isExplicitTreatmentOverviewRestart(text: string) {
  const normalized = normalizeClinicText(text);
  return EXPLICIT_RESTART_PATTERN.test(normalized) &&
    !NEGATED_RESTART_PATTERN.test(normalized);
}

/** The inactivity boundary is measured from the last committed turn, not task start. */
export function hasConversationEpisodeExpired(
  state: ConversationV2State,
  receivedAt: string,
) {
  return hasTimestampEpisodeExpired(state.updatedAt, receivedAt);
}

/** Applies the same boundary before V2 receives legacy recent-turn text. */
export function hasConversationContextEpisodeExpired(
  lastSeenAt: string | undefined,
  receivedAt: string,
) {
  if (!lastSeenAt) return false;
  return hasTimestampEpisodeExpired(lastSeenAt, receivedAt);
}

function hasTimestampEpisodeExpired(previousValue: string, currentValue: string) {
  const previousAt = Date.parse(previousValue);
  const currentAt = Date.parse(currentValue);
  return Number.isFinite(previousAt) &&
    Number.isFinite(currentAt) &&
    currentAt >= previousAt + CONVERSATION_EPISODE_IDLE_MS;
}
