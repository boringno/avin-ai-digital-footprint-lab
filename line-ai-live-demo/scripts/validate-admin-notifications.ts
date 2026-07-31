import { buildHandoffNotificationText, getHandoffNotificationReasonLabel } from "../src/lib/admin-handoff-notifications";
import { shouldCreateHandoffTask } from "../src/lib/admin-webhook-sync";
import { getRuntimeConfig } from "../src/lib/live-demo-config";

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

const previousAdminNotifyTarget = process.env.ADMIN_NOTIFY_TARGET;
const previousLineAlertUserId = process.env.LIVE_DEMO_ALERT_LINE_USER_ID;
try {
  delete process.env.ADMIN_NOTIFY_TARGET;
  process.env.LIVE_DEMO_ALERT_LINE_USER_ID = `U${"1".repeat(32)}`;
  expect(
    getRuntimeConfig().adminNotifyTarget === "",
    "operations alert recipient must not become the admin handoff recipient",
  );

  const configuredAdminTarget = `C${"2".repeat(32)}`;
  process.env.ADMIN_NOTIFY_TARGET = configuredAdminTarget;
  expect(
    getRuntimeConfig().adminNotifyTarget === configuredAdminTarget,
    "admin handoff recipient comes only from ADMIN_NOTIFY_TARGET",
  );
} finally {
  if (previousAdminNotifyTarget === undefined) {
    delete process.env.ADMIN_NOTIFY_TARGET;
  } else {
    process.env.ADMIN_NOTIFY_TARGET = previousAdminNotifyTarget;
  }
  if (previousLineAlertUserId === undefined) {
    delete process.env.LIVE_DEMO_ALERT_LINE_USER_ID;
  } else {
    process.env.LIVE_DEMO_ALERT_LINE_USER_ID = previousLineAlertUserId;
  }
}

console.log(`admin notification validation passed (${passed} checks)`);
