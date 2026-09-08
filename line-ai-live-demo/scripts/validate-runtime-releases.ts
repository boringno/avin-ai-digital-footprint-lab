import { routeCustomerMessage } from "../src/lib/router";
import {
  createStaticClinicFactsProvider,
  loadClinicFactsSnapshot,
  resolveApprovedPromotionCatalog,
  resolveApprovedPrice,
} from "../src/lib/clinic-facts";
import {
  isReleaseAudienceIncluded,
  materializeRuntimeContentReleaseSnapshot,
  mergeRuntimePricingCampaigns,
  toPricingCampaign,
  type RuntimeContentOverlay,
} from "../src/lib/runtime-content-release";

const now = new Date("2026-08-01T04:00:00.000Z");
const overlay: RuntimeContentOverlay = {
  faqEntries: [{
    answer_text: "這是已測試的 runtime FAQ 回覆。",
    approval_status: "approved",
    is_active: "true",
    notes: "test",
    question_pattern: "測試專屬問題",
    reviewed_at: "",
    topic: "測試",
  }],
  pricingCampaigns: [],
  releaseId: "test-release",
  sourceStatus: "available",
  suppressedPricingCampaignIds: [],
};

async function main() {
  const cases = [] as Array<{ name: string; passed: boolean }>;

  cases.push({ name: "zero-percent-excludes", passed: !isReleaseAudienceIncluded("line-user-a", 0) });
  cases.push({ name: "full-percent-includes", passed: isReleaseAudienceIncluded("line-user-a", 100) });
  cases.push({ name: "stable-canary-bucket", passed: isReleaseAudienceIncluded("line-user-a", 10) === isReleaseAudienceIncluded("line-user-a", 10) });

  const faqDecision = await routeCustomerMessage({ includePending: true, message: "測試專屬問題", now, runtimeContentOverlay: overlay });
  cases.push({ name: "runtime-faq-overlay", passed: faqDecision.decisionType === "faq_auto_reply" && faqDecision.replyText === "這是已測試的 runtime FAQ 回覆。" });

  const safetyDecision = await routeCustomerMessage({ includePending: true, message: "我懷孕了想預約肉毒", now, runtimeContentOverlay: overlay });
  cases.push({ name: "pregnancy-stays-priority", passed: safetyDecision.decisionType === "medical_guidance_reply" });

  const seedCampaign = {
    approval_status: "approved",
    asset_urls: "",
    branch_scope: "all",
    campaign_aliases: "",
    campaign_name: "seed",
    end_date: "2026-08-31",
    fallback_message: "",
    id: "replace-me",
    is_active: "true",
    notes: "",
    price_text: "999",
    start_date: "2026-08-01",
    treatment_name: "肉毒",
  };
  cases.push({
    name: "active-release-omission-prevents-seed-revival",
    passed: mergeRuntimePricingCampaigns([seedCampaign], {
      faqEntries: [],
      pricingCampaigns: [],
      releaseId: "replacement-release",
      sourceStatus: "available",
      suppressedPricingCampaignIds: [],
    }).length === 0,
  });
  const replacementCampaign = {
    ...seedCampaign,
    campaign_name: "runtime",
    id: "replace-me:runtime",
    price_text: "7,777",
  };
  cases.push({
    name: "active-release-uses-only-runtime-replacement",
    passed:
      mergeRuntimePricingCampaigns([seedCampaign], {
        faqEntries: [],
        pricingCampaigns: [replacementCampaign],
        releaseId: "replacement-release",
        sourceStatus: "available",
        suppressedPricingCampaignIds: [],
      })
        .map((entry) => `${entry.id}:${entry.price_text}`)
        .join(",") === "replace-me:runtime:7,777",
  });
  cases.push({
    name: "no-active-release-restores-seed-baseline",
    passed: mergeRuntimePricingCampaigns([seedCampaign], {
      faqEntries: [],
      pricingCampaigns: [],
      releaseId: null,
      sourceStatus: "available",
      suppressedPricingCampaignIds: [],
    }).map((entry) => entry.id).join(",") === "replace-me",
  });
  cases.push({
    name: "runtime-source-error-fails-price-closed",
    passed: mergeRuntimePricingCampaigns([seedCampaign], {
      faqEntries: [],
      pricingCampaigns: [],
      releaseId: "replacement-release",
      sourceStatus: "unavailable",
      suppressedPricingCampaignIds: [],
    }).length === 0,
  });
  const mappedCombination = toPricingCampaign({
    content_key: "runtime-combination",
    content_type: "campaign",
    end_at: "2026-08-31T15:59:59.999Z",
    payload_json: {
      asset_urls: [
        "https://line-ai-live-demo.vercel.app/demo/promotions/anniversary-2026/onda-face-8999.jpg",
        "https://line-ai-live-demo.vercel.app/demo/promotions/anniversary-2026/onda-detail.jpg",
      ],
      booking_treatments: ["ONDA PRO", "肉毒"],
      branch_scope: "all",
      campaign_name: "輪廓組合",
      customer_price_text: "12,999",
      fallback_message: "",
      price_text: "12,999",
      quote_priority: 100,
      starts_booking_intake: "true",
      treatment_name: "臉部輪廓組合",
    },
    start_at: "2026-08-01T16:00:00.000Z",
  });
  cases.push({
    name: "runtime-combination-fields-preserved",
    passed:
      mappedCombination.asset_urls === [
        "https://line-ai-live-demo.vercel.app/demo/promotions/anniversary-2026/onda-face-8999.jpg",
        "https://line-ai-live-demo.vercel.app/demo/promotions/anniversary-2026/onda-detail.jpg",
      ].join("|") &&
      mappedCombination.booking_treatments === "ONDA PRO|肉毒" &&
      mappedCombination.customer_price_approval_status === "approved" &&
      mappedCombination.customer_price_text === "12,999" &&
      mappedCombination.quote_priority === 100 &&
      mappedCombination.starts_booking_intake === "true",
  });

  const publishedSnapshot = materializeRuntimeContentReleaseSnapshot({
    entries: [{
      content_key: "runtime-campaign-with-artwork",
      content_type: "campaign",
      end_at: "2026-08-31T15:59:59.999Z",
      payload_json: {
        asset_urls: "https://line-ai-live-demo.vercel.app/demo/promotions/anniversary-2026/pico-honeycomb-3999.jpg",
        branch_scope: "all",
        campaign_name: "周年慶皮秒蜂巢",
        customer_price_text: "3,999",
        price_text: "3,999",
        treatment_name: "皮秒雷射＋蜂巢",
      },
      start_at: "2026-08-01T00:00:00.000Z",
    }],
    releaseId: "published-release-with-artwork",
    rolloutPercentage: 100,
    schemaVersion: 1,
  }, now);
  cases.push({
    name: "published-runtime-snapshot-preserves-campaign-artwork",
    passed:
      publishedSnapshot.pricingCampaigns.length === 1 &&
      publishedSnapshot.pricingCampaigns[0]?.asset_urls ===
        "https://line-ai-live-demo.vercel.app/demo/promotions/anniversary-2026/pico-honeycomb-3999.jpg",
  });

  const unifiedEmfaceRelease = materializeRuntimeContentReleaseSnapshot({
    entries: [{
      content_key: "standing-emface-unified-public-price",
      content_type: "campaign",
      end_at: null,
      payload_json: {
        branch_scope: "all",
        campaign_name: "EMFACE 常態核准報價",
        customer_price_text: "EMFACE 19,999 元",
        fallback_message: "請由客服協助確認。",
        price_text: "19,999",
        pricing_kind: "standing",
        treatment_name: "EMFACE",
      },
      start_at: null,
    }],
    releaseId: "unified-emface-price-release",
    rolloutPercentage: 100,
    schemaVersion: 1,
  }, now);
  const unifiedEmfaceFacts = await loadClinicFactsSnapshot(
    createStaticClinicFactsProvider({ pricingCampaigns: unifiedEmfaceRelease.pricingCampaigns }),
    { now, tenantId: "tenant_001" },
  );
  const unifiedEmfacePrice = resolveApprovedPrice(unifiedEmfaceFacts, {
    kind: "unspecified",
    treatmentKeys: ["emface"],
  });
  cases.push({
    name: "limited-treatment-allows-unified-public-standing-price",
    passed:
      unifiedEmfaceRelease.releaseId === "unified-emface-price-release" &&
      unifiedEmfacePrice.status === "approved_current" &&
      unifiedEmfacePrice.customerPriceText.includes("19,999"),
  });

  const mixedPricingSnapshot = materializeRuntimeContentReleaseSnapshot({
    entries: [
      {
        content_key: "standing-hydrafacial",
        content_type: "campaign",
        end_at: null,
        payload_json: {
          branch_scope: "all",
          campaign_name: "水飛梭常態核准報價",
          customer_price_text: "水飛梭常態核准價 2,000 元",
          fallback_message: "請由客服協助確認。",
          price_text: "2,000",
          pricing_kind: "standing",
          quote_priority: 10,
          treatment_name: "水飛梭",
        },
        start_at: null,
      },
      {
        content_key: "standing-botox-classic",
        content_type: "campaign",
        end_at: null,
        payload_json: {
          branch_scope: "all",
          campaign_name: "BOTOX 常態核准報價",
          customer_price_text: "BOTOX 肉毒 12U 體驗 1,999 元",
          dose: "12U",
          fallback_message: "請由客服協助確認。",
          price_text: "1,999",
          pricing_kind: "standing",
          quote_priority: 10,
          treatment_name: "肉毒",
          variant_key: "BOTOX",
        },
        start_at: null,
      },
      {
        content_key: "anniversary-botox",
        content_type: "campaign",
        end_at: "2026-11-30T15:59:59.999Z",
        payload_json: {
          branch_scope: "all",
          campaign_name: "周年慶肉毒",
          customer_price_text: "周年慶活動價 999 元",
          fallback_message: "請由客服協助確認。",
          price_text: "999",
          pricing_kind: "campaign",
          quote_priority: 100,
          treatment_name: "肉毒",
        },
        start_at: "2026-09-01T00:00:00.000Z",
      },
      {
        content_key: "cancelled-onda-16888",
        content_type: "campaign",
        end_at: "2026-08-31T15:59:59.999Z",
        payload_json: {
          branch_scope: "all",
          campaign_name: "已取消 ONDA 舊方案",
          customer_price_text: "體驗價 16,888 元",
          fallback_message: "請由客服協助確認。",
          price_text: "16,888",
          pricing_kind: "campaign",
          quote_priority: 10,
          treatment_name: "ONDA PRO",
        },
        start_at: "2026-08-01T00:00:00.000Z",
      },
      {
        content_key: "anniversary-onda-8999",
        content_type: "campaign",
        end_at: "2026-11-30T15:59:59.999Z",
        payload_json: {
          branch_scope: "all",
          campaign_name: "周年慶 ONDA",
          customer_price_text: "周年慶活動價 8,999 元",
          fallback_message: "請由客服協助確認。",
          price_text: "8,999",
          pricing_kind: "campaign",
          quote_priority: 100,
          treatment_name: "ONDA PRO",
        },
        start_at: "2026-09-01T00:00:00.000Z",
      },
    ],
    releaseId: "standing-and-anniversary-release",
    rolloutPercentage: 100,
    schemaVersion: 1,
  }, new Date("2026-09-03T04:00:00.000Z"));
  cases.push({
    name: "runtime-snapshot-keeps-standing-and-current-anniversary-prices",
    passed:
      mixedPricingSnapshot.pricingCampaigns.some((entry) => entry.id === "standing-hydrafacial" && entry.pricing_kind === "standing") &&
      mixedPricingSnapshot.pricingCampaigns.some((entry) => entry.id === "anniversary-onda-8999") &&
      !mixedPricingSnapshot.pricingCampaigns.some((entry) => entry.id === "cancelled-onda-16888"),
  });

  const mixedFactsSnapshot = await loadClinicFactsSnapshot(
    createStaticClinicFactsProvider({ pricingCampaigns: mixedPricingSnapshot.pricingCampaigns }),
    { now: new Date("2026-09-03T04:00:00.000Z") },
  );
  const anniversaryWinsConflict = resolveApprovedPrice(mixedFactsSnapshot, {
    kind: "unspecified",
    treatmentKeys: ["botox"],
  });
  cases.push({
    name: "anniversary-price-wins-only-conflicting-standing-offer",
    passed:
      anniversaryWinsConflict.status === "approved_current" &&
      anniversaryWinsConflict.customerPriceText === "周年慶活動價 999 元",
  });
  const explicitBrandStandingPrice = resolveApprovedPrice(mixedFactsSnapshot, {
    applicability: { dose: "12U", variant: "BOTOX" },
    kind: "unspecified",
    treatmentKeys: ["botox"],
  });
  cases.push({
    name: "specific-non-conflicting-standing-offer-remains-quoteable",
    passed:
      explicitBrandStandingPrice.status === "approved_current" &&
      explicitBrandStandingPrice.customerPriceText === "BOTOX 肉毒 12U 體驗 1,999 元",
  });
  const unrelatedStandingPrice = resolveApprovedPrice(mixedFactsSnapshot, {
    kind: "unspecified",
    treatmentKeys: ["hydrafacial"],
  });
  cases.push({
    name: "unrelated-standing-price-remains-quoteable-during-anniversary",
    passed:
      unrelatedStandingPrice.status === "approved_current" &&
      unrelatedStandingPrice.customerPriceText === "水飛梭常態核准價 2,000 元",
  });
  const promotionCatalog = resolveApprovedPromotionCatalog(mixedFactsSnapshot);
  cases.push({
    name: "promotion-catalog-excludes-standing-price-list",
    passed:
      promotionCatalog.status === "approved_current" &&
      promotionCatalog.items.some((item) => item.campaignId === "anniversary-botox") &&
      promotionCatalog.items.some((item) => item.campaignId === "anniversary-onda-8999") &&
      !promotionCatalog.items.some((item) => item.campaignId.startsWith("standing-")),
  });

  const mixedRuntimeOverlay: RuntimeContentOverlay = {
    faqEntries: [],
    pricingCampaigns: mixedPricingSnapshot.pricingCampaigns,
    releaseId: mixedPricingSnapshot.releaseId,
    sourceStatus: "available",
    suppressedPricingCampaignIds: mixedPricingSnapshot.suppressedPricingCampaignIds,
  };
  const standingV1Decision = await routeCustomerMessage({
    includePending: true,
    message: "水飛梭多少錢",
    now: new Date("2026-09-03T04:00:00.000Z"),
    runtimeContentOverlay: mixedRuntimeOverlay,
  });
  cases.push({
    name: "v1-direct-price-keeps-unrelated-standing-offer",
    passed:
      standingV1Decision.replyText.includes("2,000") &&
      !standingV1Decision.replyText.includes("999"),
  });
  const anniversaryV1Decision = await routeCustomerMessage({
    includePending: true,
    message: "肉毒原價多少",
    now: new Date("2026-09-03T04:00:00.000Z"),
    runtimeContentOverlay: mixedRuntimeOverlay,
  });
  cases.push({
    name: "v1-current-anniversary-offer-wins-every-price-wording",
    passed:
      anniversaryV1Decision.replyText.includes("999") &&
      !anniversaryV1Decision.replyText.includes("1,500"),
  });
  const cancelledOndaV1Decision = await routeCustomerMessage({
    includePending: true,
    message: "ONDA 怎麼收費",
    now: new Date("2026-09-03T04:00:00.000Z"),
    runtimeContentOverlay: mixedRuntimeOverlay,
  });
  cases.push({
    name: "v1-cancelled-onda-price-cannot-revive-behind-anniversary",
    passed:
      cancelledOndaV1Decision.replyText.includes("8,999") &&
      !cancelledOndaV1Decision.replyText.includes("16,888"),
  });

  const mappedSpecificPackage = toPricingCampaign({
    content_key: "runtime-specific-package",
    content_type: "campaign",
    end_at: "2026-08-31T15:59:59.999Z",
    payload_json: {
      branch_scope: "all",
      campaign_name: "internal package label",
      customer_price_text: "16,888",
      dose: "6 minutes",
      fallback_message: "",
      package_key: "onda-face-package",
      price_text: "16,888",
      session_count: 3,
      treatment_name: "ONDA PRO",
      variant_key: "jawline",
    },
    start_at: "2026-08-01T00:00:00.000Z",
  });
  cases.push({
    name: "runtime-price-applicability-fields-preserved",
    passed:
      mappedSpecificPackage.dose === "6 minutes" &&
      mappedSpecificPackage.package_key === "onda-face-package" &&
      mappedSpecificPackage.session_count === 3 &&
      mappedSpecificPackage.variant_key === "jawline",
  });

  const factsSnapshot = await loadClinicFactsSnapshot(
    createStaticClinicFactsProvider({ pricingCampaigns: [mappedSpecificPackage] }),
    { now },
  );
  const unspecifiedPackage = resolveApprovedPrice(factsSnapshot, {
    kind: "campaign",
    treatmentKeys: ["onda_pro"],
  });
  cases.push({
    name: "runtime-specific-price-requires-applicability",
    passed:
      unspecifiedPackage.status === "unavailable_to_quote" &&
      unspecifiedPackage.reason === "applicability_required",
  });
  const mismatchedPackage = resolveApprovedPrice(factsSnapshot, {
    applicability: {
      dose: "6 minutes",
      package: "another-package",
      sessionCount: 3,
      variant: "jawline",
    },
    kind: "campaign",
    treatmentKeys: ["onda_pro"],
  });
  cases.push({
    name: "runtime-specific-price-rejects-mismatched-applicability",
    passed:
      mismatchedPackage.status === "unavailable_to_quote" &&
      mismatchedPackage.reason === "applicability_mismatch",
  });
  const matchingPackage = resolveApprovedPrice(factsSnapshot, {
    applicability: {
      dose: "6 minutes",
      package: "onda-face-package",
      sessionCount: 3,
      variant: "jawline",
    },
    kind: "campaign",
    treatmentKeys: ["onda_pro"],
  });
  cases.push({
    name: "runtime-specific-price-allows-exact-applicability",
    passed:
      matchingPackage.status === "approved_current" &&
      matchingPackage.customerPriceText === "16,888",
  });

  const failed = cases.filter((testCase) => !testCase.passed);
  console.log(JSON.stringify({ cases, passed: cases.length - failed.length, total: cases.length }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });
