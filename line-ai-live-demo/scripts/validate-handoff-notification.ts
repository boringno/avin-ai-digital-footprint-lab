import {
  buildDigestRecipientsFromRows,
  createEmptyRecipientMap,
  executeHandoffDigestPlan,
  type HandoffDigestRecipients,
} from "../src/lib/handoff-digest";

let passed = 0;

function expect(condition: unknown, label: string) {
  if (!condition) {
    throw new Error(`Failed: ${label}`);
  }
  passed += 1;
}

const branches = ["kaohsiung", "linkou"];

function createRecipients(): HandoffDigestRecipients {
  return buildDigestRecipientsFromRows({
    branches,
    fallbackRecipients: createEmptyRecipientMap(branches),
    rows: [
      { branch: branches[0], channel: "email", recipient_scope: "clinic", target: "kaohsiung@example.test" },
      { branch: branches[0], channel: "line_group", recipient_scope: "clinic", target: "C-KHH" },
      { branch: branches[1], channel: "email", recipient_scope: "clinic", target: "linkou@example.test" },
      { branch: branches[1], channel: "line_group", recipient_scope: "clinic", target: "C-LK" },
    ],
  });
}

const isolationRecipients = createRecipients();
expect(
  isolationRecipients[branches[0]].email.join(",") === "kaohsiung@example.test",
  "Kaohsiung email recipients stay isolated to Kaohsiung branch",
);
expect(
  isolationRecipients[branches[1]].line_group.join(",") === "C-LK",
  "Linkou LINE group recipients stay isolated to Linkou branch",
);

const deliveryStatuses = new Map<string, "failed" | "sending" | "sent">();
const sentClaims = new Map<string, string | null>();
const failedClaims = new Map<string, string>();
const sendAttempts: string[] = [];

async function runScenario(digestKey: string, failFirstBranchEmail = false) {
  return executeHandoffDigestPlan({
    appBaseUrl: "https://example.test",
    branches,
    claimDelivery: async (branch, channel, key) => {
      const claimKey = `${branch}:${channel}:${key}`;
      const currentStatus = deliveryStatuses.get(claimKey);
      if (currentStatus && currentStatus !== "failed") {
        return null;
      }

      deliveryStatuses.set(claimKey, "sending");
      return { id: claimKey };
    },
    digestKey,
    enabledChannels: {
      email: true,
      line_group: true,
    },
    markFailed: async (claimId, errorMessage) => {
      failedClaims.set(claimId, errorMessage);
      deliveryStatuses.set(claimId, "failed");
    },
    markSent: async (claimId, providerMessageId) => {
      sentClaims.set(claimId, providerMessageId);
      deliveryStatuses.set(claimId, "sent");
    },
    recipients: createRecipients(),
    sendDigest: async ({ branch, channel }) => {
      sendAttempts.push(`${branch}:${channel}:${digestKey}`);
      if (branch === branches[0] && channel === "email" && failFirstBranchEmail) {
        return {
          errorMessage: "simulated email failure",
          ok: false,
          providerMessageId: null,
        };
      }

      return {
        ok: true,
        providerMessageId: `${branch}:${channel}:${digestKey}`,
      };
    },
    slot: digestKey.endsWith("weekend_2000") ? "weekend_2000" : "weekday_2100",
    taskCounts: {
      [branches[0]]: 1,
      [branches[1]]: 2,
    },
    unassignedTaskCount: 0,
  });
}

async function main() {
  const sameSlot = "2026-07-27-weekday_2100";
  const firstRun = await runScenario(sameSlot, true);
  expect(
    firstRun.deliveries.some((delivery) => delivery.branch === branches[0] && delivery.channel === "email" && delivery.status === "failed"),
    "Email failure is recorded as failed",
  );
  expect(
    firstRun.deliveries.some((delivery) => delivery.branch === branches[0] && delivery.channel === "line_group" && delivery.status === "sent"),
    "Email failure does not block LINE group delivery for the same branch",
  );
  expect(
    firstRun.deliveries.some((delivery) => delivery.branch === branches[1] && delivery.channel === "email" && delivery.status === "sent"),
    "A failed branch does not block other branches",
  );

  const attemptsAfterFirstRun = sendAttempts.length;
  const rerunSameSlot = await runScenario(sameSlot);
  expect(
    rerunSameSlot.deliveries.some((delivery) => delivery.branch === branches[0] && delivery.channel === "email" && delivery.status === "sent"),
    "A failed delivery can be retried in the same slot",
  );
  expect(
    rerunSameSlot.deliveries.filter((delivery) => !(delivery.branch === branches[0] && delivery.channel === "email")).every((delivery) => delivery.status === "skipped"),
    "Retrying a failed delivery does not resend successful channels",
  );
  expect(sendAttempts.length === attemptsAfterFirstRun + 1, "Only the failed channel is retried in the same slot");

  const attemptsAfterRetry = sendAttempts.length;
  const rerunDeliveredSlot = await runScenario(sameSlot);
  expect(
    rerunDeliveredSlot.deliveries.every((delivery) => delivery.status === "skipped"),
    "A fully delivered slot does not resend any channel",
  );
  expect(sendAttempts.length === attemptsAfterRetry, "No additional send attempt is made after a successful retry");

  const rerunDifferentSlot = await runScenario("2026-07-27-weekend_2000");
  expect(
    rerunDifferentSlot.deliveries.some((delivery) => delivery.branch === branches[1] && delivery.channel === "email" && delivery.status === "sent"),
    "A different slot can send again on the same day",
  );
  expect(
    rerunDifferentSlot.deliveries.some((delivery) => delivery.branch === branches[0] && delivery.channel === "line_group" && delivery.status === "sent"),
    "LINE group idempotency is separated by slot",
  );
  expect(
    failedClaims.has(`${branches[0]}:email:${sameSlot}`),
    "Failed deliveries are tracked per branch and channel",
  );
  expect(
    sentClaims.has(`${branches[0]}:email:${sameSlot}`),
    "A retried delivery is recorded as sent",
  );

  const emptyRecipients = createEmptyRecipientMap([branches[0]]);
  expect(
    emptyRecipients[branches[0]].email.length === 0 && emptyRecipients[branches[0]].line_group.length === 0,
    "Recipient map starts empty",
  );

  console.log(`handoff notification validation passed (${passed} checks)`);
}

void main();
