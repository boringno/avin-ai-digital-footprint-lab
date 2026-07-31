import {
  buildDigestRecipientsFromRows,
  buildHandoffDigestEmail,
  getHandoffDigestKey,
  getHandoffDigestRecipients,
  sendLineGroupDigestPush,
} from "../src/lib/handoff-digest";

let passed = 0;

function expect(condition: unknown, label: string) {
  if (!condition) {
    throw new Error(`Failed: ${label}`);
  }
  passed += 1;
}

const branches = ["高雄館", "台中館", "桃園館", "林口館"];
const validGroupId = `C${"1".repeat(32)}`;
const customerUserId = `U${"2".repeat(32)}`;
const config = {
  adminNotifyTarget: validGroupId,
  handoffDigestKaohsiungTo: "kaohsiung@example.test, backup@example.test",
  handoffDigestLinkouTo: "",
  handoffDigestTaichungTo: "",
  handoffDigestTaoyuanTo: "",
} as Parameters<typeof getHandoffDigestRecipients>[0];

const fallbackRecipients = getHandoffDigestRecipients(config, branches);
expect(
  fallbackRecipients["高雄館"].email.join(",") === "kaohsiung@example.test,backup@example.test",
  "Kaohsiung email fallback recipients are resolved from config",
);
expect(
  fallbackRecipients["高雄館"].line_group.join(",") === validGroupId,
  "LINE fallback target comes from ADMIN_NOTIFY_TARGET",
);

const mergedRecipients = buildDigestRecipientsFromRows({
  branches,
  fallbackRecipients,
  rows: [
    { branch: "高雄館", channel: "email", recipient_scope: "clinic", target: "ops-kaohsiung@example.test" },
    { branch: "林口館", channel: "line_group", recipient_scope: "clinic", target: validGroupId },
  ],
});
expect(
  mergedRecipients["高雄館"].email.join(",") === "ops-kaohsiung@example.test",
  "Saved clinic email recipients override branch fallback",
);
expect(
  mergedRecipients["林口館"].line_group.join(",") === validGroupId,
  "Saved LINE group recipients override branch fallback",
);

const weekdayKey = getHandoffDigestKey(new Date("2026-07-13T12:00:00.000Z"), "weekday_2100");
const weekendMorningKey = getHandoffDigestKey(new Date("2026-07-11T00:00:00.000Z"), "weekend_0800");
const weekendEveningKey = getHandoffDigestKey(new Date("2026-07-11T12:00:00.000Z"), "weekend_2000");
expect(weekdayKey === "2026-07-13-weekday_2100", "weekday digest key uses weekday_2100 slot");
expect(weekendMorningKey === "2026-07-11-weekend_0800", "weekend morning digest key uses weekend_0800 slot");
expect(weekendEveningKey === "2026-07-11-weekend_2000", "weekend evening digest key uses weekend_2000 slot");

const email = buildHandoffDigestEmail({ appBaseUrl: "https://example.test", branch: "高雄館", taskCount: 2 });
expect(email.subject.includes("2 位客人"), "digest subject contains aggregate count");
expect(email.text.includes("/admin/workbench") && !email.text.includes("conversation_id"), "digest links only to the workbench landing page");
expect(!email.text.includes("LINE ID") && !email.text.includes("電話") && !email.text.includes("姓名"), "digest text contains no customer identifiers");

async function main() {
  let fetchCount = 0;
  const reportError = async () => undefined;
  const blockedResult = await sendLineGroupDigestPush(
    {
      accessToken: "test-token",
      branch: "高雄館",
      recipients: [customerUserId],
      text: "test digest",
    },
    {
      fetchImpl: (async () => {
        fetchCount += 1;
        return new Response(null, { status: 200 });
      }) as typeof fetch,
      reportError,
    },
  );
  expect(!blockedResult.ok && fetchCount === 0, "polluted U recipient is blocked before LINE push");

  const allowedResult = await sendLineGroupDigestPush(
    {
      accessToken: "test-token",
      branch: "高雄館",
      recipients: [validGroupId],
      text: "test digest",
    },
    {
      fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
        fetchCount += 1;
        const payload = JSON.parse(String(init?.body)) as { to?: string };
        expect(payload.to === validGroupId, "valid group ID is preserved as the LINE push target");
        return new Response(null, { status: 200 });
      }) as typeof fetch,
      reportError,
    },
  );
  expect(allowedResult.ok && fetchCount === 1, "known C recipient can reach LINE push");

  console.log(`handoff digest validation passed (${passed} checks)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
