import { routeCustomerMessage } from "../src/lib/router";
import {
  createStaticClinicFactsProvider,
  loadClinicFactsSnapshot,
  resolveApprovedPrice,
} from "../src/lib/clinic-facts";
import {
  isReleaseAudienceIncluded,
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
    name: "runtime-tombstone-prevents-seed-revival",
    passed: mergeRuntimePricingCampaigns([seedCampaign], {
      faqEntries: [],
      pricingCampaigns: [],
      releaseId: "replacement-release",
      sourceStatus: "available",
      suppressedPricingCampaignIds: ["replace-me"],
    }).length === 0,
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
      booking_treatments: ["ONDA PRO", "肉毒"],
      branch_scope: "all",
      campaign_name: "輪廓組合",
      customer_price_text: "12,999",
      fallback_message: "",
      price_text: "12,999",
      starts_booking_intake: "true",
      treatment_name: "臉部輪廓組合",
    },
    start_at: "2026-08-01T16:00:00.000Z",
  });
  cases.push({
    name: "runtime-combination-fields-preserved",
    passed:
      mappedCombination.booking_treatments === "ONDA PRO|肉毒" &&
      mappedCombination.customer_price_approval_status === "approved" &&
      mappedCombination.customer_price_text === "12,999" &&
      mappedCombination.starts_booking_intake === "true",
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
