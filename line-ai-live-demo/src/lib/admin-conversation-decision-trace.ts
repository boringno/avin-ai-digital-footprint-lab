export type ConversationDecisionTrace = {
  responseObligation?: {
    originalRouteVersion: string | null;
    originalDecisionType: string | null;
    originalMatchedKey: string | null;
    originalPolicyAction: string | null;
    kinds: string[];
    handoffSuppression: string | null;
    finalIntegrity: string | null;
    payloadSource: string | null;
  } | null;
  approvedReplyAssetId: string | null;
  decisionType: string | null;
  fallbackReason: string | null;
  guardReplacedText: boolean | null;
  matchedKey: string | null;
  nluConfidence: number | null;
  nluStatus: string | null;
  policyAction: string | null;
  replyDeliveryAttempts: number | null;
  replyDeliveryStatus: string | null;
  replyDeliverySuppressedReason: string | null;
  rendererMode: string | null;
  replyTextSource: string | null;
  responseContractCompletedAspects: string[] | null;
  responseContractCoverageBasis: string | null;
  responseContractCoverageStatus: string | null;
  responseContractCtaPolicy: string | null;
  responseContractMissingAspects: string[] | null;
  responseContractMode: string | null;
  responseContractMustAnswer: string[] | null;
  responseContractMustNotRepeat: string[] | null;
  responseContractNextStepKind: string | null;
  responseContractSubjectKeys: string[] | null;
  routeVersion: string | null;
  toolRequestType: string | null;
};

export function getConversationDecisionTrace(payload: unknown): ConversationDecisionTrace | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const trace = {
    responseObligation: readResponseObligation(record.response_obligation),
    approvedReplyAssetId: readString(record.conversation_v2_approved_reply_asset_id),
    decisionType: readString(record.decision_type),
    fallbackReason: readString(record.renderer_fallback_reason),
    guardReplacedText: readBoolean(record.renderer_guard_replaced_text),
    matchedKey: readString(record.matched_key),
    nluConfidence: readNumber(record.conversation_v2_nlu_confidence),
    nluStatus: readString(record.conversation_v2_nlu_status),
    policyAction: readString(record.conversation_v2_policy_action),
    replyDeliveryAttempts: readNumber(record.reply_delivery_attempts),
    replyDeliveryStatus: readString(record.reply_delivery_status),
    replyDeliverySuppressedReason: readString(record.reply_delivery_suppressed_reason),
    rendererMode: readString(record.renderer_mode),
    replyTextSource: readString(record.renderer_reply_text_source),
    responseContractCompletedAspects: readStringArray(record.response_contract_completed_aspects),
    responseContractCoverageBasis: readString(record.response_contract_coverage_basis),
    responseContractCoverageStatus: readString(record.response_contract_coverage_status),
    responseContractCtaPolicy: readString(record.response_contract_cta_policy),
    responseContractMissingAspects: readStringArray(record.response_contract_missing_aspects),
    responseContractMode: readString(record.response_contract_mode),
    responseContractMustAnswer: readStringArray(record.response_contract_must_answer),
    responseContractMustNotRepeat: readStringArray(record.response_contract_must_not_repeat),
    responseContractNextStepKind: readString(record.response_contract_next_step_kind),
    responseContractSubjectKeys: readStringArray(record.response_contract_subject_keys),
    routeVersion: readString(record.route_version),
    toolRequestType: readString(record.conversation_v2_tool_request_type),
  } satisfies ConversationDecisionTrace;

  return Object.values(trace).some((value) => value !== null) ? trace : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readResponseObligation(value: unknown) {
  if (!isRecord(value)) return null;
  return {
    originalRouteVersion: readString(value.originalRouteVersion),
    originalDecisionType: readString(value.originalDecisionType),
    originalMatchedKey: readString(value.originalMatchedKey),
    originalPolicyAction: readString(value.originalPolicyAction),
    kinds: Array.isArray(value.obligations) ? value.obligations.flatMap((item: unknown) =>
      isRecord(item) && typeof item.kind === "string" ? [item.kind] : []) : [],
    handoffSuppression: readString(value.handoffSuppression),
    finalIntegrity: readString(value.finalIntegrity),
    payloadSource: readString(value.payloadSource),
  };
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim())) {
    return null;
  }
  return value.map((item) => item.trim());
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
