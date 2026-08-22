import type {
  PriceApplicabilityDimensions,
  PriceFactResolution,
  TreatmentKnowledgeResolution,
} from "@/lib/clinic-facts";

export type ConversationV2FactDomain = "clinic" | "price" | "treatment";

export type ConversationV2ToolRequest =
  | {
      bookingTask: {
        draft: {
          appointmentReference?: string;
          branch?: string;
          changeRequest?: string;
          firstVisit?: boolean;
          name?: string;
          phone?: string;
          timeSlots: string[];
          treatmentKeys: string[];
        };
        expectedField?: string;
        id?: string;
        intent: "create" | "modify" | "cancel" | "none";
        status: "inactive" | "collecting" | "suspended" | "completed";
      };
      type: "persist_booking_progress";
    }
  | {
      handoffId: string;
      reason: string;
      type: "queue_handoff";
    }
  | {
      domain: ConversationV2FactDomain;
      keys: string[];
      priceApplicability?: PriceApplicabilityDimensions;
      reason: string;
      /** Data confirmation does not pause AI or replace the active dialogue task. */
      type: "request_fact_confirmation";
    };

export function treatmentGapReply(resolution: TreatmentKnowledgeResolution) {
  const explicitlyUnavailable = resolution.gaps.some((gap) => gap.status === "not_offered");
  const needsConfirmation = resolution.gaps.some((gap) => gap.status === "unknown");
  if (explicitlyUnavailable && needsConfirmation) {
    return "您問的項目中，有一部分是院內明確未提供，另一部分的院內提供資訊仍待確認。我先不替缺資料的項目做比較，可以依您的部位或困擾整理已確認的方向。";
  }
  if (explicitlyUnavailable) {
    return "目前核准資料顯示院內沒有提供這個項目。您可以告訴我最在意的部位或困擾，我再從已確認的院內療程整理相近方向。";
  }
  return "這項療程的院內提供資訊目前還在確認中，我先不猜內容。您可以告訴我最想改善的部位或困擾，我會先整理需求並請真人客服補充。";
}

export function treatmentProfileGapReply(resolution: TreatmentKnowledgeResolution) {
  const labels: Record<string, string> = {
    approved_intro: "基本介紹",
    brand_information: "品牌資訊",
    combination_guidance: "搭配差異",
    comfort_recovery: "療程感受與恢復期",
    expected_directions: "改善方向",
    human_review_required: "需由真人評估的內容",
    mechanism: "作用原理",
    requested_content: "您詢問的細節",
  };
  const fields = Array.from(new Set(
    resolution.requestedDataGaps.flatMap((gap) =>
      gap.fields.map((field) => labels[field] ?? "您詢問的細節")),
  ));
  return `目前核准資料還沒有這個面向的完整內容（${fields.join("、")}），我先不自行補寫。您可以換一個想了解的重點，或由真人客服補充確認。`;
}

export function priceGapReply(resolution: PriceFactResolution) {
  if (resolution.status === "approved_current") return "";
  if (resolution.reason === "treatment_not_offered") {
    return "目前核准資料顯示院內沒有提供這項療程，因此不會提供該項價格。您可以告訴我想改善的部位或困擾，我再整理院內可評估方向。";
  }
  if (resolution.reason === "treatment_unconfirmed") {
    return "這項療程的院內提供資料目前還在確認中，我先不猜價格；您可以先告訴我想改善的部位或困擾，我會整理需求並請真人客服確認。";
  }
  if (resolution.reason === "ambiguous") {
    return "目前查到不只一筆可能的核准方案，為避免報錯，我先請真人客服確認正確價格；您也可以告訴我想做的部位或方案。";
  }
  if (resolution.reason === "branch_required") {
    return "這筆核准價格只適用特定館別，請先告訴我想前往的館別，我再確認是否適用，避免把別館價格報給您。";
  }
  if (resolution.reason === "applicability_required") {
    return "這筆核准價格有指定品牌、規格或堂數，請先告訴我您詢問的內容；也可以先安排免費諮詢，真人客服會在上班時間協助確認報價。";
  }
  if (resolution.reason === "applicability_mismatch") {
    return "目前沒有您詢問品牌或規格的核准價格，我先不套用其他方案；可以先安排免費諮詢，真人客服會在上班時間協助確認報價。";
  }
  if (resolution.reason === "expired" || resolution.reason === "not_yet_effective") {
    return "目前沒有可直接提供的有效核准價格，我先不沿用舊活動或尚未生效的內容；真人客服確認後會再協助您。";
  }
  return "目前這項療程還沒有可直接提供的核准價格，我先不猜價；可以先安排免費諮詢，真人客服會在上班時間協助確認報價。";
}
