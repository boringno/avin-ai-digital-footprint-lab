import type {
  ConversationMove,
  DialogueReference,
  DialogueSpeechAct,
  QuestionAspect,
} from "../dialogue-semantics";
import type {
  PriceApplicabilityDimensions,
  PriceQuery,
} from "../clinic-facts";
import type { ResponseContractAttachment } from "../response-contract";

export const CONVERSATION_V2_SCHEMA_VERSION = 2 as const;

export type ControlMode =
  | "ai_active"
  | "handoff_pending"
  | "human_active"
  | "ai_paused"
  | "closed";

export type HandoffTask = {
  id: string;
  reason: string;
  requestedAt: string;
  status: "pending" | "active";
};

export type ConversationControl = {
  handoff?: HandoffTask;
  mode: ControlMode;
};

export type ActiveTaskKind =
  | "idle"
  | "learn_treatment"
  | "compare_treatments"
  | "answer_concern"
  | "pricing"
  | "clinic_info"
  | "booking"
  | "safety";

export type ActiveTask = {
  id: string;
  kind: ActiveTaskKind;
  startedAt: string;
  subjectKey?: string;
};

export type BookingIntent = "none" | "create" | "modify" | "cancel";
export type BookingStatus = "inactive" | "collecting" | "suspended" | "completed";
export type BookingField =
  | "treatment"
  | "branch"
  | "time_slots"
  | "first_visit"
  | "name"
  | "phone"
  | "appointment_reference"
  | "change_request";

export type BookingDraft = {
  appointmentReference?: string;
  branch?: string;
  changeRequest?: string;
  firstVisit?: boolean;
  name?: string;
  phone?: string;
  timeSlots: string[];
  treatmentKeys: string[];
};

export type CreateBookingField = Extract<
  BookingField,
  "treatment" | "branch" | "time_slots" | "first_visit" | "name" | "phone"
>;
export type ModifyBookingField = Extract<
  BookingField,
  "appointment_reference" | "change_request"
>;
export type CancelBookingField = Extract<BookingField, "appointment_reference">;

export type KnowledgeUpdateMode = "merge" | "replace_active_subject";

export type BookingTask = {
  draft: BookingDraft;
  expectedField?: BookingField;
  id?: string;
  intent: BookingIntent;
  status: BookingStatus;
};

export type AwaitingOptionEntity = "area" | "concern" | "treatment" | "answer";

export type AwaitingOption = {
  entity: AwaitingOptionEntity;
  id: string;
  label: string;
  value: string;
};

export type AwaitingState = {
  allowMultiple: boolean;
  expectedField: "selection" | "area" | "concern" | BookingField;
  id: string;
  knowledgeMode?: KnowledgeUpdateMode;
  options: AwaitingOption[];
  /** Candidate entities awaiting confirmation; never canonical knowledge. */
  pendingKnowledge?: Pick<
    KnowledgeContext,
    "areaKeys" | "concernKeys" | "treatmentKeys"
  >;
  prompt: string;
  responseContext?: TreatmentResponseContext;
};

/**
 * Only verified or explicitly observed knowledge belongs here. It is not a
 * copy of the last reply and must never contain generated prose.
 */
export type KnowledgeContext = {
  approvedFactIds: string[];
  areaKeys: string[];
  concernKeys: string[];
  treatmentKeys: string[];
};

export type PendingQuickReplySemantic =
  | { concernKey: string; kind: "concern" }
  | {
      areaKey?: string;
      concernKey?: string;
      kind: "approved_asset";
      questionAspect: QuestionAspect;
      replyAssetId: string;
    };

export type PendingQuickReplyChoice = {
  choiceId: string;
  label: string;
  nextStage?: "approach" | "followup" | "initial" | "consultation";
  normalizedMessageText: string;
  messageText: string;
  semantic: PendingQuickReplySemantic;
};

/**
 * Exact semantic choices that were projected into the latest customer-visible
 * LINE reply. This is approved identity, never generated prose or price data.
 */
export type PendingQuickReplyContract = {
  choices: PendingQuickReplyChoice[];
  episodeId: string;
  expiresAt: string;
  contractId: string;
  issuedAt: string;
  owner: { kind: "treatment"; treatmentKey: string };
  sourceSnapshotId: string;
  sourceTurnId: string;
};

