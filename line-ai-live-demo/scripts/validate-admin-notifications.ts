import {
  buildHandoffNotificationText,
  getHandoffNotificationReasonLabel,
  notifyAdminHandoffCreated,
} from "../src/lib/admin-handoff-notifications";
import {
  buildHandoffReason,
  refreshHandoffTaskWithPriority,
  shouldCreateHandoffTask,
  shouldRecoverMissingHandoffTask,
  shouldRefreshHandoffTask,
  shouldResolveBookingIntakeHandoffTask,
  shouldStoreAiMessage,
} from "../src/lib/admin-webhook-sync";
import { getRuntimeConfig } from "../src/lib/live-demo-config";
import { isHandoffEscalation, selectHigherPriorityHandoffReason } from "../src/lib/handoff-priority";

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
const factConfirmationResult = {
  bookingDraft: { pregnancyRiskFlag: false },
  conversationV2FactConfirmation: {
    domain: "price",
    keys: ["onda_pro"],
    reason: "ambiguous",
  },
  conversationV2ToolRequestType: "request_fact_confirmation",
  decision: {
    decisionType: "pricing_auto_reply",
    matchedKey: "conversation_v2:price_gap",
  },
  handoffReason: null,
} as const;
expect(shouldCreateHandoffTask(factConfirmationResult), "V2 fact confirmation creates a non-blocking staff task");
expect(
  buildHandoffReason(factConfirmationResult as never) === "fact_confirmation:price:ambiguous:onda_pro",
  "fact confirmation preserves its domain, reason, and safe keys for staff",
);
expect(
  getHandoffNotificationReasonLabel("fact_confirmation:price:ambiguous:onda_pro") === "診所資料待確認",
  "fact confirmation notification has a staff-readable label",
);
expect(getHandoffNotificationReasonLabel("booking_intake") === "新預約需求", "booking intake uses Chinese label");
expect(!shouldCreateHandoffTask({ decision: { decisionType: "clinic_info_reply" } }), "clinic information does not create a task");
expect(
  shouldResolveBookingIntakeHandoffTask({ decision: { matchedKey: "conversation_v2:booking_declined" } }),
  "pausing an in-progress booking resolves its still-open intake follow-up",
);
expect(
  !shouldResolveBookingIntakeHandoffTask({ decision: { matchedKey: "conversation_v2:fallback_clarify" } }),
  "an unrelated fallback must not resolve a booking follow-up",
);
expect(shouldRefreshHandoffTask({ conversationStatus: "handoff_pending" }), "a pending conversation refreshes an existing task after a new message");
expect(!shouldRefreshHandoffTask({ conversationStatus: "ai_active" }), "an active AI conversation does not refresh a handoff task");
expect(shouldRecoverMissingHandoffTask({ conversationStatus: "handoff_pending", handoffReason: "human_request" }), "a pending conversation with a canonical reason can recreate a missing task");
expect(!shouldRecoverMissingHandoffTask({ conversationStatus: "handoff_pending", handoffReason: null }), "a pending conversation without a canonical reason cannot create a task from the current route");
expect(!shouldRecoverMissingHandoffTask({ conversationStatus: "ai_active", handoffReason: "human_request" }), "an active AI conversation cannot recreate a stale handoff task");
expect(buildHandoffReason({
  bookingDraft: { pregnancyRiskFlag: false },
  decision: { matchedKey: "branch_list" },
  handoffReason: "human_request",
} as never) === "human_request", "task recovery uses the canonical handoff reason instead of the current route");
const medicalRecoveryWithFactGap = {
  ...factConfirmationResult,
  conversationStatus: "handoff_pending",
  handoffReason: "post_procedure_issue",
} as const;
expect(
  shouldRecoverMissingHandoffTask(medicalRecoveryWithFactGap) &&
    shouldCreateHandoffTask(medicalRecoveryWithFactGap) &&
    buildHandoffReason(medicalRecoveryWithFactGap as never) === "post_procedure_issue",
  "missing-task recovery preserves a higher-priority medical handoff over a fact confirmation",
);
expect(isHandoffEscalation("human_request", "post_procedure_emergency"), "an emergency upgrades an existing ordinary handoff task");
expect(!isHandoffEscalation("post_procedure_emergency", "human_request"), "an ordinary request cannot downgrade an emergency task");
expect(
  selectHigherPriorityHandoffReason("post_procedure_emergency", "human_request") === "post_procedure_emergency",
  "an ordinary refresh preserves the emergency task reason",
);
expect(!shouldStoreAiMessage({ suppressedReason: "conversation_state_blocked" }), "an ownership-suppressed reply is not stored as a delivered AI message");
expect(shouldStoreAiMessage(undefined), "a normal reply remains eligible for AI message storage");

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

