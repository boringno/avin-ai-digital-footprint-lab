export type ConversationV2RuntimeMode = "canary" | "off" | "shadow";

export type ConversationV2CanaryGate = {
  eligible: boolean;
  reason:
    | "eligible"
    | "mode_not_canary"
    | "missing_user"
    | "non_direct_source"
    | "not_allowlisted";
};

export function parseConversationV2CanaryUserIds(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(/[,;\n\r]+/u)
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

/**
 * Canary selection is intentionally account-scoped instead of message-scoped.
 * An allowlisted LINE user therefore stays on the same route for the entire
 * conversation; there is no percentage sampling that can drop middle turns.
 */
export function evaluateConversationV2CanaryGate(input: {
  allowlistedUserIds: ReadonlySet<string>;
  mode: ConversationV2RuntimeMode;
  sourceType: string;
  userId: string;
}): ConversationV2CanaryGate {
  if (input.mode !== "canary") {
    return { eligible: false, reason: "mode_not_canary" };
  }
  if (input.sourceType !== "user") {
    return { eligible: false, reason: "non_direct_source" };
  }
  if (!input.userId) {
    return { eligible: false, reason: "missing_user" };
  }
  if (!input.allowlistedUserIds.has(input.userId)) {
    return { eligible: false, reason: "not_allowlisted" };
  }
  return { eligible: true, reason: "eligible" };
}
