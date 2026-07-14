import { assertContentDraftInput, canTransitionContentStatus } from "../src/lib/content-versioning";
import { canEditContent, canReviewContent, canViewContent, type StaffRole } from "../src/lib/admin-auth";

let passed = 0;

function expect(condition: unknown, label: string) {
  if (!condition) throw new Error(`Failed: ${label}`);
  passed += 1;
}

function expectThrows(run: () => void, label: string) {
  try { run(); } catch { passed += 1; return; }
  throw new Error(`Failed: ${label}`);
}

assertContentDraftInput({ changeReason: "新增核准說明", contentKey: "botox-pricing", contentType: "faq", endAt: null, payload: { answer_text: "請由客服依當期核准方案說明。", question_pattern: "肉毒價格怎麼算", topic: "價格" }, startAt: null });
passed += 1;
assertContentDraftInput({ changeReason: "更新活動", contentKey: "summer-botox", contentType: "campaign", endAt: "2026-08-31T15:59:00.000Z", payload: { branch_scope: "全館", campaign_name: "夏季方案", fallback_message: "請由客服協助確認。", price_text: "依核准方案說明", treatment_name: "肉毒" }, startAt: "2026-07-31T16:00:00.000Z" });
passed += 1;
expectThrows(() => assertContentDraftInput({ changeReason: "x", contentKey: "不合法 key", contentType: "faq", endAt: null, payload: {}, startAt: null }), "invalid key is rejected");
expectThrows(() => assertContentDraftInput({ changeReason: "x", contentKey: "faq-a", contentType: "campaign", endAt: "2026-07-01T00:00:00.000Z", payload: { branch_scope: "全館", campaign_name: "活動", fallback_message: "請確認", price_text: "價格", treatment_name: "療程" }, startAt: "2026-07-02T00:00:00.000Z" }), "invalid time range is rejected");
expectThrows(() => assertContentDraftInput({ changeReason: "x", contentKey: "campaign-a", contentType: "campaign", endAt: null, payload: { branch_scope: "全館", campaign_name: "活動", fallback_message: "請確認", price_text: "價格", treatment_name: "療程" }, startAt: null }), "campaign dates are required");
expect(canTransitionContentStatus("draft", "submit"), "draft can submit");
expect(!canTransitionContentStatus("published", "submit"), "published cannot submit");
expect(canTransitionContentStatus("in_review", "publish"), "in-review can publish");
expect(!canTransitionContentStatus("draft", "publish"), "draft cannot publish");
expect(canTransitionContentStatus("published", "disable"), "published can disable");
expect(!canTransitionContentStatus("disabled", "disable"), "disabled cannot disable");

const roleExpectations: Array<[StaffRole, boolean, boolean]> = [
  ["owner", true, true],
  ["manager", true, true],
  ["maintainer", false, false],
  ["agent", false, false],
  ["analyst", false, false],
];
for (const [role, canEdit, canReview] of roleExpectations) {
  expect(canViewContent(role) === (role === "owner" || role === "manager" || role === "maintainer"), `${role} content visibility`);
  expect(canEditContent(role) === canEdit, `${role} content edit permission`);
  expect(canReviewContent(role) === canReview, `${role} content review permission`);
}

console.log(`content versioning validation passed (${passed} checks)`);