export type ConversationPreferences = {
  excludedAreaKeys: string[];
  excludedConcernKeys: string[];
  excludedTreatmentKeys: string[];
  treatmentApproach: "single" | "unspecified";
};

export type ConversationV2State = {
  activeTask: ActiveTask;
  awaiting?: AwaitingState;
  bookingTask: BookingTask;
  control: ConversationControl;
  episodeId: string;
  knowledge: KnowledgeContext;
  lastProcessedTurnId?: string;
  pendingQuickReply?: PendingQuickReplyContract;
  pricingSubjectTreatmentKeys: string[];
  processedTurnIds: string[];
  revision: number;
  schemaVersion: typeof CONVERSATION_V2_SCHEMA_VERSION;
  preferences: ConversationPreferences;
  updatedAt: string;
};

export type MentionResolution = "resolved" | "underspecified";
export type MentionPolarity = "affirmed" | "negated";

export type EntityMention = {
  confidence: number;
  key: string;
  label?: string;
  polarity: MentionPolarity;
  resolution: MentionResolution;
};

export type ClarificationNeed = {
  allowMultiple: boolean;
  options: AwaitingOption[];
  prompt: string;
  slot: "area" | "concern" | "treatment";
};

export type SelectionUnderstanding =
  | { mode: "all" }
  | { indexes: number[]; mode: "indexes" }
  | { keys: string[]; mode: "keys" };

export type BookingUnderstanding = {
  explicit: boolean;
  fields?: Partial<BookingDraft>;
  intent: BookingIntent;
};

/**
 * High-trust evidence that the current customer text explicitly rejects an
 * ontology entity. An empty key set is still meaningful: it says the sentence
 * is a clear negation but its object could not be resolved deterministically,
 * so model-produced positive entities must be discarded rather than guessed.
 */
export type DeterministicNegationGuard = {
  affirmedAreaKeys: string[];
  affirmedConcernKeys: string[];
  affirmedTreatmentKeys: string[];
  areaKeys: string[];
  concernKeys: string[];
  treatmentKeys: string[];
};

/**
 * High-trust, customer-message evidence produced without asking the model to
 * decide clinic facts. It may ground a low-confidence treatment-content turn,
 * but it never carries prices, booking mutations, safety decisions, or prose.
 */
export type TrustedSemanticAnchor = {
  areaKeys: string[];
  concernKeys: string[];
  conversationMove: ConversationMove;
  dialogueReference: DialogueReference;
  questionAspect: QuestionAspect;
  replyAssetId?: string;
  source: "active_subject_query" | "approved_asset" | "exact_ontology";
  speechAct: Extract<
    DialogueSpeechAct,
    "ask_concern" | "ask_treatment_detail" | "compare_treatments" | "learn_treatment"
  >;
  treatmentKeys: string[];
};

export type TurnSpeechAct = DialogueSpeechAct;

export type TreatmentResponseContext = {
  affirmedAreaKeys: string[];
  affirmedConcernKeys: string[];
  affirmedTreatmentKeys: string[];
  conversationMove: ConversationMove;
  declinedTreatmentKeys: string[];
  dialogueReference: DialogueReference;
  excludedAreaKeys: string[];
  excludedConcernKeys: string[];
  excludedTreatmentKeys: string[];
  questionAspect: QuestionAspect;
  treatmentApproach: ConversationPreferences["treatmentApproach"];
};

/** Structured output expected from deterministic preflight plus NLU. */
export type TurnUnderstanding = {
  areas: EntityMention[];
  booking?: BookingUnderstanding;
  clarification?: ClarificationNeed;
  conversationMove: ConversationMove;
  concerns: EntityMention[];
  confidence: number;
  dialogueReference: DialogueReference;
  /** Structured price qualifiers extracted by NLU or a deterministic tool. */
  priceApplicability?: PriceApplicabilityDimensions;
  questionAspect: QuestionAspect;
  receivedAt: string;
  /** Snapshot-pinned approved content selected by a trusted semantic anchor. */
  replyAssetId?: string;
  selection?: SelectionUnderstanding;
  semanticEvidence?: TrustedSemanticAnchor["source"];
  speechAct: TurnSpeechAct;
  text: string;
  treatments: EntityMention[];
  turnId: string;
};

