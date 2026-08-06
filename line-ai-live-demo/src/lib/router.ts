import {
  clinicConfig,
  findConcernByMessage,
  findAnyBranchByMessage,
  findBranchByMessage,
  findTreatmentByKey,
  findTreatmentByMessage,
  listActiveBranches,
  normalizeClinicText,
  type BranchConfig,
} from "@/lib/clinic-config";
import type { ConversationContext } from "@/lib/conversation-context";
import { createEmptyConversationContext } from "@/lib/conversation-context";
import { resolveDoctorScheduleDecision } from "@/lib/doctor-schedule";
import { getHumanSupportStatus } from "@/lib/human-support";
import { buildPromotionCarouselMessage, type PromotionCarouselCard } from "@/lib/promotion-carousel";
import { loadSeedData, type FaqEntry, type PregnancyRule, type PricingCampaign } from "@/lib/seed-loader";
import { loadRuntimeContentOverlay, type RuntimeContentOverlay } from "@/lib/runtime-content-release";
import { isPriceInquiry, isPromotionBrowseIntent, PRICE_ASK_TERMS, resolvePricingSubject } from "@/lib/pricing-subject";
import {
  buildTreatmentCarouselMessage,
  getTreatmentCarouselReplyText,
  isTreatmentCarouselRequest,
  type LineImageMessage,
  type LineReplyMessage,
  type LineTextMessage,
} from "@/lib/treatment-carousel";
import type { ControlledTreatmentConcern, ControlledTreatmentKey } from "@/lib/ai-intent-classifier";

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
  runtimeAudienceKey?: string;
  runtimeContentOverlay?: RuntimeContentOverlay;
  semanticTreatmentConsultation?: {
    concern: ControlledTreatmentConcern;
    treatmentKey: ControlledTreatmentKey;
  };
  tenantId?: string;
};

type BookingFieldKey = "branch" | "isFirstVisit" | "name" | "phone" | "timeSlots" | "treatment";