async function validateConcurrentPriorityRefresh() {
  let storedReason: null | string = "human_request";
  let firstAttempt = true;
  const result = await refreshHandoffTaskWithPriority({
    incomingReason: "human_request",
    observedReason: "human_request",
  }, {
    compareAndSetReason: async (expectedReason, nextReason) => {
      if (firstAttempt) {
        firstAttempt = false;
        // Simulate an emergency refresh winning immediately before this
        // ordinary request tries to write its stale reason.
        storedReason = "post_procedure_emergency";
      }
      if (storedReason !== expectedReason) return false;
      storedReason = nextReason;
      return true;
    },
    loadCurrentReason: async () => storedReason,
  });
  expect(result.reason === "post_procedure_emergency", "a concurrent ordinary refresh cannot overwrite an emergency task");
  expect(storedReason === "post_procedure_emergency", "the persisted task reason stays at the highest observed priority");
}

async function validateAdminNotificationRecipientIsolation() {
  const fetchCalls: Array<{ body: string; url: string }> = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({
      body: String(init?.body ?? ""),
      url: String(input),
    });
    return {
      ok: true,
      status: 200,
      text: async () => "ok",
    };
  };
  const input = { conversationId: "customer-conversation", reason: "human_request" };
  const makeDependencies = (adminNotifyTarget: string) => ({
    fetchImpl,
    getConfig: () => ({
      adminNotifyTarget,
      appBaseUrl: "https://example.test",
      lineAccessToken: "test-token",
    }),
    getSupportStatus: () => ({ inServiceHours: true }),
  });

  const invalidTargets = [
    { label: "empty target", value: "" },
    { label: "customer user target", value: `U${"3".repeat(32)}` },
    { label: "LINE room target", value: `R${"4".repeat(32)}` },
  ];

  for (const target of invalidTargets) {
    const callCountBefore = fetchCalls.length;
    const result = await notifyAdminHandoffCreated(input, makeDependencies(target.value));
    expect(result.skipped, `${target.label} is skipped`);
    expect(
      fetchCalls.length === callCountBefore,
      `${target.label} cannot receive a workbench notification`,
    );
  }

  const adminGroupId = `C${"5".repeat(32)}`;
  const groupResult = await notifyAdminHandoffCreated(input, makeDependencies(adminGroupId));
  expect(!groupResult.skipped && groupResult.ok, "a valid LINE group receives the admin notification");
  expect(fetchCalls.length === 1, "only the valid LINE group triggers fetch");

  const payload = JSON.parse(fetchCalls[0]?.body ?? "{}") as {
    messages?: Array<{ text?: string }>;
    to?: string;
  };
  expect(payload.to === adminGroupId, "the push recipient is the validated LINE group");
  expect(
    payload.messages?.[0]?.text?.includes("/admin/workbench"),
    "the internal workbench link is included only in the group notification",
  );
}

async function runAsyncValidations() {
  await validateAdminNotificationRecipientIsolation();
  await validateConcurrentPriorityRefresh();
}

runAsyncValidations()
  .then(() => console.log(`admin notification validation passed (${passed} checks)`))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
