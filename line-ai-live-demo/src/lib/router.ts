import {
  clinicConfig,
  findAnyBranchByMessage,
  findBranchByMessage,
  findTreatmentByMessage,
  listActiveBranches,
  normalizeClinicText,
} from "@/lib/clinic-config";
import type { ConversationContext } from "@/lib/conversation-context";
import { createEmptyConversationContext } from "@/lib/conversation-context";
import { resolveDoctorScheduleDecision } from "@/lib/doctor-schedule";
import { getHumanSupportStatus } from "@/lib/human-support";
import { loadSeedData, type FaqEntry, type PregnancyRule, type PricingCampaign } from "@/lib/seed-loader";
import {
  buildTreatmentCarouselMessage,
  getTreatmentCarouselReplyText,
  isTreatmentCarouselRequest,
  type LineReplyMessage,
} from "@/lib/treatment-carousel";

type DecisionType =
  | "clinic_info_reply"
  | "treatment_intro_reply"
  | "booking_intake_reply"
  | "medical_guidance_reply"
  | "pricing_auto_reply"
  | "doctor_schedule_auto_reply"
  | "handoff_pending"
  | "faq_auto_reply"
  | "fallback_reply";

type MatchedType =
  | "config"
  | "faq_entry"
  | "guided_reply"
  | "pricing_campaign"
  | "doctor_schedule"
  | "handoff_rule"
  | "generic_fallback";

type PregnancyContext = "pregnant" | "breastfeeding" | "trying_to_conceive";

type RouteCustomerMessageInput = {
  conversationContext?: ConversationContext;
  includePending: boolean;
  message: string;
  now?: Date;
};

type BookingFieldKey = "branch" | "isFirstVisit" | "name" | "phone" | "timeSlots" | "treatment";

export type RouterDecision = {
  decisionType: DecisionType;
  matchedKey: string;
  matchedType: MatchedType;
  nextContext: ConversationContext;
  replyMessages?: LineReplyMessage[];
  replyText: string;
};

const CAPABILITY_TERMS = [
  "你是誰",
  "你可以回答什麼",
  "你能回答什麼",
  "你可以幫我做什麼",
  "你能幫我做什麼",
  "你可以做什麼",
  "你們可以幫我做什麼",
  "我可以問什麼",
  "可以問什麼",
  "能問什麼",
  "你有什麼功能",
];

const ADDRESS_TERMS = ["地址", "在哪", "位置", "哪裡", "怎麼去"];
const APPOINTMENT_TERMS = ["預約", "想約", "安排時間", "安排療程", "諮詢", "可約", "想做"];
const BOOKING_CANCEL_TERMS = ["取消預約", "取消這次預約", "先取消", "取消掉", "不約了", "先不要約", "取消這次"];
const BOOKING_MODIFY_TERMS = ["改約", "改時間", "改期", "改日期", "換時間", "換日期", "改成", "改到", "調時間", "改館別", "換館別"];
const BRANCH_LIST_TERMS = ["幾間", "館別", "管別", "分館", "分店", "據點", "門市"];
const BUSINESS_HOUR_TERMS = ["營業時間", "營業到幾點", "幾點關", "幾點開", "上班時間", "服務時間"];
const FIRST_VISIT_TERMS = ["第一次", "初診", "要準備什麼", "需要準備什麼"];
const NEAREST_BRANCH_TERMS = ["最近", "哪一間", "哪間", "離我最近"];
const PAYMENT_TERMS = ["付款", "刷卡", "轉帳", "匯款", "現金", "信用卡"];
const PHONE_TERMS = ["電話", "聯絡方式", "專線"];
const PRICE_TERMS = ["價格", "價位", "費用", "方案", "活動", "優惠", "多少錢", "報價", "體驗價"];
const SUPPORT_HOURS_TERMS = ["真人客服", "客服時間", "客服幾點", "有人嗎"];
const TRANSPORT_TERMS = ["交通", "怎麼去", "停車", "捷運"];
const WHOLE_BRANCH_ONLY_TERMS = ["高雄館", "台中館", "桃園館", "林口館", "台南館", "台北館", "高雄", "台中", "桃園", "林口", "台南", "台北"];
const EFFECT_GUARANTEE_TERMS = ["保證有效", "一定有效", "保證改善", "一定會改善", "保證有感", "一定有感", "效果保證"];
const PRICE_COMMITMENT_TERMS = ["固定價", "保證最低價", "最低價", "一定多少錢", "保證多少錢", "先報死價", "直接報價"];
const TREATMENT_DISCOVERY_TERMS = [
  "療程",
  "功效",
  "效果",
  "介紹",
  "是什麼",
  "可以做嗎",
  "品牌",
  "牌子",
  "恢復期",
  "修復期",
  "術後",
  "維持多久",
  "痛嗎",
  "副作用",
  "適合",
];

const CUSTOMER_ACCOUNT_TERMS = ["會員", "紀錄", "姓名", "電話", "帳號", "查詢個資", "我的資料"];
const DOCTOR_SCHEDULE_TERMS = ["醫師", "門診", "看診", "班表"];

const PREGNANCY_TERMS = {
  breastfeeding: ["哺乳", "餵奶", "親餵", "母乳"],
  pregnant: ["懷孕", "孕婦", "孕期", "有孕"],
  trying_to_conceive: ["備孕", "準備懷孕", "想懷孕", "試管"],
} satisfies Record<PregnancyContext, string[]>;

const POST_PROCEDURE_TERMS = clinicConfig.escalationPolicy.postProcedureAlertTerms;
const HUMAN_REQUEST_TERMS = clinicConfig.escalationPolicy.humanRequestTerms;
const PERSONALIZED_CONSULT_TERMS = clinicConfig.escalationPolicy.personalizedConsultTerms;
const SERIOUS_COMPLAINT_TERMS = clinicConfig.escalationPolicy.seriousComplaintTerms;
const ALL_TREATMENT_TERMS = clinicConfig.treatmentList.flatMap((treatment) => [treatment.name, ...treatment.aliases]);

function normalizeText(text: string) {
  return text.replace(/[\s\p{P}\p{S}]+/gu, "").trim().toLowerCase();
}

