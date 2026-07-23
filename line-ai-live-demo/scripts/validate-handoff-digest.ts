import { buildHandoffDigestEmail, getHandoffDigestKey, getHandoffDigestRecipients } from "../src/lib/handoff-digest";

let passed = 0;
function expect(condition: unknown, label: string) {
  if (!condition) throw new Error(`Failed: ${label}`);
  passed += 1;
}

const config = {
  handoffDigestKaohsiungTo: "kaohsiung@example.test, backup@example.test",
  handoffDigestLinkouTo: "",
  handoffDigestTaichungTo: "",
  handoffDigestTaoyuanTo: "",
} as Parameters<typeof getHandoffDigestRecipients>[0];
const recipients = getHandoffDigestRecipients(config);
expect(recipients["高雄館"].join(",") === "kaohsiung@example.test,backup@example.test", "Kaohsiung recipients are resolved from config");
expect(recipients["台中館"].length === 0 && recipients["桃園館"].length === 0 && recipients["林口館"].length === 0, "blank branches remain disabled");

const weekdayKey = getHandoffDigestKey(new Date("2026-07-13T12:00:00.000Z"));
const saturdayKey = getHandoffDigestKey(new Date("2026-07-11T08:00:00.000Z"));
const sundayKey = getHandoffDigestKey(new Date("2026-07-12T08:00:00.000Z"));
expect(weekdayKey === "2026-07-13-weekday-afternoon", "weekday test slot is Taiwan afternoon");
expect(saturdayKey === "2026-07-11-saturday-afternoon", "Saturday slot is Taiwan afternoon");
expect(sundayKey === "2026-07-12-sunday-afternoon", "Sunday slot is Taiwan afternoon");

const email = buildHandoffDigestEmail({ appBaseUrl: "https://example.test", branch: "高雄館", taskCount: 2 });
expect(email.subject.includes("2 位客人"), "digest subject contains aggregate count");
expect(email.text.includes("/admin/workbench") && !email.text.includes("conversation_id"), "digest links only to the workbench landing page");
expect(!email.text.includes("LINE ID") && !email.text.includes("電話") && !email.text.includes("姓名"), "digest text contains no customer identifiers");

console.log(`handoff digest validation passed (${passed} checks)`);
