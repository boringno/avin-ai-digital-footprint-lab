import { getHumanSupportStatus } from "@/lib/human-support";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { reportOperationalError } from "@/lib/monitoring";

export type HandoffNotificationInput = {
  conversationId: string;
  customerMessage: string;
  lineUserId: string;
  reason: string;
};

export async function notifyAdminHandoffCreated(input: HandoffNotificationInput) {
  const supportStatus = getHumanSupportStatus();
  if (!supportStatus.inServiceHours) {
    return {
      ok: true,
      skipped: true,
      reason: "outside_human_support_hours",
    };
  }

  const config = getRuntimeConfig();
  if (!config.adminNotifyTarget || !config.lineAccessToken) {
    return {
      ok: true,
      skipped: true,
      reason: "notification_config_missing",
    };
  }

  try {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      body: JSON.stringify({
        messages: [
          {
            text: buildHandoffNotificationText(input, config.appBaseUrl),
            type: "text",
          },
        ],
        to: config.adminNotifyTarget,
      }),
      headers: {
        Authorization: `Bearer ${config.lineAccessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const body = await response.text();

    if (!response.ok) {
      await reportOperationalError({
        alert: false,
        error: new Error(`Admin handoff notification failed: ${response.status} ${body}`),
        extra: {
          conversation_id: input.conversationId,
          reason: input.reason,
          status: response.status,
        },
        source: "admin_handoff_notification",
      });
    }

    return {
      body,
      ok: response.ok,
      skipped: false,
      status: response.status,
    };
  } catch (error) {
    await reportOperationalError({
      alert: false,
      error,
      extra: {
        conversation_id: input.conversationId,
        reason: input.reason,
      },
      source: "admin_handoff_notification",
    });

    return {
      ok: false,
      skipped: false,
      status: 0,
    };
  }
}

function buildHandoffNotificationText(input: HandoffNotificationInput, appBaseUrl: string) {
  const link = `${appBaseUrl.replace(/\/$/, "")}/admin/workbench?conversation_id=${encodeURIComponent(input.conversationId)}`;
  const customerPreview = input.customerMessage.trim().slice(0, 120) || "-";

  return [
    "有新的真人接手任務",
    `原因：${input.reason}`,
    `LINE：${shortLineUserId(input.lineUserId)}`,
    `客人訊息：${customerPreview}`,
    `工作台：${link}`,
  ].join("\n");
}

function shortLineUserId(lineUserId: string) {
  return lineUserId.length > 8 ? `${lineUserId.slice(0, 6)}...${lineUserId.slice(-4)}` : lineUserId;
}
