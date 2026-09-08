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
  PendingQuickReplySemantic,
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

const PROMOTION_CATALOG_ACTION = {
  label: "周年慶活動",
  text: "我想了解現在有哪些活動",
} as const;

const FALLBACK_ACTIONS = [
  PROMOTION_CATALOG_ACTION,
  { label: "依困擾找療程", text: "我想依困擾找適合療程" },
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
  /** Derived from the current snapshot; false/omitted hides time-sensitive campaign entry points. */
  hasCurrentPromotionCatalog?: boolean;
  issuedAt?: string;
  nextStage?: CustomerQuickReplyStage | "consultation";
  snapshotId?: string;
};

type ProjectedQuickReplyAction = {
  choice?: CustomerQuickReplyChoice;
  label: string;
  pendingSemantic?: PendingQuickReplySemantic;
  text: string;
};

/**
 * Treatment-specific choices answer the current question, while this extra
 * clinic-wide entry keeps every current approved campaign reachable.  It is
 * intentionally a plain message action: the runtime re-resolves the active
 * promotion snapshot instead of storing a treatment-owned semantic shortcut.
 */
function withPromotionCatalogAction(
  actions: readonly ProjectedQuickReplyAction[],
  hasCurrentPromotionCatalog: boolean,
): ProjectedQuickReplyAction[] {
  const catalogText = normalizeClinicText(PROMOTION_CATALOG_ACTION.text);
  const customerActions = actions
    .filter((action) => normalizeClinicText(action.text) !== catalogText)
    .map((action) => action.label === "價格／活動"
      ? { ...action, label: "本療程價格" }
      : action);
  if (!hasCurrentPromotionCatalog) return customerActions;
  // Keep the clinic-wide activity entry visible without horizontal scrolling
  // past every treatment-specific choice on a typical phone screen.
  const insertAt = Math.min(2, customerActions.length);
  return [
    ...customerActions.slice(0, insertAt),
    PROMOTION_CATALOG_ACTION,
    ...customerActions.slice(insertAt),
  ];
}

function uniqueTreatmentKeys(values: readonly string[], clinic: ClinicConfig) {
  const offered = new Set(clinic.treatmentList.map((item) => item.key));
  return Array.from(new Set(values.filter((key) => offered.has(key))));
}

function subjectTreatmentKeys(subjectKey: string | undefined) {
  if (!subjectKey) return [];
  for (const prefix of ["treatment:", "comparison:"]) {
    if (subjectKey.startsWith(prefix)) {
      return subjectKey.slice(prefix.length).split("+").filter(Boolean);
    }
  }
  return [];
}

/**
 * Some approved L1 treatments intentionally do not yet carry a bespoke
 * consultation pack. They still need the same safe, low-pressure exits as
 * the reviewed launch packs without duplicating a copy of this array into
 * every treatment record.
 */
function sharedLaunchL1Actions(treatmentName: string): ProjectedQuickReplyAction[] {
  return [
    { label: "適合方向", text: `我想了解${treatmentName}適合方向` },
    { label: "價格／活動", text: `我想了解${treatmentName}價格／活動` },
    { label: "預約免費諮詢", text: "我要預約免費諮詢" },
    { label: "真人客服協助", text: "我要找真人客服" },
  ];
}

/**
 * Quick replies belong to the treatment that owns the current answer, not to
 * every treatment ever mentioned in the episode.  A returning customer may
 * have both Botox and ONDA in canonical history; current concern evidence can
 * still identify the one treatment whose approved guide should be displayed.
 */
