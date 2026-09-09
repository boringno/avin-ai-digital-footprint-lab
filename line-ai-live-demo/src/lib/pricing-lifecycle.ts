export const pricingKinds = ["campaign", "standing"] as const;

export type PricingKind = (typeof pricingKinds)[number];

type PricingLifecycleRecord = {
  campaign_name?: string;
  id?: string;
  pricing_kind?: string;
};

/**
 * This is intentionally an offer-id allowlist, not a treatment or price
 * allowlist.  A treatment can have both a customer-visible anniversary offer
 * and a staff-only extension with the same amount or a similar name.
 */
export const ANNIVERSARY_ONLINE_PUBLIC_PROMOTION_IDS: ReadonlySet<string> = new Set([
  "promo-2026-anniv-vio",
  "promo-2026-anniv-underarm",
  "promo-2026-anniv-botox-10u",
  "promo-2026-anniv-pico-honeycomb",
  "promo-2026-anniv-tenthermage-eye-300",
  "promo-2026-anniv-tenthermage-200",
  "promo-2026-anniv-qplus-200",
  "promo-2026-anniv-ultherapy-200-botox40",
  "promo-2026-anniv-onda-face-online",
  "promo-2026-anniv-beienxi-1cc",
  "promo-2026-anniv-powder-glow",
] as const);

const ANNIVERSARY_PROMOTION_ID_PREFIX = "promo-2026-anniv-";

export function normalizeCampaignFamilyText(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, "").replace(/週/gu, "周").replace(/庆/gu, "慶");
}

export function hasAnniversaryCampaignWording(value: string) {
  return normalizeCampaignFamilyText(value).includes("周年慶");
}

export function isAnniversaryPromotion(record: PricingLifecycleRecord) {
  if (record.id?.trim().startsWith(ANNIVERSARY_PROMOTION_ID_PREFIX)) return true;
  if (isStandingPrice(record)) return false;
  const name = normalizeCampaignFamilyText(record.campaign_name ?? "");
  if (!hasAnniversaryCampaignWording(name)) return false;
  const year = name.match(/(?:20\d{2}|1\d{2})(?=年|周年慶)/u)?.[0];
  const edition = name.match(/(?:第)?(\d{1,2})周年慶/u)?.[1];
  // No family metadata exists yet: unqualified anniversary wording belongs to
  // the current DEMO family, while explicitly different years/editions do not.
  if (year && !["2026", "115"].includes(year)) return false;
  if (edition && !year && edition !== "21") return false;
  return true;
}

/**
 * Unknown anniversary rows fail closed.  This deliberately leaves standing
 * prices and other campaigns under their existing approval lifecycles.
 */
export function isCustomerVisiblePriceOffer(record: PricingLifecycleRecord) {
  return !isAnniversaryPromotion(record) ||
    ANNIVERSARY_ONLINE_PUBLIC_PROMOTION_IDS.has(record.id?.trim() ?? "");
}

/**
 * Older price rows predate an explicit lifecycle field and were all timed
 * campaigns. Keep that backward-compatible default while allowing reviewed
 * standing prices to exist without an artificial expiry date.
 */
export function pricingKindFor(record: PricingLifecycleRecord): PricingKind {
  return record.pricing_kind?.trim().toLowerCase() === "standing"
    ? "standing"
    : "campaign";
}

export function isStandingPrice(record: PricingLifecycleRecord) {
  return pricingKindFor(record) === "standing";
}
