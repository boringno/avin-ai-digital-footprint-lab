import {
  findTreatmentByKey,
  type CustomerQuickReplyStage,
} from "@/lib/clinic-config";
import { lineQuickReplyItems } from "@/lib/line-quick-replies";
import type { ReplyPlan } from "@/lib/reply-plan";

import type { ConversationV2State } from "./types";
import { isConsultationInvitationPaused } from "./consultation-invitation";

const CONSULTATION_ACTIONS = [
  { label: "預約免費諮詢", text: "我要預約免費諮詢" },
  { label: "真人客服協助", text: "我要找真人客服" },
  { label: "繼續詢問", text: "繼續詢問" },
] as const;

const PAUSED_CONSULTATION_ACTIONS = CONSULTATION_ACTIONS.filter(
  (item) => item.text !== "我要預約免費諮詢",
);

const BRANCH_ACTIONS = ["高雄館", "台中館", "桃園館", "林口館"].map((name) => ({
  label: name,
  text: name,
}));

const FIRST_VISIT_ACTIONS = ["初診", "複診"].map((value) => ({ label: value, text: value }));

const TREATMENT_DIALOGUE_ACTS = new Set<ReplyPlan["dialogueAct"]>([
  "introduce_treatment",
  "discover_need",
  "answer_followup",
  "recommend_direction",
  "compare_options",
  "quote_approved_price",
]);

/**
 * LINE choices are selected from the canonical V2 state, never inferred from
 * a rendered sentence.  A tap sends normal customer text, so free typing and
 * the same deterministic router remain available.
 */
export function conversationV2QuickReplyItems(
  plan: ReplyPlan,
  state: ConversationV2State,
  options: {
    nextStage?: CustomerQuickReplyStage | "consultation";
  } = {},
) {
  if (state.bookingTask.status === "collecting") {
    if (state.bookingTask.expectedField === "branch") return lineQuickReplyItems(BRANCH_ACTIONS);
    if (state.bookingTask.expectedField === "first_visit") return lineQuickReplyItems(FIRST_VISIT_ACTIONS);
    return [];
  }

  const treatmentKeys = plan.treatmentKeys.length > 0
    ? plan.treatmentKeys
    : state.knowledge.treatmentKeys;
  if (
    plan.dialogueAct === "quote_approved_price" ||
    options.nextStage === "consultation"
  ) {
    return lineQuickReplyItems(
      isConsultationInvitationPaused(state, treatmentKeys)
        ? PAUSED_CONSULTATION_ACTIONS
        : CONSULTATION_ACTIONS,
    );
  }
  if (!TREATMENT_DIALOGUE_ACTS.has(plan.dialogueAct)) return [];

  if (treatmentKeys.length !== 1) return [];

  const guide = findTreatmentByKey(treatmentKeys[0])?.consultationGuide;
  const customerChoices = guide?.customerQuickReplies ?? [];
  const stage = options.nextStage ?? (
    state.knowledge.concernKeys.length > 0 ? "followup" : "initial"
  );
  const stagedChoices = customerChoices.filter((choice) => choice.stage === stage);
  const concernChoices = stagedChoices.filter((choice) =>
    choice.concernKeys?.some((key) => state.knowledge.concernKeys.includes(key)),
  );
  // Once the customer has told us their concern, offer the next useful
  // decision for that concern.  Generic choices remain the fallback for an
  // unqualified treatment question, rather than crowding out this turn's
  // follow-up question on a small LINE screen.
  const actions = concernChoices.length > 0
    ? concernChoices
    : stagedChoices.filter((choice) => !choice.concernKeys?.length);
  return lineQuickReplyItems(actions.slice(0, 4));
}

export function withConversationV2QuickReplies(
  plan: ReplyPlan,
  state: ConversationV2State,
  options: {
    nextStage?: CustomerQuickReplyStage | "consultation";
  } = {},
) {
  const quickReplyItems = conversationV2QuickReplyItems(plan, state, options);
  return quickReplyItems.length > 0 ? { ...plan, quickReplyItems } : plan;
}
