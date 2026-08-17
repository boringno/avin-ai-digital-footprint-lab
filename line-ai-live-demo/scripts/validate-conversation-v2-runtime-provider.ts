import assert from "node:assert/strict";

import {
  createRuntimeClinicFactsProvider,
  loadClinicFactsSnapshot,
  resolveApprovedPrice,
  resolveTreatmentFact,
  type ClinicFactsSnapshot,
} from "../src/lib/clinic-facts";
import type { RuntimeContentOverlay } from "../src/lib/runtime-content-release";
import type { PricingCampaign } from "../src/lib/seed-loader";

const NOW = new Date("2026-08-17T04:00:00.000Z");
const PRIVATE_AUDIENCE_A = "line-user-private-a";
const PRIVATE_AUDIENCE_B = "line-user-private-b";

type RuntimeRequest = {
  audienceKey: string;
  now: Date;
  tenantId?: string;
};

type RuntimeFixture =
  | Error
  | RuntimeContentOverlay
  | ((input: RuntimeRequest) => Error | RuntimeContentOverlay);

function campaign(priceText: string): PricingCampaign {
  return {
    approval_status: "approved",
    asset_urls: "",
    branch_scope: "all",
    campaign_aliases: "",
    campaign_name: "internal runtime provider fixture",
    customer_price_approval_status: "approved",
    customer_price_text: priceText,
    end_date: "2026-08-31",
    fallback_message: "請由客服協助確認。",
    id: "runtime-provider-price",
    is_active: "true",
    notes: "validator",
    price_text: priceText,
    start_date: "2026-08-01",
    treatment_name: "ONDA PRO",
  };
}

function overlay(input: {
  price?: string;
  releaseId: string | null;
  sourceStatus?: RuntimeContentOverlay["sourceStatus"];
  suppressedPricingCampaignIds?: string[];
}): RuntimeContentOverlay {
  return {
    faqEntries: [],
    pricingCampaigns: input.price ? [campaign(input.price)] : [],
    releaseId: input.releaseId,
    sourceStatus: input.sourceStatus ?? "available",
    suppressedPricingCampaignIds: input.suppressedPricingCampaignIds
      ?? (input.releaseId ? ["runtime-provider-price"] : []),
  };
}

function resolvedPrice(snapshot: ClinicFactsSnapshot) {
  const result = resolveApprovedPrice(snapshot, {
    kind: "campaign",
    treatmentKeys: ["onda_pro"],
  });
  if (result.status !== "approved_current") {
    throw new Error(`Expected an approved price, received ${result.reason}`);
  }
  return result.customerPriceText;
}

