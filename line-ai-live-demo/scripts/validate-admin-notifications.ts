import { buildHandoffNotificationText, getHandoffNotificationReasonLabel } from "../src/lib/admin-handoff-notifications";
import { shouldCreateHandoffTask } from "../src/lib/admin-webhook-sync";

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
expect(shouldCreateHandoffTask({ decision: { decisionType: "booking_intake_reply" } }), "booking intake creates a human follow-up task");
expect(getHandoffNotificationReasonLabel("booking_intake") === "新預約需求", "booking intake uses Chinese label");
expect(!shouldCreateHandoffTask({ decision: { decisionType: "clinic_info_reply" } }), "clinic information does not create a task");

console.log(`admin notification validation passed (${passed} checks)`);
