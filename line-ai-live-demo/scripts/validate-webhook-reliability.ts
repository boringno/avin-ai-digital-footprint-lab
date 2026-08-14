import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";

import { isReplyStillAuthorized, processWebhookRequestBody, sendReplyPayloads, type ProcessedWebhookResult } from "../src/lib/line-webhook";
import { loadConversationContext } from "../src/lib/conversation-context";
import { loadConversationState, markHumanTakeover, saveConversationState } from "../src/lib/conversation-state";
import { splitWebhookResultsByDuplicate } from "../src/lib/webhook-dedupe";

type MockFetch = typeof fetch;

async function withTempLogDir<T>(run: (logDir: string) => Promise<T>) {
  const previousLogDir = process.env.LIVE_DEMO_LOG_DIR;
  const logDir = await mkdtemp(path.join(os.tmpdir(), "line-ai-live-demo-webhook-"));

  process.env.LIVE_DEMO_LOG_DIR = logDir;

  try {
    return await run(logDir);
  } finally {
    if (previousLogDir === undefined) {
      delete process.env.LIVE_DEMO_LOG_DIR;
    } else {
      process.env.LIVE_DEMO_LOG_DIR = previousLogDir;
    }
    await rm(logDir, { force: true, recursive: true });
  }
}

async function loadSingleEventPayload(overrides: Partial<Record<"messageId" | "replyToken" | "text" | "webhookEventId", string>> = {}) {
  const payloadPath = path.resolve(process.cwd(), "./data/live-demo-seed/sample_line_webhook_payload.json");
  const payload = JSON.parse(await readFile(payloadPath, "utf8")) as { events: Array<Record<string, unknown>> };
  const firstEvent = structuredClone(payload.events[0]) as Record<string, unknown>;
  const message = (firstEvent.message ?? {}) as Record<string, unknown>;

  if (overrides.messageId) {
    message.id = overrides.messageId;
  }
  if (overrides.text) {
    message.text = overrides.text;
  }
  firstEvent.message = message;

  if (overrides.replyToken) {
    firstEvent.replyToken = overrides.replyToken;
  }
  if (overrides.webhookEventId) {
    firstEvent.webhookEventId = overrides.webhookEventId;
  }

  return JSON.stringify({ events: [firstEvent] });
}

async function buildAcceptedResults(rawBody: string) {
  const processed = await processWebhookRequestBody(rawBody, { includePending: false });
  return splitWebhookResultsByDuplicate(processed.results);
}

function setMockFetch(mockFetch: MockFetch) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  return () => {
    globalThis.fetch = previousFetch;
  };
}

async function caseDuplicateMessageId() {
  return withTempLogDir(async () => {
    let fetchCount = 0;
    const restoreFetch = setMockFetch(async () => {
      fetchCount += 1;
      return new Response("{}", { status: 200 });
    });

    try {
      const acceptedCounts: number[] = [];

      for (let index = 0; index < 3; index += 1) {
        const rawBody = await loadSingleEventPayload({
          messageId: "msg-same-001",
          replyToken: `reply-token-dup-${index}`,
          webhookEventId: `evt-dup-${index}`,
        });
        const dedupeResult = await buildAcceptedResults(rawBody);
        acceptedCounts.push(dedupeResult.acceptedResults.length);
        await sendReplyPayloads(dedupeResult.acceptedResults, "test-token", {
          retryCount: 1,
          timeoutMs: 500,
        });
      }

      return {
        acceptedCounts,
        fetchCount,
        ok: fetchCount === 1 && acceptedCounts.join(",") === "1,0,0",
      };
    } finally {
      restoreFetch();
    }
  });
}

async function caseRetrySuccess() {
  const rawBody = await loadSingleEventPayload({
    messageId: "msg-retry-001",
    replyToken: "reply-token-retry-001",
    webhookEventId: "evt-retry-001",
  });
  const processed = await processWebhookRequestBody(rawBody, { includePending: false });
  const result = processed.results[0] as ProcessedWebhookResult;

  let attempts = 0;
  const restoreFetch = setMockFetch(async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error("temporary network error");
    }
    return new Response("{}", { status: 200 });
  });

  try {
    const replyResults = await sendReplyPayloads([result], "test-token", {
      retryCount: 1,
      timeoutMs: 500,
    });

    return {
      attempts,
      ok: replyResults[0]?.ok === true && replyResults[0]?.attempts === 2,
      result: replyResults[0],
    };
  } finally {
    restoreFetch();
  }
}

async function caseDeadLetter() {
  return withTempLogDir(async (logDir) => {
    const rawBody = await loadSingleEventPayload({
      messageId: "msg-dead-001",
      replyToken: "reply-token-dead-001",
      webhookEventId: "evt-dead-001",
    });
    const processed = await processWebhookRequestBody(rawBody, { includePending: false });
    const result = processed.results[0] as ProcessedWebhookResult;

    const restoreFetch = setMockFetch(async () => new Response("boom", { status: 500 }));

    try {
      const replyResults = await sendReplyPayloads([result], "test-token", {
        retryCount: 1,
        timeoutMs: 500,
      });

      const deadLetterPath = path.join(logDir, "line-reply-dead-letter.jsonl");
      const deadLetterContent = await readFile(deadLetterPath, "utf8");
      const deadLetterLines = deadLetterContent.split(/\r?\n/).filter(Boolean);
      const contextAfterFailure = await loadConversationContext(result.sourceUserId);
      const failedReplyStillVisible = contextAfterFailure.recentTurns?.some(
        (turn) => turn.role === "assistant" && turn.text === result.decision.replyText,
      );

      return {
        deadLetterCount: deadLetterLines.length,
        failedReplyStillVisible,
        ok:
          replyResults[0]?.ok === false &&
          replyResults[0]?.attempts === 2 &&
          deadLetterLines.length === 1 &&
          failedReplyStillVisible === false,
        result: replyResults[0],
      };
    } finally {
      restoreFetch();
    }
  });
}

