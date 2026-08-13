import {
  clinicConfig,
  findTreatmentByKey,
  findTreatmentByMessage,
  normalizeClinicText,
} from "@/lib/clinic-config";
import type { ConversationContext } from "@/lib/conversation-context";

export const PRICE_ASK_TERMS = ["價格", "價錢", "價位", "費用", "方案", "活動", "優惠", "多少錢", "報價", "體驗價", "折扣"];

export type PricingQuestionKind =
  | "regular"
  | "post_campaign"
  | "alternate"
  | "current_offer"
  | "browse";

const POST_CAMPAIGN_PRICE_PATTERNS = [
  /(?:活動|優惠|體驗|方案)(?:結束|到期|過期|完了|沒有了|沒了|之後|以後).*(?:價格|價錢|價位|費用|多少|原價|正常價|一般價|恢復|回復)/u,
  /(?:結束|到期|過期|之後|以後|過後).*(?:價格|價錢|價位|費用|多少|原價|正常價|一般價|恢復|回復)/u,
  /(?:恢復|回復|變回)(?:原價|正常價|一般價|價格|多少)/u,
  /(?:活動|優惠|體驗(?:價)?|方案)(?:結束|到期|過期|完了|沒有了|沒了)(?:呢|之後|以後|的話|會怎樣|怎麼算)?$/u,
];

const REGULAR_PRICE_PATTERNS = [
  /(?:原價|正價|定價|正常價|正常價格|一般價|一般價格|平常價|平常價格|非活動價|非優惠價)/u,
  /(?:不是|不算|不含|沒有)(?:活動|優惠)(?:價|價格|的話|時)/u,
  /(?:平時|平常|一般|正常)(?:的)?(?:價|價格|價錢|價位|費用)(?:是)?(?:多少|怎麼算|如何算|呢|嗎)?/u,
  /(?:那)?(?:平時|平常|一般|正常)(?:是)?(?:怎麼算|如何算|多少)/u,
  /非(?:活動|優惠)(?:期間|時段|的時候|時)?(?:是)?(?:多少|怎麼算|如何算|費用|價格|價錢)?/u,
];

const ALTERNATE_PRICE_PATTERNS = [
  /(?:其他|別的|另一個|不同)(?:價格|價錢|價位|費用|方案|優惠)/u,
  /還有(?:沒有)?(?:其他|別的)?(?:價格|價錢|價位|費用|方案|優惠)/u,
];

const CURRENT_OFFER_PATTERNS = [
  /(?:體驗價|活動價|優惠價|現價|目前價格|現在價格|現行價格|這個價格|方案價格)/u,
  /(?:價格|價錢|價位|費用|多少錢|報價|折扣)/u,
  /(?:目前|現在|近期|最近)(?:活動|優惠|方案)/u,
  /(?:活動|優惠|方案)(?:是什麼|有哪些|內容|怎麼算|如何)/u,
  /這個(?:活動|方案).*(?:多少|價格|價錢|價位|費用|報價)/u,
  /(?:有活動嗎|有優惠嗎|方案多少|方案費用|方案優惠)/u,
];

export type PricingSubjectResolution =
  | { kind: "explicit"; treatmentKey: string }
  | { kind: "active"; treatmentKey: string }
  | { kind: "contextual"; treatmentKey: string }
  | { kind: "browse" }
  | { kind: "unresolved" };

type PricingSubjectOptions = {
  bookingIntentActive: boolean;
  contextualMaxAgeMs: number;
  now: Date;
};

function includesAnyTerm(message: string, terms: string[]) {
  const normalizedMessage = normalizeClinicText(message);
  return terms.some((term) => normalizedMessage.includes(normalizeClinicText(term)));
}

/**
 * Describes what kind of price answer the customer is asking for without
 * deciding which treatment owns that price. More-specific follow-ups must win
 * before the generic current-offer bucket so that a regular-price question is
 * not answered by repeating the campaign price.
 */
