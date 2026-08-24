import {
  resolveApprovedPrice,
  resolveClinicInfo,
  resolveTreatmentFact,
  resolveTreatmentKnowledge,
  type ClinicFactsSnapshot,
  type ClinicInfoFactResolution,
  type PriceApplicabilityDimensions,
  type PriceFactResolution,
  type TreatmentKnowledgeResolution,
} from "@/lib/clinic-facts";
import { findTreatmentBrandInClinic } from "@/lib/clinic-config";
import {
  buildTreatmentReplyAssets,
  type TreatmentReplyAsset,
} from "@/lib/clinic-facts/treatment-reply-assets";
import type { QuestionAspect } from "@/lib/dialogue-semantics";
import {
  DEFAULT_PROHIBITED_CLAIMS,
  legacyDecisionToReplyPlan,
  type DialogueAct,
  type ReplyPlan as RendererReplyPlan,
} from "@/lib/reply-plan";
import type { ResponseContractAttachment } from "@/lib/response-contract";

import {
  priceGapReply,
  treatmentGapReply,
  treatmentProfileGapReply,
  type ConversationV2ToolRequest,
} from "./data-gap-policy";
import type {
  BookingField,
  ConversationV2State,
  DialoguePolicyResult,
  GeneratedReplyPlan,
  TurnUnderstanding,
} from "./types";
import { isConsultationInvitationPaused } from "./consultation-invitation";

type DoctorScheduleDecision = {
  replyMessages?: RendererReplyPlan["richMessages"];
  replyText: string;
};

export type HydratedConversationV2Reply = {
  alternativePriceResolution?: PriceFactResolution;
  clinicInfoResolution?: ClinicInfoFactResolution;
  dataStatus: "partial" | "ready" | "unresolved";
  priceResolution?: PriceFactResolution;
  rendererPlan: RendererReplyPlan | null;
  snapshotId: string;
  stateCommit: "commit" | "hold";
  toolRequest?: ConversationV2ToolRequest;
  treatmentResolution?: TreatmentKnowledgeResolution;
};

export type HydrateConversationV2ReplyInput = {
  nextState: ConversationV2State;
  result: DialoguePolicyResult;
  snapshot: ClinicFactsSnapshot;
  turn: TurnUnderstanding;
};

export type HydrateConversationV2ReplyDependencies = {
  resolveDoctorSchedule?: (input: {
    message: string;
    now: Date;
  }) => Promise<DoctorScheduleDecision | null>;
};

const BOOKING_PROMPTS: Record<BookingField, string> = {
  appointment_reference: "請提供原預約的姓名、電話或其他可供客服查詢的資料。",
  branch: "請問較方便前往哪個館別？",
  change_request: "請告訴我想修改的日期、時段、館別或療程。",
  first_visit: "請問這次是初診還是複診呢？",
  name: "請留下方便聯絡的姓名。",
  phone: "請留下聯絡電話。",
  time_slots: "請提供 3 個方便的日期與時段。",
  treatment: "想預約諮詢哪一項療程呢？",
};