async function caseTakeoverBeforeSend() {
  return withTempLogDir(async () => {
    const rawBody = await loadSingleEventPayload({
      messageId: "msg-takeover-001",
      replyToken: "reply-token-takeover-001",
      text: "想了解 ONDA",
      webhookEventId: "evt-takeover-001",
    });
    const processed = await processWebhookRequestBody(rawBody, { includePending: false });
    const result = processed.results[0] as ProcessedWebhookResult;
    const currentState = await loadConversationState(result.sourceUserId);
    await saveConversationState(markHumanTakeover(currentState, {
      assignedTo: "Amy",
      sentAt: "2099-08-13T12:00:00.000Z",
    }));

    let fetchCount = 0;
    const restoreFetch = setMockFetch(async () => {
      fetchCount += 1;
      return new Response("{}", { status: 200 });
    });
    try {
      const replyResults = await sendReplyPayloads([result], "test-token", {
        retryCount: 1,
        timeoutMs: 500,
      });
      return {
        fetchCount,
        ok: fetchCount === 0 && replyResults[0]?.ok === true && replyResults[0]?.attempts === 0,
        result: replyResults[0],
      };
    } finally {
      restoreFetch();
    }
  });
}

async function caseTakeoverBeforeRetry() {
  return withTempLogDir(async () => {
    const rawBody = await loadSingleEventPayload({
      messageId: "msg-takeover-retry-001",
      replyToken: "reply-token-takeover-retry-001",
      text: "想了解 ONDA",
      webhookEventId: "evt-takeover-retry-001",
    });
    const processed = await processWebhookRequestBody(rawBody, { includePending: false });
    const result = processed.results[0] as ProcessedWebhookResult;
    let fetchCount = 0;
    const restoreFetch = setMockFetch(async () => {
      fetchCount += 1;
      const currentState = await loadConversationState(result.sourceUserId);
      await saveConversationState(markHumanTakeover(currentState, {
        assignedTo: "Amy",
        sentAt: "2099-08-13T12:00:00.000Z",
      }));
      throw new Error("temporary network error before staff takeover");
    });
    try {
      const replyResults = await sendReplyPayloads([result], "test-token", {
        retryCount: 1,
        timeoutMs: 500,
      });
      return {
        fetchCount,
        ok: fetchCount === 1 && replyResults[0]?.ok === true && replyResults[0]?.attempts === 1,
        result: replyResults[0],
      };
    } finally {
      restoreFetch();
    }
  });
}

async function caseAuthorizationUnavailable() {
  const rawBody = await loadSingleEventPayload({
    messageId: "msg-auth-unavailable-001",
    replyToken: "reply-token-auth-unavailable-001",
    webhookEventId: "evt-auth-unavailable-001",
  });
  const processed = await processWebhookRequestBody(rawBody, { includePending: false });
  let fetchCount = 0;
  const restoreFetch = setMockFetch(async () => {
    fetchCount += 1;
    return new Response("{}", { status: 200 });
  });
  try {
    const replyResults = await sendReplyPayloads(processed.results, "test-token", {
      authorizeBeforeSend: async () => {
        throw new Error("state store unavailable");
      },
      retryCount: 1,
      timeoutMs: 500,
    });
    return {
      fetchCount,
      ok:
        fetchCount === 0 &&
        replyResults[0]?.ok === true &&
        replyResults[0]?.suppressedReason === "conversation_state_unavailable",
      result: replyResults[0],
    };
  } finally {
    restoreFetch();
  }
}

async function caseDefaultAuthorizationFailsClosed() {
  const rawBody = await loadSingleEventPayload({
    messageId: "msg-auth-default-unavailable-001",
    replyToken: "reply-token-auth-default-unavailable-001",
    webhookEventId: "evt-auth-default-unavailable-001",
  });
  const processed = await processWebhookRequestBody(rawBody, { includePending: false });
  const authorized = await isReplyStillAuthorized(
    processed.results[0] as ProcessedWebhookResult,
    async () => { throw new Error("authoritative state unavailable after takeover"); },
  );
  return { authorized, ok: authorized === false };
}

async function main() {
  const duplicateCase = await caseDuplicateMessageId();
  const retryCase = await caseRetrySuccess();
  const deadLetterCase = await caseDeadLetter();
  const takeoverBeforeSendCase = await caseTakeoverBeforeSend();
  const takeoverBeforeRetryCase = await caseTakeoverBeforeRetry();
  const authorizationUnavailableCase = await caseAuthorizationUnavailable();
  const defaultAuthorizationUnavailableCase = await caseDefaultAuthorizationFailsClosed();

  const output = {
    authorizationUnavailableCase,
    defaultAuthorizationUnavailableCase,
    deadLetterCase,
    duplicateCase,
    retryCase,
    takeoverBeforeRetryCase,
    takeoverBeforeSendCase,
  };

  console.log(JSON.stringify(output, null, 2));

  if (!authorizationUnavailableCase.ok || !defaultAuthorizationUnavailableCase.ok || !duplicateCase.ok || !retryCase.ok || !deadLetterCase.ok || !takeoverBeforeSendCase.ok || !takeoverBeforeRetryCase.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
