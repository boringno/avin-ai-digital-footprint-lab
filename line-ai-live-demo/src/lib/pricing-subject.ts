import {
  clinicConfig,
  findTreatmentByKey,
  findTreatmentByMessage,
  normalizeClinicText,
} from "@/lib/clinic-config";
import type { ConversationContext } from "@/lib/conversation-context";

export const PRICE_ASK_TERMS = ["價格", "價錢", "價位", "費用", "收費", "方案", "活動", "優惠", "多少錢", "報價", "體驗價", "折扣"];

/** Only an anaphoric amount follow-up can borrow a verified pricing exchange.
 * Quantity, frequency, duration and newly named subjects must supply their own evidence.
 */
export function isContextualPriceFollowup(message: string) {
  return /^(?:那|這)(?:個|個方案|個療程)?(?:是|要)?多少(?:呢|啊|呀|嗎)?$/u.test(
    normalizeClinicText(message).replace(/[？?！!。.,，\s]/gu, ""),
  );
}

const FUZZY_PRICE_INQUIRY_TERMS = [
  "多少錢",
  "怎麼收費",
  "價格多少",
  "費用多少",
  "活動價",
  "體驗價",
  "優惠價",
  "正常價格",
  "原價多少",
] as const;
const NON_PRICE_QUANTITY_PATTERN =
  /多少(?:次|堂|發|單位|u|週|天|分鐘|小時|支|瓶|cc|毫升|部位|人)/iu;
const FUZZY_PRICE_SEMANTIC_ANCHOR_PATTERN = /(?:錢|前|價|費|收費|報價|活動|優惠|折扣)/u;

function isWithinOneEdit(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) {
      leftIndex += 1;
    } else if (right.length > left.length) {
      rightIndex += 1;
    } else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  if (leftIndex < left.length || rightIndex < right.length) edits += 1;
  return edits <= 1;
}

function containsWithinOneEdit(message: string, term: string) {
  for (const windowLength of [term.length - 1, term.length, term.length + 1]) {
    if (windowLength < 2 || windowLength > message.length) continue;
    for (let start = 0; start + windowLength <= message.length; start += 1) {
      if (isWithinOneEdit(message.slice(start, start + windowLength), term)) return true;
    }
  }
  return false;
}

/**
 * Recovers a single missing, extra, or mistyped character in a price phrase.
 * Callers must also have an explicit treatment subject; this is intentionally
 * not a global fuzzy intent classifier.
 */
export function isLikelyPriceInquiryTypo(message: string) {
  const normalized = normalizeClinicText(message).replace(/[^\p{L}\p{N}]/gu, "");
  if (NON_PRICE_QUANTITY_PATTERN.test(normalized)) return false;
  // Edit distance alone would make 「多少針／多少點／多少區」 look like
  // 「多少錢」. Fuzzy recovery is only safe when the current message still
  // contains a customer-visible price cue (including the common 錢→前 typo).
  if (!FUZZY_PRICE_SEMANTIC_ANCHOR_PATTERN.test(normalized)) return false;
  return Boolean(
    normalized && FUZZY_PRICE_INQUIRY_TERMS.some((term) =>
      containsWithinOneEdit(normalized, normalizeClinicText(term))),
  );
}

/**
 * Hedged ways of naming a treatment ("我好像想問那個肉毒").
 *
 * A hedge means the customer has not committed to a subject, so a price answer must
 * keep clarifying instead of borrowing whichever treatment happens to be active.
 * Both the NLU adapter and the V2 policy gate on this, and they must never drift
 * apart, so the pattern lives here beside the price wording it is paired with.
 */
export const HEDGED_TREATMENT_REFERENCE_PATTERN =
  /(?:(?:好像|似乎|可能|也許).{0,8}(?:想問|想了解|是|指|哪個|那個)|(?:不確定|不太確定|不知道).{0,8}(?:是不是|哪一個|哪個|什麼療程)|某個.{0,4}(?:療程|治療))/u;

export function isHedgedTreatmentReference(message: string) {
  return HEDGED_TREATMENT_REFERENCE_PATTERN.test(message);
}

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
  /多少(?:元|塊)/u,
  /(?:體驗價|活動價|優惠價|現價|目前價格|現在價格|現行價格|這個價格|方案價格)/u,
  /(?:價格|價錢|價位|費用|收費|多少錢|報價|折扣)/u,
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

export function isPriceInquiryWithTypoTolerance(
  message: string,
  hasExplicitTreatment: boolean,
) {
  // 「打完肉毒有哪些活動不能做」中的「活動」是日常活動，
  // 不是少一個「價」字的「活動價」。這道邊界必須在模糊容錯前
  // 判斷，否則明確療程名稱會讓編輯距離把術後衛教拉成問價。
  if (isPurePostTreatmentActivityQuestion(message)) {
    return false;
  }
  return isPriceInquiry(message) ||
    (hasExplicitTreatment && isLikelyPriceInquiryTypo(message));
}

export function isPromotionBrowseIntent(message: string) {
  if (!includesAnyTerm(message, clinicConfig.pricePolicy.browseTerms)) {
    return false;
  }

  // 「活動」也可能指術後能否運動。只要句子的實際問題是術後限制，
  // 即使前面提到「週年慶方案」，也應留給療程／術後衛教；真正詢問
  // 「活動優惠」不含這些限制語意，仍會進入活動目錄。
  return !isPurePostTreatmentActivityQuestion(message);
}

/**
 * Distinguishes physical activity / after-care questions from campaign
 * browsing.  An explicit commercial question in the same message is retained
 * so the multi-intent layer can still answer the price obligation as well.
 */
export function isPurePostTreatmentActivityQuestion(message: string) {
  const normalizedMessage = normalizeClinicText(message);
  const asksAboutAfterCare =
    /(?:術後|打完|做完|施作後|治療後|療程後|雷射後|恢復期)/u.test(normalizedMessage) &&
    /(?:活動|運動)/u.test(normalizedMessage) &&
    /(?:可以|不能|避免|多久|恢復|注意|限制|受限|不建議|受影響|影響|暫停|休息|能否|可否|日常|正常活動)/u.test(normalizedMessage);
  if (!asksAboutAfterCare) return false;

  const commercialPriceTerm =
    "(?:價格|價錢|價位|費用|收費|報價|活動價|體驗價|優惠價|現價|原價)";
  const alsoAsksCommercialPrice = new RegExp(
    `(?:多少錢|${commercialPriceTerm}(?:是多少|多少|怎麼算|如何算|是什麼|呢|嗎|[?？])|(?:想問|請問|想知道|想了解|了解).{0,8}${commercialPriceTerm}|(?:最近|近期|現在|目前)?有(?:什麼)?(?:活動|優惠|方案)(?:嗎|呢|[?？])|折扣多少|有哪些優惠|有什麼優惠|優惠內容|優惠方案)`,
    "u",
  ).test(normalizedMessage);
  return !alsoAsksCommercialPrice;
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