function unique(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function customerPriceReply(
  snapshot: ClinicFactsSnapshot,
  resolution: Extract<PriceFactResolution, { status: "approved_current" }>,
) {
  const treatmentNames = resolution.treatmentKeys
    .map((key) => snapshot.clinic.treatmentList.find((item) => item.key === key)?.name)
    .filter((name): name is string => Boolean(name));
  const subject = treatmentNames.length === 1 ? `${treatmentNames[0]}目前可參考` : "目前可參考";
  return unique([
    `${subject}：${resolution.customerPriceText}。`,
    resolution.branchScope ? `${resolution.branchScope}。` : "",
  ]).join("\n");
}

function contextualPriceCampaignId(input: HydrateConversationV2ReplyInput) {
  const query = input.result.replyPlan.mode === "deterministic"
    ? input.result.replyPlan.pricingQuery
    : undefined;
  if (!query || query.treatmentKeys.length === 0) return undefined;
  const concernKeys = unique([
    ...input.turn.concerns
      .filter((mention) => mention.polarity === "affirmed" && mention.resolution === "resolved")
      .map((mention) => mention.key),
    ...input.nextState.knowledge.concernKeys,
  ]);
  for (const concernKey of concernKeys) {
    for (const treatmentKey of query.treatmentKeys) {
      const treatment = input.snapshot.clinic.treatmentList.find((item) => item.key === treatmentKey);
      const combinationKeys = treatment?.consultationGuide?.approvedCombinationTreatmentKeys ?? [];
      if (
        input.nextState.preferences.treatmentApproach === "single" ||
        combinationKeys.some((key) => input.nextState.preferences.excludedTreatmentKeys.includes(key))
      ) {
        continue;
      }
      const campaignId = treatment?.consultationGuide?.concernReplies?.find(
        (item) => item.concernKey === concernKey,
      )?.pricingCampaignId;
      if (campaignId) return campaignId;
    }
  }
  return undefined;
}

/**
 * Resolve a clinic-approved combination offer from the treatment pack itself.
 * This deliberately does not inspect treatment names or customer wording: the
 * clinic's approvedCombinationTreatmentKeys is the sole relationship owner.
 */
function approvedCombinationPriceResolution(
  input: HydrateConversationV2ReplyInput,
  treatmentKeys: readonly string[],
) {
  if (
    treatmentKeys.length !== 1 ||
    input.nextState.preferences.treatmentApproach === "single"
  ) return undefined;
  const treatment = input.snapshot.clinic.treatmentList.find(
    (candidate) => candidate.key === treatmentKeys[0],
  );
  for (const companionKey of treatment?.consultationGuide?.approvedCombinationTreatmentKeys ?? []) {
    if (input.nextState.preferences.excludedTreatmentKeys.includes(companionKey)) continue;
    const resolution = resolveApprovedPrice(input.snapshot, {
      kind: "unspecified",
      treatmentKeys: [treatmentKeys[0], companionKey],
    });
    if (resolution.status === "approved_current") return resolution;
  }
  return undefined;
}

function priceConcernFollowup(input: HydrateConversationV2ReplyInput) {
  const pricedTreatmentKeys = input.result.replyPlan.mode === "deterministic"
    ? input.result.replyPlan.pricingQuery?.treatmentKeys ?? []
    : [];
  const concernKeys = unique([
    ...input.turn.concerns
      .filter((mention) => mention.polarity === "affirmed" && mention.resolution === "resolved")
      .map((mention) => mention.key),
    ...input.nextState.knowledge.concernKeys,
  ]).filter((concernKey) => pricedTreatmentKeys.some((treatmentKey) => {
    const treatment = input.snapshot.clinic.treatmentList.find((item) => item.key === treatmentKey);
    const concern = input.snapshot.clinic.concernList.find((item) => item.key === concernKey);
    return Boolean(
      treatment?.consultationGuide?.concernReplies?.some((item) => item.concernKey === concernKey) ||
      concern?.recommendedTreatmentKeys.includes(treatmentKey),
    );
  }));
  const label = concernKeys
    .map((key) => input.snapshot.clinic.concernList.find((item) => item.key === key)?.label)
    .find(Boolean);
  return label
    ? `您提到在意${label}；兩個方案內容不同，可接著比較單做與搭配的差異，或安排免費諮詢😊`
    : "兩個方案內容不同，可接著比較單做與搭配的差異，或安排免費諮詢😊";
}

function treatmentFactMode(plan: GeneratedReplyPlan) {
  if (plan.dialogueAct === "introduce_treatment") return "introduction" as const;
  if (plan.dialogueAct === "compare_options" || plan.dialogueAct === "address_objection") {
    return "comparison" as const;
  }
  return "followup" as const;
}

function rendererDialogueAct(plan: GeneratedReplyPlan): DialogueAct {
  if (plan.dialogueAct === "address_objection") return "handle_objection";
  return plan.dialogueAct;
}

function resolvedAffirmedKeys(
  mentions: TurnUnderstanding["treatments"] | TurnUnderstanding["concerns"],
) {
  return unique(
    mentions
      .filter((mention) =>
        mention.polarity === "affirmed" && mention.resolution === "resolved")
      .map((mention) => mention.key),
  );
}

function approvedAssetQuestionAspects(asset: TreatmentReplyAsset): ReadonlySet<QuestionAspect> {
  const aspect = asset.aspectKey?.trim().toLowerCase() ?? "";
  if (/(?:side_effect|sideeffect|risk)/u.test(aspect)) return new Set<QuestionAspect>(["side_effects"]);
  if (/(?:comfort|recovery|downtime)/u.test(aspect)) return new Set<QuestionAspect>(["comfort_recovery"]);
  if (/(?:combination|single)/u.test(aspect)) {
    return new Set<QuestionAspect>(["single_vs_combination", "combination_reason", "general_difference"]);
  }
  if (/(?:brand)/u.test(aspect)) return new Set<QuestionAspect>(["brands", "brand_difference"]);
  if (/(?:duration)/u.test(aspect)) return new Set<QuestionAspect>(["duration"]);
  if (/(?:session)/u.test(aspect)) return new Set<QuestionAspect>(["sessions"]);
  if (/(?:feature|mechanism|cooling)/u.test(aspect)) return new Set<QuestionAspect>(["mechanism"]);
  if (/(?:intro)/u.test(aspect)) return new Set<QuestionAspect>(["benefits", "mechanism"]);
  return new Set<QuestionAspect>(["benefits", "suitability"]);
}

/**
 * Resolve only the exact, snapshot-pinned approved asset selected by the
 * semantic layer.  The asset may supply content for an already-decided V2
 * action; it must never create or change the treatment/concern owner itself.
 */
function resolveApprovedReplyAsset(
  input: HydrateConversationV2ReplyInput,
  plan: GeneratedReplyPlan,
): TreatmentReplyAsset | undefined {
  const replyAssetId = input.turn.replyAssetId?.trim();
  if (
    !replyAssetId ||
    input.turn.semanticEvidence !== "approved_asset" ||
    input.turn.speechAct !== "ask_treatment_detail" ||
    input.turn.questionAspect !== plan.responseContext.questionAspect
  ) return undefined;

  const treatmentKeys = unique(plan.knowledgeQuery.treatmentKeys);
  const concernKeys = unique(plan.knowledgeQuery.concernKeys);
  const turnTreatmentKeys = resolvedAffirmedKeys(input.turn.treatments);
  const turnConcernKeys = resolvedAffirmedKeys(input.turn.concerns);
  // An asset only fills an already-grounded, singular content request. It must
  // not create an owner for a stale, ambiguous, or replay-injected turn.
  if (
    treatmentKeys.length !== 1 ||
    turnTreatmentKeys.length !== 1 ||
    turnTreatmentKeys[0] !== treatmentKeys[0]
  ) return undefined;

  const asset = buildTreatmentReplyAssets(input.snapshot.clinic).find(
    (candidate) => candidate.id === replyAssetId,
  );
  if (
    !asset ||
    !["detail", "quick"].includes(asset.kind) ||
    !asset.aspectKey ||
    !asset.customerCopy.trim() ||
    asset.treatmentKey !== treatmentKeys[0] ||
    !approvedAssetQuestionAspects(asset).has(input.turn.questionAspect)
  ) return undefined;

  if (asset.concernKey) {
    if (
      concernKeys.length !== 1 ||
      turnConcernKeys.length !== 1 ||
      concernKeys[0] !== asset.concernKey ||
      turnConcernKeys[0] !== concernKeys[0]
    ) return undefined;
  } else if (
    turnConcernKeys.length !== concernKeys.length ||
    turnConcernKeys.some((key) => !concernKeys.includes(key))
  ) {
    return undefined;
  }
  return asset;
}

/**
 * A reviewed combination is owned by the treatment pack that defines the
 * relationship. The companion treatment does not need to duplicate the same
 * paragraph. This resolves only when every named companion is explicitly
 * approved by that pack.
 */
function resolveApprovedCombinationReplyAsset(
  input: HydrateConversationV2ReplyInput,
  plan: GeneratedReplyPlan,
): TreatmentReplyAsset | undefined {
  if (
    !["single_vs_combination", "combination_reason"].includes(
      plan.responseContext.questionAspect,
    )
  ) return undefined;
  const treatmentKeys = unique(plan.knowledgeQuery.treatmentKeys);
  if (treatmentKeys.length < 2) return undefined;
  const concernKeys = new Set(plan.knowledgeQuery.concernKeys);
  const assets = buildTreatmentReplyAssets(input.snapshot.clinic);
  for (const treatmentKey of treatmentKeys) {
    const treatment = input.snapshot.clinic.treatmentList.find(
      (candidate) => candidate.key === treatmentKey,
    );
    const approvedCompanions = new Set(
      treatment?.consultationGuide?.approvedCombinationTreatmentKeys ?? [],
    );
    const companionKeys = treatmentKeys.filter((key) => key !== treatmentKey);
    if (
      companionKeys.length === 0 ||
      !companionKeys.every((key) => approvedCompanions.has(key))
    ) continue;
    const candidates = assets.filter((candidate) =>
      candidate.treatmentKey === treatmentKey &&
      candidate.customerCopy.trim() &&
      ["detail", "related"].includes(candidate.kind) &&
      (
        candidate.behaviors.includes("combination_comparison") ||
        /(?:combination|搭配)/iu.test(candidate.aspectKey ?? "") ||
        (
          candidate.kind === "related" &&
          Boolean(candidate.relatedTreatmentKey) &&
          companionKeys.includes(candidate.relatedTreatmentKey ?? "")
        )
      ) &&
      (!candidate.concernKey || concernKeys.size === 0 || concernKeys.has(candidate.concernKey))
    );
    const asset = candidates.find((candidate) => Boolean(candidate.priceRef)) ?? candidates[0];
    if (asset) return asset;
  }
  return undefined;
}

/**
 * Deterministic customer-visible copy for a resolved treatment.
 *
 * `resolution.facts` is a knowledge base for the model and carries internal field
 * labels ("療程名稱：X"), so it must never be sent to a customer. Only the approved
 * customer-facing intro copy plus the planned next question may be rendered here.
 * When approved copy is missing we fall back to the gap reply rather than exposing
 * the labelled facts.
 */
function approvedCustomerFallback(
  resolution: TreatmentKnowledgeResolution,
  nextQuestion: string | undefined,
  dialogueAct: GeneratedReplyPlan["dialogueAct"],
  questionAspect: QuestionAspect,
) {
  const approvedCopy = resolution.customerAspectReplies.length > 0
    ? resolution.customerAspectReplies.slice(0, 2)
    : dialogueAct === "recommend_direction" && resolution.customerConcernReplies.length > 0
      ? resolution.customerConcernReplies.slice(0, 2)
      : resolution.customerIntroReplies.slice(0, 2);
  if (approvedCopy.length === 0) return treatmentGapReply(resolution);
  // The approved intro is the answer to "what is this treatment", so it belongs to the
  // introduction turn only. Replaying it on every follow-up produced the dead end the
  // customer hit: three turns in a row returned the same paragraph. Later turns keep
  // at most one line of context and lead with the next step instead.
  if (dialogueAct !== "introduce_treatment") {
    if (resolution.customerAspectReplies.length > 0) {
      return unique([...approvedCopy, nextQuestion ?? ""]).join("\n");
    }
    // A concern-selection turn may use its approved explanation and follow-up. A
    // later restatement of the same treatment/concern should advance with the
    // planned question rather than replaying that explanation verbatim.
    if (dialogueAct === "recommend_direction" && resolution.customerConcernReplies.length > 0) {
      return unique([...approvedCopy, nextQuestion ?? ""]).join("\n");
    }
    // A direct benefits/mechanism question is a new information request, not
    // an accidental restart. When the treatment profile has no dedicated
    // aspect reply, answer from its approved intro before advancing instead
    // of returning only a generic follow-up question.
    if (
      ["benefits", "mechanism"].includes(questionAspect) &&
      resolution.customerIntroReplies.length > 0
    ) {
      return unique([
        ...resolution.customerIntroReplies.slice(0, 2),
        nextQuestion ?? "",
      ]).join("\n");
    }
    const advance = nextQuestion?.trim() ||
      "您想先了解這個部位可評估的方向，還是安排免費諮詢由醫師現場確認呢？";
    return advance;
  }
  return unique([...approvedCopy, nextQuestion ?? ""]).join("\n");
}

function bookingToolRequest(state: ConversationV2State): ConversationV2ToolRequest {
  return {
    bookingTask: {
      draft: {
        ...state.bookingTask.draft,
        timeSlots: [...state.bookingTask.draft.timeSlots],
        treatmentKeys: [...state.bookingTask.draft.treatmentKeys],
      },
      expectedField: state.bookingTask.expectedField,
      id: state.bookingTask.id,
      intent: state.bookingTask.intent,
      status: state.bookingTask.status,
    },
    type: "persist_booking_progress",
  };
}

function deterministicPlan(input: {
  action: string;
  dialogueAct: DialogueAct;
  matchedKey: string;
  replyText: string;
  responseContract: ResponseContractAttachment;
  requiresHuman?: boolean;
  richMessages?: RendererReplyPlan["richMessages"];
  exactPriceFacts?: string[];
}): RendererReplyPlan {
  return legacyDecisionToReplyPlan(
    {
      decisionType: input.requiresHuman
        ? "handoff_pending"
        : input.dialogueAct === "quote_approved_price"
          ? "pricing_auto_reply"
          : input.dialogueAct === "answer_clinic_info"
            ? "clinic_info_reply"
            : input.dialogueAct === "answer_safety"
              ? "medical_guidance_reply"
              : input.dialogueAct === "collect_booking" || input.dialogueAct === "manage_booking"
                ? "booking_intake_reply"
                : "fallback_reply",
      matchedKey: input.matchedKey,
      matchedType: input.requiresHuman ? "handoff_rule" : "config",
      replyMessages: input.richMessages,
      replyText: input.replyText,
    },
    {
      dialogueAct: input.dialogueAct,
      exactPriceFacts: input.exactPriceFacts,
      fallbackText: input.replyText,
      renderMode: "deterministic",
      responseContract: input.responseContract,
      requiresHuman: input.requiresHuman,
    },
  );
}

function factConfirmationRequest(
  domain: "clinic" | "price" | "treatment",
  keys: readonly string[],
  reason: string,
  priceApplicability?: PriceApplicabilityDimensions,
): ConversationV2ToolRequest {
  return {
    domain,
    keys: unique(keys),
    ...(priceApplicability ? { priceApplicability: { ...priceApplicability } } : {}),
    reason,
    type: "request_fact_confirmation",
  };
}

export async function hydrateConversationV2ReplyPlan(
  input: HydrateConversationV2ReplyInput,
  dependencies: HydrateConversationV2ReplyDependencies = {},
): Promise<HydratedConversationV2Reply> {
  const { replyPlan } = input.result;
  if (replyPlan.mode === "silent") {
    return {
      dataStatus: "ready",
      rendererPlan: null,
      snapshotId: input.snapshot.snapshotId,
      stateCommit: "commit",
    };
  }

  if (replyPlan.mode === "generated") {
    let treatmentResolution = resolveTreatmentKnowledge(input.snapshot, {
      excludedTreatmentKeys: replyPlan.responseContext.excludedTreatmentKeys,
      mode: treatmentFactMode(replyPlan),
      questionAspect: replyPlan.responseContext.questionAspect,
      query: replyPlan.knowledgeQuery,
    });
    const explicitBrand = replyPlan.knowledgeQuery.treatmentKeys.length === 1
      ? findTreatmentBrandInClinic(
          input.snapshot.clinic,
          input.turn.text,
          replyPlan.knowledgeQuery.treatmentKeys[0],
        )
      : null;
    if (explicitBrand) {
      const brandCopy = explicitBrand.customerReply.trim();
      treatmentResolution = {
        ...treatmentResolution,
        customerAspectReplies: unique([
          brandCopy,
          ...treatmentResolution.customerAspectReplies,
        ]),
        customerIntroReplies: replyPlan.responseContext.questionAspect === "overview"
          ? unique([brandCopy, ...treatmentResolution.customerIntroReplies])
          : treatmentResolution.customerIntroReplies,
        facts: unique([
          ...treatmentResolution.facts,
          `核准品牌身分：${explicitBrand.name}`,
        ]),
      };
    }
    const hasFacts = treatmentResolution.facts.length > 0;
    const hasResolutionGaps = treatmentResolution.gaps.length > 0;
    const hasUnknownGaps = treatmentResolution.gaps.some((gap) => gap.status === "unknown");
    const hasRequestedDataGaps = treatmentResolution.requestedDataGaps.length > 0;
    // A reviewed asset can fill a missing aspect only after the ordinary facts
    // resolver has confirmed that the treatment itself has no availability,
    // stale-source, or not-offered gap.  Real resolution gaps always win.
    const approvedReplyAsset = hasResolutionGaps
      ? undefined
      : resolveApprovedReplyAsset(input, replyPlan) ??
        resolveApprovedCombinationReplyAsset(input, replyPlan);
    const approvedAssetPriceResolution = approvedReplyAsset?.priceRef
      ? resolveApprovedPrice(input.snapshot, {
          campaignId: approvedReplyAsset.priceRef,
          kind: "campaign",
          treatmentKeys: replyPlan.knowledgeQuery.treatmentKeys,
        })
      : undefined;
    const approvedAssetPrice = approvedAssetPriceResolution?.status === "approved_current"
      ? approvedAssetPriceResolution
      : undefined;
    const approvedAssetFacts = approvedReplyAsset
      ? unique([
          approvedReplyAsset.customerCopy,
          ...(approvedAssetPrice?.customerFacts ?? []),
        ])
      : [];
    const consultationInvitationPaused = approvedReplyAsset
      ? isConsultationInvitationPaused(input.nextState, [approvedReplyAsset.treatmentKey])
      : false;
    const approvedAssetNextQuestion = consultationInvitationPaused
      ? "😊 可以繼續告訴我想了解的療程細節，我會接著幫您整理。"
      : approvedReplyAsset?.followup ?? replyPlan.nextQuestion;
    const hasApprovedAnswer = hasFacts || approvedAssetFacts.length > 0;
    const hasUnresolvedRequestedData = hasRequestedDataGaps && !approvedReplyAsset;
    const partialInstruction = treatmentResolution.profileCompleteness === "partial"
      ? "請自然介紹目前已確認的方向；不得宣稱這是完整院內清單，也不得把缺資料解讀為院內沒有提供。"
      : "";
    // A data gap changes what we say, never how we say it: the deterministic text is
    // always approved customer-facing copy plus the gap explanation. Labelled facts
    // stay in `approvedFacts` for the model only.
    const gapCustomerCopy = treatmentResolution.customerAspectReplies.length > 0
      ? treatmentResolution.customerAspectReplies.slice(0, 1)
      : replyPlan.dialogueAct === "recommend_direction" &&
        treatmentResolution.customerConcernReplies.length > 0
      ? treatmentResolution.customerConcernReplies.slice(0, 1)
      : replyPlan.dialogueAct === "introduce_treatment"
        ? treatmentResolution.customerIntroReplies.slice(0, 1)
        : [];
    const fallbackText = approvedReplyAsset
      ? unique([
          approvedReplyAsset.customerCopy,
          approvedAssetPrice
            ? `💰 ${approvedAssetPrice.customerPriceText}。${approvedAssetPrice.branchScope ? `\n${approvedAssetPrice.branchScope}。` : ""}`
            : "",
          approvedAssetNextQuestion ?? "",
        ]).join("\n")
      : hasResolutionGaps || hasRequestedDataGaps
      ? unique([
          ...gapCustomerCopy,
          hasResolutionGaps
            ? treatmentGapReply(treatmentResolution)
            : treatmentProfileGapReply(treatmentResolution),
        ]).join("\n")
      : approvedCustomerFallback(
        treatmentResolution,
        replyPlan.nextQuestion,
        replyPlan.dialogueAct,
        replyPlan.responseContext.questionAspect,
      );
    const rendererPlan = legacyDecisionToReplyPlan(
      {
        decisionType: hasApprovedAnswer ? "treatment_intro_reply" : "fallback_reply",
        matchedKey: `conversation_v2:${replyPlan.action}`,
        matchedType: "config",
        replyText: fallbackText,
      },
      {
        approvedFacts: unique([...treatmentResolution.facts, ...approvedAssetFacts]),
        approvedKnowledge: unique([...treatmentResolution.facts, ...approvedAssetFacts]),
        concernKeys: replyPlan.knowledgeQuery.concernKeys,
        dialogueAct: hasApprovedAnswer && !hasResolutionGaps && !hasUnresolvedRequestedData
          ? rendererDialogueAct(replyPlan)
          : "clarify",
        exactPriceFacts: approvedAssetPrice?.customerFacts ?? [],
        fallbackText,
        knowledgeSource: "turn_snapshot",
        nextQuestion: approvedAssetNextQuestion,
        prohibitedClaims: [
          ...DEFAULT_PROHIBITED_CLAIMS,
          "不得把資料未載入、未審核或查詢失敗解讀為院內未提供",
        ],
        renderMode: hasApprovedAnswer && !hasResolutionGaps && !hasUnresolvedRequestedData
          ? "generated"
          : "deterministic",
        responseContract: replyPlan.responseContract,
        strategyInstructions: unique([replyPlan.objective, partialInstruction]),
        treatmentKeys: treatmentResolution.resolvedTreatmentKeys,
      },
    );
    return {
      dataStatus: treatmentResolution.profileCompleteness === "complete"
        ? "ready"
        : treatmentResolution.profileCompleteness === "partial"
          ? "partial"
          : "unresolved",
      rendererPlan,
      snapshotId: input.snapshot.snapshotId,
      stateCommit: "commit",
      ...(!hasUnknownGaps && (!hasRequestedDataGaps || Boolean(approvedReplyAsset))
        ? {}
        : {
            toolRequest: factConfirmationRequest(
              "treatment",
              hasUnknownGaps
                ? treatmentResolution.gaps.filter((gap) => gap.status === "unknown").map((gap) => gap.key)
                : treatmentResolution.requestedDataGaps.map((gap) => gap.treatmentKey),
              hasUnknownGaps
                ? treatmentResolution.gaps.find((gap) => gap.status === "unknown")?.reason ?? "not_configured"
                : `missing_requested_fields:${treatmentResolution.requestedDataGaps.flatMap((gap) => gap.fields).join(",")}`,
            ),
          }),
      treatmentResolution,
    };
  }

  if (replyPlan.dialogueAct === "answer_price" && replyPlan.pricingQuery) {
    const priceResolution = resolveApprovedPrice(input.snapshot, replyPlan.pricingQuery);
    const genericBotoxAlternative =
      priceResolution.status !== "approved_current" &&
      replyPlan.pricingQuery.treatmentKeys.length === 1 &&
      replyPlan.pricingQuery.treatmentKeys[0] === "botox" &&
      Boolean(replyPlan.pricingQuery.applicability?.variant)
        ? resolveApprovedPrice(input.snapshot, {
            kind: "unspecified",
            treatmentKeys: ["botox"],
          })
        : undefined;
    const contextualCampaignId = contextualPriceCampaignId(input);
    const contextualPriceResolution = contextualCampaignId
      ? resolveApprovedPrice(input.snapshot, {
          ...replyPlan.pricingQuery,
          campaignId: contextualCampaignId,
        })
      : undefined;
    const approvedCombinationResolution = approvedCombinationPriceResolution(
      input,
      replyPlan.pricingQuery.treatmentKeys,
    );
    const alternativePriceResolution =
      genericBotoxAlternative?.status === "approved_current"
        ? genericBotoxAlternative
        : contextualPriceResolution?.status === "approved_current"
          ? contextualPriceResolution
          : approvedCombinationResolution;
    const hasDistinctAlternative =
      priceResolution.status === "approved_current" &&
      alternativePriceResolution?.status === "approved_current" &&
      alternativePriceResolution.campaignId !== priceResolution.campaignId;
    const replyText = priceResolution.status === "approved_current"
      ? hasDistinctAlternative
        ? unique([
            `🟢 ${customerPriceReply(input.snapshot, priceResolution)}`,
            `💎 另有搭配方案：${alternativePriceResolution.customerPriceText}。${alternativePriceResolution.branchScope ? `\n${alternativePriceResolution.branchScope}。` : ""}`,
            priceConcernFollowup(input),
          ]).join("\n")
        : customerPriceReply(input.snapshot, priceResolution)
      : alternativePriceResolution?.status === "approved_current"
        ? unique([
            priceGapReply(priceResolution),
            `💰 另有可直接參考的方案：${alternativePriceResolution.customerPriceText}。${alternativePriceResolution.branchScope ? `\n${alternativePriceResolution.branchScope}。` : ""}`,
            `📅 如果您願意，我可以先幫您整理免費諮詢需求，品牌方案價格再由真人客服協助確認。\n${input.snapshot.clinic.humanSupportHours.fallbackSummary}`,
          ]).join("\n\n")
        : priceGapReply(priceResolution);
    return {
      ...(alternativePriceResolution ? { alternativePriceResolution } : {}),
      dataStatus: priceResolution.status === "approved_current" ? "ready" : "unresolved",
      priceResolution,
      rendererPlan: deterministicPlan({
        action: replyPlan.action,
        dialogueAct: "quote_approved_price",
        exactPriceFacts: priceResolution.status === "approved_current"
          ? unique([
              ...priceResolution.customerFacts,
              ...(hasDistinctAlternative && alternativePriceResolution.status === "approved_current"
                ? alternativePriceResolution.customerFacts
                : []),
            ])
          : [],
        matchedKey: priceResolution.status === "approved_current"
          ? "conversation_v2:price:approved_current"
          : `conversation_v2:price:unavailable_to_quote:${priceResolution.reason}`,
        replyText,
        responseContract: replyPlan.responseContract,
      }),
      snapshotId: input.snapshot.snapshotId,
      stateCommit: "commit",
      ...(priceResolution.status === "approved_current"
        ? {}
        : {
            toolRequest: factConfirmationRequest(
              "price",
              replyPlan.pricingQuery.treatmentKeys,
              priceResolution.reason,
              replyPlan.pricingQuery.applicability,
            ),
          }),
    };
  }

  if (replyPlan.dialogueAct === "answer_clinic_info") {
    const topic = String(replyPlan.templateVariables.topic ?? "general");
    let clinicInfoResolution = resolveClinicInfo(input.snapshot, {
      message: input.turn.text,
      topic,
    });
    let doctorSchedule: DoctorScheduleDecision | null = null;
    if (
      clinicInfoResolution.status === "unknown" &&
      clinicInfoResolution.reason === "tool_required" &&
      dependencies.resolveDoctorSchedule
    ) {
      doctorSchedule = await dependencies.resolveDoctorSchedule({
        message: input.turn.text,
        now: input.snapshot.asOf,
      });
      if (doctorSchedule) {
        clinicInfoResolution = {
          customerFacts: [doctorSchedule.replyText],
          provenance: clinicInfoResolution.provenance,
          status: "resolved",
          topic,
        };
      }
    }
    const replyText = clinicInfoResolution.status === "resolved"
      ? clinicInfoResolution.customerFacts.join("\n")
      : clinicInfoResolution.reason === "branch_required"
        ? "想確認您要查哪一個館別呢？"
        : "這項診所資訊目前還在確認中，我先請真人客服補充；您也可以先告訴我想查的館別或醫師。";
    return {
      clinicInfoResolution,
      dataStatus: clinicInfoResolution.status === "resolved" ? "ready" : "unresolved",
      rendererPlan: deterministicPlan({
        action: replyPlan.action,
        dialogueAct: "answer_clinic_info",
        matchedKey: `conversation_v2:clinic:${topic}:${clinicInfoResolution.status}`,
        replyText,
        responseContract: replyPlan.responseContract,
        richMessages: doctorSchedule?.replyMessages,
      }),
      snapshotId: input.snapshot.snapshotId,
      stateCommit: "commit",
      ...(clinicInfoResolution.status === "resolved" || clinicInfoResolution.reason === "branch_required"
        ? {}
        : {
            toolRequest: factConfirmationRequest("clinic", [topic], clinicInfoResolution.reason),
          }),
    };
  }

  if (replyPlan.dialogueAct === "collect_booking" || replyPlan.dialogueAct === "manage_booking") {
    const requestedTreatmentKeys = input.nextState.bookingTask.draft.treatmentKeys;
    const treatmentChecks = requestedTreatmentKeys.map((key) =>
      resolveTreatmentFact(input.snapshot, key, "followup"));
    const treatmentGap = treatmentChecks.find((result) => result.status !== "offered");
    if (treatmentGap) {
      const replyText = treatmentGap.status === "not_offered"
        ? "目前核准資料顯示院內沒有提供這項療程，我先不收預約資料。您可以告訴我想改善的部位或困擾，我再整理院內可評估方向。"
        : "這項療程的院內提供資料目前還在確認中，我先不收預約資料。您可以告訴我想改善的部位或困擾，我會先整理需求並請真人客服確認。";
      return {
        dataStatus: "unresolved",
        rendererPlan: deterministicPlan({
          action: replyPlan.action,
          dialogueAct: "clarify",
          matchedKey: `conversation_v2:booking:treatment:${treatmentGap.status}`,
          replyText,
          responseContract: replyPlan.responseContract,
        }),
        snapshotId: input.snapshot.snapshotId,
        stateCommit: "hold",
        ...(treatmentGap.status === "unknown"
          ? {
              toolRequest: factConfirmationRequest(
                "treatment",
                [treatmentGap.key],
                treatmentGap.reason,
              ),
            }
          : {}),
      };
    }
    const expectedField = input.nextState.bookingTask.expectedField;
    const replyText = expectedField
      ? BOOKING_PROMPTS[expectedField]
      : `已收到您提供的預約資料，真人客服會接續確認可預約時段；目前尚未完成預約。\n${input.snapshot.clinic.humanSupportHours.fallbackSummary}`;
    return {
      dataStatus: "ready",
      rendererPlan: deterministicPlan({
        action: replyPlan.action,
        dialogueAct: replyPlan.dialogueAct,
        matchedKey: input.nextState.bookingTask.intent === "modify"
          ? "booking_modify_request"
          : input.nextState.bookingTask.intent === "cancel"
            ? "booking_cancel_request"
            : "booking_intake",
        replyText,
        responseContract: replyPlan.responseContract,
      }),
      snapshotId: input.snapshot.snapshotId,
      stateCommit: "commit",
      toolRequest: bookingToolRequest(input.nextState),
    };
  }

  if (replyPlan.dialogueAct === "handoff") {
    const action = input.result.action;
    const handoffId = action.type === "queue_handoff" ? action.handoffId : `${input.nextState.episodeId}:${replyPlan.sourceTurnId}:handoff`;
    const reason = action.type === "queue_handoff" ? action.reason : "customer_requested_human";
    const replyText = `好的，我已幫您通知真人客服接手，客服會在服務時間內接續協助。\n${input.snapshot.clinic.humanSupportHours.fallbackSummary}`;
    return {
      dataStatus: "ready",
      rendererPlan: deterministicPlan({
        action: replyPlan.action,
        dialogueAct: "handoff",
        matchedKey: `conversation_v2:handoff:${reason}`,
        replyText,
        responseContract: replyPlan.responseContract,
        requiresHuman: true,
      }),
      snapshotId: input.snapshot.snapshotId,
      stateCommit: "commit",
      toolRequest: { handoffId, reason, type: "queue_handoff" },
    };
  }

  if (replyPlan.dialogueAct === "answer_safety") {
    return {
      dataStatus: "ready",
      rendererPlan: deterministicPlan({
        action: replyPlan.action,
        dialogueAct: "answer_safety",
        matchedKey: "conversation_v2:urgent_safety",
        replyText: "若有呼吸困難、持續出血、嚴重疼痛或意識異常，請立即撥打 119；其他術後不適也請直接聯絡診所，由真人協助。",
        responseContract: replyPlan.responseContract,
      }),
      snapshotId: input.snapshot.snapshotId,
      stateCommit: "commit",
    };
  }

  const prompt = replyPlan.nextQuestion ?? String(replyPlan.templateVariables.prompt ?? "想確認一下，您目前最想了解哪個部分呢？");
  return {
    dataStatus: "ready",
    rendererPlan: deterministicPlan({
      action: replyPlan.action,
      dialogueAct: "clarify",
      matchedKey: `conversation_v2:${replyPlan.templateKey}`,
      replyText: prompt,
      responseContract: replyPlan.responseContract,
    }),
    snapshotId: input.snapshot.snapshotId,
    stateCommit: "commit",
  };
}
