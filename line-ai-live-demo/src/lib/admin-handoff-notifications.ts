import { getHumanSupportStatus } from "@/lib/human-support";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { reportOperationalError } from "@/lib/monitoring";

export type HandoffNotificationInput = {
  conversationId: string;
  reason: string;
};

const handoffReasonLabels: Record<string, string> = {
  booking_cancel_request: "預約取消需求",
  booking_intake: "新預約需求",
  booking_modify_request: "預約變更需求",
  customer_account_lookup: "客戶資料查詢",
  effect_guarantee_request: "療效保證問題",
  human_request: "客人要求真人協助",
  personalized_consult: "個人適合度問題",
  post_procedure_issue: "術後狀況需確認",
  price_commitment_request: "價格承諾問題",
  serious_complaint: "客訴／退款問題",
  unsupported_treatment_or_unapproved_content: "需人工確認療程問題",
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

export function getHandoffNotificationReasonLabel(reason: string) {
  if (reason.startsWith("treatment_brand_missing:")) {
    return "需人工確認療程品牌問題";
  }
  return handoffReasonLabels[reason] ?? "需真人客服確認";
}

export function buildHandoffNotificationText(input: HandoffNotificationInput, appBaseUrl: string) {
  const link = `${appBaseUrl.replace(/\/$/, "")}/admin/workbench`;

  return [
    "有新的真人接手任務",
    `原因：${getHandoffNotificationReasonLabel(input.reason)}`,
    "請登入客服工作台查看並接續處理。",
    `工作台：${link}`,
  ].join("\n");
}
