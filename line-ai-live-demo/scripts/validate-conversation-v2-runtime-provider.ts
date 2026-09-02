import assert from "node:assert/strict";

import {
  createRuntimeClinicFactsProvider,
  loadClinicFactsSnapshot,
  resolveApprovedPrice,
  resolveTreatmentFact,
  type ClinicFactsSnapshot,
} from "../src/lib/clinic-facts";
import {
  materializeRuntimeContentReleaseSnapshot,
  parseRuntimeContentReleaseSnapshot,
  type RuntimeContentOverlay,
} from "../src/lib/runtime-content-release";
import type { PricingCampaign } from "../src/lib/seed-loader";

const NOW = new Date("2026-08-17T04:00:00.000Z");
const PRIVATE_AUDIENCE_A = "line-user-private-a";
const PRIVATE_AUDIENCE_B = "line-user-private-b";
const PRIVATE_AUDIENCE_C = "line-user-private-c";
const PRIVATE_AUDIENCE_D = "line-user-private-d";

type RuntimeRequest = {
  audienceKey: string;
  now: Date;
  tenantId?: string;
};

type RuntimeFixture =
  | Error
  | RuntimeContentOverlay
  | ((input: RuntimeRequest) => Error | RuntimeContentOverlay);

function campaign(priceText: string, quotePriority?: number): PricingCampaign {
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
    ...(quotePriority !== undefined ? { quote_priority: quotePriority } : {}),
    start_date: "2026-08-01",
    treatment_name: "ONDA PRO",
  };
}