export type RouterDecision = {
  decisionType: DecisionType;
  matchedKey: string;
  matchedType: MatchedType;
  nextContext: ConversationContext;
  replyMessages?: LineReplyMessage[];
  replyText: string;
  suppressAiFooter?: boolean;
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
const BRANCH_LIST_TERMS = [
  "幾間",
  "館別",
  "管別",
  "分館",
  "分店",
  "據點",
  "門市",
  "各館",
  "全部館別",
  "所有館別",
  "只有",
  "還有",
  "其他館",
  "別的館",
];
const BUSINESS_HOUR_TERMS = ["營業時間", "營業到幾點", "幾點關", "幾點開", "上班時間", "服務時間"];
const FIRST_VISIT_TERMS = ["第一次", "初診", "要準備什麼", "需要準備什麼"];
const NEAREST_BRANCH_TERMS = ["最近", "哪一間", "哪間", "離我最近"];
const PAYMENT_TERMS = ["付款", "刷卡", "轉帳", "匯款", "現金", "信用卡"];
const PHONE_TERMS = ["電話", "聯絡方式", "專線"];
const PRICE_TERMS = PRICE_ASK_TERMS;
const PRICE_OR_PROMOTION_TERMS = PRICE_ASK_TERMS;
const SUPPORT_HOURS_TERMS = ["真人客服", "客服時間", "客服幾點", "有人嗎"];
const TRANSPORT_TERMS = ["交通", "怎麼去", "停車", "捷運"];
const EFFECT_GUARANTEE_TERMS = ["保證有效", "一定有效", "保證改善", "一定會改善", "保證有感", "一定有感", "效果保證"];
const PRICE_COMMITMENT_TERMS = ["固定價", "保證最低價", "最低價", "一定多少錢", "保證多少錢", "先報死價", "直接報價"];
const TREATMENT_CONSULTATION_SESSION_MS = 20 * 60 * 1000;
const BOOKING_SESSION_MS = 24 * 60 * 60 * 1000;
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
const DOCTOR_SCHEDULE_TERMS = ["醫師", "門診", "看診", "班表", "診次", "診表"];
const BRANCH_QUERY_HINT_TERMS = ["館", "分館", "分店", "據點", "門市", "地址", "在哪", "哪裡", "最近", "有嗎", "有沒有"];
const STRUCTURED_BOOKING_FIELD_LABELS = {
  branch: ["館別", "管別"],
  isFirstVisit: ["初診", "複診", "是否第一次到診", "第一次到診"],
  name: ["稱呼", "姓名"],
  phone: ["電話", "手機", "聯絡電話"],
  timeSlots: ["時段", "時間", "方便時段"],
  treatment: ["療程", "項目"],
} satisfies Record<BookingFieldKey, string[]>;

const PREGNANCY_TERMS = {
  breastfeeding: ["哺乳", "餵奶", "親餵", "母乳"],
  pregnant: ["懷孕", "孕婦", "孕期", "有孕"],
  trying_to_conceive: ["備孕", "準備懷孕", "想懷孕", "試管"],
} satisfies Record<PregnancyContext, string[]>;

const POST_PROCEDURE_TERMS = clinicConfig.escalationPolicy.postProcedureAlertTerms;
const POST_PROCEDURE_CONTEXT_TERMS = ["打完", "做完", "術後", "剛做", "剛打", "昨天打", "前天打", "回去後"];
const POST_PROCEDURE_ABNORMALITY_TERMS = [
  ...POST_PROCEDURE_TERMS,
  "歪",
  "瘀青",
  "有血",
  "出血",
  "刺",
  "麻",
  "硬塊",
  "凹凸",
  "不對稱",
  "化膿",
  "水泡",
];
const HUMAN_REQUEST_TERMS = clinicConfig.escalationPolicy.humanRequestTerms;
const PERSONALIZED_CONSULT_TERMS = clinicConfig.escalationPolicy.personalizedConsultTerms;
const SERIOUS_COMPLAINT_TERMS = clinicConfig.escalationPolicy.seriousComplaintTerms;
const ALL_TREATMENT_TERMS = clinicConfig.treatmentList.flatMap((treatment) => [treatment.name, ...treatment.aliases]);

function normalizeText(text: string) {
  return text.replace(/[\s\p{P}\p{S}]+/gu, "").trim().toLowerCase();
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripPromotionDateWording(text: string) {
  return text
    .replace(/依館別、日期與現場評估調整/g, "依館別與現場評估調整")
    .replace(/依館別、檔期與現場評估調整/g, "依館別與現場評估調整")
    .replace(/依館別與日期調整/g, "依館別調整")
    .replace(/依檔期調整/g, "依現場狀況調整")
    .trim();
}

function cloneContext(context: ConversationContext | undefined) {
  const baseContext = context ?? createEmptyConversationContext("");
  const bookingDraft = baseContext.bookingDraft ?? createEmptyConversationContext("").bookingDraft;
  return {
    ...baseContext,
    bookingDraft: {
      appointmentAt: bookingDraft.appointmentAt,
      branch: bookingDraft.branch,
      isFirstVisit: bookingDraft.isFirstVisit,
      name: bookingDraft.name,
      phone: bookingDraft.phone,
      requestedTimeSlots: Array.isArray(bookingDraft.requestedTimeSlots) ? [...bookingDraft.requestedTimeSlots] : [],
      timeSlots: Array.isArray(bookingDraft.timeSlots) ? [...bookingDraft.timeSlots] : [],
      treatment: bookingDraft.treatment,
    },
  };
}

function includesAnyTerm(message: string, terms: string[]) {
  const normalizedMessage = normalizeText(message);
  return terms.some((term) => normalizedMessage.includes(normalizeText(term)));
}

function hasContraindicationOrMedicalHistorySignal(message: string) {
  if (includesAnyTerm(message, [...PREGNANCY_TERMS.pregnant, ...PREGNANCY_TERMS.breastfeeding, ...PREGNANCY_TERMS.trying_to_conceive])) {
    return false;
  }

  const normalizedMessage = normalizeText(message);
  return (
    /我有.{1,30}(?:可以|可不可以|能不能|能否|適不適合)/.test(normalizedMessage) ||
    /我在(?:吃|服用)|我正在用/.test(normalizedMessage) ||
    /(?:我有)?.{0,30}病史/.test(normalizedMessage) ||
    /開過刀|動過手術/.test(normalizedMessage) ||
    /我對.{1,30}過敏/.test(normalizedMessage)
  );
}

function isTreatmentLikeMessage(message: string) {
  return (
    includesAnyTerm(message, [...ALL_TREATMENT_TERMS, ...TREATMENT_DISCOVERY_TERMS]) ||
    isUnsupportedTreatmentAvailabilityQuestion(message)
  );
}

function isUnsupportedTreatmentAvailabilityQuestion(message: string) {
  if (findTreatmentByMessage(message)) {
    return false;
  }

  const normalizedMessage = normalizeText(message);
  return /(?:有做|有沒有做|有提供).{1,16}/.test(normalizedMessage);
}

function isGenericTreatmentInquiry(message: string) {
  const normalizedMessage = normalizeText(message);
  return /^(?:您好|你好|嗨|哈囉)?(?:我)?(?:想|想要|想先)?(?:詢問|問|了解|知道)?(?:一下|關於|你們)?療程(?:介紹|資訊|內容)?(?:嗎|呢)?$/.test(
    normalizedMessage,
  );
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
    Boolean(extractUnknownBranchLikeTerm(message)) ||
    isTreatmentLikeMessage(message) ||
    includesAnyTerm(message, [...PREGNANCY_TERMS.pregnant, ...PREGNANCY_TERMS.breastfeeding, ...PREGNANCY_TERMS.trying_to_conceive]) ||
    includesAnyTerm(message, PRICE_OR_PROMOTION_TERMS) ||
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

function isPromotionIntent(message: string) {
  return isPromotionBrowseIntent(message);
}

function getActivePricingCampaigns(pricingCampaigns: PricingCampaign[], includePending: boolean, today: Date) {
  return pricingCampaigns
    .filter((campaign) => isSeedRowUsable(campaign.is_active, campaign.approval_status, includePending))
    .filter((campaign) => campaignIsActive(campaign, today));
}

function findTreatmentConfigByName(name: string) {
  const normalizedTarget = normalizeText(name);
  return (
    clinicConfig.treatmentList.find(
      (treatment) =>
        normalizeText(treatment.name) === normalizedTarget ||
        treatment.aliases.some((alias) => normalizeText(alias) === normalizedTarget),
    ) ?? null
  );
}

function getCampaignSearchTerms(campaign: PricingCampaign) {
  const terms = new Set<string>();
  terms.add(campaign.treatment_name);
  terms.add(campaign.campaign_name);
  terms.add(campaign.branch_scope);
  campaign.campaign_aliases
    .split(/[|,，、\n]/)
    .map((alias) => alias.trim())
    .filter(Boolean)
    .forEach((alias) => terms.add(alias));

  const matchedTreatment = findTreatmentConfigByName(campaign.treatment_name);
  if (matchedTreatment) {
    terms.add(matchedTreatment.name);
    matchedTreatment.aliases.forEach((alias) => terms.add(alias));
  }

  return [...terms].map((term) => normalizeText(term)).filter(Boolean);
}

function getCampaignImageUrls(campaign: PricingCampaign) {
  return campaign.asset_urls
    .split(/[|,，、\n]/)
    .map((url) => url.trim())
    .filter(Boolean);
}

function getPromotionOverviewGroups(pricingCampaigns: PricingCampaign[]) {
  const groups = new Map<
    string,
    {
      campaignName: string;
      imageUrls: string[];
      priceTexts: string[];
      treatmentNames: string[];
    }
  >();

  for (const campaign of pricingCampaigns) {
    const imageUrls = getCampaignImageUrls(campaign);
    const groupKey = `${campaign.campaign_name}__${imageUrls.join("|")}`;
    const existing = groups.get(groupKey);

    if (existing) {
      if (!existing.treatmentNames.includes(campaign.treatment_name)) {
        existing.treatmentNames.push(campaign.treatment_name);
      }
      if (campaign.price_text.trim() && !existing.priceTexts.includes(campaign.price_text.trim())) {
        existing.priceTexts.push(campaign.price_text.trim());
      }
      continue;
    }

    groups.set(groupKey, {
      campaignName: campaign.campaign_name,
      imageUrls,
      priceTexts: campaign.price_text.trim() ? [campaign.price_text.trim()] : [],
      treatmentNames: [campaign.treatment_name],
    });
  }

  return [...groups.values()];
}

function findPricingCampaignForTreatmentKey(treatmentKey: string, activeCampaigns: PricingCampaign[]) {
  const treatment = findTreatmentByKey(treatmentKey);
  if (!treatment) {
    return null;
  }

  const treatmentTerms = new Set([treatment.name, ...treatment.aliases].map((term) => normalizeText(term)));
  return activeCampaigns.find((campaign) =>
    getCampaignSearchTerms(campaign).some((term) => treatmentTerms.has(term)),
  ) ?? null;
}

function clearStaleTreatmentConsultation(context: ConversationContext, now: Date) {
  if (!context.treatmentConsultation || !context.lastSeenAt) {
    return;
  }

  const lastSeenAt = new Date(context.lastSeenAt).getTime();
  if (!Number.isFinite(lastSeenAt) || now.getTime() - lastSeenAt <= TREATMENT_CONSULTATION_SESSION_MS) {
    return;
  }

  delete context.treatmentConsultation;
  if (context.lastIntent?.startsWith("treatment_consult:")) {
    delete context.lastIntent;
  }
  delete context.lastReferencedTreatment;
}

function clearExpiredBookingSession(context: ConversationContext, now: Date) {
  const appointmentAt = context.bookingDraft.appointmentAt;
  if (!appointmentAt) {
    return;
  }

  const appointmentTime = new Date(appointmentAt).getTime();
  if (!Number.isFinite(appointmentTime) || now.getTime() <= appointmentTime) {
    return;
  }

  // This is not an arrival/no-show decision. Historical lead data stays in the
  // database, while the next LINE enquiry begins with a fresh booking draft.
  context.bookingDraft = createEmptyConversationContext("").bookingDraft;
  delete context.bookingSession;
  delete context.lastIntent;
  delete context.lastReferencedBranch;
  delete context.lastReferencedTreatment;
  delete context.locationPreference;
  delete context.preferredBranch;
  delete context.pregnancyRiskFlag;
  delete context.treatmentConsultation;
}

function getBookingSessionActivityAt(context: ConversationContext) {
  return context.bookingSession?.lastActiveAt ?? context.lastSeenAt;
}

function isActiveBookingConversation(context: ConversationContext | undefined, now: Date) {
  if (!context || !isBookingConversationIntent(context.lastIntent)) {
    return false;
  }

  const activityAt = getBookingSessionActivityAt(context);
  if (!activityAt) {
    // Preserve compatibility for legacy persisted contexts that predate the
    // session timestamp. New sessions always receive an explicit timestamp.
    return true;
  }

  const activityTime = new Date(activityAt).getTime();
  return Number.isFinite(activityTime) && now.getTime() - activityTime <= BOOKING_SESSION_MS;
}

function clearStaleBookingDraft(context: ConversationContext, now: Date) {
  if (context.bookingDraft.appointmentAt || !hasBookingDraftValue(context)) {
    return;
  }

  const activityAt = getBookingSessionActivityAt(context);
  if (!activityAt) {
    // Legacy contexts created before timestamps were persisted cannot be
    // reliably dated, so preserve their established behavior for this turn.
    return;
  }

  const activityTime = new Date(activityAt).getTime();
  if (Number.isFinite(activityTime) && now.getTime() - activityTime <= BOOKING_SESSION_MS) {
    return;
  }

  // An unfinished booking is only a short-lived working draft. This does not
  // change any historical lead or appointment record; it prevents an old draft
  // from becoming the subject of a later, unrelated customer question.
  context.bookingDraft = createEmptyConversationContext("").bookingDraft;
  context.bookingSession = {
    lastActiveAt: now.toISOString(),
    status: "stale",
  };
  if (isBookingConversationIntent(context.lastIntent)) {
    delete context.lastIntent;
  }
}

function markBookingSessionActive(context: ConversationContext, now: Date) {
  context.bookingSession = {
    lastActiveAt: now.toISOString(),
    status: "collecting",
  };
}

function buildPromotionOverviewReply(pricingCampaigns: PricingCampaign[]) {
  const lines = getPromotionOverviewGroups(pricingCampaigns)
    .slice(0, 5)
    .map((group) => {
      const treatmentLabel =
        group.treatmentNames.length <= 4
          ? group.treatmentNames.join("、")
          : `${group.treatmentNames.slice(0, 4).join("、")}等`;
      const priceLabel = group.priceTexts.length > 0 ? `｜${group.priceTexts.join(" / ")}` : "";
      return `${treatmentLabel}${priceLabel}`;
    });

  return `${clinicConfig.pricePolicy.overviewPrefix}\n${lines.join("\n")}\n實際活動內容仍會依館別與現場評估調整；如果您想確認適用條件，我也可以再幫您整理給真人客服確認。`;
}

function buildPromotionImageMessages(pricingCampaigns: PricingCampaign[]) {
  const imageUrls = [...new Set(pricingCampaigns.flatMap(getCampaignImageUrls))].slice(0, 3);
  return imageUrls.map((url) => ({
    type: "image",
    originalContentUrl: url,
    previewImageUrl: url,
  } satisfies LineImageMessage));
}

function buildPromotionReplyMessages(pricingCampaigns: PricingCampaign[], replyText: string) {
  const imageMessages = buildPromotionImageMessages(pricingCampaigns);
  if (imageMessages.length === 0) {
    return undefined;
  }

  return [
    ...imageMessages,
    {
      type: "text",
      text: replyText,
    } satisfies LineTextMessage,
  ] satisfies LineReplyMessage[];
}

function buildPromotionCarouselCards(pricingCampaigns: PricingCampaign[]) {
  const cards: PromotionCarouselCard[] = [];

  for (const campaign of pricingCampaigns) {
      const primaryImageUrl = getCampaignImageUrls(campaign)[0];
      if (!primaryImageUrl) {
        continue;
      }

      cards.push({
        ctaLabel: "我想了解",
        ctaText: `我想了解${campaign.treatment_name}活動`,
        imageUrl: primaryImageUrl,
        priceText: campaign.price_text.trim() || undefined,
        subtitle: campaign.campaign_name.trim() || undefined,
        title: campaign.treatment_name.trim(),
      });
  }

  return cards;
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

  if (getPregnancyContext(message)) {
    context.pregnancyRiskFlag = true;
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

function hasStructuredFieldLabel(message: string, labels: string[]) {
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:${labels.map(escapeRegExp).join("|")})\\s*[：:]`, "u");
  return pattern.test(message);
}

function extractStructuredFieldValue(message: string, labels: string[]) {
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:${labels.map(escapeRegExp).join("|")})\\s*[：:]\\s*([^\\n]+)`, "u");
  const value = message.match(pattern)?.[1]?.trim();
  return value || undefined;
}

function hasStructuredBookingForm(message: string) {
  const matchedFieldCount = (Object.keys(STRUCTURED_BOOKING_FIELD_LABELS) as BookingFieldKey[]).filter((key) =>
    hasStructuredFieldLabel(message, STRUCTURED_BOOKING_FIELD_LABELS[key]),
  ).length;

  return matchedFieldCount >= 2;
}

function extractName(message: string) {
  const match = message.match(/(?:我叫|我是|稱呼我|名字是)\s*([^\s，。,！!？?\n]+)/);
  return match?.[1];
}

function extractBookingName(message: string) {
  const structuredValue = extractStructuredFieldValue(message, STRUCTURED_BOOKING_FIELD_LABELS.name);
  if (structuredValue) {
    return structuredValue;
  }

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
  const structuredValue = extractStructuredFieldValue(message, STRUCTURED_BOOKING_FIELD_LABELS.isFirstVisit);
  if (structuredValue) {
    if (includesAnyTerm(structuredValue, ["初診", "第一次", "首次", "是", "yes"])) {
      return "yes" as const;
    }
    if (includesAnyTerm(structuredValue, ["複診", "回診", "不是第一次", "否", "no"])) {
      return "no" as const;
    }
  }

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
  const structuredValue = extractStructuredFieldValue(message, STRUCTURED_BOOKING_FIELD_LABELS.timeSlots);

  if (structuredValue) {
    const structuredChunks = structuredValue
      .split(/[，,、；;]+/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);
    const structuredTimeLikeChunks = structuredChunks.filter((chunk) => timePattern.test(chunk));

    if (structuredTimeLikeChunks.length > 0) {
      return Array.from(new Set(structuredTimeLikeChunks)).slice(0, 3);
    }

    return [structuredValue];
  }

  const chunks = message
    .split(/[，,、；;\n]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const timeLikeChunks = chunks.filter((chunk) => timePattern.test(chunk));

  if (timeLikeChunks.length > 0) {
    return Array.from(new Set(timeLikeChunks)).slice(0, 3);
  }

  return [];
}

function mergeBookingTreatment(existingTreatment: string | undefined, nextTreatment: string) {
  if (!existingTreatment) {
    return nextTreatment;
  }

  const items = existingTreatment
    .split(/[、,，]/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.includes(nextTreatment)) {
    return existingTreatment;
  }

  return [...items, nextTreatment].join("、");
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
    context.bookingDraft.treatment = mergeBookingTreatment(context.bookingDraft.treatment, treatment.name);
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

function isFreshTreatmentInquiry(message: string, previousContext: ConversationContext | undefined) {
  if (!previousContext || !isBookingConversationIntent(previousContext.lastIntent)) {
    return false;
  }

  // An existing booking must not trap a customer in that flow forever.  A
  // clear new treatment question is answered as a parallel consultation while
  // the original booking draft remains intact.
  if (
    hasStructuredBookingForm(message) ||
    hasExplicitBookingDetails(message) ||
    includesAnyTerm(message, APPOINTMENT_TERMS) ||
    isBookingModifyRequest(message) ||
    isBookingCancelRequest(message)
  ) {
    return false;
  }

  if (findConcernByMessage(message) || isGenericTreatmentInquiry(message)) {
    return true;
  }

  const matchedTreatment = findTreatmentByMessage(message);
  if (!matchedTreatment) {
    return false;
  }

  return includesAnyTerm(message, [
    "想了解",
    "想問",
    "介紹",
    "功效",
    "效果",
    "特色",
    "適合",
    "可以做",
    ...PRICE_OR_PROMOTION_TERMS,
  ]);
}

function shouldKeepBookingMode(
  previousContext: ConversationContext | undefined,
  nextContext: ConversationContext,
  message?: string,
) {
  return (
    isBookingConversationIntent(previousContext?.lastIntent) &&
    hasBookingDraftValue(nextContext) &&
    !(message && (isFreshTreatmentInquiry(message, previousContext) || isBookingContextDetour(message)))
  );
}

function isBookingContextDetour(message: string) {
  // A factual clinic question may be asked during booking, but it should not
  // keep the booking intent alive forever. The draft remains intact; only the
  // current topic changes so later generic questions do not inherit it.
  return includesAnyTerm(message, [
    ...ADDRESS_TERMS,
    ...BUSINESS_HOUR_TERMS,
    ...DOCTOR_SCHEDULE_TERMS,
    ...NEAREST_BRANCH_TERMS,
    ...PAYMENT_TERMS,
    ...PHONE_TERMS,
    ...TRANSPORT_TERMS,
  ]);
}

function isFreeTextBookingInfoQuestion(message: string) {
  // A customer can ask a factual question while an unfinished booking draft exists.
  // Keep explicit booking actions in the intake flow, but let factual questions reach
  // their dedicated rule instead of repeating the booking summary.
  if (
    includesAnyTerm(message, APPOINTMENT_TERMS) ||
    isBookingModifyRequest(message) ||
    isBookingCancelRequest(message)
  ) {
    return false;
  }

  return (
    includesAnyTerm(message, ADDRESS_TERMS) ||
    includesAnyTerm(message, BUSINESS_HOUR_TERMS) ||
    includesAnyTerm(message, DOCTOR_SCHEDULE_TERMS) ||
    includesAnyTerm(message, NEAREST_BRANCH_TERMS) ||
    includesAnyTerm(message, PHONE_TERMS) ||
    includesAnyTerm(message, TREATMENT_DISCOVERY_TERMS) ||
    includesAnyTerm(message, PRICE_OR_PROMOTION_TERMS) ||
    includesAnyTerm(message, TRANSPORT_TERMS)
  );
}

function hasExplicitBookingDetails(message: string) {
  return (
    Boolean(extractPhone(message)) ||
    Boolean(extractBookingName(message)) ||
    Boolean(extractFirstVisit(message)) ||
    extractBookingProgressTimeSlots(message).length > 0
  );
}

function hasFreeTextBookingSignal(message: string) {
  if (isFreeTextBookingInfoQuestion(message)) {
    return false;
  }

  return Boolean(findBranchByMessage(message)) || Boolean(findTreatmentByMessage(message));
}

function isBookingFollowupMessage(message: string, previousContext: ConversationContext | undefined, now: Date) {
  if (!previousContext) {
    return false;
  }

  const structuredBookingForm = hasStructuredBookingForm(message);
  if (structuredBookingForm || isBookingModifyRequest(message) || isBookingCancelRequest(message)) {
    return true;
  }

  if (isFreshTreatmentInquiry(message, previousContext)) {
    return false;
  }

  if (isFreeTextBookingInfoQuestion(message) && !hasExplicitBookingDetails(message)) {
    return false;
  }

  if (isActiveBookingConversation(previousContext, now)) {
    return hasBookingDraftProgress(message, previousContext);
  }

  if (previousContext.lastIntent === "human_request") {
    return (
      (hasBookingDraftValue(previousContext) && hasBookingDraftProgress(message, previousContext)) ||
      hasFreeTextBookingSignal(message)
    );
  }

  return false;
}

function hasBookingDraftProgress(message: string, context: ConversationContext) {
  const missingFields = getMissingBookingFields(context);
  const normalizedMessage = normalizeText(message);
  const matchedTreatment = findTreatmentByMessage(message);
  const looksLikeTreatmentQuestion =
    Boolean(matchedTreatment) &&
    /[？?]/.test(message) &&
    ["什麼", "有嗎", "牌子", "品牌", "介紹", "功效", "效果", "適合"].some((term) => normalizedMessage.includes(normalizeText(term)));

  if (isBookingModifyRequest(message) || isBookingCancelRequest(message)) {
    return true;
  }

  if (hasBookingDraftValue(context)) {
    if (Boolean(findBranchByMessage(message))) {
      return true;
    }
    if (Boolean(matchedTreatment) && !looksLikeTreatmentQuestion) {
      return true;
    }
    if (extractBookingProgressTimeSlots(message).length > 0) {
      return true;
    }
  }

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
    const treatmentLabel = context.bookingDraft.treatment
      .split(/[、,，]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .join("＋");
    parts.push(`想了解的療程先記為 ${treatmentLabel}`);
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
    parts.push(`姓名先記為 ${context.bookingDraft.name}`);
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
    name: "姓名",
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
    return "可以的，我先幫您整理改約需求。再麻煩您提供原本預約的館別、姓名、聯絡電話，以及想改成的日期或時段，我整理後請客服接續協助確認。";
  }

  return `可以的，我先幫您整理改約需求。${knownFields.join("，")}。如果您還想調整館別、療程或新的方便時段，也可以直接一起告訴我，客服會在服務時間內接續協助確認。`;
}

function buildBookingCancelReply(context: ConversationContext) {
  const knownFields = formatBookingKnownFields(context);

  if (knownFields.length === 0) {
    return "可以的，我先幫您整理取消預約需求。再麻煩您提供原本預約的館別、姓名、聯絡電話，以及原本預約時段，我整理後請客服接續協助確認。";
  }

  return `可以的，我先幫您整理取消預約需求。${knownFields.join("，")}。客服會在服務時間內接續協助確認取消；如果您其實是想改約，也可以直接告訴我新的館別或時段。`;
}

function pickReplyVariant(seed: string, variants: string[]) {
  if (variants.length === 0) {
    return "";
  }

  return variants[Math.abs(seed.length) % variants.length];
}

function buildBookingIntakeReplyV2(context: ConversationContext) {
  const knownFields = formatBookingKnownFields(context);
  const missingFields = getMissingBookingFields(context);
  const missingPrompts: Record<BookingFieldKey, string> = {
    branch: "想去的館別",
    isFirstVisit: "是否第一次到診",
    name: "姓名",
    phone: "聯絡電話",
    timeSlots: "3 個方便時段",
    treatment: "想了解的療程",
  };
  const seed = `${knownFields.join("|")}|${missingFields.join("|")}`;

  if (missingFields.length === 0) {
    return [
      pickReplyVariant(seed, [
        "可以的，我先幫您把預約資料整理好了。",
        "收到，我先幫您把預約需求整合如下。",
        "好，我這邊先幫您把預約重點整理完成。",
      ]),
      `${knownFields.join("，")}。`,
      "客服會在服務時間內接續協助確認可安排的時段。",
    ].join("\n");
  }

  return [
    pickReplyVariant(seed, [
      "可以的，我先幫您整理預約需求。",
      "收到，我先幫您把預約重點記下來。",
      "好，我先幫您整理目前的預約資訊。",
      "沒問題，我先幫您把預約內容統整一下。",
    ]),
    knownFields.length > 0 ? `${knownFields.join("，")}。` : "",
    `再麻煩您補一下 ${missingFields.map((field) => missingPrompts[field]).join("、")}。`,
    pickReplyVariant(seed + "closing", [
      "您補齊後，我就能一起整理給客服接續確認。",
      "補齊這些資訊後，客服就能更快接續安排。",
      "整理完整後，客服會在服務時間內接續協助您。",
    ]),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildBookingModifyReplyV2(context: ConversationContext) {
  const knownFields = formatBookingKnownFields(context);

  if (knownFields.length === 0) {
    return "可以的，我先幫您整理改約需求。再麻煩您告訴我想調整的館別、時段或療程，我會一起整理給客服確認。";
  }

  return [
    pickReplyVariant(knownFields.join("|"), [
      "可以的，我先幫您整理改約需求。",
      "收到，我先幫您把修改後的預約內容記下來。",
      "好，我先幫您更新目前的預約資訊。",
    ]),
    `${knownFields.join("，")}。`,
    "如果館別、時段或想了解的療程還要再調整，也可以直接一起告訴我，客服會在服務時間內接續確認。",
  ].join("\n");
}

function buildBookingCancelReplyV2(context: ConversationContext) {
  const knownFields = formatBookingKnownFields(context);

  if (knownFields.length === 0) {
    return "可以的，我先幫您整理取消預約需求。您可以直接告訴我原本的館別、時段或想取消的療程，我會一起整理給客服確認。";
  }

  return [
    "可以的，我先幫您整理取消預約需求。",
    `${knownFields.join("，")}。`,
    "客服會在服務時間內接續協助確認取消；如果您其實是想改約，也可以直接告訴我新的館別或時段。",
  ].join("\n");
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

  const isAddressQuestion = includesAnyTerm(message, ADDRESS_TERMS);
  const isImmediateBranchFollowup = /^(branch_(focus|address|hours|phone)|nearest_branch):/.test(context.lastIntent ?? "");

  if (
    includesAnyTerm(message, [...ADDRESS_TERMS, ...BUSINESS_HOUR_TERMS, ...PHONE_TERMS, ...TRANSPORT_TERMS, ...NEAREST_BRANCH_TERMS]) &&
    (!isAddressQuestion || isImmediateBranchFollowup)
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

function isBareBranchReference(normalizedMessage: string, branch: BranchConfig) {
  return [branch.name, branch.city, ...branch.aliases].some(
    (term) => normalizedMessage === normalizeText(term),
  );
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

function buildBranchFocusReply(branchName: string) {
  const branch = findBranchByName(branchName);
  if (!branch) {
    return getBranchListReply();
  }

  const addressText = branch.hasCompleteAddress
    ? `${branch.name}地址是${branch.address}。`
    : `目前系統裡 ${branch.name} 的完整地址資料還沒有補齊。`;

  return `${addressText}\n如果您想一起看營業時間、交通方式，或直接安排預約，也可以直接告訴我。`;
}

function formatConcernRecommendedTreatments(concernKey: string) {
  const concern = clinicConfig.concernList.find((item) => item.key === concernKey);
  if (!concern) {
    return [];
  }

  return concern.recommendedTreatmentKeys
    .map((treatmentKey) => findTreatmentByKey(treatmentKey))
    .filter((treatment): treatment is NonNullable<typeof treatment> => Boolean(treatment))
    .map((treatment) => treatment.name);
}

function getConsultationTreatment(context: ConversationContext) {
  const treatment = context.lastReferencedTreatment
    ? clinicConfig.treatmentList.find((item) => item.name === context.lastReferencedTreatment) ?? null
    : null;

  return treatment?.consultationGuide ? treatment : null;
}

function preferActiveTreatmentConsultationForBooking(context: ConversationContext) {
  const treatmentKey = context.treatmentConsultation?.treatmentKey;
  const treatment = treatmentKey ? findTreatmentByKey(treatmentKey) : null;

  // A fresh guided consultation is also a current customer need. Keep any
  // earlier treatment already collected for this booking and add this one.
  if (treatment) {
    context.bookingDraft.treatment = mergeBookingTreatment(context.bookingDraft.treatment, treatment.name);
    context.lastReferencedTreatment = treatment.name;
  }
}

function findConsultationQuickReply(
  treatment: NonNullable<ReturnType<typeof getConsultationTreatment>>,
  message: string,
) {
  return treatment.consultationGuide?.quickReplies?.find((item) => includesAnyTerm(message, item.terms)) ?? null;
}

function buildConsultationQuickReply(
  treatment: NonNullable<ReturnType<typeof getConsultationTreatment>>,
  message: string,
) {
  const quickReply = findConsultationQuickReply(treatment, message);
  if (!quickReply) {
    return null;
  }

  return {
    decisionType: "treatment_intro_reply",
    matchedKey: `treatment_consult:${treatment.key}:${quickReply.key}`,
    matchedType: "guided_reply",
    replyText: `${quickReply.reply}\n${quickReply.followupPrompt}`,
  } satisfies Omit<RouterDecision, "nextContext">;
}

function buildConsultationConcernReply(
  treatment: NonNullable<ReturnType<typeof getConsultationTreatment>>,
  concernKey: string,
  concernKeyword: string,
  context: ConversationContext,
  message?: string,
) {
  const guide = treatment.consultationGuide;
  if (!guide) {
    return null;
  }

  const activeConsultation = getActiveTreatmentConsultation(context, treatment.key);
  const previousConcernKeys = activeConsultation?.concernKeys ?? [];
  const answeredAspectKeys = activeConsultation?.answeredAspectKeys ?? [];
  const detailMessage = message ?? "";
  const matchingDetailReplies = guide.detailReplies?.filter(
    (item) => item.concernKey === concernKey && includesAnyTerm(detailMessage, item.terms),
  ) ?? [];
  const nextDetailReply = matchingDetailReplies.find(
    (item) => !answeredAspectKeys.includes(`detail:${item.aspectKey}`),
  );

  if (nextDetailReply) {
    return {
      aspectKey: `detail:${nextDetailReply.aspectKey}`,
      replyText: `${nextDetailReply.reply}\n${nextDetailReply.followupPrompt}`,
    };
  }

  if (previousConcernKeys.includes(concernKey)) {
    if (matchingDetailReplies.length > 0) {
      return {
        aspectKey: "followup:consultation",
        replyText: `😊 ${treatment.name} 關於 ${concernKeyword} 的重點已先為您整理。您想接著了解體驗價，還是安排免費諮詢呢？`,
      };
    }

    if (activeConsultation?.primaryConcernKey === concernKey) {
      return {
        aspectKey: "followup:primary",
        replyText: `了解😊 我們先以 ${concernKeyword} 為主安排。您想接著了解這個部位的體驗價，還是安排免費諮詢呢？`,
      };
    }

    return {
      aspectKey: "followup:priority",
      replyText: `了解😊 已記下您也在意 ${concernKeyword}。您想先以哪個部位為主，我再幫您整理 ${treatment.name} 的諮詢方向？`,
    };
  }

  if (previousConcernKeys.length > 0) {
    const previousConcernLabel = formatTreatmentConsultationConcerns(previousConcernKeys);
    return {
      aspectKey: `concern:${concernKey}:overview`,
      replyText: `了解😊 已記下您在意 ${previousConcernLabel}，也想改善 ${concernKeyword}。${treatment.name} 可依不同部位需求分開評估；您想先以哪個部位為主呢？`,
    };
  }

  const configuredConcernReply = guide.concernReplies?.find((item) => item.concernKey === concernKey);
  if (configuredConcernReply) {
    return {
      aspectKey: `concern:${concernKey}:overview`,
      replyText: `${configuredConcernReply.reply}\n${configuredConcernReply.followupPrompt}`,
    };
  }

  const discoveryPrompt =
    concernKey === "jawline_looseness"
      ? "您較在意脂肪感、輪廓線，還是鬆弛感呢？"
      : concernKey === "local_contour"
        ? "您較在意腹部、手臂或大腿哪個部位呢？"
        : guide.discoveryPrompt;

  return {
    aspectKey: `concern:${concernKey}:overview`,
    replyText: `${concernKeyword} 可先了解 ${treatment.name}。${discoveryPrompt}`,
  };
}

function getActiveTreatmentConsultationConcernKeys(context: ConversationContext, treatmentKey: string) {
  const consultation = getActiveTreatmentConsultation(context, treatmentKey);
  return consultation?.concernKeys ?? [];
}

function getActiveTreatmentConsultation(context: ConversationContext, treatmentKey: string) {
  if (!context.lastIntent?.startsWith(`treatment_consult:${treatmentKey}`)) {
    return null;
  }

  if (context.treatmentConsultation?.treatmentKey !== treatmentKey) {
    return null;
  }

  return {
    ...context.treatmentConsultation,
    answeredAspectKeys: Array.isArray(context.treatmentConsultation.answeredAspectKeys)
      ? context.treatmentConsultation.answeredAspectKeys.filter((aspectKey) => typeof aspectKey === "string")
      : [],
    concernKeys: Array.isArray(context.treatmentConsultation.concernKeys)
      ? context.treatmentConsultation.concernKeys.filter((concernKey) => typeof concernKey === "string")
      : [],
  };
}

function formatTreatmentConsultationConcerns(concernKeys: string[]) {
  const labels = concernKeys
    .map((concernKey) => {
      if (concernKey === "jawline_looseness") {
        return "雙下巴／嘴邊肉等臉部輪廓";
      }
      if (concernKey === "local_contour") {
        return "手臂、腹部或大腿等身體局部";
      }
      return null;
    })
    .filter((label) => label !== null);

  return labels.join("、") || "局部輪廓需求";
}

function recordTreatmentConsultationConcern(
  context: ConversationContext,
  treatmentKey: string,
  concernKey: string,
  answeredAspectKey?: string,
) {
  const activeConsultation = getActiveTreatmentConsultation(context, treatmentKey);
  const previousConcernKeys = activeConsultation?.concernKeys ?? [];
  const previousAnsweredAspectKeys = activeConsultation?.answeredAspectKeys ?? [];
  context.treatmentConsultation = {
    answeredAspectKeys: answeredAspectKey
      ? Array.from(new Set([...previousAnsweredAspectKeys, answeredAspectKey]))
      : previousAnsweredAspectKeys,
    concernKeys: Array.from(new Set([...previousConcernKeys, concernKey])),
    primaryConcernKey: activeConsultation?.primaryConcernKey,
    stage: activeConsultation?.stage ?? "needs_discovery",
    treatmentKey,
  };
}

function setTreatmentConsultationPrimaryConcern(context: ConversationContext, treatmentKey: string, concernKey: string) {
  const activeConsultation = getActiveTreatmentConsultation(context, treatmentKey);
  context.treatmentConsultation = {
    answeredAspectKeys: activeConsultation?.answeredAspectKeys ?? [],
    concernKeys: Array.from(new Set([...(activeConsultation?.concernKeys ?? []), concernKey])),
    primaryConcernKey: concernKey,
    stage: "priority_selected",
    treatmentKey,
  };
}

function isPrimaryConcernSelection(message: string) {
  return /(?:主要|最在意|優先|先以|先處理|重點).{0,8}(?:雙下巴|雙下八|嘴邊肉|下顎線|手臂|腹部|大腿|橘皮)/u.test(
    normalizeText(message),
  );
}

function buildPrimaryConcernReply(concernKey: string, concernPhrase: string) {
  if (concernKey === "jawline_looseness") {
    return `了解😊 那我們先以 ${concernPhrase} 的臉部輪廓需求為主。您比較在意肉肉厚度、下顎線不明顯，還是嘴邊肉一起改善呢？`;
  }

  if (concernKey === "local_contour") {
    return `了解😊 那我們先以 ${concernPhrase} 的身體局部需求為主。您比較在意脂肪厚度、線條感，還是緊實需求呢？`;
  }

  return `了解😊 我先以 ${concernPhrase} 為主幫您整理諮詢方向。`;
}

function getTreatmentConsultationPriorityReply(message: string, context: ConversationContext) {
  if (!isPrimaryConcernSelection(message)) {
    return null;
  }

  const treatment = getConsultationTreatment(context);
  const matchedConcern = findConcernByMessage(message);
  if (!treatment?.consultationGuide || !matchedConcern) {
    return null;
  }

  return {
    concernKey: matchedConcern.key,
    decisionType: "treatment_intro_reply",
    matchedKey: `treatment_consult:${treatment.key}:primary:${matchedConcern.key}`,
    matchedType: "guided_reply",
    replyText: buildPrimaryConcernReply(
      matchedConcern.key,
      getCustomerConcernPhrase(message, matchedConcern.key, matchedConcern.keywords),
    ),
    treatment,
  } as const;
}

type ConsultationConcernDecision = Omit<RouterDecision, "nextContext"> & {
  consultationAspectKey?: string;
};

function getConcernReply(message: string, context: ConversationContext): ConsultationConcernDecision | null {
  const matchedConcern = findConcernByMessage(message);
  if (!matchedConcern) {
    return null;
  }

  const matchedKeyword = getCustomerConcernPhrase(message, matchedConcern.key, matchedConcern.keywords);
  const recommendedTreatments = formatConcernRecommendedTreatments(matchedConcern.key);
  if (recommendedTreatments.length === 0) {
    return null;
  }

  const consultationTreatment = getConsultationTreatment(context);
  const recommendedConsultationTreatment = matchedConcern.recommendedTreatmentKeys
    .map((treatmentKey) => findTreatmentByKey(treatmentKey))
    .find((treatment) => treatment?.consultationGuide);
  const guidedTreatment = consultationTreatment ?? recommendedConsultationTreatment;
  if (guidedTreatment) {
    const consultationReply = buildConsultationConcernReply(
      guidedTreatment,
      matchedConcern.key,
      matchedKeyword,
      context,
      message,
    );
    if (consultationReply) {
      return {
        decisionType: "treatment_intro_reply",
        matchedKey: `treatment_consult:${guidedTreatment.key}`,
        matchedType: "guided_reply",
        replyText: consultationReply.replyText,
        consultationAspectKey: consultationReply.aspectKey,
      } satisfies ConsultationConcernDecision;
    }
  }

  if (matchedConcern.informationalReply) {
    return {
      decisionType: "treatment_intro_reply",
      matchedKey: `concern:${matchedConcern.key}`,
      matchedType: "guided_reply",
      replyText: matchedConcern.informationalReply,
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  return {
    decisionType: "treatment_intro_reply",
    matchedKey: `concern:${matchedConcern.key}`,
    matchedType: "guided_reply",
    replyText: `如果您想改善 ${matchedKeyword}，${matchedConcern.summary} 以院內目前可先評估的方向，常見會先從 ${recommendedTreatments.join("、")} 這幾類療程討論；實際仍要依您的部位條件、膚況與醫師評估為主。`,
  } satisfies Omit<RouterDecision, "nextContext">;
}

function getCustomerConcernPhrase(message: string, concernKey: string, fallbackKeywords: string[]) {
  const preferredPhrases =
    concernKey === "jawline_looseness"
      ? ["肉肉的雙下巴", "雙下巴", "雙下八", "嘴邊肉", "下顎線"]
      : concernKey === "local_contour"
        ? ["手臂脂肪", "腹部脂肪", "大腿脂肪", "局部脂肪", "橘皮", "手臂", "腹部", "大腿"]
        : [];
  const normalizedMessage = normalizeText(message);

  return (
    preferredPhrases.find((phrase) => normalizedMessage.includes(normalizeText(phrase))) ??
    fallbackKeywords.find((keyword) => normalizedMessage.includes(normalizeText(keyword))) ??
    fallbackKeywords[0]
  );
}

function getSemanticTreatmentConsultationReply(
  consultation: NonNullable<RouteCustomerMessageInput["semanticTreatmentConsultation"]>,
  context: ConversationContext,
) {
  const treatment = findTreatmentByKey(consultation.treatmentKey);
  if (!treatment?.consultationGuide) {
    return null;
  }

  const consultationReply = buildConsultationConcernReply(treatment, consultation.concern, treatment.name, context);
  if (!consultationReply) {
    return null;
  }

  return {
    decisionType: "treatment_intro_reply",
    matchedKey: `treatment_consult:${treatment.key}:semantic:${consultation.concern}`,
    matchedType: "guided_reply",
    consultationAspectKey: consultationReply.aspectKey,
    replyText: consultationReply.replyText,
    treatment,
  } as const;
}

function getBranchListReply() {
  const branches = listActiveBranches();
  const branchNames = branches.map((branch) => branch.name).join("、");
  const summary = branches
    .map((branch) => `${branch.name}：${branch.hasCompleteAddress ? branch.address : "地址資料待補"}`)
    .join("\n");

  return `目前可先為您整理的館別有 \n${branchNames}。\n${summary}`;
}

function extractUnknownBranchLikeTerm(message: string) {
  if (findAnyBranchByMessage(message)) {
    return null;
  }

  const locationStoreCandidate = message.match(/([\u4e00-\u9fffA-Za-z0-9]{2,3}?)(?:有)?(?:分店|據點|分館|門市)/u)?.[1];
  if (
    locationStoreCandidate &&
    !["你們", "我們", "目前", "這裡", "附近", "哪些", "所有", "各地"].includes(locationStoreCandidate) &&
    !/[有幾間]/u.test(locationStoreCandidate)
  ) {
    return locationStoreCandidate;
  }

  if (includesAnyTerm(message, BRANCH_LIST_TERMS)) {
    return null;
  }

  if (!includesAnyTerm(message, BRANCH_QUERY_HINT_TERMS)) {
    return null;
  }

  const explicitBranchCandidate = message.match(/([\u4e00-\u9fffA-Za-z0-9]{1,8}館)/u)?.[1];
  if (explicitBranchCandidate) {
    return explicitBranchCandidate;
  }

  const addressLocationCandidate = message.match(/([\u4e00-\u9fffA-Za-z0-9]{1,8})地址/u)?.[1];
  if (addressLocationCandidate && !["各館", "全部", "所有", "你們", "我們"].includes(addressLocationCandidate)) {
    return addressLocationCandidate;
  }

  return null;
}

function getClinicBasicInfoReply(message: string, context: ConversationContext) {
  if (hasStructuredBookingForm(message)) {
    return null;
  }

  const normalizedMessage = normalizeText(message);
  const resolvedBranch = resolveBranchFromContext(message, context);
  const anyMatchedBranch = findAnyBranchByMessage(message);
  const branchName = resolvedBranch?.name;
  const unknownBranchLikeTerm = extractUnknownBranchLikeTerm(message);

  if (anyMatchedBranch && !anyMatchedBranch.isActive) {
    const activeBranchNames = listActiveBranches().map((branch) => branch.name).join("、");
    return {
      decisionType: "clinic_info_reply",
      matchedKey: `inactive_branch:${anyMatchedBranch.name}`,
      matchedType: "config",
      replyText: `目前可安排的館別只有 ${activeBranchNames}。${anyMatchedBranch.name} 目前沒有開放接待；如果您方便，我可以直接幫您整理離您較近的館別或預約需求。`,
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  if (unknownBranchLikeTerm) {
    const activeBranchNames = listActiveBranches().map((branch) => branch.name).join("、");
    return {
      decisionType: "clinic_info_reply",
      matchedKey: `unsupported_branch_query:${unknownBranchLikeTerm}`,
      matchedType: "guided_reply",
      replyText: `目前可安排的館別只有 ${activeBranchNames}。${unknownBranchLikeTerm} 目前沒有開放接待；如果您願意，我可以先幫您整理較近館別、地址資訊或預約需求。`,
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  if (resolvedBranch && isBareBranchReference(normalizedMessage, resolvedBranch)) {
    return {
      decisionType: "clinic_info_reply",
      matchedKey: `branch_focus:${resolvedBranch.name}`,
      matchedType: "config",
      replyText: buildBranchFocusReply(resolvedBranch.name),
    } satisfies Omit<RouterDecision, "nextContext">;
  }

  if (
    includesAnyTerm(message, ADDRESS_TERMS) &&
    (includesAnyTerm(message, BRANCH_LIST_TERMS) || includesAnyTerm(message, ["全部", "所有", "各館"]))
  ) {
    return {
      decisionType: "clinic_info_reply",
      matchedKey: "branch_list",
      matchedType: "config",
      replyText: getBranchListReply(),
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

  if (includesAnyTerm(message, NEAREST_BRANCH_TERMS) && !isPromotionIntent(message)) {
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
      replyText: "目前可安排高雄、台中、桃園與林口館。請告訴我您所在的縣市，我幫您整理較方便的館別與地址。",
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

  if (includesAnyTerm(message, ADDRESS_TERMS) && !branchName) {
    return {
      decisionType: "clinic_info_reply",
      matchedKey: "branch_list",
      matchedType: "guided_reply",
      replyText: `${getBranchListReply()}\n如果您想比對哪一館離您比較近，也可以直接告訴我您所在的城市。`,
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
        replyText: buildBranchFocusReply(resolvedBranch.name),
      } satisfies Omit<RouterDecision, "nextContext">;
    }
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
  const consultationGuide = matchedTreatment.consultationGuide;

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

  const consultationQuickReply = consultationGuide
    ? buildConsultationQuickReply(matchedTreatment, message)
    : null;
  if (consultationQuickReply) {
    return consultationQuickReply;
  }

  return {
    decisionType: "treatment_intro_reply",
    matchedKey: `treatment_intro:${matchedTreatment.key}`,
    matchedType: "config",
    replyText: `${approvedIntroReply}${consultationGuide ? "" : ` ${matchedTreatment.evaluationNote}`}${branchAvailabilityNote ? ` ${branchAvailabilityNote}` : ""}\n${consultationGuide ? consultationGuide.discoveryPrompt : "如果您願意，也可以告訴我想改善的部位，以及方便的館別，我先幫您整理諮詢方向。"}`,
  } satisfies Omit<RouterDecision, "nextContext">;
}

function getTreatmentConsultationFollowup(message: string, context: ConversationContext) {
  if (
    includesAnyTerm(message, [...PRICE_OR_PROMOTION_TERMS, ...APPOINTMENT_TERMS, ...BOOKING_CANCEL_TERMS, ...BOOKING_MODIFY_TERMS]) ||
    findConcernByMessage(message) ||
    findTreatmentByMessage(message)
  ) {
    return null;
  }

  const treatment = getConsultationTreatment(context);
  if (!treatment?.consultationGuide) {
    return null;
  }

  const guide = treatment.consultationGuide;
  const consultationQuickReply = buildConsultationQuickReply(treatment, message);
  if (consultationQuickReply) {
    return consultationQuickReply;
  }

  return {
    decisionType: "treatment_intro_reply",
    matchedKey: `treatment_consult:${treatment.key}`,
    matchedType: "guided_reply",
    replyText: `了解，我先記下您想進一步了解 ${treatment.name}。${guide.featureSummary}\n${treatment.evaluationNote} ${guide.followupPrompt}`,
  } satisfies Omit<RouterDecision, "nextContext">;
}

function buildPricingReply(campaign: PricingCampaign) {
  const normalizedFallbackMessage = stripPromotionDateWording(campaign.fallback_message.trim());
  const fallbackSuffix = normalizedFallbackMessage
    ? ` ${normalizedFallbackMessage}`
    : "";
  const campaignLabel = `${campaign.treatment_name} 目前可參考`;
  const branchScope = campaign.branch_scope.trim();
  const branchScopeLabel =
    branchScope.toLowerCase() === "all"
      ? "全館適用。"
      : branchScope
        ? `適用館別：${branchScope.replace(/[|,，、/]+/g, "、")}。`
        : "";
  const detailLabel = campaign.price_text.trim()
    ? `：${campaign.price_text}。`
    : "；詳細內容可直接參考活動圖片。";

  return `${campaignLabel}${detailLabel} ${branchScopeLabel}${fallbackSuffix}`.trim();
}

function getPricingReply(
  message: string,
  context: ConversationContext,
  pricingCampaigns: PricingCampaign[],
  includePending: boolean,
  today: Date,
  bookingIntentActive: boolean,
) {
  if (!isPriceInquiry(message)) {
    return null;
  }

  const activeCampaigns = getActivePricingCampaigns(pricingCampaigns, includePending, today);
  const subject = resolvePricingSubject(message, context, {
    bookingIntentActive,
    contextualMaxAgeMs: TREATMENT_CONSULTATION_SESSION_MS,
    now: today,
  });

  if (subject.kind === "browse" && activeCampaigns.length > 0) {
    const replyText = buildPromotionOverviewReply(activeCampaigns);
    const carouselCards = buildPromotionCarouselCards(activeCampaigns);
    return {
      decisionType: "pricing_auto_reply",
      matchedKey: "promotion_overview",
      matchedType: "pricing_campaign",
      nextContext: context,
      replyMessages: carouselCards.length > 0 ? [buildPromotionCarouselMessage(carouselCards, "目前活動優惠")] : undefined,
      replyText,
      suppressAiFooter: carouselCards.length > 0,
    } satisfies RouterDecision;
  }

  if (subject.kind === "explicit" || subject.kind === "active" || subject.kind === "contextual") {
    const matchedPricing = findPricingCampaignForTreatmentKey(subject.treatmentKey, activeCampaigns);
    const treatment = findTreatmentByKey(subject.treatmentKey);
    if (!matchedPricing) {
      return {
        decisionType: "pricing_auto_reply",
        matchedKey: "pricing_followup",
        matchedType: "guided_reply",
        nextContext: context,
        replyText: treatment
          ? `目前尚未提供 ${treatment.name} 的核准價格方案。我可以先幫您安排免費諮詢，或請客服協助確認。`
          : "想了解哪個療程的價格或優惠呢？我可以先幫您確認核准方案。",
      } satisfies RouterDecision;
    }

    const replyText = buildPricingReply(matchedPricing);
    return {
      decisionType: "pricing_auto_reply",
      matchedKey: matchedPricing.treatment_name,
      matchedType: "pricing_campaign",
      nextContext: context,
      replyMessages: buildPromotionReplyMessages([matchedPricing], replyText),
      replyText,
    } satisfies RouterDecision;
  }

  return {
    decisionType: "pricing_auto_reply",
    matchedKey: "pricing_followup",
    matchedType: "guided_reply",
    nextContext: context,
    replyText: "想了解哪個療程的價格或優惠呢？我可以先幫您確認核准方案。",
  } satisfies RouterDecision;
}

function buildHandoffPendingReply(extraGuidance: string | null, now: Date) {
  const supportStatus = getHumanSupportStatus(now);
  const baseReply = supportStatus.inServiceHours
    ? "這個問題需要由真人客服進一步確認。我先幫您整理需求，稍後客服會接續協助。"
    : "這個問題需要由真人客服進一步確認。目前真人客服服務時間為週一至週五 09:00-18:00。我會先幫您整理需求，客服上班後再接續協助。";

  return extraGuidance ? `${extraGuidance} ${baseReply}` : baseReply;
}

function getHandoffPendingReply(message: string, now: Date, skipCustomerAccountLookup = false) {
  // A procedure word alone (for example, asking when Botox takes effect) is not
  // a safety signal. Escalate only when it is paired with an abnormal symptom.
  if (includesAnyTerm(message, POST_PROCEDURE_CONTEXT_TERMS) && includesAnyTerm(message, POST_PROCEDURE_ABNORMALITY_TERMS)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "post_procedure_issue",
      matchedType: "handoff_rule",
      replyText: `如果您現在有明顯疼痛、發燒、持續惡化的紅腫，或任何讓您不安的異常反應，建議盡快聯繫診所或就醫。${buildHandoffPendingReply("這類術後反應需要真人客服與現場進一步確認。", now)}`,
    } satisfies Omit<RouterDecision, "nextContext">;
  }

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

  if (hasContraindicationOrMedicalHistorySignal(message)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "contraindication_or_medical_history",
      matchedType: "handoff_rule",
      replyText: buildHandoffPendingReply("這類涉及既往病史、用藥或過敏狀況，需要由真人客服與醫師進一步確認。", now),
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

  if (!skipCustomerAccountLookup && includesAnyTerm(message, CUSTOMER_ACCOUNT_TERMS)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "customer_account_lookup",
      matchedType: "handoff_rule",
      replyText: buildHandoffPendingReply("這類涉及個人資料或既有紀錄查詢，我先幫您記下需求。", now),
    } satisfies Omit<RouterDecision, "nextContext">;
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
  runtimeAudienceKey = "",
  runtimeContentOverlay,
  semanticTreatmentConsultation,
  tenantId,
}: RouteCustomerMessageInput): Promise<RouterDecision> {
  const trimmedMessage = message.trim();
  const currentTime = now ?? new Date();
  const previousContext = cloneContext(conversationContext);
  const nextContext = cloneContext(conversationContext);
  clearExpiredBookingSession(previousContext, currentTime);
  clearExpiredBookingSession(nextContext, currentTime);
  clearStaleBookingDraft(previousContext, currentTime);
  clearStaleBookingDraft(nextContext, currentTime);
  clearStaleTreatmentConsultation(previousContext, currentTime);
  clearStaleTreatmentConsultation(nextContext, currentTime);
  nextContext.lastSeenAt = currentTime.toISOString();

  if (!trimmedMessage) {
    return {
      ...getGenericFallback(),
      nextContext,
    };
  }

  // Safety and human handoff rules always take precedence over booking follow-up.
  const hasStructuredBookingMessage = hasStructuredBookingForm(trimmedMessage);
  const hasBookingFollowup = isBookingFollowupMessage(trimmedMessage, previousContext, currentTime);
  const priorityHandoffReply = getHandoffPendingReply(
    trimmedMessage,
    currentTime,
    hasStructuredBookingMessage || hasBookingFollowup,
  );
  if (priorityHandoffReply) {
    nextContext.lastIntent = priorityHandoffReply.matchedKey;
    return {
      ...priorityHandoffReply,
      nextContext,
    };
  }

  const seedData = await loadSeedData();
  // Runtime content is an additive, reviewed overlay. Any database error or a
  // non-selected canary audience leaves the established seed baseline intact.
  const runtimeOverlay = runtimeContentOverlay ?? await loadRuntimeContentOverlay({
    audienceKey: runtimeAudienceKey,
    now: currentTime,
    tenantId,
  });
  const runtimeData = {
    ...seedData,
    faqEntries: [...runtimeOverlay.faqEntries, ...seedData.faqEntries],
    pricingCampaigns: [...runtimeOverlay.pricingCampaigns, ...seedData.pricingCampaigns],
  };
  const { matchedBranch, matchedTreatment } = updateContextEntities(trimmedMessage, nextContext);

  // Pregnancy, breastfeeding, and trying-to-conceive guidance must win over booking intake.
  const pregnancyReply = getPregnancyGuidanceReply(
    trimmedMessage,
    matchedTreatment?.name ?? nextContext.lastReferencedTreatment,
    runtimeData.pregnancyRules,
    includePending,
  );
  if (pregnancyReply) {
    nextContext.lastIntent = pregnancyReply.matchedKey;
    return {
      ...pregnancyReply,
      nextContext,
    };
  }

  if (isCapabilityQuestion(trimmedMessage)) {
    nextContext.lastIntent = "capability_intro";
    return {
      ...getCapabilityReply(),
      nextContext,
    };
  }

  if (hasBookingFollowup || hasStructuredBookingMessage) {
    preferActiveTreatmentConsultationForBooking(nextContext);
    updateBookingDraft(trimmedMessage, nextContext);
    const bookingIntent: "booking_intake" | "booking_modify_request" | "booking_cancel_request" =
      isBookingCancelRequest(trimmedMessage)
        ? "booking_cancel_request"
        : isBookingModifyRequest(trimmedMessage)
          ? "booking_modify_request"
          : isActiveBookingConversation(previousContext, currentTime)
            ? (previousContext.lastIntent as "booking_intake" | "booking_modify_request" | "booking_cancel_request")
            : "booking_intake";
    nextContext.lastIntent = bookingIntent;
    markBookingSessionActive(nextContext, currentTime);

    const replyText =
      bookingIntent === "booking_modify_request"
        ? buildBookingModifyReplyV2(nextContext)
        : bookingIntent === "booking_cancel_request"
          ? buildBookingCancelReplyV2(nextContext)
          : buildBookingIntakeReplyV2(nextContext);

    return {
      decisionType: "booking_intake_reply",
      matchedKey: bookingIntent,
      matchedType: "guided_reply",
      nextContext,
      replyText,
    };
  }

  if (isBookingCancelRequest(trimmedMessage)) {
    preferActiveTreatmentConsultationForBooking(nextContext);
    updateBookingDraft(trimmedMessage, nextContext);
    nextContext.lastIntent = "booking_cancel_request";
    markBookingSessionActive(nextContext, currentTime);
    return {
      decisionType: "booking_intake_reply",
      matchedKey: "booking_cancel_request",
      matchedType: "guided_reply",
      nextContext,
      replyText: buildBookingCancelReplyV2(nextContext),
    };
  }

  if (isBookingModifyRequest(trimmedMessage)) {
    preferActiveTreatmentConsultationForBooking(nextContext);
    updateBookingDraft(trimmedMessage, nextContext);
    nextContext.lastIntent = "booking_modify_request";
    markBookingSessionActive(nextContext, currentTime);
    return {
      decisionType: "booking_intake_reply",
      matchedKey: "booking_modify_request",
      matchedType: "guided_reply",
      nextContext,
      replyText: buildBookingModifyReplyV2(nextContext),
    };
  }

  // An appointment request remains an intake flow even when it names a doctor.
  // The monthly image is reference material, never an appointment confirmation.
  if (includesAnyTerm(trimmedMessage, APPOINTMENT_TERMS)) {
    preferActiveTreatmentConsultationForBooking(nextContext);
    updateBookingDraft(trimmedMessage, nextContext);
    nextContext.lastIntent = "booking_intake";
    markBookingSessionActive(nextContext, currentTime);
    return {
      decisionType: "booking_intake_reply",
      matchedKey: "booking_intake",
      matchedType: "guided_reply",
      nextContext,
      replyText: buildBookingIntakeReplyV2(nextContext),
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

  const basicInfoReply = getClinicBasicInfoReply(trimmedMessage, nextContext);
  if (basicInfoReply) {
    nextContext.lastIntent = shouldKeepBookingMode(previousContext, nextContext, trimmedMessage)
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

  const consultationPriorityReply = getTreatmentConsultationPriorityReply(trimmedMessage, nextContext);
  if (consultationPriorityReply) {
    nextContext.lastReferencedTreatment = consultationPriorityReply.treatment.name;
    setTreatmentConsultationPrimaryConcern(
      nextContext,
      consultationPriorityReply.treatment.key,
      consultationPriorityReply.concernKey,
    );
    nextContext.lastIntent = consultationPriorityReply.matchedKey;
    return {
      decisionType: consultationPriorityReply.decisionType,
      matchedKey: consultationPriorityReply.matchedKey,
      matchedType: consultationPriorityReply.matchedType,
      nextContext,
      replyText: consultationPriorityReply.replyText,
    };
  }

  const concernReply = getConcernReply(trimmedMessage, nextContext);
  if (concernReply) {
    const guidedTreatmentKey = concernReply.matchedKey.match(/^treatment_consult:(.+)$/u)?.[1];
    const guidedTreatment = guidedTreatmentKey ? findTreatmentByKey(guidedTreatmentKey) : null;
    if (guidedTreatment) {
      nextContext.lastReferencedTreatment = guidedTreatment.name;
      const matchedConcern = findConcernByMessage(trimmedMessage);
      if (matchedConcern) {
        recordTreatmentConsultationConcern(
          nextContext,
          guidedTreatment.key,
          matchedConcern.key,
          concernReply.consultationAspectKey,
        );
      }
    }
    nextContext.lastIntent = shouldKeepBookingMode(previousContext, nextContext, trimmedMessage)
      ? "booking_intake"
      : concernReply.matchedKey;
    const { consultationAspectKey: _consultationAspectKey, ...decision } = concernReply;
    return {
      ...decision,
      nextContext,
    };
  }

  if (semanticTreatmentConsultation) {
    const semanticTreatmentReply = getSemanticTreatmentConsultationReply(semanticTreatmentConsultation, nextContext);
    if (semanticTreatmentReply) {
      nextContext.lastReferencedTreatment = semanticTreatmentReply.treatment.name;
      recordTreatmentConsultationConcern(
        nextContext,
        semanticTreatmentReply.treatment.key,
        semanticTreatmentConsultation.concern,
        semanticTreatmentReply.consultationAspectKey,
      );
      nextContext.lastIntent = semanticTreatmentReply.matchedKey;
      return {
        decisionType: semanticTreatmentReply.decisionType,
        matchedKey: semanticTreatmentReply.matchedKey,
        matchedType: semanticTreatmentReply.matchedType,
        nextContext,
        replyText: semanticTreatmentReply.replyText,
      };
    }
  }

  const treatmentConsultationFollowup = getTreatmentConsultationFollowup(trimmedMessage, nextContext);
  if (treatmentConsultationFollowup) {
    nextContext.lastIntent = treatmentConsultationFollowup.matchedKey;
    return {
      ...treatmentConsultationFollowup,
      nextContext,
    };
  }

  const pricingReply = getPricingReply(
    trimmedMessage,
    previousContext,
    runtimeData.pricingCampaigns,
    includePending,
    currentTime,
    isBookingConversationIntent(previousContext.lastIntent),
  );
  if (pricingReply) {
    nextContext.lastIntent = shouldKeepBookingMode(previousContext, nextContext, trimmedMessage)
      ? "booking_intake"
      : pricingReply.matchedKey;
    return {
      ...pricingReply,
      nextContext,
    };
  }

  const treatmentReply = getTreatmentReply(trimmedMessage, nextContext);
  if (treatmentReply) {
    nextContext.lastIntent = shouldKeepBookingMode(previousContext, nextContext, trimmedMessage)
      ? "booking_intake"
      : treatmentReply.matchedKey;
    return {
      ...treatmentReply,
      nextContext,
    };
  }

  if (isGenericTreatmentInquiry(trimmedMessage)) {
    nextContext.lastIntent = "guided_clarify";
    return {
      decisionType: "fallback_reply",
      matchedKey: "generic_treatment_inquiry",
      matchedType: "guided_reply",
      nextContext,
      replyText:
        "可以的，想先了解哪一項療程呢？也可以直接告訴我您想改善的部位或在意的問題，我會先依院內核准資訊協助您整理方向。",
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

  const matchedFaq = matchFaq(trimmedMessage, runtimeData.faqEntries, includePending);
  if (matchedFaq) {
    nextContext.lastIntent = shouldKeepBookingMode(previousContext, nextContext, trimmedMessage)
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