function cloneContext(context: ConversationContext | undefined) {
  const baseContext = context ?? createEmptyConversationContext("");
  return {
    ...baseContext,
    bookingDraft: {
      branch: baseContext.bookingDraft.branch,
      isFirstVisit: baseContext.bookingDraft.isFirstVisit,
      name: baseContext.bookingDraft.name,
      phone: baseContext.bookingDraft.phone,
      requestedTimeSlots: [...(baseContext.bookingDraft.requestedTimeSlots ?? [])],
      timeSlots: [...baseContext.bookingDraft.timeSlots],
      treatment: baseContext.bookingDraft.treatment,
    },
  };
}

function includesAnyTerm(message: string, terms: string[]) {
  const normalizedMessage = normalizeText(message);
  return terms.some((term) => normalizedMessage.includes(normalizeText(term)));
}

function isTreatmentLikeMessage(message: string) {
  return includesAnyTerm(message, [...ALL_TREATMENT_TERMS, ...TREATMENT_DISCOVERY_TERMS]);
}

function isHardBlockedQuestion(message: string) {
  return (
    includesAnyTerm(message, POST_PROCEDURE_TERMS) ||
    includesAnyTerm(message, PERSONALIZED_CONSULT_TERMS) ||
    includesAnyTerm(message, EFFECT_GUARANTEE_TERMS) ||
    (includesAnyTerm(message, PRICE_TERMS) && includesAnyTerm(message, PRICE_COMMITMENT_TERMS))
  );
}

export function shouldAllowAiFallbackReply(message: string) {
  return !(
    Boolean(findAnyBranchByMessage(message)) ||
    isTreatmentLikeMessage(message) ||
    includesAnyTerm(message, [...PREGNANCY_TERMS.pregnant, ...PREGNANCY_TERMS.breastfeeding, ...PREGNANCY_TERMS.trying_to_conceive]) ||
    includesAnyTerm(message, PRICE_TERMS) ||
    includesAnyTerm(message, DOCTOR_SCHEDULE_TERMS) ||
    isHardBlockedQuestion(message)
  );
}

function isEnabled(value: string, includePending: boolean) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "active" || normalized === "enabled") {
    return true;
  }
  return includePending && (normalized === "pending" || normalized === "draft");
}

function isApproved(value: string, includePending: boolean) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "approved" || normalized === "stable" || normalized === "") {
    return true;
  }
  return includePending && (normalized === "pending" || normalized === "review");
}

function isSeedRowUsable(isActive: string, approvalStatus: string, includePending: boolean) {
  return isEnabled(isActive, includePending) && isApproved(approvalStatus, includePending);
}

function matchFaq(message: string, faqEntries: FaqEntry[], includePending: boolean) {
  const normalizedMessage = normalizeText(message);

  return [...faqEntries]
    .filter((entry) => isSeedRowUsable(entry.is_active, entry.approval_status, includePending))
    .sort((left, right) => right.question_pattern.length - left.question_pattern.length)
    .find((entry) => {
      const pattern = normalizeText(entry.question_pattern);
      return (
        normalizedMessage === pattern ||
        normalizedMessage.includes(pattern) ||
        (normalizedMessage.length >= 4 && pattern.includes(normalizedMessage))
      );
    });
}

