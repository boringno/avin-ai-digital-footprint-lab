import { getRuntimeConfig } from "@/lib/live-demo-config";

type SendOperationalAlertInput = {
  message: string;
  source: string;
};

function buildAlertText(input: SendOperationalAlertInput) {
  return [
    "[LINE AI Demo Alert]",
    `source=${input.source}`,
    `time=${new Date().toISOString()}`,
    input.message.slice(0, 240),
  ].join("\n");
}

export async function sendOperationalAlert(input: SendOperationalAlertInput) {
  const config = getRuntimeConfig();
  if (!config.lineAccessToken || !config.lineAlertUserId) {
    return {
      ok: false,
      skipped: true,
    };
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.lineAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          text: buildAlertText(input),
          type: "text",
        },
      ],
      to: config.lineAlertUserId,
    }),
  });

  return {
    ok: response.ok,
    skipped: false,
    status: response.status,
  };
}
