export type ConversationDecisionTrace = {
  decisionType: string | null;
  fallbackReason: string | null;
  guardReplacedText: boolean | null;
  matchedKey: string | null;
  nluConfidence: number | null;
  nluStatus: string | null;
  policyAction: string | null;
  rendererMode: string | null;
  replyTextSource: string | null;
  routeVersion: string | null;
  toolRequestType: string | null;
};

export function getConversationDecisionTrace(payload: unknown): ConversationDecisionTrace | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const trace = {
    decisionType: readString(record.decision_type),
    fallbackReason: readString(record.renderer_fallback_reason),
    guardReplacedText: readBoolean(record.renderer_guard_replaced_text),
    matchedKey: readString(record.matched_key),
    nluConfidence: readNumber(record.conversation_v2_nlu_confidence),
    nluStatus: readString(record.conversation_v2_nlu_status),
    policyAction: readString(record.conversation_v2_policy_action),
    rendererMode: readString(record.renderer_mode),
    replyTextSource: readString(record.renderer_reply_text_source),
    routeVersion: readString(record.route_version),
    toolRequestType: readString(record.conversation_v2_tool_request_type),
  } satisfies ConversationDecisionTrace;

  return Object.values(trace).some((value) => value !== null) ? trace : null;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
