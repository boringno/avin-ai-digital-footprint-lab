import { buildHandoffNotificationText, getHandoffNotificationReasonLabel } from "../src/lib/admin-handoff-notifications";

let passed = 0;

function expect(condition: unknown, label: string) {
  if (!condition) throw new Error(`Failed: ${label}`);
  passed += 1;
}

const text = buildHandoffNotificationText(
  { conversationId: "abc-123", reason: "human_request" },
  "https://example.test",
);

expect(getHandoffNotificationReasonLabel("human_request") === "客人要求真人協助", "human request uses Chinese label");
expect(getHandoffNotificationReasonLabel("unsupported_treatment_or_unapproved_content") === "需人工確認療程問題", "unapproved treatment uses Chinese label");
expect(text.includes("客人要求真人協助"), "notification includes localized reason");
expect(text.includes("/admin/workbench") && !text.includes("conversation_id"), "notification uses workbench landing path only");
expect(!text.includes("abc-123") && !text.includes("LINE：") && !text.includes("客人訊息："), "notification excludes identifiers and customer message");

console.log(`admin notification validation passed (${passed} checks)`);
