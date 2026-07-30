import { reportOperationalError } from "../src/lib/monitoring";

type MockFetch = typeof fetch;

function setMockFetch(mockFetch: MockFetch) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  return () => {
    globalThis.fetch = previousFetch;
  };
}

async function main() {
  const previousLineAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const previousAlertUserId = process.env.LIVE_DEMO_ALERT_LINE_USER_ID;

  process.env.LINE_CHANNEL_ACCESS_TOKEN = "test-line-access-token";
  process.env.LIVE_DEMO_ALERT_LINE_USER_ID = "U-ops-alert-target";

  let fetchCount = 0;
  let pushedText = "";

  const restoreFetch = setMockFetch(async (_input, init) => {
    fetchCount += 1;
    const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ text?: string }> };
    pushedText = body.messages?.[0]?.text ?? "";
    return new Response("{}", { status: 200 });
  });

  try {
    await reportOperationalError({
      error: new Error("monitoring validation error"),
      source: "monitoring_validation",
    });
  } finally {
    restoreFetch();

    if (previousLineAccessToken === undefined) {
      delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    } else {
      process.env.LINE_CHANNEL_ACCESS_TOKEN = previousLineAccessToken;
    }

    if (previousAlertUserId === undefined) {
      delete process.env.LIVE_DEMO_ALERT_LINE_USER_ID;
    } else {
      process.env.LIVE_DEMO_ALERT_LINE_USER_ID = previousAlertUserId;
    }
  }

  const result = {
    fetchCount,
    ok: fetchCount === 1 && pushedText.includes("[LINE AI Demo Alert]") && pushedText.includes("source=monitoring_validation"),
    pushedText,
  };

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
