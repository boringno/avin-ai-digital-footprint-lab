import {
  canCreateContentDraft,
  canEditContent,
  canPublishContent,
  canReviewContent,
  canSubmitContentSource,
  canViewContent,
  type StaffRole,
} from "../src/lib/admin-auth";
import {
  assertContentDraftInput,
  canTransitionContentStatus,
  readCampaignApplicabilityFields,
  readCampaignBookingFields,
  writeCampaignApplicabilityFields,
  writeCampaignBookingFields,
} from "../src/lib/content-versioning";

let passed = 0;
function expect(condition: unknown, label: string) {
  if (!condition) throw new Error(`Failed: ${label}`);
  passed += 1;
}
function expectThrows(run: () => void, label: string) {
  try { run(); } catch { passed += 1; return; }
  throw new Error(`Failed: ${label}`);
}

const baseFaq = {
  changeReason: "content workflow validation",
  contentKey: "test-faq",
  contentType: "faq" as const,
  displayName: "測試常見問題",
  endAt: null,
  payload: { answer_text: "這是測試用核准回答。", question_pattern: "測試問題", topic: "測試分類" },
  startAt: null,
};
assertContentDraftInput(baseFaq);
passed += 1;
expectThrows(() => assertContentDraftInput({ ...baseFaq, displayName: "" }), "blank Chinese display name is rejected");
expectThrows(() => assertContentDraftInput({ ...baseFaq, contentKey: "invalid key" }), "invalid generated key is rejected");

const campaignBookingFields = writeCampaignBookingFields({
  bookingTreatments: " ONDA PRO、肉毒、ONDA PRO ",
  startsBookingIntake: true,
});
expect(
  JSON.stringify(campaignBookingFields) === JSON.stringify({
    booking_treatments: ["ONDA PRO", "肉毒"],
    starts_booking_intake: "true",
  }),
  "campaign editor serializes booking fields without duplicates",
);
expect(
  JSON.stringify(readCampaignBookingFields(campaignBookingFields)) === JSON.stringify({
    bookingTreatments: ["ONDA PRO", "肉毒"],
    startsBookingIntake: true,
  }),
  "campaign booking fields survive edit and save round trip",
);

const campaignApplicabilityFields = writeCampaignApplicabilityFields({
  dose: " 200發 ",
  packageKey: " six_minute ",
  sessionCount: " 3 ",
  variantKey: " premium ",
});
expect(
  JSON.stringify(campaignApplicabilityFields) === JSON.stringify({
    dose: "200發",
    package_key: "six_minute",
    session_count: "3",
    variant_key: "premium",
  }),
  "campaign editor serializes price applicability dimensions",
);
expect(
  JSON.stringify(readCampaignApplicabilityFields(campaignApplicabilityFields)) === JSON.stringify({
    dose: "200發",
    packageKey: "six_minute",
    sessionCount: "3",
    variantKey: "premium",
  }),
  "campaign price applicability survives edit and save round trip",
);

const baseCampaign = {
  changeReason: "preserve campaign booking fields",
  contentKey: "test-campaign",
  contentType: "campaign" as const,
  displayName: "測試活動",
  endAt: "2026-08-31T15:59:59.000Z",
  payload: {
    branch_scope: "全館",
    campaign_name: "測試活動",
    customer_price_text: "12,999 元",
    fallback_message: "請由客服協助確認。",
    price_text: "12,999 元",
    treatment_name: "臉部輪廓組合",
    ...campaignApplicabilityFields,
    ...campaignBookingFields,
  },
  startAt: "2026-08-01T00:00:00.000Z",
};
assertContentDraftInput(baseCampaign);
passed += 1;
expectThrows(
  () => assertContentDraftInput({
    ...baseCampaign,
    payload: { ...baseCampaign.payload, booking_treatments: { treatment: "ONDA PRO" } },
  }),
  "invalid booking treatment payload is rejected",
);
expectThrows(
  () => assertContentDraftInput({
    ...baseCampaign,
    payload: { ...baseCampaign.payload, starts_booking_intake: "yes" },
  }),
  "invalid booking intake flag is rejected",
);
expectThrows(
  () => assertContentDraftInput({
    ...baseCampaign,
    payload: { ...baseCampaign.payload, starts_booking_intake: true },
  }),
  "boolean booking intake flag is rejected before runtime can silently drop it",
);
expectThrows(
  () => assertContentDraftInput({
    ...baseCampaign,
    payload: { ...baseCampaign.payload, package_key: { key: "six_minute" } },
  }),
  "invalid package applicability is rejected",
);
expectThrows(
  () => assertContentDraftInput({
    ...baseCampaign,
    payload: { ...baseCampaign.payload, session_count: 0 },
  }),
  "non-positive session count is rejected",
);

expect(canTransitionContentStatus("draft", "submit"), "draft can submit to engineering review");
expect(canTransitionContentStatus("in_review", "approve"), "maintainer can approve engineering review");
expect(canTransitionContentStatus("in_review", "request_changes"), "maintainer can request changes");
expect(canTransitionContentStatus("approved", "publish"), "owner can publish engineering-approved content");
expect(!canTransitionContentStatus("in_review", "publish"), "unreviewed content cannot publish");
expect(canTransitionContentStatus("published", "disable"), "published content can be disabled");

const roles: StaffRole[] = ["owner", "manager", "agent", "analyst", "maintainer"];
for (const role of roles) {
  expect(canViewContent(role) === (role === "owner" || role === "manager" || role === "maintainer"), `${role} content visibility`);
  expect(canCreateContentDraft(role) === (role === "owner" || role === "manager" || role === "maintainer"), `${role} content draft permission`);
  expect(canEditContent(role) === (role === "owner" || role === "manager" || role === "maintainer"), `${role} content edit permission`);
  expect(canSubmitContentSource(role) === (role === "owner" || role === "manager" || role === "maintainer"), `${role} source submission permission`);
  expect(canReviewContent(role) === (role === "maintainer"), `${role} engineering review permission`);
  expect(canPublishContent(role) === (role === "owner" || role === "maintainer"), `${role} publishing permission`);
}

console.log(`content versioning validation passed (${passed} checks)`);