function quickReplyTreatmentOwner(
  plan: ReplyPlan,
  state: ConversationV2State,
  clinic: ClinicConfig,
) {
  const planKeys = uniqueTreatmentKeys(plan.treatmentKeys, clinic);
  if (planKeys.length === 1) return planKeys[0];

  // A promotion catalog deliberately has no single treatment owner. Do not
  // let an older ONDA/Botox topic leak treatment-specific buttons into the
  // clinic-wide activity overview.
  if (plan.dialogueAct === "quote_approved_price" && planKeys.length === 0) {
    return undefined;
  }

  const activeKeys = uniqueTreatmentKeys(subjectTreatmentKeys(state.activeTask.subjectKey), clinic);
  if (activeKeys.length === 1 && (planKeys.length === 0 || planKeys.includes(activeKeys[0]!))) {
    return activeKeys[0];
  }

  const pricingKeys = uniqueTreatmentKeys(state.pricingSubjectTreatmentKeys, clinic);
  if (plan.dialogueAct === "quote_approved_price" && pricingKeys.length === 1) {
    return pricingKeys[0];
  }

  const candidateKeys = planKeys.length > 0
    ? planKeys
    : activeKeys.length > 0
      ? activeKeys
      : uniqueTreatmentKeys(state.knowledge.treatmentKeys, clinic);
  const concernKeys = plan.concernKeys.length > 0
    ? plan.concernKeys
    : state.knowledge.concernKeys;
  if (concernKeys.length === 0) return undefined;

  const owners = candidateKeys.filter((treatmentKey) => {
    const guide = clinic.treatmentList.find((item) => item.key === treatmentKey)?.consultationGuide;
    return Boolean(
      guide?.concernReplies?.some((reply) => concernKeys.includes(reply.concernKey)) ||
      guide?.customerQuickReplies?.some((choice) =>
        choice.concernKeys?.some((key) => concernKeys.includes(key)),
      ),
    );
  });
  return owners.length === 1 ? owners[0] : undefined;
}

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
    const awaitingActions = (state.awaiting?.options ?? [])
      .filter((option) => option.label.trim().length > 0 && option.label.length <= 20)
      .slice(0, 4)
      .map((option) => ({ label: option.label, text: option.label }));
    if (awaitingActions.length > 0) {
      return awaitingActions satisfies ProjectedQuickReplyAction[];
    }
    return FALLBACK_ACTIONS.filter(
      (action) => action !== PROMOTION_CATALOG_ACTION || options.hasCurrentPromotionCatalog === true,
    ) satisfies ProjectedQuickReplyAction[];
  }

  const treatmentOwner = quickReplyTreatmentOwner(plan, state, clinic);
  const treatmentKeys = treatmentOwner ? [treatmentOwner] : [];
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
    const actions = [
      ...(comparisonChoice
        ? [{ choice: comparisonChoice, label: comparisonChoice.label, text: comparisonChoice.text }]
        : []),
      ...consultationActions.filter((item) => item.text !== "繼續詢問"),
      ...(!comparisonChoice ? consultationActions.filter((item) => item.text === "繼續詢問") : []),
    ].slice(0, 4) satisfies ProjectedQuickReplyAction[];
    return treatmentOwner
      ? withPromotionCatalogAction(actions, options.hasCurrentPromotionCatalog === true)
      : actions;
  }

  const concernProjection = plan.concernCandidateProjection;
  if (concernProjection?.kind === "entry") {
    return [
      ...clinic.customerConcernGroups.map((group) => ({
        label: group.label,
        pendingSemantic: { groupKey: group.key, kind: "launch_concern_group" } as const,
        text: group.label,
      })),
      { label: "不確定，想預約免費諮詢", text: "不確定，想預約免費諮詢" },
    ] satisfies ProjectedQuickReplyAction[];
  }
  if (concernProjection?.kind === "candidates") {
    return concernProjection.treatmentKeys
      .map((treatmentKey) => clinic.treatmentList.find((item) => item.key === treatmentKey))
      .filter((treatment): treatment is NonNullable<typeof treatment> => Boolean(treatment))
      .slice(0, 6)
      .map((treatment) => ({
        label: treatment.name,
        pendingSemantic: { kind: "treatment", treatmentKey: treatment.key } as const,
        text: `想了解${treatment.name}`,
      }));
  }
  if (options.nextStage === "consultation") {
    const guide = treatmentKeys.length === 1
      ? clinic.treatmentList.find((item) => item.key === treatmentKeys[0])?.consultationGuide
      : undefined;
    const currentConcernKeys = plan.concernKeys.length > 0
      ? plan.concernKeys
      : state.knowledge.concernKeys;
    const configuredChoices = (guide?.customerQuickReplies ?? []).filter((choice) =>
      choice.stage === "consultation" &&
      (!choice.concernKeys?.length || choice.concernKeys.some((key) => currentConcernKeys.includes(key))),
    );
    const consultationActions = isConsultationInvitationPaused(state, treatmentKeys)
      ? PAUSED_CONSULTATION_ACTIONS
      : CONSULTATION_ACTIONS;
    return withPromotionCatalogAction([
      ...configuredChoices.map((choice) => ({ choice, label: choice.label, text: choice.text })),
      ...consultationActions,
    ].slice(0, 4) satisfies ProjectedQuickReplyAction[], options.hasCurrentPromotionCatalog === true);
  }
  if (!TREATMENT_DIALOGUE_ACTS.has(plan.dialogueAct)) return [] as ProjectedQuickReplyAction[];
  if (!treatmentOwner) return [] as ProjectedQuickReplyAction[];

  const treatment = clinic.treatmentList.find((item) => item.key === treatmentOwner);
  const guide = treatment?.consultationGuide;
  if (!guide && treatment) {
    return withPromotionCatalogAction(
      sharedLaunchL1Actions(treatment.name),
      options.hasCurrentPromotionCatalog === true,
    );
  }
  const customerChoices = guide?.customerQuickReplies ?? [];
  const stage = options.nextStage ?? (
    state.knowledge.concernKeys.length > 0 ? "followup" : "initial"
  );
  const stagedChoices = customerChoices.filter((choice) => choice.stage === stage);
  const currentConcernKeys = plan.concernKeys.length > 0
    ? plan.concernKeys
    : state.knowledge.concernKeys;
  const concernChoices = stagedChoices.filter((choice) =>
    choice.concernKeys?.some((key) => currentConcernKeys.includes(key)),
  );
  const actions = (concernChoices.length > 0
    ? concernChoices
    : stagedChoices.filter((choice) => !choice.concernKeys?.length))
    .slice(0, 4)
    .map((choice) => ({ choice, label: choice.label, text: choice.text }));
  return withPromotionCatalogAction(actions, options.hasCurrentPromotionCatalog === true);
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
  const { quickReplyItems: _previousQuickReplyItems, ...planWithoutQuickReplies } = plan;
  const projectedPlan = quickReplyItems.length > 0
    ? { ...planWithoutQuickReplies, quickReplyItems }
    : { ...planWithoutQuickReplies, quickReplyItems: [] };
  const concernProjection = plan.concernCandidateProjection;
  if (concernProjection) {
    const choices = actions.flatMap((action, index) => action.pendingSemantic
      ? [{
          choiceId: `launch_concern:${concernProjection.kind}:${index}:${normalizeClinicText(action.text)}`,
          label: action.label,
          normalizedMessageText: normalizeClinicText(action.text),
          messageText: action.text,
          semantic: action.pendingSemantic,
        }]
      : []);
    const issuedAt = new Date(options.issuedAt);
    if (choices.length === 0 || !Number.isFinite(issuedAt.getTime())) {
      return { plan: projectedPlan };
    }
    return {
      pendingQuickReply: {
        ...(concernProjection.branchName
          ? { contextBranchName: concernProjection.branchName }
          : {}),
        choices,
        episodeId: state.episodeId,
        expiresAt: new Date(issuedAt.getTime() + 30 * 60 * 1000).toISOString(),
        contractId: `${state.episodeId}:${state.lastProcessedTurnId ?? "uncommitted"}:launch-concern`,
        issuedAt: issuedAt.toISOString(),
        owner: { kind: "launch_concern", treatmentKey: "" },
        sourceSnapshotId: options.snapshotId,
        sourceTurnId: state.lastProcessedTurnId ?? "uncommitted",
      },
      plan: projectedPlan,
    };
  }
  const treatmentKey = quickReplyTreatmentOwner(plan, state, clinic);
  if (!treatmentKey || quickReplyItems.length === 0) {
    return { plan: projectedPlan };
  }
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
          ...(configured.semantic.conversationMove
            ? { conversationMove: configured.semantic.conversationMove }
            : {}),
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
  const { quickReplyItems: _previousQuickReplyItems, ...planWithoutQuickReplies } = plan;
  return quickReplyItems.length > 0
    ? { ...planWithoutQuickReplies, quickReplyItems }
    : { ...planWithoutQuickReplies, quickReplyItems: [] };
}
