export const DIALOGUE_SPEECH_ACTS = [
  "learn_treatment",
  "ask_treatment_detail",
  "compare_treatments",
  "ask_concern",
  "ask_clinic_info",
  "ask_price",
  "book_consultation",
  "manage_booking",
  "provide_booking_field",
  "request_handoff",
  "select_options",
  "urgent_safety",
  "unknown",
] as const;

export type DialogueSpeechAct = (typeof DIALOGUE_SPEECH_ACTS)[number];

export const QUESTION_ASPECTS = [
  "overview",
  "benefits",
  "mechanism",
  "suitability",
  "comfort_recovery",
  "side_effects",
  "duration",
  "sessions",
  "single_vs_combination",
  "combination_reason",
  "general_difference",
  "brands",
  "brand_difference",
  "alternatives",
  "branch_list",
  "branch_address",
  "branch_hours",
  "doctor_schedule",
  "clinic_contact",
  "booking_policy",
  "price_regular",
  "price_campaign",
  "price_unspecified",
  "none",
] as const;

export type QuestionAspect = (typeof QUESTION_ASPECTS)[number];

export const CONVERSATION_MOVES = [
  "start",
  "continue",
  "compare",
  "replace",
  "prefer_single",
  "reject",
  "none",
] as const;

export type ConversationMove = (typeof CONVERSATION_MOVES)[number];

export const DIALOGUE_REFERENCES = [
  "explicit",
  "active_subject",
  "active_comparison",
  "unresolved",
  "none",
] as const;

export type DialogueReference = (typeof DIALOGUE_REFERENCES)[number];

export type NluDialogueFrame = {
  /** Ordered current-message NLU candidate aspects; shadow-only and never fact/state/action ownership. */
  aspects?: QuestionAspect[];
  focus: QuestionAspect;
  move: ConversationMove;
  reference: DialogueReference;
  speechAct: DialogueSpeechAct;
};

export const DEFAULT_NLU_DIALOGUE_FRAME: NluDialogueFrame = {
  aspects: [],
  focus: "none",
  move: "none",
  reference: "none",
  speechAct: "unknown",
};
