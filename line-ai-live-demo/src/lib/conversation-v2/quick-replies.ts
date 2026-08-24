import {
  clinicConfig,
  normalizeClinicText,
  type ClinicConfig,
  type CustomerQuickReplyChoice,
  type CustomerQuickReplyStage,
} from "@/lib/clinic-config";
import { lineQuickReplyItems } from "@/lib/line-quick-replies";
import type { ReplyPlan } from "@/lib/reply-plan";

import { buildConversationV2QuickReplySelection } from "./quick-reply-selection";
import type {
  ConversationV2State,
  PendingQuickReplyContract,
} from "./types";
import { isConsultationInvitationPaused } from "./consultation-invitation";
import { isConversationV2AiAssistanceEnabled } from "./state";

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

const FALLBACK_ACTIONS = [
  { label: "了解 ONDA", text: "我想了解 ONDA" },
  { label: "了解肉毒", text: "我想了解肉毒" },
  { label: "預約免費諮詢", text: "我要預約免費諮詢" },
  { label: "真人客服協助", text: "我要找真人客服" },
] as const;

const TREATMENT_DIALOGUE_ACTS = new Set<ReplyPlan["dialogueAct"]>([
  "introduce_treatment",
  "discover_need",
  "answer_followup",
  "recommend_direction",
  "compare_options",
  "quote_approved_price",
]);

type QuickReplyOptions = {
  clinic?: ClinicConfig;
  issuedAt?: string;
  nextStage?: CustomerQuickReplyStage | "consultation";
  snapshotId?: string;
};

type ProjectedQuickReplyAction = {
  choice?: CustomerQuickReplyChoice;
  label: string;
  text: string;
};

function conversationV2QuickReplyActions(
  plan: ReplyPlan,
  state: ConversationV2State,
  options: QuickReplyOptions = {},
): ProjectedQuickReplyAction[] {
  const clinic = options.clinic ?? clinicConfig;
  if (!isConversationV2AiAssistanceEnabled(state.control.mode)) {
    return [] as ProjectedQuickReplyAction[];
  }
  if (state.bookingTask.status === "collecting") {
    if (state.bookingTask.expectedField === "branch") return [...BRANCH_ACTIONS] satisfies ProjectedQuickReplyAction[];
    if (state.bookingTask.expectedField === "first_visit") return [...FIRST_VISIT_ACTIONS] satisfies ProjectedQuickReplyAction[];
    return [] as ProjectedQuickReplyAction[];
  }

  if (plan.dialogueAct === "clarify") {
    return [...FALLBACK_ACTIONS] satisfies ProjectedQuickReplyAction[];
  }

  const treatmentKeys = plan.treatmentKeys.length > 0
    ? plan.treatmentKeys
    : state.knowledge.treatmentKeys;
  if (plan.dialogueAct === "quote_approved_price") {
    const guide = treatmentKeys.length === 1
      ? clinic.treatmentList.find((item) => item.key === treatmentKeys[0])?.consultationGuide
      : undefined;
    const comparisonChoice = guide?.customerQuickReplies?.find((choice) =>
        choice.stage === "approach" &&
        choice.semantic?.type === "approved_asset" &&
        choice.semantic.questionAspect === "single_vs_combination" &&
        /(?:組合|搭配)/u.test(choice.label),
      );
    const consultationActions = isConsultationInvitationPaused(state, treatmentKeys)
      ? PAUSED_CONSULTATION_ACTIONS
      : CONSULTATION_ACTIONS;
    return [
      ...(comparisonChoice
        ? [{ choice: comparisonChoice, label: comparisonChoice.label, text: comparisonChoice.text }]
        : []),
      ...consultationActions.filter((item) => item.text !== "繼續詢問"),
      ...(!comparisonChoice ? consultationActions.filter((item) => item.text === "繼續詢問") : []),
    ].slice(0, 4) satisfies ProjectedQuickReplyAction[];
  }
  if (options.nextStage === "consultation") {
    return [...(isConsultationInvitationPaused(state, treatmentKeys)
      ? PAUSED_CONSULTATION_ACTIONS
      : CONSULTATION_ACTIONS)] satisfies ProjectedQuickReplyAction[];
  }
  if (!TREATMENT_DIALOGUE_ACTS.has(plan.dialogueAct)) return [] as ProjectedQuickReplyAction[];
  if (treatmentKeys.length !== 1) return [] as ProjectedQuickReplyAction[];

  const guide = clinic.treatmentList.find((item) => item.key === treatmentKeys[0])?.consultationGuide;
  const customerChoices = guide?.customerQuickReplies ?? [];
  const stage = options.nextStage ?? (
    state.knowledge.concernKeys.length > 0 ? "followup" : "initial"
  );
  const stagedChoices = customerChoices.filter((choice) => choice.stage === stage);
  const concernChoices = stagedChoices.filter((choice) =>
    choice.concernKeys?.some((key) => state.knowledge.concernKeys.includes(key)),
  );
  return (concernChoices.length > 0
    ? concernChoices
    : stagedChoices.filter((choice) => !choice.concernKeys?.length))
    .slice(0, 4)
    .map((choice) => ({ choice, label: choice.label, text: choice.text }));
}

