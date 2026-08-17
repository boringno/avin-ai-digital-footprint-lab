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
import {
  DEFAULT_PROHIBITED_CLAIMS,
  legacyDecisionToReplyPlan,
  type DialogueAct,
  type ReplyPlan as RendererReplyPlan,
} from "@/lib/reply-plan";

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

type DoctorScheduleDecision = {
  replyMessages?: RendererReplyPlan["richMessages"];
  replyText: string;
};

export type HydratedConversationV2Reply = {
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

function generatedFallback(
  resolution: TreatmentKnowledgeResolution,
  nextQuestion: string | undefined,
) {
  if (resolution.facts.length === 0) return treatmentGapReply(resolution);
  return unique([
    ...resolution.facts.slice(0, 2),
    nextQuestion ?? "",
  ]).join("\n");
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
    const treatmentResolution = resolveTreatmentKnowledge(input.snapshot, {
      excludedTreatmentKeys: replyPlan.responseContext.excludedTreatmentKeys,
      mode: treatmentFactMode(replyPlan),
      questionAspect: replyPlan.responseContext.questionAspect,
      query: replyPlan.knowledgeQuery,
    });
    const hasFacts = treatmentResolution.facts.length > 0;
    const hasResolutionGaps = treatmentResolution.gaps.length > 0;
    const hasUnknownGaps = treatmentResolution.gaps.some((gap) => gap.status === "unknown");
    const hasRequestedDataGaps = treatmentResolution.requestedDataGaps.length > 0;
    const partialInstruction = treatmentResolution.profileCompleteness === "partial"
      ? "請自然介紹目前已確認的方向；不得宣稱這是完整院內清單，也不得把缺資料解讀為院內沒有提供。"
      : "";
    const fallbackText = hasFacts && (hasResolutionGaps || hasRequestedDataGaps)
      ? unique([
          ...treatmentResolution.facts.slice(0, 2),
          hasResolutionGaps
            ? treatmentGapReply(treatmentResolution)
            : treatmentProfileGapReply(treatmentResolution),
        ]).join("\n")
      : generatedFallback(treatmentResolution, replyPlan.nextQuestion);
    const rendererPlan = legacyDecisionToReplyPlan(
      {
        decisionType: hasFacts ? "treatment_intro_reply" : "fallback_reply",
        matchedKey: `conversation_v2:${replyPlan.action}`,
        matchedType: "config",
        replyText: fallbackText,
      },
      {
        approvedFacts: treatmentResolution.facts,
        approvedKnowledge: treatmentResolution.facts,
        concernKeys: replyPlan.knowledgeQuery.concernKeys,
        dialogueAct: hasFacts && !hasResolutionGaps && !hasRequestedDataGaps
          ? rendererDialogueAct(replyPlan)
          : "clarify",
        fallbackText,
        knowledgeSource: "turn_snapshot",
        nextQuestion: replyPlan.nextQuestion,
        prohibitedClaims: [
          ...DEFAULT_PROHIBITED_CLAIMS,
          "不得把資料未載入、未審核或查詢失敗解讀為院內未提供",
        ],
        renderMode: hasFacts && !hasResolutionGaps && !hasRequestedDataGaps
          ? "generated"
          : "deterministic",
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
      ...(!hasUnknownGaps && !hasRequestedDataGaps
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
    const replyText = priceResolution.status === "approved_current"
      ? `${priceResolution.customerFacts.join("，")}。`
      : priceGapReply(priceResolution);
    return {
      dataStatus: priceResolution.status === "approved_current" ? "ready" : "unresolved",
      priceResolution,
      rendererPlan: deterministicPlan({
        action: replyPlan.action,
        dialogueAct: "quote_approved_price",
        exactPriceFacts: priceResolution.status === "approved_current"
          ? priceResolution.customerFacts
          : [],
        matchedKey: `conversation_v2:price:${priceResolution.status}`,
        replyText,
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
      : "已收到您提供的預約資料，真人客服會接續確認可預約時段；目前尚未完成預約。";
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
    const replyText = "好的，我已幫您通知真人客服接手，客服會在服務時間內接續協助。";
    return {
      dataStatus: "ready",
      rendererPlan: deterministicPlan({
        action: replyPlan.action,
        dialogueAct: "handoff",
        matchedKey: `conversation_v2:handoff:${reason}`,
        replyText,
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
    }),
    snapshotId: input.snapshot.snapshotId,
    stateCommit: "commit",
  };
}
