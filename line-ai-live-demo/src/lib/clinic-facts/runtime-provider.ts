import crypto from "node:crypto";

import { loadRuntimeContentOverlay, mergeRuntimePricingCampaigns, type RuntimeContentOverlay } from "@/lib/runtime-content-release";
import { loadSeedData, type PricingCampaign } from "@/lib/seed-loader";
import { CLINIC_CONFIG_CONTENT_VERSION } from "@/lib/treatment-knowledge";

import { createStaticClinicFactsProvider } from "./static-provider";
import type {
  ClinicFactsProvider,
  ClinicFactsSnapshot,
  ClinicFactsSnapshotRequest,
} from "./types";

export const RUNTIME_CLINIC_FACTS_PROVIDER_VERSION = "runtime-clinic-facts-v1";

export type RuntimeClinicFactsProviderDependencies = {
  loadRuntimeContentOverlay?: typeof loadRuntimeContentOverlay;
  loadSeedData?: typeof loadSeedData;
};

function unavailableOverlay(): RuntimeContentOverlay {
  return {
    faqEntries: [],
    pricingCampaigns: [],
    releaseId: null,
    sourceStatus: "unavailable",
    suppressedPricingCampaignIds: [],
  };
}

function snapshotDescriptor(
  overlay: RuntimeContentOverlay,
  priceSourceAvailable: boolean,
  pricingCampaigns: readonly PricingCampaign[],
) {
  const contentVersion = overlay.releaseId
    ? `release:${overlay.releaseId}`
    : "seed";
  return {
    snapshotId: [
      RUNTIME_CLINIC_FACTS_PROVIDER_VERSION,
      CLINIC_CONFIG_CONTENT_VERSION,
      contentVersion,
      crypto.createHash("sha256").update(JSON.stringify({
        campaigns: pricingCampaigns
          .map((campaign) => ({
            customerPriceText: campaign.customer_price_text ?? "",
            endDate: campaign.end_date,
            id: campaign.id,
            startDate: campaign.start_date,
          }))
          .sort((left, right) => left.id.localeCompare(right.id)),
        suppressed: [...overlay.suppressedPricingCampaignIds].sort(),
      })).digest("hex").slice(0, 12),
      priceSourceAvailable ? "price-ready" : "price-source-unavailable",
    ].join(":"),
    source: priceSourceAvailable
      ? overlay.releaseId
        ? "clinic_config_seed_and_runtime_release"
        : "clinic_config_and_seed"
      : "clinic_config_with_price_source_unavailable",
  };
}

/**
 * Turn-scoped adapter over the existing immutable runtime release mechanism.
 * Treatment knowledge stays on the reviewed static catalog and remains
 * explicitly partial; approved campaign prices may be overlaid per audience.
 */
export class RuntimeClinicFactsProvider implements ClinicFactsProvider {
  private readonly loadRuntimeOverlay: typeof loadRuntimeContentOverlay;
  private readonly loadSeeds: typeof loadSeedData;

  constructor(dependencies: RuntimeClinicFactsProviderDependencies = {}) {
    this.loadRuntimeOverlay = dependencies.loadRuntimeContentOverlay ?? loadRuntimeContentOverlay;
    this.loadSeeds = dependencies.loadSeedData ?? loadSeedData;
  }

  async loadSnapshot(input: ClinicFactsSnapshotRequest): Promise<ClinicFactsSnapshot> {
    // Both sources are loaded exactly once for this turn. A rejected runtime
    // lookup is represented as unavailable so no seed amount can leak through.
    const [seedResult, overlayResult] = await Promise.allSettled([
      this.loadSeeds(),
      this.loadRuntimeOverlay({
        audienceKey: input.audienceKey ?? "",
        now: input.now,
        tenantId: input.tenantId,
      }),
    ]);
    const seedData = seedResult.status === "fulfilled" ? seedResult.value : null;
    const overlay = overlayResult.status === "fulfilled"
      ? overlayResult.value
      : unavailableOverlay();
    const priceSourceAvailable = Boolean(seedData) && overlay.sourceStatus !== "unavailable";
    const pricingCampaigns = priceSourceAvailable && seedData
      ? mergeRuntimePricingCampaigns(seedData.pricingCampaigns, overlay)
      : [];
    const descriptor = snapshotDescriptor(overlay, priceSourceAvailable, pricingCampaigns);

    return createStaticClinicFactsProvider({
      priceCatalogCompleteness: "partial",
      priceSourceAvailable,
      pricingCampaigns,
      snapshotId: descriptor.snapshotId,
      source: descriptor.source,
      treatmentCatalogCompleteness: "partial",
      treatmentSourceAvailable: true,
    }).loadSnapshot(input);
  }
}

export function createRuntimeClinicFactsProvider(
  dependencies: RuntimeClinicFactsProviderDependencies = {},
) {
  return new RuntimeClinicFactsProvider(dependencies);
}

export const runtimeClinicFactsProvider = createRuntimeClinicFactsProvider();
