import { routeCustomerMessage } from "../src/lib/router";
import { isReleaseAudienceIncluded, type RuntimeContentOverlay } from "../src/lib/runtime-content-release";

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

  const failed = cases.filter((testCase) => !testCase.passed);
  console.log(JSON.stringify({ cases, passed: cases.length - failed.length, total: cases.length }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });
