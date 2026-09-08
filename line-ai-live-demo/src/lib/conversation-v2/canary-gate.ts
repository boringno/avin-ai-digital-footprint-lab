export type ConversationV2RuntimeMode = "canary" | "demo_all" | "production_all" | "off" | "shadow";
export type LineChannelStage = "demo" | "production" | "unconfigured";

/** Invalid authorization is a configuration error, never ordinary V1 eligibility. */
export function assertConversationV2AudienceStage(mode: ConversationV2RuntimeMode, stage: LineChannelStage = "unconfigured") {
  if (!["canary", "demo_all", "production_all", "off", "shadow"].includes(mode)) {
    throw new Error("Unsupported CONVERSATION_V2_MODE");
  }
  if (!["demo", "production", "unconfigured"].includes(stage)) {
    throw new Error("Unsupported LINE_CHANNEL_STAGE");
  }
  if (mode === "demo_all" && stage !== "demo") {
    throw new Error("CONVERSATION_V2_MODE=demo_all requires LINE_CHANNEL_STAGE=demo");
  }
  if (mode === "production_all" && stage !== "production") {
    throw new Error("CONVERSATION_V2_MODE=production_all requires LINE_CHANNEL_STAGE=production");
  }
}

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
  lineChannelStage?: LineChannelStage;
  sourceType: string;
  userId: string;
}): ConversationV2CanaryGate {
  assertConversationV2AudienceStage(input.mode, input.lineChannelStage);
  if (input.mode !== "canary" && input.mode !== "demo_all" && input.mode !== "production_all") {
    return { eligible: false, reason: "mode_not_canary" };
  }
  if (input.sourceType !== "user") {
    return { eligible: false, reason: "non_direct_source" };
  }
  if (!input.userId) {
    return { eligible: false, reason: "missing_user" };
  }
  if (input.mode === "canary" && !input.allowlistedUserIds.has(input.userId)) {
    return { eligible: false, reason: "not_allowlisted" };
  }
  return { eligible: true, reason: "eligible" };
}
