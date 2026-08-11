import {
  clinicConfig,
  findTreatmentByKey,
  findTreatmentByMessage,
  normalizeClinicText,
} from "@/lib/clinic-config";
import type { ConversationContext } from "@/lib/conversation-context";

export const PRICE_ASK_TERMS = ["價格", "價錢", "價位", "費用", "方案", "活動", "優惠", "多少錢", "報價", "體驗價", "折扣"];

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
  return includesAnyTerm(message, PRICE_ASK_TERMS) || isPromotionBrowseIntent(message);
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

  if (!includesAnyTerm(message, PRICE_ASK_TERMS)) {
    return { kind: "unresolved" };
  }

  const activeTreatmentKey = context.treatmentConsultation?.treatmentKey;
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
