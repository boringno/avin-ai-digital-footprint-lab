import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  sendReplyPayloads,
  type ConfirmedReplyDelivery,
  type ProcessedWebhookResult,
} from "../src/lib/line-webhook";

const DELIVERED_AT = "2026-08-20T12:00:00.000Z";

function resultFixture(id: string, hasPayload = true): ProcessedWebhookResult {
  return {
    bookingDraft: { timeSlots: [] },
    conversationStatus: "ai_active",
    decision: {
      decisionType: "treatment_intro_reply",
      matchedKey: "test:onda",
      matchedType: "test",
      replyText: "ONDA Pro 核准介紹",
    },
    eventType: "message",
    handoffReason: null,
    messageId: `message-${id}`,
    messageText: "想了解 ONDA",
    replyPayload: hasPayload
      ? {
          messages: [{ text: "ONDA Pro 核准介紹", type: "text" }],
          replyToken: `reply-${id}`,
        }
      : null,
    replyToken: `reply-${id}`,
    sourceGroupId: "",
    sourceRoomId: "",
    sourceType: "user",
    sourceUserId: `user-${id}`,
    usedAiHumanizer: false,
    usedAiReplyGenerator: false,
    webhookEventId: `event-${id}`,
  };
}

function setMockFetch(mock: typeof fetch) {
  const prior = globalThis.fetch;
  globalThis.fetch = mock;
  return () => {
    globalThis.fetch = prior;
  };
}

async function send(
  results: ProcessedWebhookResult[],
  input: {
    authorizeBeforeSend?: (result: ProcessedWebhookResult) => Promise<boolean>;
    onConfirmedDelivery?: (
      delivery: ConfirmedReplyDelivery,
    ) => Promise<void>;
    retryCount?: number;
  },
) {
  return sendReplyPayloads(results, "test-token", {
    authorizeBeforeSend: input.authorizeBeforeSend ?? (async () => true),
    now: () => new Date(DELIVERED_AT),
    onConfirmedDelivery: input.onConfirmedDelivery,
    retryCount: input.retryCount ?? 0,
    timeoutMs: 500,
  });
}

async function validateConfirmedSuccessAndRetry() {
  const deliveries: ConfirmedReplyDelivery[] = [];
  let attempts = 0;
  const restore = setMockFetch(async () => {
    attempts += 1;
    return attempts === 1
      ? new Response("retry", { status: 503 })
      : new Response("{}", { status: 200 });
  });
  try {
    const result = resultFixture("retry-success");
    const sendResults = await send([result], {
      onConfirmedDelivery: async (delivery) => {
        deliveries.push(delivery);
      },
      retryCount: 1,
    });
    assert.equal(sendResults[0]?.ok, true, "DEL-1: retry must eventually succeed");
    assert.equal(sendResults[0]?.attempts, 2, "DEL-1: send result must retain attempt count");
    assert.equal(deliveries.length, 1, "DEL-1: retry success must commit delivery exactly once");
    assert.deepEqual(deliveries[0], {
      deliveredAt: DELIVERED_AT,
      deliveryId: "line-reply:event-retry-success",
      messageId: "message-retry-success",
      sourceUserId: "user-retry-success",
      webhookEventId: "event-retry-success",
    });
  } finally {
    restore();
  }
}

async function validateFailureAndSuppressionNeverCommit() {
  const committed: string[] = [];
  let mode: "http" | "network" = "http";
  let fetchCount = 0;
  const restore = setMockFetch(async () => {
    fetchCount += 1;
    if (mode === "network") throw new Error("network unknown");
    return new Response("not accepted", { status: 500 });
  });
  try {
    const onConfirmedDelivery = async (delivery: ConfirmedReplyDelivery) => {
      committed.push(delivery.deliveryId);
    };
    const failed = await send([resultFixture("http-failure")], { onConfirmedDelivery });
    assert.equal(failed[0]?.ok, false);
    assert.equal(failed[0]?.status, 500);

    mode = "network";
    const unknown = await send([resultFixture("network-unknown")], { onConfirmedDelivery });
    assert.equal(unknown[0]?.ok, false);
    assert.equal(unknown[0]?.status, 0, "DEL-2: network result is unknown, not delivered");

    const suppressed = await send([resultFixture("suppressed")], {
      authorizeBeforeSend: async () => false,
      onConfirmedDelivery,
    });
    assert.equal(suppressed[0]?.ok, true, "DEL-2: suppression remains non-retryable");
    assert.equal(suppressed[0]?.suppressedReason, "conversation_state_blocked");

    const noPayload = await send([resultFixture("no-payload", false)], { onConfirmedDelivery });
    assert.equal(noPayload[0]?.responseBody, "No reply payload generated");
    assert.deepEqual(committed, [], "DEL-2: non-2xx, status 0, suppression and no payload must never commit");
    assert.equal(fetchCount, 2, "DEL-2: suppressed/no-payload events must not call LINE");
  } finally {
    restore();
  }
}

