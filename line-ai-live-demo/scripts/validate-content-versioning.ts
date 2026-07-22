import { canCreateContentDraft, canPublishContent, canReviewContent, canViewContent, type StaffRole } from "../src/lib/admin-auth";
import { assertContentDraftInput, canTransitionContentStatus } from "../src/lib/content-versioning";

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
  expect(canReviewContent(role) === (role === "maintainer"), `${role} engineering review permission`);
  expect(canPublishContent(role) === (role === "owner" || role === "maintainer"), `${role} publishing permission`);
}

console.log(`content versioning validation passed (${passed} checks)`);
