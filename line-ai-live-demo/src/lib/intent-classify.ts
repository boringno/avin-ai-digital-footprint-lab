export const INTENT_CLASSIFIER_VERSION = "v1";

export const INTENT_KEYS = [
  "branch_info",
  "pricing",
  "campaign",
  "treatment",
  "booking_new",
  "booking_modify",
  "booking_cancel",
  "post_treatment",
  "pregnancy_nursing",
  "complaint",
  "human_request",
  "schedule",
  "off_topic",
  "unclassified",
] as const;

export type IntentKey = (typeof INTENT_KEYS)[number];

export type IntentClassificationInput = {
  decisionType?: string | null;
  direction?: string | null;
  matchedKey?: string | null;
  matchedType?: string | null;
};

export type IntentClassification = {
  classifierVersion: typeof INTENT_CLASSIFIER_VERSION;
  intentKey: IntentKey;
  ruleSnapshot: {
    decision_type: string;
    direction: string;
    matched_key: string;
    matched_type: string;
    rule: string;
  };
};

type PrefixRule = { intentKey: IntentKey; prefix: string };

const prefixRules: PrefixRule[] = [
  { prefix: "branch_", intentKey: "branch_info" },
  { prefix: "inactive_branch:", intentKey: "branch_info" },
  { prefix: "unsupported_branch", intentKey: "branch_info" },
  { prefix: "nearest_branch", intentKey: "branch_info" },
  { prefix: "treatment_", intentKey: "treatment" },
  { prefix: "concern:", intentKey: "treatment" },
  { prefix: "pregnancy", intentKey: "pregnancy_nursing" },
  { prefix: "doctor_schedule", intentKey: "schedule" },
  { prefix: "schedule_", intentKey: "schedule" },
  { prefix: "booking_modify", intentKey: "booking_modify" },
  { prefix: "booking_cancel", intentKey: "booking_cancel" },
  { prefix: "booking_", intentKey: "booking_new" },
  { prefix: "promotion_", intentKey: "campaign" },
  { prefix: "campaign_", intentKey: "campaign" },
  { prefix: "pricing_", intentKey: "pricing" },
  { prefix: "post_procedure", intentKey: "post_treatment" },
  { prefix: "serious_complaint", intentKey: "complaint" },
  { prefix: "effect_guarantee", intentKey: "complaint" },
  { prefix: "human_request", intentKey: "human_request" },
  { prefix: "personalized_consult", intentKey: "human_request" },
  { prefix: "customer_account", intentKey: "human_request" },
  { prefix: "off_topic", intentKey: "off_topic" },
];

const exactRules: Record<string, IntentKey> = {
  appointment_policy: "branch_info",
  branch_list: "branch_info",
  capability_intro: "branch_info",
  first_visit_preparation: "branch_info",
  human_support_hours: "branch_info",
  payment_methods: "branch_info",
  price_commitment_request: "pricing",
  pricing_followup: "pricing",
  promotion_followup: "campaign",
  treatment_carousel: "treatment",
  unsupported_treatment_or_unapproved_content: "treatment",
};

const decisionTypeRules: Record<string, IntentKey> = {
  ai_auto_reply: "unclassified",
  booking_intake_reply: "booking_new",
  clinic_info_reply: "branch_info",
  faq_auto_reply: "unclassified",
  fallback_reply: "unclassified",
  handoff_pending: "human_request",
  medical_guidance_reply: "pregnancy_nursing",
  pricing_auto_reply: "pricing",
  treatment_intro_reply: "treatment",
};

function normalized(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function buildClassification(input: IntentClassificationInput, intentKey: IntentKey, rule: string): IntentClassification {
  return {
    classifierVersion: INTENT_CLASSIFIER_VERSION,
    intentKey,
    ruleSnapshot: {
      decision_type: normalized(input.decisionType),
      direction: normalized(input.direction),
      matched_key: normalized(input.matchedKey),
      matched_type: normalized(input.matchedType),
      rule,
    },
  };
}

// This is deliberately deterministic: report categories must be auditable without an LLM call.
export function classifyMessageIntent(input: IntentClassificationInput): IntentClassification {
  const matchedKey = normalized(input.matchedKey);
  const exact = exactRules[matchedKey];
  if (exact) {
    return buildClassification(input, exact, "matched_key_exact");
  }

  const prefix = prefixRules.find((candidate) => matchedKey.startsWith(candidate.prefix));
  if (prefix) {
    return buildClassification(input, prefix.intentKey, "matched_key_prefix");
  }

  const decisionType = normalized(input.decisionType);
  const fallback = decisionTypeRules[decisionType];
  if (fallback) {
    return buildClassification(input, fallback, "decision_type_fallback");
  }

  return buildClassification(input, "unclassified", "unclassified");
}