/**
 * LINE choices are selected from the canonical V2 state, never inferred from
 * a rendered sentence.  A tap sends normal customer text, so free typing and
 * the same deterministic router remain available.
 */
export function conversationV2QuickReplyItems(
  plan: ReplyPlan,
  state: ConversationV2State,
  options: QuickReplyOptions = {},
) {
  return lineQuickReplyItems(conversationV2QuickReplyActions(plan, state, options));
}

export function projectConversationV2QuickReplies(
  plan: ReplyPlan,
  state: ConversationV2State,
  options: Required<Pick<QuickReplyOptions, "issuedAt" | "snapshotId">> & QuickReplyOptions,
): { pendingQuickReply?: PendingQuickReplyContract; plan: ReplyPlan } {
  const clinic = options.clinic ?? clinicConfig;
  const actions = conversationV2QuickReplyActions(plan, state, options);
  const quickReplyItems = lineQuickReplyItems(actions);
  const projectedPlan = quickReplyItems.length > 0 ? { ...plan, quickReplyItems } : plan;
  const treatmentKeys = plan.treatmentKeys.length > 0
    ? plan.treatmentKeys
    : state.knowledge.treatmentKeys;
  if (treatmentKeys.length !== 1 || quickReplyItems.length === 0) {
    return { plan: projectedPlan };
  }

  const treatmentKey = treatmentKeys[0]!;
  const choices = actions.flatMap((action, index) => {
    const configured = action.choice;
    if (!configured?.semantic) return [];
    const selection = buildConversationV2QuickReplySelection({
      choice: configured,
      clinic,
      treatmentKey,
    });
    if (!selection) return [];
    const semantic = configured.semantic.type === "concern"
      ? { concernKey: configured.semantic.concernKey, kind: "concern" as const }
      : {
          ...(configured.semantic.areaKey ? { areaKey: configured.semantic.areaKey } : {}),
          ...(configured.semantic.concernKey ? { concernKey: configured.semantic.concernKey } : {}),
          kind: "approved_asset" as const,
          questionAspect: configured.semantic.questionAspect,
          replyAssetId: selection.semanticAnchor.replyAssetId!,
        };
    return [{
      choiceId: `${treatmentKey}:${configured.stage}:${index}:${normalizeClinicText(configured.text)}`,
      label: configured.label,
      ...(configured.nextStage ? { nextStage: configured.nextStage } : {}),
      normalizedMessageText: normalizeClinicText(configured.text),
      messageText: configured.text,
      semantic,
    }];
  });
  if (choices.length === 0) return { plan: projectedPlan };
  const issuedAt = new Date(options.issuedAt);
  if (!Number.isFinite(issuedAt.getTime())) return { plan: projectedPlan };
  return {
    pendingQuickReply: {
      choices,
      episodeId: state.episodeId,
      expiresAt: new Date(issuedAt.getTime() + 30 * 60 * 1000).toISOString(),
      contractId: `${state.episodeId}:${state.lastProcessedTurnId ?? "uncommitted"}:quick-reply`,
      issuedAt: issuedAt.toISOString(),
      owner: { kind: "treatment", treatmentKey },
      sourceSnapshotId: options.snapshotId,
      sourceTurnId: state.lastProcessedTurnId ?? "uncommitted",
    },
    plan: projectedPlan,
  };
}

export function withConversationV2QuickReplies(
  plan: ReplyPlan,
  state: ConversationV2State,
  options: QuickReplyOptions = {},
) {
  const quickReplyItems = conversationV2QuickReplyItems(plan, state, options);
  return quickReplyItems.length > 0 ? { ...plan, quickReplyItems } : plan;
}