type PolicyActionBase = {
  at: string;
  /** Turn-level preference changes persist even when price/clinic is the primary action. */
  preferenceContext?: TreatmentResponseContext;
  turnId: string;
};

export type DialoguePolicyAction =
  | (PolicyActionBase & {
      type: "learn_treatment";
      /** True only when this turn deliberately starts a fresh consultation episode. */
      episodeRestart?: boolean;
      taskKind: "learn_treatment" | "compare_treatments" | "answer_concern";
      treatmentKeys: string[];
      concernKeys: string[];
      areaKeys: string[];
      knowledgeMode: KnowledgeUpdateMode;
      responseContext: TreatmentResponseContext;
    })
  | (PolicyActionBase & {
      awaiting: AwaitingState;
      areaKeys: string[];
      concernKeys: string[];
      knowledgeMode: KnowledgeUpdateMode;
      taskKind: "learn_treatment" | "compare_treatments" | "answer_concern";
      treatmentKeys: string[];
      type: "clarify";
      responseContext: TreatmentResponseContext;
    })
  | (PolicyActionBase & {
      areaKeys: string[];
      concernKeys: string[];
      knowledgeMode: KnowledgeUpdateMode;
      selectedOptions: AwaitingOption[];
      taskKind: "learn_treatment" | "compare_treatments" | "answer_concern";
      treatmentKeys: string[];
      type: "answer_selection";
      responseContext: TreatmentResponseContext;
    })
  | (PolicyActionBase & {
      intent: Exclude<BookingIntent, "none">;
      initialDraft: Partial<BookingDraft>;
      type: "start_booking";
    })
  | (PolicyActionBase & {
      fields: Partial<BookingDraft>;
      type: "capture_booking_fields";
    })
  | (PolicyActionBase & {
      topic?: string;
      type: "answer_clinic_info";
    })
  | (PolicyActionBase & {
      priceApplicability?: PriceApplicabilityDimensions;
      priceKind: "campaign" | "regular" | "unspecified";
      treatmentKeys: string[];
      type: "answer_price";
    })
  | (PolicyActionBase & {
      handoffId: string;
      reason: string;
      type: "queue_handoff";
    })
  | (PolicyActionBase & {
      reason: "urgent_safety";
      type: "answer_safety";
    })
  | (PolicyActionBase & {
      reason: "human_active" | "ai_paused" | "closed" | "duplicate_turn";
      type: "do_not_reply";
    })
  | (PolicyActionBase & {
      prompt: string;
      type: "fallback_clarify";
    });

export type ReplyKnowledgeQuery = {
  approvedFactIds: string[];
  areaKeys: string[];
  concernKeys: string[];
  treatmentKeys: string[];
};

type ReplyPlanBase = {
  action: DialoguePolicyAction["type"];
  responseContract: ResponseContractAttachment;
  sourceTurnId: string;
};

export type GeneratedReplyPlan = ReplyPlanBase & {
  dialogueAct:
    | "introduce_treatment"
    | "answer_followup"
    | "compare_options"
    | "recommend_direction"
    | "address_objection";
  knowledgeQuery: ReplyKnowledgeQuery;
  mode: "generated";
  nextQuestion?: string;
  objective: string;
  responseContext: TreatmentResponseContext;
  selectedOptions?: AwaitingOption[];
};

export type DeterministicReplyPlan = ReplyPlanBase & {
  dialogueAct:
    | "clarify"
    | "collect_booking"
    | "manage_booking"
    | "answer_price"
    | "answer_clinic_info"
    | "answer_safety"
    | "handoff";
  mode: "deterministic";
  nextQuestion?: string;
  pricingQuery?: PriceQuery;
  templateKey: string;
  templateVariables: Record<string, string | string[]>;
};

export type SilentReplyPlan = ReplyPlanBase & {
  mode: "silent";
  reason: "human_active" | "ai_paused" | "closed" | "duplicate_turn";
};

export type ReplyPlan = GeneratedReplyPlan | DeterministicReplyPlan | SilentReplyPlan;

/** One turn produces exactly one action and exactly one corresponding plan. */
export type DialoguePolicyResult = {
  action: DialoguePolicyAction;
  replyPlan: ReplyPlan;
};