async function validateCommitFailureNeverRetriesLine() {
  let fetchCount = 0;
  let callbackCount = 0;
  const restore = setMockFetch(async () => {
    fetchCount += 1;
    return new Response("{}", { status: 200 });
  });
  try {
    const sendResults = await send([resultFixture("commit-failure")], {
      onConfirmedDelivery: async () => {
        callbackCount += 1;
        throw new Error("simulated state CAS failure");
      },
      retryCount: 2,
    });
    assert.equal(sendResults[0]?.ok, true, "DEL-3: LINE success remains success when state commit fails");
    assert.equal(fetchCount, 1, "DEL-3: post-delivery failure must never resend LINE");
    assert.equal(callbackCount, 1, "DEL-3: post-delivery hook must run once");
  } finally {
    restore();
  }
}

async function validateAcceptedStatusSurvivesUnreadableBody() {
  let fetchCount = 0;
  let callbackCount = 0;
  const restore = setMockFetch(async () => {
    fetchCount += 1;
    return {
      ok: true,
      status: 200,
      text: async () => {
        throw new Error("response body stream failed after headers");
      },
    } as unknown as Response;
  });
  try {
    const sendResults = await send([resultFixture("accepted-unreadable-body")], {
      onConfirmedDelivery: async () => {
        callbackCount += 1;
      },
      retryCount: 2,
    });
    assert.equal(sendResults[0]?.ok, true, "DEL-4: a known 2xx remains accepted when its body is unreadable");
    assert.equal(sendResults[0]?.status, 200);
    assert.equal(sendResults[0]?.responseBody, "");
    assert.equal(fetchCount, 1, "DEL-4: a single-use LINE reply token must not be reused after known 2xx");
    assert.equal(callbackCount, 1, "DEL-4: known 2xx must commit delivery exactly once");
  } finally {
    restore();
  }
}

async function validatePartialMultiEventCommit() {
  const committed: string[] = [];
  const restore = setMockFetch(async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { replyToken?: string };
    return body.replyToken === "reply-multi-ok"
      ? new Response("{}", { status: 200 })
      : new Response("no", { status: 400 });
  });
  try {
    const sendResults = await send([
      resultFixture("multi-ok"),
      resultFixture("multi-fail"),
    ], {
      onConfirmedDelivery: async (delivery) => {
        committed.push(delivery.deliveryId);
      },
    });
    assert.deepEqual(sendResults.map((item) => item.ok), [true, false]);
    assert.deepEqual(
      committed,
      ["line-reply:event-multi-ok"],
      "DEL-5: a multi-event request must commit only the confirmed event",
    );
  } finally {
    restore();
  }
}

async function main() {
  const priorLogDir = process.env.LIVE_DEMO_LOG_DIR;
  const logDir = await mkdtemp(path.join(os.tmpdir(), "line-ai-delivery-commit-"));
  process.env.LIVE_DEMO_LOG_DIR = logDir;
  try {
    await validateConfirmedSuccessAndRetry();
    await validateFailureAndSuppressionNeverCommit();
    await validateCommitFailureNeverRetriesLine();
    await validateAcceptedStatusSurvivesUnreadableBody();
    await validatePartialMultiEventCommit();
    console.log("LINE confirmed-delivery commit boundary validation passed");
  } finally {
    if (priorLogDir === undefined) delete process.env.LIVE_DEMO_LOG_DIR;
    else process.env.LIVE_DEMO_LOG_DIR = priorLogDir;
    await rm(logDir, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