async function main() {
  const checks: string[] = [];
  let seedCalls = 0;
  let runtimeCalls = 0;
  let runtimeState: RuntimeFixture = overlay({
    price: "release A 10,999",
    releaseId: "release-a",
  });
  const runtimeRequests: RuntimeRequest[] = [];
  const provider = createRuntimeClinicFactsProvider({
    loadRuntimeContentOverlay: async (input) => {
      runtimeCalls += 1;
      runtimeRequests.push(input);
      const selectedState = typeof runtimeState === "function"
        ? runtimeState(input)
        : runtimeState;
      if (selectedState instanceof Error) throw selectedState;
      return selectedState;
    },
    loadSeedData: async () => {
      seedCalls += 1;
      return {
        faqEntries: [],
        handoffRules: [],
        pregnancyRules: [],
        pricingCampaigns: [campaign("seed 9,999")],
      };
    },
  });

  async function load(audienceKey: string, tenantId: string) {
    const seedCallsBefore = seedCalls;
    const runtimeCallsBefore = runtimeCalls;
    const snapshot = await loadClinicFactsSnapshot(provider, {
      audienceKey,
      now: NOW,
      tenantId,
    });
    assert.equal(seedCalls, seedCallsBefore + 1, "each snapshot must load seed data exactly once");
    assert.equal(runtimeCalls, runtimeCallsBefore + 1, "each snapshot must load the runtime overlay exactly once");
    checks.push("single-load-per-source");
    return snapshot;
  }

  const releaseA = await load(PRIVATE_AUDIENCE_A, "tenant-a");
  assert.equal(resolvedPrice(releaseA), "release A 10,999");
  assert.equal(releaseA.treatmentCatalogCompleteness, "partial");
  assert.equal(releaseA.treatmentSourceAvailable, true);
  assert.equal(resolveTreatmentFact(releaseA, "onda_pro", "introduction").status, "offered");
  const unknownTreatment = resolveTreatmentFact(releaseA, "future_device", "introduction");
  assert.equal(unknownTreatment.status, "unknown");
  if (unknownTreatment.status === "unknown") {
    assert.equal(unknownTreatment.reason, "not_in_partial_catalog");
  }
  checks.push("release-a-price", "static-partial-treatment-catalog");

  const sameReleaseDifferentAudience = await load(PRIVATE_AUDIENCE_B, "tenant-a");
  assert.equal(sameReleaseDifferentAudience.snapshotId, releaseA.snapshotId);
  assert.equal(resolvedPrice(sameReleaseDifferentAudience), "release A 10,999");
  checks.push("snapshot-id-excludes-audience");

  runtimeState = overlay({ price: "release B 12,999", releaseId: "release-b" });
  const releaseB = await load(PRIVATE_AUDIENCE_A, "tenant-a");
  assert.equal(resolvedPrice(releaseB), "release B 12,999");
  assert.notEqual(releaseB.snapshotId, releaseA.snapshotId);

  runtimeState = overlay({ price: "release A 10,999", releaseId: "release-a" });
  const releaseAAgain = await load(PRIVATE_AUDIENCE_A, "tenant-a");
  assert.equal(resolvedPrice(releaseAAgain), "release A 10,999");
  assert.equal(releaseAAgain.snapshotId, releaseA.snapshotId);
  assert.notEqual(releaseAAgain.snapshotId, releaseB.snapshotId);
  checks.push("same-tenant-audience-a-b-a-version-isolation");

  runtimeState = ({ tenantId }) => {
    if (tenantId === "tenant-a") {
      return overlay({ price: "tenant A 13,111", releaseId: "tenant-a-release" });
    }
    if (tenantId === "tenant-b") {
      return overlay({ price: "tenant B 14,222", releaseId: "tenant-b-release" });
    }
    return new Error(`Unexpected tenant fixture: ${tenantId ?? "<missing>"}`);
  };
  const tenantAPrice = await load(PRIVATE_AUDIENCE_A, "tenant-a");
  const tenantBPrice = await load(PRIVATE_AUDIENCE_A, "tenant-b");
  assert.equal(resolvedPrice(tenantAPrice), "tenant A 13,111");
  assert.equal(resolvedPrice(tenantBPrice), "tenant B 14,222");
  assert.notEqual(tenantAPrice.snapshotId, tenantBPrice.snapshotId);
  checks.push("tenant-specific-runtime-facts");

  runtimeState = overlay({ releaseId: null });
  const rolledBack = await load(PRIVATE_AUDIENCE_A, "tenant-a");
  assert.equal(resolvedPrice(rolledBack), "seed 9,999");
  assert.notEqual(rolledBack.snapshotId, releaseA.snapshotId);
  assert.notEqual(rolledBack.snapshotId, releaseB.snapshotId);
  checks.push("rollback-restores-seed-snapshot");

  runtimeState = overlay({
    price: "runtime owned 15,333",
    releaseId: "runtime-owned-release",
  });
  const runtimeOwned = await load(PRIVATE_AUDIENCE_A, "tenant-a");
  assert.equal(resolvedPrice(runtimeOwned), "runtime owned 15,333");

  runtimeState = overlay({
    releaseId: "runtime-owned-key-withdrawn",
    suppressedPricingCampaignIds: ["runtime-provider-price"],
  });
  const withdrawnRuntimePrice = await load(PRIVATE_AUDIENCE_A, "tenant-a");
  const withdrawnResolution = resolveApprovedPrice(withdrawnRuntimePrice, {
    kind: "campaign",
    treatmentKeys: ["onda_pro"],
  });
  assert.equal(withdrawnRuntimePrice.priceSourceAvailable, true);
  assert.equal(withdrawnRuntimePrice.pricingCampaigns.length, 0);
  assert.equal(withdrawnResolution.status, "unavailable_to_quote");
  if (withdrawnResolution.status === "unavailable_to_quote") {
    assert.equal(withdrawnResolution.reason, "not_provided");
  }
  assert.notEqual(withdrawnRuntimePrice.snapshotId, runtimeOwned.snapshotId);
  checks.push("runtime-owned-tombstone-prevents-seed-revival");

  runtimeState = overlay({
    price: "must never be quoted",
    releaseId: "release-b",
    sourceStatus: "unavailable",
  });
  const unavailable = await load(PRIVATE_AUDIENCE_A, "tenant-a");
  const unavailablePrice = resolveApprovedPrice(unavailable, {
    kind: "campaign",
    treatmentKeys: ["onda_pro"],
  });
  assert.equal(unavailable.priceSourceAvailable, false);
  assert.equal(unavailable.pricingCampaigns.length, 0);
  assert.equal(unavailablePrice.status, "unavailable_to_quote");
  if (unavailablePrice.status === "unavailable_to_quote") {
    assert.equal(unavailablePrice.reason, "source_unavailable");
  }
  assert.notEqual(unavailable.snapshotId, releaseB.snapshotId);
  assert.equal(resolveTreatmentFact(unavailable, "onda_pro", "introduction").status, "offered");
  checks.push("declared-source-failure-closes-price-only");

  runtimeState = new Error("simulated runtime loader failure");
  const rejectedRuntimeLoad = await load(PRIVATE_AUDIENCE_A, "tenant-a");
  const rejectedPrice = resolveApprovedPrice(rejectedRuntimeLoad, {
    kind: "campaign",
    treatmentKeys: ["onda_pro"],
  });
  assert.equal(rejectedRuntimeLoad.priceSourceAvailable, false);
  assert.equal(rejectedPrice.status, "unavailable_to_quote");
  if (rejectedPrice.status === "unavailable_to_quote") {
    assert.equal(rejectedPrice.reason, "source_unavailable");
  }
  checks.push("rejected-runtime-load-fails-closed");

  assert.deepEqual(
    runtimeRequests.map(({ audienceKey, tenantId }) => ({ audienceKey, tenantId })),
    [
      { audienceKey: PRIVATE_AUDIENCE_A, tenantId: "tenant-a" },
      { audienceKey: PRIVATE_AUDIENCE_B, tenantId: "tenant-a" },
      { audienceKey: PRIVATE_AUDIENCE_A, tenantId: "tenant-a" },
      { audienceKey: PRIVATE_AUDIENCE_A, tenantId: "tenant-a" },
      { audienceKey: PRIVATE_AUDIENCE_A, tenantId: "tenant-a" },
      { audienceKey: PRIVATE_AUDIENCE_A, tenantId: "tenant-b" },
      { audienceKey: PRIVATE_AUDIENCE_A, tenantId: "tenant-a" },
      { audienceKey: PRIVATE_AUDIENCE_A, tenantId: "tenant-a" },
      { audienceKey: PRIVATE_AUDIENCE_A, tenantId: "tenant-a" },
      { audienceKey: PRIVATE_AUDIENCE_A, tenantId: "tenant-a" },
      { audienceKey: PRIVATE_AUDIENCE_A, tenantId: "tenant-a" },
    ],
  );
  assert(runtimeRequests.every(({ now }) => now.getTime() === NOW.getTime()));
  checks.push("tenant-audience-and-turn-time-forwarded");

  for (const snapshot of [
    releaseA,
    sameReleaseDifferentAudience,
    releaseB,
    releaseAAgain,
    tenantAPrice,
    tenantBPrice,
    rolledBack,
    runtimeOwned,
    withdrawnRuntimePrice,
    unavailable,
    rejectedRuntimeLoad,
  ]) {
    assert(!snapshot.snapshotId.includes(PRIVATE_AUDIENCE_A));
    assert(!snapshot.snapshotId.includes(PRIVATE_AUDIENCE_B));
    assert(!snapshot.source.includes(PRIVATE_AUDIENCE_A));
    assert(!snapshot.source.includes(PRIVATE_AUDIENCE_B));
  }
  checks.push("snapshot-metadata-has-no-audience-pii");

  assert.equal(seedCalls, 11);
  assert.equal(runtimeCalls, 11);
  console.log(JSON.stringify({ checks, passed: checks.length, total: checks.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
