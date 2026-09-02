import type { PricingCampaign } from "@/lib/seed-loader";

const MAX_QUOTE_PRIORITY = 10_000;

/**
 * A clinic-owned rank for the offer shown when the customer asks a generic
 * price question. Explicit package, dose, variant, or campaign selections are
 * resolved before this rank is considered.
 */
export function pricingCampaignQuotePriority(campaign: PricingCampaign) {
  const raw = campaign.quote_priority;
  if (raw === undefined || raw === null || raw === "") return 0;
  const parsed = typeof raw === "number" ? raw : Number(raw.trim());
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_QUOTE_PRIORITY) return 0;
  return parsed;
}

/**
 * Once at least one eligible offer has a declared priority, unranked legacy
 * rows cannot win merely because they appeared first in CSV or JSON order.
 */
export function highestQuotePriorityCampaigns<T extends PricingCampaign>(
  campaigns: readonly T[],
) {
  if (campaigns.length === 0) return [];
  const highest = Math.max(...campaigns.map(pricingCampaignQuotePriority));
  if (highest <= 0) return [...campaigns];
  return campaigns.filter((campaign) => pricingCampaignQuotePriority(campaign) === highest);
}

export function isSpecificPricingCampaign(campaign: PricingCampaign) {
  return Boolean(
    campaign.dose?.trim() ||
      campaign.package_key?.trim() ||
      String(campaign.session_count ?? "").trim() ||
      campaign.variant_key?.trim(),
  );
}