function parseOptionalDate(value: string, endOfDay = false) {
  if (!value.trim()) {
    return null;
  }

  const suffix = endOfDay ? "T23:59:59.999" : "T00:00:00.000";
  const parsed = new Date(`${value.trim()}${suffix}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function campaignIsActive(campaign: PricingCampaign, today: Date) {
  const startDate = parseOptionalDate(campaign.start_date);
  const endDate = parseOptionalDate(campaign.end_date, true);

  if (!startDate || !endDate) {
    return false;
  }

  return startDate.getTime() <= today.getTime() && today.getTime() <= endDate.getTime();
}

function matchPricing(message: string, pricingCampaigns: PricingCampaign[], includePending: boolean, today: Date) {
  const normalizedMessage = normalizeText(message);

  return pricingCampaigns
    .filter((campaign) => isSeedRowUsable(campaign.is_active, campaign.approval_status, includePending))
    .filter((campaign) => campaignIsActive(campaign, today))
    .sort((left, right) => right.treatment_name.length - left.treatment_name.length)
    .find((campaign) => {
      const treatment = normalizeText(campaign.treatment_name);
      const campaignName = normalizeText(campaign.campaign_name);
      return normalizedMessage.includes(treatment) || (campaignName && normalizedMessage.includes(campaignName));
    });
}

function findBranchByName(name: string | undefined) {
  if (!name) {
    return null;
  }

  return clinicConfig.branches.find((branch) => branch.name === name) ?? null;
}

function resolvePreferredBranchFromContext(message: string, context: ConversationContext) {
  return (
    findBranchByMessage(message) ??
    findBranchByName(context.bookingDraft.branch) ??
    findBranchByName(context.preferredBranch) ??
    findBranchByName(context.lastReferencedBranch)
  );
}

function updateContextEntities(message: string, context: ConversationContext) {
  const matchedBranch = findBranchByMessage(message);
  const matchedTreatment = findTreatmentByMessage(message);

  if (matchedBranch) {
    context.locationPreference = matchedBranch.city;
    context.preferredBranch = matchedBranch.name;
    context.lastReferencedBranch = matchedBranch.name;
    context.bookingDraft.branch = context.bookingDraft.branch || matchedBranch.name;
  }

  if (matchedTreatment) {
    context.lastReferencedTreatment = matchedTreatment.name;
    context.bookingDraft.treatment = context.bookingDraft.treatment || matchedTreatment.name;
  }

  return {
    matchedBranch,
    matchedTreatment,
  };
}

function extractPhone(message: string) {
  const match = message.match(/09\d{8}/);
  return match?.[0];
}

function extractName(message: string) {
  const match = message.match(/(?:我叫|我是|稱呼我|名字是)\s*([^\s，。,！!？?\n]+)/);
  return match?.[1];
}

function extractBookingName(message: string) {
  const explicitMatch = message.match(/(?:我叫|名字是|稱呼我)\s*([A-Za-z0-9\u4e00-\u9fff_-]{1,20})/);
  if (explicitMatch?.[1]) {
    return explicitMatch[1];
  }

  const fallbackMatch = message.match(/我是\s*([A-Za-z0-9\u4e00-\u9fff_-]{1,20})/);
  const candidate = fallbackMatch?.[1];

  if (!candidate) {
    return undefined;
  }

  if (["初診", "第一次", "本人", "客人"].includes(candidate)) {
    return undefined;
  }

  return candidate;
}

function extractFirstVisit(message: string) {
  if (includesAnyTerm(message, ["初診", "第一次", "首次"])) {
    return "yes" as const;
  }
  if (includesAnyTerm(message, ["複診", "不是第一次", "回診", "之前去過"])) {
    return "no" as const;
  }
  return undefined;
}

function extractTimeSlots(message: string) {
  const chunks = message
    .split(/[\/、，,\n；;]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const timeLikeChunks = chunks.filter((chunk) =>
    /(\d{1,2}[:點]\d{0,2}|上午|中午|下午|晚上|明天|今天|週|周|月|號)/.test(chunk),
  );

  if (timeLikeChunks.length >= 2) {
    return Array.from(new Set(timeLikeChunks)).slice(0, 3);
  }

  if (/(\d{1,2}[:點]\d{0,2}|上午|中午|下午|晚上|明天|今天|週|周|月|號)/.test(message)) {
    return [message.trim()];
  }

  return [];
}

function extractBookingProgressTimeSlots(message: string) {
  const timePattern =
    /(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}|\d{1,2}:\d{2}|上午|下午|晚上|中午|今天|明天|後天|週[一二三四五六日天]|星期[一二三四五六日天])/;

  const chunks = message
    .split(/[，,、；;\n]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const timeLikeChunks = chunks.filter((chunk) => timePattern.test(chunk));

  if (timeLikeChunks.length >= 2) {
    return Array.from(new Set(timeLikeChunks)).slice(0, 3);
  }

  if (timePattern.test(message)) {
    return [message.trim()];
  }

  return [];
}

function updateBookingDraft(message: string, context: ConversationContext) {
  const branch = findBranchByMessage(message);
  const treatment = findTreatmentByMessage(message);
  const phone = extractPhone(message);
  const name = extractBookingName(message);
  const firstVisit = extractFirstVisit(message);
  const timeSlots = extractBookingProgressTimeSlots(message);

  if (branch) {
    context.bookingDraft.branch = branch.name;
  }
  if (treatment) {
    context.bookingDraft.treatment = treatment.name;
  }
  if (phone) {
    context.bookingDraft.phone = phone;
  }
  if (name) {
    context.bookingDraft.name = name;
  }
  if (firstVisit) {
    context.bookingDraft.isFirstVisit = firstVisit;
  }
  if (timeSlots.length > 0) {
    if (context.lastIntent === "booking_modify_request") {
      context.bookingDraft.requestedTimeSlots = Array.from(new Set(timeSlots)).slice(0, 3);
    } else {
      context.bookingDraft.timeSlots = Array.from(new Set([...context.bookingDraft.timeSlots, ...timeSlots])).slice(0, 3);
    }
  }
}

function hasBookingDraftValue(context: ConversationContext) {
  return Boolean(
    context.bookingDraft.treatment ||
      context.bookingDraft.branch ||
      context.bookingDraft.name ||
      context.bookingDraft.phone ||
      (context.bookingDraft.isFirstVisit && context.bookingDraft.isFirstVisit !== "unknown") ||
      (context.bookingDraft.requestedTimeSlots?.length ?? 0) > 0 ||
      context.bookingDraft.timeSlots.length > 0,
  );
}

function isBookingConversationIntent(lastIntent: string | undefined) {
  return ["booking_intake", "booking_modify_request", "booking_cancel_request"].includes(lastIntent ?? "");
}

function getMissingBookingFields(context: ConversationContext): BookingFieldKey[] {
  const missing: BookingFieldKey[] = [];

  if (!context.bookingDraft.treatment) {
    missing.push("treatment");
  }
  if (!context.bookingDraft.branch) {
    missing.push("branch");
  }
  if (context.bookingDraft.timeSlots.length < 3) {
    missing.push("timeSlots");
  }
  if (!context.bookingDraft.isFirstVisit || context.bookingDraft.isFirstVisit === "unknown") {
    missing.push("isFirstVisit");
  }
  if (!context.bookingDraft.name) {
    missing.push("name");
  }
  if (!context.bookingDraft.phone) {
    missing.push("phone");
  }

  return missing;
}

function shouldKeepBookingMode(previousContext: ConversationContext | undefined, nextContext: ConversationContext) {
  return (
    isBookingConversationIntent(previousContext?.lastIntent) &&
    hasBookingDraftValue(nextContext) &&
    getMissingBookingFields(nextContext).length > 0
  );
}

function hasBookingDraftProgress(message: string, context: ConversationContext) {
  const missingFields = getMissingBookingFields(context);

  if (missingFields.includes("treatment") && Boolean(findTreatmentByMessage(message))) {
    return true;
  }
  if (missingFields.includes("branch") && Boolean(findBranchByMessage(message))) {
    return true;
  }
  if (missingFields.includes("timeSlots") && extractBookingProgressTimeSlots(message).length > 0) {
    return true;
  }
  if (missingFields.includes("isFirstVisit") && Boolean(extractFirstVisit(message))) {
    return true;
  }
  if (missingFields.includes("name") && Boolean(extractBookingName(message))) {
    return true;
  }
  if (missingFields.includes("phone") && Boolean(extractPhone(message))) {
    return true;
  }

  return false;
}

function formatBookingKnownFields(context: ConversationContext) {
  const parts: string[] = [];

  if (context.bookingDraft.treatment) {
    parts.push(`想了解的療程先記為 ${context.bookingDraft.treatment}`);
  }
  if (context.bookingDraft.branch) {
    parts.push(`館別先記為 ${context.bookingDraft.branch}`);
  }
  if (context.bookingDraft.timeSlots.length > 0) {
    parts.push(`方便時段先記為 ${context.bookingDraft.timeSlots.join("、")}`);
  }
  if ((context.bookingDraft.requestedTimeSlots?.length ?? 0) > 0) {
    parts.push(`希望改成的時段先記為 ${context.bookingDraft.requestedTimeSlots?.join("、")}`);
  }
  if (context.bookingDraft.isFirstVisit === "yes") {
    parts.push("目前先記為初診");
  }
  if (context.bookingDraft.isFirstVisit === "no") {
    parts.push("目前先記為非初診");
  }
  if (context.bookingDraft.name) {
    parts.push(`稱呼先記為 ${context.bookingDraft.name}`);
  }
  if (context.bookingDraft.phone) {
    parts.push(`聯絡電話先記為 ${context.bookingDraft.phone}`);
  }

  return parts;
}

function buildBookingIntakeReply(context: ConversationContext) {
  const knownFields = formatBookingKnownFields(context);
  const missingFields = getMissingBookingFields(context);

  const missingPrompts: Record<BookingFieldKey, string> = {
    branch: "想去的館別",
    isFirstVisit: "是否第一次到診",
    name: "稱呼",
    phone: "聯絡電話",
    timeSlots: "3 個方便時段",
    treatment: "想了解的療程",
  };

  if (missingFields.length === 0) {
    return [
      "我先幫您整理預約需求。",
      knownFields.join("，") + "。",
      "真人客服會在服務時間內協助確認實際可約時段。",
    ].join("\n");
  }

  const summaryLine = knownFields.length > 0 ? `${knownFields.join("，")}。` : "";
  const missingSummary = missingFields.map((field) => missingPrompts[field]).join("、");

  return [
    "可以的，我先幫您整理預約需求。",
    summaryLine,
    `再麻煩您提供 ${missingSummary}，`,
    "我整理好後續資料，客服會在服務時間內接續協助確認。",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildBookingModifyReply(context: ConversationContext) {
  const knownFields = formatBookingKnownFields(context);

  if (knownFields.length === 0) {
    return "可以的，我先幫您整理改約需求。再麻煩您提供原本預約的館別、稱呼、聯絡電話，以及想改成的日期或時段，我整理後請客服接續協助確認。";
  }

  return `可以的，我先幫您整理改約需求。${knownFields.join("，")}。如果您還想調整館別、療程或新的方便時段，也可以直接一起告訴我，客服會在服務時間內接續協助確認。`;
}

function buildBookingCancelReply(context: ConversationContext) {
  const knownFields = formatBookingKnownFields(context);

  if (knownFields.length === 0) {
    return "可以的，我先幫您整理取消預約需求。再麻煩您提供原本預約的館別、稱呼、聯絡電話，以及原本預約時段，我整理後請客服接續協助確認。";
  }

  return `可以的，我先幫您整理取消預約需求。${knownFields.join("，")}。客服會在服務時間內接續協助確認取消；如果您其實是想改約，也可以直接告訴我新的館別或時段。`;
}

function isBookingCancelRequest(message: string) {
  return includesAnyTerm(message, BOOKING_CANCEL_TERMS);
}

function isBookingModifyRequest(message: string) {
  return includesAnyTerm(message, BOOKING_MODIFY_TERMS);
}

function getPregnancyContext(message: string): PregnancyContext | null {
  if (includesAnyTerm(message, PREGNANCY_TERMS.pregnant)) {
    return "pregnant";
  }
  if (includesAnyTerm(message, PREGNANCY_TERMS.breastfeeding)) {
    return "breastfeeding";
  }
  if (includesAnyTerm(message, PREGNANCY_TERMS.trying_to_conceive)) {
    return "trying_to_conceive";
  }
  return null;
}

function buildTermsFromPregnancyRule(rule: PregnancyRule) {
  return [rule.treatment_name, ...rule.aliases.split(/[|,，、/\n]+/)]
    .map((term) => term.trim())
    .filter(Boolean);
}

function matchPregnancyRule(message: string, rules: PregnancyRule[], includePending: boolean) {
  const normalizedMessage = normalizeText(message);

  return rules
    .filter((rule) => isSeedRowUsable(rule.is_active, rule.approval_status, includePending))
    .sort((left, right) => right.treatment_name.length - left.treatment_name.length)
    .find((rule) => buildTermsFromPregnancyRule(rule).some((term) => normalizedMessage.includes(normalizeText(term))));
}

function buildPregnancyFallbackReply(context: PregnancyContext, treatmentName?: string) {
  const prefix =
    context === "pregnant"
      ? "懷孕期間通常建議先暫緩醫美療程"
      : context === "breastfeeding"
        ? "哺乳期間安排醫美療程通常要更保守評估"
        : "備孕期間若要安排醫美療程，通常也會建議先保守評估";

  if (treatmentName) {
    return `${prefix}。像 ${treatmentName} 這類雷射、電音波、針劑或手術類療程，通常都建議先不要急著施作，實際狀況仍需由醫師評估。`;
  }

  return `${prefix}。像雷射、電音波、針劑與手術類療程，通常都建議先保守處理，實際狀況仍需由醫師評估。`;
}

function getPregnancyGuidanceReply(
  message: string,
  matchedTreatmentName: string | undefined,
  pregnancyRules: PregnancyRule[],
  includePending: boolean,
) {
  const context = getPregnancyContext(message);
  if (!context) {
    return null;
  }

  const matchedRule = matchPregnancyRule(message, pregnancyRules, includePending);
  if (matchedRule) {
    return {
      decisionType: "medical_guidance_reply",
      matchedKey: "pregnancy_caution",
      matchedType: "guided_reply",
      replyText: matchedRule.guidance_reply.trim(),
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  return {
    decisionType: "medical_guidance_reply",
    matchedKey: "pregnancy_caution",
    matchedType: "guided_reply",
    replyText: buildPregnancyFallbackReply(context, matchedTreatmentName),
  } satisfies Omit<RouterDecision, "nextContext">;
}

function isCapabilityQuestion(message: string) {
  return includesAnyTerm(message, CAPABILITY_TERMS);
}

function getCapabilityReply() {
  return {
    decisionType: "clinic_info_reply",
    matchedKey: "capability_intro",
    matchedType: "guided_reply",
    replyText:
      `您好，我是${clinicConfig.clinicName}的 AI 客服${clinicConfig.aiName}，主要先協助您處理館別資訊、付款方式、預約前整理、療程第一層介紹、孕期與哺乳期的保守原則，以及預約需求蒐集；真的需要真人判斷的部分，我也會先幫您整理重點。`,
  } satisfies Omit<RouterDecision, "nextContext">;
}

function resolveBranchFromContext(message: string, context: ConversationContext) {
  const explicitBranch = findBranchByMessage(message);
  if (explicitBranch) {
    return explicitBranch;
  }

  if (
    includesAnyTerm(message, [...ADDRESS_TERMS, ...BUSINESS_HOUR_TERMS, ...PHONE_TERMS, ...TRANSPORT_TERMS, ...NEAREST_BRANCH_TERMS])
  ) {
    const preferredBranch = findBranchByName(context.preferredBranch) ?? findBranchByName(context.lastReferencedBranch);
    if (preferredBranch) {
      return preferredBranch;
    }

    if (context.locationPreference) {
      return (
        clinicConfig.branches.find((branch) => branch.city === context.locationPreference && branch.isActive) ?? null
      );
    }
  }

  return null;
}

function formatBranchAddress(branchName: string) {
  const branch = findBranchByName(branchName);
  if (!branch) {
    return "";
  }

  if (!branch.hasCompleteAddress) {
    return `${branch.name}地址資料目前尚未建立在系統中。`;
  }

  return `${branch.name}地址是${branch.address}。`;
}

function formatBranchHours(branchName: string) {
  const branch = findBranchByName(branchName);
  if (!branch) {
    return clinicConfig.humanSupportHours.fallbackSummary;
  }

  if (!branch.hasCompleteBusinessHours) {
    return `目前系統先記錄 ${clinicConfig.humanSupportHours.fallbackSummary} 分館現場營業時間資料待補齊，若您想詢問 ${branch.name}，我也可以先幫您記錄。`;
  }

  return `${branch.name}營業時間為 ${branch.businessHours}`;
}

function formatBranchPhone(branchName: string) {
  const branch = findBranchByName(branchName);
  if (!branch) {
    return "目前系統中的分館聯絡電話資料尚未完整建立。";
  }

  if (!branch.hasCompletePhone) {
    return `目前 ${branch.name} 的電話資料尚未完整建立在系統中，我可以先幫您記錄想詢問 ${branch.name}，客服上班後再補充完整聯絡方式。`;
  }

  return `${branch.name}聯絡電話是 ${branch.phone}。`;
}

function formatTransport(branchName: string) {
  const branch = findBranchByName(branchName);
  if (!branch) {
    return "如果您告訴我想去的館別，我可以先幫您整理交通方向。";
  }

  return `${branch.name}交通可先參考：${branch.transportationNote}`;
}

function getBranchListReply() {
  const branches = listActiveBranches();
  const branchNames = branches.map((branch) => branch.name).join("、");
  const summary = branches
    .map((branch) => `${branch.name}：${branch.hasCompleteAddress ? branch.address : "地址資料待補"}`)
    .join("\n");

  return `目前可先為您整理的館別有 \n${branchNames}。\n${summary}`;
}

function getClinicBasicInfoReply(message: string, context: ConversationContext) {
  const normalizedMessage = normalizeText(message);
  const resolvedBranch = resolveBranchFromContext(message, context);
  const anyMatchedBranch = findAnyBranchByMessage(message);
  const branchName = resolvedBranch?.name;

  if (anyMatchedBranch && !anyMatchedBranch.isActive) {
    const activeBranchNames = listActiveBranches().map((branch) => branch.name).join("、");
    return {
      decisionType: "clinic_info_reply",
      matchedKey: `inactive_branch:${anyMatchedBranch.name}`,
      matchedType: "config",
      replyText: `目前可安排的館別只有 ${activeBranchNames}。${anyMatchedBranch.name} 目前沒有開放接待；如果您方便，我可以直接幫您整理離您較近的館別或預約需求。`,
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  if (resolvedBranch) {
    const branchAliasLengths = [resolvedBranch.name, resolvedBranch.city, ...resolvedBranch.aliases].map((alias) =>
      normalizeText(alias).length,
    );
    const longestAliasLength = Math.max(...branchAliasLengths);

    if (normalizedMessage.length <= longestAliasLength + 2) {
      return {
        decisionType: "clinic_info_reply",
        matchedKey: `branch_focus:${resolvedBranch.name}`,
        matchedType: "config",
        replyText: `目前先以 ${resolvedBranch.name} 為您整理，您想了解地址、營業時間、交通方式，還是想直接預約呢？`,
      } satisfies Omit<RouterDecision, "nextContext">;
    }
  }

  if (WHOLE_BRANCH_ONLY_TERMS.some((term) => normalizedMessage === normalizeText(term))) {
    if (!resolvedBranch) {
      return null;
    }

    return {
      decisionType: "clinic_info_reply",
      matchedKey: `branch_focus:${resolvedBranch.name}`,
      matchedType: "config",
      replyText: `目前先以 ${resolvedBranch.name} 為您整理，您想了解地址、營業時間、交通方式，還是想直接預約呢？`,
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  if (includesAnyTerm(message, BRANCH_LIST_TERMS) && includesAnyTerm(message, ["館", "管", "診所", "分館", "地址", "在哪", "幾間"])) {
    return {
      decisionType: "clinic_info_reply",
      matchedKey: "branch_list",
      matchedType: "config",
      replyText: getBranchListReply(),
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  if (includesAnyTerm(message, PAYMENT_TERMS)) {
    return {
      decisionType: "clinic_info_reply",
      matchedKey: "payment_methods",
      matchedType: "config",
      replyText: clinicConfig.paymentMethods.summary,
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  if (includesAnyTerm(message, ["預約制", "需要預約", "要預約嗎", "有預約制嗎"])) {
    return {
      decisionType: "clinic_info_reply",
      matchedKey: "appointment_policy",
      matchedType: "config",
      replyText: clinicConfig.appointmentPolicy.summary,
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  if (includesAnyTerm(message, FIRST_VISIT_TERMS)) {
    return {
      decisionType: "clinic_info_reply",
      matchedKey: "first_visit_preparation",
      matchedType: "config",
      replyText: clinicConfig.firstVisitPreparation.summary,
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  if (includesAnyTerm(message, SUPPORT_HOURS_TERMS) && !includesAnyTerm(message, HUMAN_REQUEST_TERMS)) {
    return {
      decisionType: "clinic_info_reply",
      matchedKey: "human_support_hours",
      matchedType: "config",
      replyText: `${clinicConfig.humanSupportHours.fallbackSummary} ${clinicConfig.humanSupportHours.note}`,
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  if (includesAnyTerm(message, NEAREST_BRANCH_TERMS)) {
    if (resolvedBranch) {
      const addressReply = resolvedBranch.hasCompleteAddress
        ? `地址是${resolvedBranch.address}。`
        : "地址資料目前尚未完整建立。";
      return {
        decisionType: "clinic_info_reply",
        matchedKey: `nearest_branch:${resolvedBranch.name}`,
        matchedType: "config",
        replyText: `如果您目前以 ${resolvedBranch.city} 為主，可先以 ${resolvedBranch.name} 為主。${addressReply}`,
      } satisfies Omit<RouterDecision, "nextContext">;
    }

    return {
      decisionType: "clinic_info_reply",
      matchedKey: "nearest_branch_clarify",
      matchedType: "guided_reply",
      replyText: "如果您告訴我目前比較方便的城市或館別，我可以先幫您整理最近的分館資訊。",
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  if (includesAnyTerm(message, ADDRESS_TERMS) && branchName) {
    const branch = findBranchByName(branchName);
    const replyText = branch?.hasCompleteAddress
      ? `${branch.name}地址是${branch.address}。`
      : `目前 ${branchName} 地址資料尚未建立在系統中，我可以先幫您記錄想詢問 ${branchName}，客服上班後補充完整地址資訊。`;

    return {
      decisionType: "clinic_info_reply",
      matchedKey: `branch_address:${branchName}`,
      matchedType: "config",
      replyText,
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  if (includesAnyTerm(message, BUSINESS_HOUR_TERMS)) {
    return {
      decisionType: "clinic_info_reply",
      matchedKey: branchName ? `branch_hours:${branchName}` : "branch_hours_general",
      matchedType: "config",
      replyText: branchName ? formatBranchHours(branchName) : clinicConfig.humanSupportHours.fallbackSummary,
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  if (includesAnyTerm(message, PHONE_TERMS)) {
    return {
      decisionType: "clinic_info_reply",
      matchedKey: branchName ? `branch_phone:${branchName}` : "branch_phone_general",
      matchedType: "config",
      replyText: branchName
        ? formatBranchPhone(branchName)
        : "如果您告訴我想詢問哪一館，我可以先幫您確認目前系統中的聯絡資訊。",
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  if (includesAnyTerm(message, TRANSPORT_TERMS)) {
    return {
      decisionType: "clinic_info_reply",
      matchedKey: branchName ? `branch_transport:${branchName}` : "branch_transport_general",
      matchedType: "config",
      replyText: branchName
        ? formatTransport(branchName)
        : "如果您告訴我想去的館別，我可以先幫您整理交通方向。",
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  if (message.includes("住") && resolvedBranch) {
    return {
      decisionType: "clinic_info_reply",
      matchedKey: `branch_location_preference:${resolvedBranch.name}`,
      matchedType: "config",
      replyText: `${formatBranchAddress(resolvedBranch.name)}如果您之後要問最近分館、地址或預約，我都可以直接接著幫您整理。`,
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  return null;
}

function getTreatmentReply(message: string, context: ConversationContext): Omit<RouterDecision, "nextContext"> | null {
  const matchedTreatment = findTreatmentByMessage(message);
  if (!matchedTreatment) {
    return null;
  }

  const preferredBranch = resolvePreferredBranchFromContext(message, context);
  const limitedBranches =
    matchedTreatment.availableBranchNames
      ?.map((branchName) => findBranchByName(branchName))
      .filter((branch): branch is NonNullable<typeof branch> => branch !== null) ?? [];
  const branchAvailabilityNote =
    limitedBranches.length === 0
      ? ""
      : limitedBranches.length === 1
        ? `目前這個療程以 ${limitedBranches[0].name} 提供與評估為主。`
        : `目前這個療程可優先評估的館別為 ${limitedBranches.map((branch) => branch.name).join("、")}。`;

  const isBrandQuestion =
    includesAnyTerm(message, ["品牌", "牌子", "哪個牌", "哪一牌", "可以選擇", "什麼肉毒", "哪些品牌"]) ||
    normalizeText(message).includes("什麼探頭");
  const approvedIntroReply = matchedTreatment.approvedContent.introReplies[0];
  const approvedBrandReply = matchedTreatment.approvedContent.brandReplies[0];

  if (isBrandQuestion) {
    if (approvedBrandReply) {
      return {
        decisionType: "treatment_intro_reply",
        matchedKey: `treatment_brand:${matchedTreatment.key}`,
        matchedType: "config",
        replyText: approvedBrandReply,
      } satisfies Omit<RouterDecision, "nextContext">;
    }

    return {
      decisionType: "handoff_pending",
      matchedKey: `treatment_brand_missing:${matchedTreatment.key}`,
      matchedType: "handoff_rule",
      replyText: matchedTreatment.approvedContent.unsupportedReply,
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  if (
    preferredBranch &&
    limitedBranches.length > 0 &&
    !limitedBranches.some((branch) => branch.name === preferredBranch.name)
  ) {
    return {
      decisionType: "treatment_intro_reply",
      matchedKey: `treatment_intro_branch_limit:${matchedTreatment.key}`,
      matchedType: "config",
      replyText: `${approvedIntroReply} ${branchAvailabilityNote} 您如果想了解這個療程，我可以先幫您整理需求，後續以 ${limitedBranches.map((branch) => branch.name).join("、")} 為主協助安排。`,
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  return {
    decisionType: "treatment_intro_reply",
    matchedKey: `treatment_intro:${matchedTreatment.key}`,
    matchedType: "config",
    replyText: `${approvedIntroReply} ${matchedTreatment.evaluationNote}${branchAvailabilityNote ? ` ${branchAvailabilityNote}` : ""}`,
  } satisfies Omit<RouterDecision, "nextContext">;
}

function buildPricingReply(campaign: PricingCampaign) {
  const fallbackSuffix = campaign.fallback_message.trim()
    ? ` ${campaign.fallback_message.trim()}`
    : "";

  return `${campaign.treatment_name} 目前可參考「${campaign.campaign_name}」：${campaign.price_text}。${fallbackSuffix}`.trim();
}

function getPricingReply(
  message: string,
  context: ConversationContext,
  pricingCampaigns: PricingCampaign[],
  includePending: boolean,
  today: Date,
) {
  if (!includesAnyTerm(message, PRICE_TERMS)) {
    return null;
  }

  const matchedPricing = matchPricing(message, pricingCampaigns, includePending, today);
  if (matchedPricing) {
    return {
      decisionType: "pricing_auto_reply",
      matchedKey: matchedPricing.treatment_name,
      matchedType: "pricing_campaign",
      nextContext: context,
      replyText: buildPricingReply(matchedPricing),
    } satisfies RouterDecision;
  }

  return {
    decisionType: "pricing_auto_reply",
    matchedKey: "pricing_followup",
    matchedType: "guided_reply",
    nextContext: context,
    replyText: clinicConfig.pricePolicy.fallbackSummary,
  } satisfies RouterDecision;
}

function buildHandoffPendingReply(extraGuidance: string | null, now: Date) {
  const supportStatus = getHumanSupportStatus(now);
  const baseReply = supportStatus.inServiceHours
    ? "這個問題需要由真人客服進一步確認。我先幫您整理需求，稍後客服會接續協助。"
    : "這個問題需要由真人客服進一步確認。目前真人客服服務時間為週一至週五 09:00-18:00。我會先幫您整理需求，客服上班後再接續協助。";

  return extraGuidance ? `${extraGuidance} ${baseReply}` : baseReply;
}

function getHandoffPendingReply(message: string, now: Date) {
  if (includesAnyTerm(message, POST_PROCEDURE_TERMS)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "post_procedure_issue",
      matchedType: "handoff_rule",
      replyText: `如果您現在有明顯疼痛、發燒、持續惡化的紅腫，或任何讓您不安的異常反應，建議盡快聯繫診所或就醫。${buildHandoffPendingReply("這類術後反應需要真人客服與現場進一步確認。", now)}`,
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  if (includesAnyTerm(message, SERIOUS_COMPLAINT_TERMS)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "serious_complaint",
      matchedType: "handoff_rule",
      replyText: buildHandoffPendingReply("我先幫您記錄這次狀況與訴求。", now),
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  if (includesAnyTerm(message, EFFECT_GUARANTEE_TERMS)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "effect_guarantee_request",
      matchedType: "handoff_rule",
      replyText: buildHandoffPendingReply("療效保證這類問題不能直接承諾，我先幫您整理想了解的療程與狀況。", now),
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  if (includesAnyTerm(message, PRICE_COMMITMENT_TERMS)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "price_commitment_request",
      matchedType: "handoff_rule",
      replyText: buildHandoffPendingReply("價格承諾這類問題需要由真人客服進一步確認，我先幫您整理想了解的療程與館別。", now),
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  if (includesAnyTerm(message, HUMAN_REQUEST_TERMS)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "human_request",
      matchedType: "handoff_rule",
      replyText: buildHandoffPendingReply("沒問題，我先幫您整理目前需求。", now),
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  if (includesAnyTerm(message, PERSONALIZED_CONSULT_TERMS)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "personalized_consult",
      matchedType: "handoff_rule",
      replyText: buildHandoffPendingReply("這類屬於個人適合度與療程判斷，需要依您的狀況由真人客服與醫師進一步確認。", now),
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  if (includesAnyTerm(message, CUSTOMER_ACCOUNT_TERMS)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "customer_account_lookup",
      matchedType: "handoff_rule",
      replyText: buildHandoffPendingReply("這類涉及個人資料或既有紀錄查詢，我先幫您記下需求。", now),
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  return null;
}

function getPreTreatmentSafetyReply(message: string, now: Date) {
  if (
    includesAnyTerm(message, POST_PROCEDURE_TERMS) ||
    includesAnyTerm(message, PERSONALIZED_CONSULT_TERMS) ||
    includesAnyTerm(message, EFFECT_GUARANTEE_TERMS) ||
    includesAnyTerm(message, PRICE_COMMITMENT_TERMS)
  ) {
    return getHandoffPendingReply(message, now);
  }

  return null;
}

function getGenericFallback() {
  return {
    decisionType: "fallback_reply",
    matchedKey: "generic_fallback",
    matchedType: "generic_fallback",
    replyText:
      "我可以先幫您整理館別資訊、付款方式、預約前準備、療程第一層介紹，或先協助整理預約需求。您可以直接告訴我想了解的療程、想去的館別，或提供方便的時段。",
  } satisfies Omit<RouterDecision, "nextContext">;
}

export async function routeCustomerMessage({
  conversationContext,
  includePending,
  message,
  now,
}: RouteCustomerMessageInput): Promise<RouterDecision> {
  const trimmedMessage = message.trim();
  const currentTime = now ?? new Date();
  const previousContext = cloneContext(conversationContext);
  const nextContext = cloneContext(conversationContext);
  nextContext.lastSeenAt = currentTime.toISOString();

  if (!trimmedMessage) {
    return {
      ...getGenericFallback(),
      nextContext,
    };
  }

  const seedData = await loadSeedData();
  const { matchedBranch, matchedTreatment } = updateContextEntities(trimmedMessage, nextContext);

  const hasBookingFollowup =
    isBookingConversationIntent(previousContext.lastIntent) && hasBookingDraftProgress(trimmedMessage, previousContext);

  if (isCapabilityQuestion(trimmedMessage)) {
    nextContext.lastIntent = "capability_intro";
    return {
      ...getCapabilityReply(),
      nextContext,
    };
  }

  if (hasBookingFollowup) {
    updateBookingDraft(trimmedMessage, nextContext);
    const bookingIntent: "booking_intake" | "booking_modify_request" | "booking_cancel_request" =
      isBookingConversationIntent(conversationContext?.lastIntent)
        ? (conversationContext?.lastIntent as "booking_intake" | "booking_modify_request" | "booking_cancel_request")
        : "booking_intake";
    nextContext.lastIntent = bookingIntent;

    const replyText =
      bookingIntent === "booking_modify_request"
        ? buildBookingModifyReply(nextContext)
        : bookingIntent === "booking_cancel_request"
          ? buildBookingCancelReply(nextContext)
          : buildBookingIntakeReply(nextContext);

    return {
      decisionType: "booking_intake_reply",
      matchedKey: bookingIntent,
      matchedType: "guided_reply",
      nextContext,
      replyText,
    };
  }

  if (isBookingCancelRequest(trimmedMessage)) {
    updateBookingDraft(trimmedMessage, nextContext);
    nextContext.lastIntent = "booking_cancel_request";
    return {
      decisionType: "booking_intake_reply",
      matchedKey: "booking_cancel_request",
      matchedType: "guided_reply",
      nextContext,
      replyText: buildBookingCancelReply(nextContext),
    };
  }

  if (isBookingModifyRequest(trimmedMessage)) {
    updateBookingDraft(trimmedMessage, nextContext);
    nextContext.lastIntent = "booking_modify_request";
    return {
      decisionType: "booking_intake_reply",
      matchedKey: "booking_modify_request",
      matchedType: "guided_reply",
      nextContext,
      replyText: buildBookingModifyReply(nextContext),
    };
  }

  const basicInfoReply = getClinicBasicInfoReply(trimmedMessage, nextContext);
  if (basicInfoReply) {
    nextContext.lastIntent = shouldKeepBookingMode(conversationContext, nextContext)
      ? "booking_intake"
      : basicInfoReply.matchedKey;
    return {
      ...basicInfoReply,
      nextContext,
    };
  }

  if (isTreatmentCarouselRequest(trimmedMessage)) {
    nextContext.lastIntent = "treatment_carousel";
    return {
      decisionType: "treatment_intro_reply",
      matchedKey: "treatment_carousel",
      matchedType: "config",
      nextContext,
      replyMessages: [buildTreatmentCarouselMessage()],
      replyText: getTreatmentCarouselReplyText(),
    };
  }

  if (includesAnyTerm(trimmedMessage, DOCTOR_SCHEDULE_TERMS)) {
    const doctorScheduleDecision = await resolveDoctorScheduleDecision({
      fallbackReply: buildHandoffPendingReply("醫師門診與班表仍需依現場安排確認。", currentTime),
      message: trimmedMessage,
      today: currentTime,
    });
    nextContext.lastIntent = doctorScheduleDecision.matchedKey;
    return {
      ...doctorScheduleDecision,
      nextContext,
    };
  }

  const pregnancyReply = getPregnancyGuidanceReply(
    trimmedMessage,
    matchedTreatment?.name ?? nextContext.lastReferencedTreatment,
    seedData.pregnancyRules,
    includePending,
  );
  if (pregnancyReply) {
    nextContext.lastIntent = shouldKeepBookingMode(conversationContext, nextContext)
      ? "booking_intake"
      : pregnancyReply.matchedKey;
    return {
      ...pregnancyReply,
      nextContext,
    };
  }

  const preTreatmentSafetyReply = getPreTreatmentSafetyReply(trimmedMessage, currentTime);
  if (preTreatmentSafetyReply) {
    nextContext.lastIntent = preTreatmentSafetyReply.matchedKey;
    return {
      ...preTreatmentSafetyReply,
      nextContext,
    };
  }

  const pricingReply = getPricingReply(
    trimmedMessage,
    nextContext,
    seedData.pricingCampaigns,
    includePending,
    currentTime,
  );
  if (pricingReply) {
    nextContext.lastIntent = shouldKeepBookingMode(conversationContext, nextContext)
      ? "booking_intake"
      : pricingReply.matchedKey;
    return pricingReply;
  }

  const hasBookingIntent = includesAnyTerm(trimmedMessage, APPOINTMENT_TERMS);
  if (hasBookingIntent) {
    updateBookingDraft(trimmedMessage, nextContext);
    nextContext.lastIntent = "booking_intake";
    return {
      decisionType: "booking_intake_reply",
      matchedKey: "booking_intake",
      matchedType: "guided_reply",
      nextContext,
      replyText: buildBookingIntakeReply(nextContext),
    };
  }

  const treatmentReply = getTreatmentReply(trimmedMessage, nextContext);
  if (treatmentReply) {
    nextContext.lastIntent = shouldKeepBookingMode(conversationContext, nextContext)
      ? "booking_intake"
      : treatmentReply.matchedKey;
    return {
      ...treatmentReply,
      nextContext,
    };
  }

  if (isTreatmentLikeMessage(trimmedMessage)) {
    nextContext.lastIntent = "unsupported_treatment_or_unapproved_content";
    return {
      decisionType: "handoff_pending",
      matchedKey: "unsupported_treatment_or_unapproved_content",
      matchedType: "handoff_rule",
      nextContext,
      replyText:
        "目前系統只會依院內核准內容說明療程；這一題我先不直接延伸回答，以免提供到未核准或不完整的療程描述。我先幫您整理想了解的項目，後續由真人客服接續補充。",
    };
  }

  const matchedFaq = matchFaq(trimmedMessage, seedData.faqEntries, includePending);
  if (matchedFaq) {
    nextContext.lastIntent = shouldKeepBookingMode(conversationContext, nextContext)
      ? "booking_intake"
      : matchedFaq.question_pattern;
    return {
      decisionType: "faq_auto_reply",
      matchedKey: matchedFaq.question_pattern,
      matchedType: "faq_entry",
      nextContext,
      replyText: matchedFaq.answer_text,
    };
  }

  const handoffPendingReply = getHandoffPendingReply(trimmedMessage, currentTime);
  if (handoffPendingReply) {
    nextContext.lastIntent = handoffPendingReply.matchedKey;
    return {
      ...handoffPendingReply,
      nextContext,
    };
  }

  if (matchedBranch || matchedTreatment) {
    const entitySummary = [
      matchedBranch ? `如果您是想問 ${matchedBranch.name}` : "",
      matchedTreatment ? `如果您是想了解 ${matchedTreatment.name}` : "",
    ]
      .filter(Boolean)
      .join("，");

    nextContext.lastIntent = "guided_clarify";
    return {
      decisionType: "fallback_reply",
      matchedKey: "guided_clarify",
      matchedType: "guided_reply",
      nextContext,
      replyText: `${entitySummary}，我可以先幫您整理地址、營業時間、療程第一層介紹，或直接接著幫您整理預約需求。`,
    };
  }

  nextContext.lastIntent = "generic_fallback";
  return {
    ...getGenericFallback(),
    nextContext,
  };
}