export function parsePricingQuestionKind(message: string): PricingQuestionKind | null {
  const normalizedMessage = normalizeClinicText(message);
  if (!normalizedMessage) {
    return null;
  }

  if (isPromotionBrowseIntent(message)) {
    return "browse";
  }

  if (POST_CAMPAIGN_PRICE_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    return "post_campaign";
  }

  if (REGULAR_PRICE_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    return "regular";
  }

  if (ALTERNATE_PRICE_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    return "alternate";
  }

  if (CURRENT_OFFER_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    return "current_offer";
  }

  return null;
}

function findTreatmentKeyByStoredName(name: string | undefined) {
  const value = name?.trim();
  if (!value) {
    return null;
  }

  const exactMatch = clinicConfig.treatmentList.find((treatment) =>
    [treatment.name, ...treatment.aliases].some((alias) => normalizeClinicText(alias) === normalizeClinicText(value)),
  );
  return exactMatch?.key ?? findTreatmentByMessage(value)?.key ?? null;
}

function getBookingTreatmentKey(context: ConversationContext) {
  const treatments = context.bookingDraft.treatment
    ?.split(/[、,，]/)
    .map((value) => value.trim())
    .filter(Boolean) ?? [];

  return treatments.map(findTreatmentKeyByStoredName).find((key): key is string => Boolean(key)) ?? null;
}

function hasFreshContext(context: ConversationContext, now: Date, contextualMaxAgeMs: number) {
  if (!context.lastSeenAt) {
    return false;
  }

  const lastSeenAt = new Date(context.lastSeenAt).getTime();
  return Number.isFinite(lastSeenAt) && now.getTime() - lastSeenAt <= contextualMaxAgeMs;
}

function isCurrentTreatmentTopic(context: ConversationContext) {
  const lastIntent = context.lastIntent?.trim();
  if (!lastIntent) {
    return false;
  }

  if (lastIntent.startsWith("treatment_intro:") || lastIntent.startsWith("treatment_consult:")) {
    return true;
  }

  return clinicConfig.treatmentList.some((treatment) =>
    [treatment.name, ...treatment.aliases].some((alias) => normalizeClinicText(alias) === normalizeClinicText(lastIntent)),
  );
}

export function isPriceInquiry(message: string) {
  return parsePricingQuestionKind(message) !== null;
}

export function isPromotionBrowseIntent(message: string) {
  return includesAnyTerm(message, clinicConfig.pricePolicy.browseTerms);
}

export function resolvePricingSubject(
  message: string,
  context: ConversationContext,
  { bookingIntentActive, contextualMaxAgeMs, now }: PricingSubjectOptions,
): PricingSubjectResolution {
  const namedTreatment = findTreatmentByMessage(message);
  if (namedTreatment) {
    return { kind: "explicit", treatmentKey: namedTreatment.key };
  }

  if (isPromotionBrowseIntent(message)) {
    return { kind: "browse" };
  }

  if (!isPriceInquiry(message)) {
    return { kind: "unresolved" };
  }

  const canonicalSingleTreatmentKey = context.dialogueState?.topic === "treatment" &&
    context.dialogueState.treatmentKeys.length === 1 &&
    hasFreshContext(context, now, contextualMaxAgeMs)
    ? context.dialogueState.treatmentKeys[0]
    : undefined;
  const activeTreatmentKey = canonicalSingleTreatmentKey ?? context.treatmentConsultation?.treatmentKey;
  if (activeTreatmentKey && findTreatmentByKey(activeTreatmentKey)) {
    return { kind: "active", treatmentKey: activeTreatmentKey };
  }

  if (bookingIntentActive) {
    const bookingTreatmentKey = getBookingTreatmentKey(context);
    if (bookingTreatmentKey) {
      return { kind: "contextual", treatmentKey: bookingTreatmentKey };
    }
  }

  if (isCurrentTreatmentTopic(context) && hasFreshContext(context, now, contextualMaxAgeMs)) {
    const lastReferencedTreatmentKey = findTreatmentKeyByStoredName(context.lastReferencedTreatment);
    if (lastReferencedTreatmentKey) {
      return { kind: "contextual", treatmentKey: lastReferencedTreatmentKey };
    }
  }

  return { kind: "unresolved" };
}