function overlay(input: {
  price?: string;
  quotePriority?: number;
  releaseId: string | null;
  sourceStatus?: RuntimeContentOverlay["sourceStatus"];
  suppressedPricingCampaignIds?: string[];
}): RuntimeContentOverlay {
  return {
    faqEntries: [],
    pricingCampaigns: input.price ? [campaign(input.price, input.quotePriority)] : [],
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
  const parsedManifest = parseRuntimeContentReleaseSnapshot({
    entries: [
      {
        content_key: "runtime-provider-price",
        content_type: "campaign",
        end_at: "2026-08-31T23:59:59.000Z",
        payload_json: {
          approval_status: "approved",
          branch_scope: "全館適用",
          campaign_name: "ONDA 體驗方案",
          customer_price_text: "體驗價 16,888 元",
          price_text: "16,888",
          treatment_name: "ONDA PRO",
        },
        start_at: "2026-08-01T00:00:00.000Z",
      },
    ],
    release_id: "durable-release",
    rollout_percentage: 100,
    schema_version: 1,
  });
  assert(parsedManifest, "a complete durable release manifest must parse");
  assert.equal(
    materializeRuntimeContentReleaseSnapshot(parsedManifest, NOW).pricingCampaigns[0]?.customer_price_text,
    "體驗價 16,888 元",
    "a cold instance must materialize approved pricing from the durable manifest",
  );
  assert.equal(
    materializeRuntimeContentReleaseSnapshot(parsedManifest, new Date("2026-07-31T23:59:59.999Z")).pricingCampaigns.length,
    0,
    "a cached raw manifest must not make a campaign visible before its start",
  );
  assert.equal(
    materializeRuntimeContentReleaseSnapshot(parsedManifest, new Date("2026-08-01T00:00:00.000Z")).pricingCampaigns.length,
    1,
    "the approved campaign start instant must be inclusive",
  );
  assert.equal(
    materializeRuntimeContentReleaseSnapshot(parsedManifest, new Date("2026-08-31T23:59:59.000Z")).pricingCampaigns.length,
    1,
    "the approved campaign end instant must be inclusive",
  );
  assert.equal(
    materializeRuntimeContentReleaseSnapshot(parsedManifest, new Date("2026-08-31T23:59:59.001Z")).pricingCampaigns.length,
    0,
    "a cached raw manifest must stop exposing a campaign immediately after its end",
  );
  const invalidWindowManifest = parseRuntimeContentReleaseSnapshot({
    entries: [{
      content_key: "invalid-window",
      content_type: "campaign",
      end_at: null,
      payload_json: { customer_price_text: "must never be visible" },
      start_at: "not-a-date",
    }],
    release_id: "invalid-window-release",
    rollout_percentage: 100,
    schema_version: 1,
  });
  assert(invalidWindowManifest);
  assert.equal(
    materializeRuntimeContentReleaseSnapshot(invalidWindowManifest, NOW).pricingCampaigns.length,
    0,
    "an invalid activity window must fail closed instead of becoming timeless",
  );
  assert.equal(
    parseRuntimeContentReleaseSnapshot({
      entries: [],
      release_id: "partial-release",
      rollout_percentage: 100,
    }),
    null,
    "a partial settings payload must never become price authority",
  );
  checks.push(
    "durable-manifest-cold-materialization",
    "durable-manifest-time-window-boundaries",
    "partial-manifest-fails-closed",
  );
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
    const runtimeRequestsBefore = runtimeRequests.length;
    const snapshot = await loadClinicFactsSnapshot(provider, {
      audienceKey,
      now: NOW,
      tenantId,
    });
    assert.equal(seedCalls, seedCallsBefore + 1, "each snapshot must load seed data exactly once");
    const runtimeAttempts = runtimeCalls - runtimeCallsBefore;
    assert(
      runtimeAttempts === 1 || runtimeAttempts === 2,
      "each snapshot must load the runtime overlay once, plus at most one unavailable-source retry",
    );
    const attempts = runtimeRequests.slice(runtimeRequestsBefore);
    assert.equal(attempts.length, runtimeAttempts);
    assert(
      attempts.every((request) =>
        request.audienceKey === audienceKey &&
        request.tenantId === tenantId &&
        request.now.getTime() === NOW.getTime()),
      "every initial and retry attempt must preserve the logical request tenant, audience, and turn time",
    );
    checks.push("single-seed-load-bounded-runtime-retry");
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

  runtimeState = overlay({ price: "priority-stable 10,999", quotePriority: 10, releaseId: "priority-release" });
  const lowerPrioritySnapshot = await load(PRIVATE_AUDIENCE_A, "tenant-a");
  runtimeState = overlay({ price: "priority-stable 10,999", quotePriority: 100, releaseId: "priority-release" });
  const higherPrioritySnapshot = await load(PRIVATE_AUDIENCE_A, "tenant-a");
  assert.notEqual(
    higherPrioritySnapshot.snapshotId,
    lowerPrioritySnapshot.snapshotId,
    "changing only quote priority must produce a new snapshot id",
  );
  checks.push("quote-priority-participates-in-snapshot-identity");

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
  const unavailable = await load(PRIVATE_AUDIENCE_C, "tenant-a");
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
  const rejectedCallsBefore = runtimeCalls;
  const rejectedRuntimeLoad = await load(PRIVATE_AUDIENCE_D, "tenant-a");
  assert.equal(
    runtimeCalls - rejectedCallsBefore,
    2,
    "a thrown transport failure must receive exactly one bounded retry",
  );
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

  let transientThrowCalls = 0;
  runtimeState = () => {
    transientThrowCalls += 1;
    return transientThrowCalls === 1
      ? new Error("transient transport failure")
      : overlay({ releaseId: null });
  };
  const recoveredAfterThrow = await load(PRIVATE_AUDIENCE_D, "tenant-a");
  assert.equal(transientThrowCalls, 2, "a transient thrown failure must retry exactly once");
  assert.equal(
    resolvedPrice(recoveredAfterThrow),
    "seed 9,999",
    "a successful retry after a transport exception must restore the verified seed baseline",
  );
  checks.push("transient-throw-single-retry");

  let transientOverlayCalls = 0;
  const transientProvider = createRuntimeClinicFactsProvider({
    loadRuntimeContentOverlay: async () => {
      transientOverlayCalls += 1;
      return transientOverlayCalls === 1
        ? overlay({
            price: "must not be quoted",
            releaseId: null,
            sourceStatus: "unavailable",
          })
        : overlay({ releaseId: null });
    },
    loadSeedData: async () => ({
      faqEntries: [],
      handoffRules: [],
      pregnancyRules: [],
      pricingCampaigns: [campaign("seed after retry 16,888")],
    }),
  });
  const recoveredSnapshot = await loadClinicFactsSnapshot(transientProvider, {
    audienceKey: PRIVATE_AUDIENCE_A,
    now: NOW,
    tenantId: "tenant-a",
  });
  assert.equal(transientOverlayCalls, 2, "an unavailable runtime lookup must be retried exactly once");
  assert.equal(
    resolvedPrice(recoveredSnapshot),
    "seed after retry 16,888",
    "a successful retry must restore the verified seed baseline",
  );

  let unavailableOverlayCalls = 0;
  const permanentlyUnavailableProvider = createRuntimeClinicFactsProvider({
    loadRuntimeContentOverlay: async () => {
      unavailableOverlayCalls += 1;
      return overlay({
        price: "must never be quoted",
        releaseId: null,
        sourceStatus: "unavailable",
      });
    },
    loadSeedData: async () => ({
      faqEntries: [],
      handoffRules: [],
      pregnancyRules: [],
      pricingCampaigns: [campaign("must still stay hidden")],
    }),
  });
  const permanentlyUnavailableSnapshot = await loadClinicFactsSnapshot(
    permanentlyUnavailableProvider,
    { audienceKey: PRIVATE_AUDIENCE_A, now: NOW, tenantId: "tenant-a" },
  );
  const permanentlyUnavailablePrice = resolveApprovedPrice(
    permanentlyUnavailableSnapshot,
    { kind: "campaign", treatmentKeys: ["onda_pro"] },
  );
  assert.equal(unavailableOverlayCalls, 2, "a persistent outage must stop after one retry");
  assert.equal(
    permanentlyUnavailablePrice.status,
    "unavailable_to_quote",
    "two unavailable lookups must remain fail closed",
  );
  checks.push("transient-overlay-single-retry", "persistent-overlay-outage-fails-closed");

  let durableRuntimeState = overlay({
    price: "durable release 16,888",
    releaseId: "durable-release",
  });
  const durableProvider = createRuntimeClinicFactsProvider({
    loadRuntimeContentOverlay: async () => durableRuntimeState,
    loadSeedData: async () => ({
      faqEntries: [],
      handoffRules: [],
      pregnancyRules: [],
      pricingCampaigns: [campaign("seed must remain overlaid")],
    }),
  });
  const durableRequest = {
    audienceKey: "line-user-durable",
    now: NOW,
    tenantId: "tenant-durable",
  };
  const verifiedSnapshot = await loadClinicFactsSnapshot(durableProvider, durableRequest);
  assert.equal(resolvedPrice(verifiedSnapshot), "durable release 16,888");

  durableRuntimeState = overlay({
    price: "must never replace the verified snapshot",
    releaseId: "unavailable-release",
    sourceStatus: "unavailable",
  });
  const outageAfterSuccess = await loadClinicFactsSnapshot(durableProvider, durableRequest);
  assert.equal(
    resolveApprovedPrice(outageAfterSuccess, {
      kind: "campaign",
      treatmentKeys: ["onda_pro"],
    }).status,
    "unavailable_to_quote",
    "process memory must not keep serving a release after its durable authority becomes unavailable",
  );
  checks.push("durable-source-outage-fails-closed-without-process-authority");

  assert.deepEqual(
    [...new Set(runtimeRequests.map(({ audienceKey, tenantId }) => `${audienceKey}|${tenantId}`))].sort(),
    [
      `${PRIVATE_AUDIENCE_A}|tenant-a`,
      `${PRIVATE_AUDIENCE_A}|tenant-b`,
      `${PRIVATE_AUDIENCE_B}|tenant-a`,
      `${PRIVATE_AUDIENCE_C}|tenant-a`,
      `${PRIVATE_AUDIENCE_D}|tenant-a`,
    ].sort(),
    "every requested tenant/audience pair must reach the runtime provider without cross-tenant substitution",
  );
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
    assert(!snapshot.snapshotId.includes(PRIVATE_AUDIENCE_C));
    assert(!snapshot.snapshotId.includes(PRIVATE_AUDIENCE_D));
    assert(!snapshot.source.includes(PRIVATE_AUDIENCE_A));
    assert(!snapshot.source.includes(PRIVATE_AUDIENCE_B));
    assert(!snapshot.source.includes(PRIVATE_AUDIENCE_C));
    assert(!snapshot.source.includes(PRIVATE_AUDIENCE_D));
  }
  checks.push("snapshot-metadata-has-no-audience-pii");

  assert.equal(runtimeRequests.length, runtimeCalls, "runtime attempt bookkeeping must remain complete");
  console.log(JSON.stringify({ checks, passed: checks.length, total: checks.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
