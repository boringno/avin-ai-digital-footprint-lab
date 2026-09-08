export const pricingKinds = ["campaign", "standing"] as const;

export type PricingKind = (typeof pricingKinds)[number];

type PricingLifecycleRecord = {
  pricing_kind?: string;
};

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
