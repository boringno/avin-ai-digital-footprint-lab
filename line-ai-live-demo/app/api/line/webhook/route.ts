import { after, NextResponse } from "next/server";

import { syncWebhookResultsToAdminDb } from "@/lib/admin-webhook-sync";
import { syncWebhookResultsToGoogleSheetsWithRetry } from "@/lib/google-sheets-log";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import {
  InvalidWebhookPayloadError,
  processWebhookRequestBody,
  sendReplyPayloads,
  verifyLineSignature,
  type ProcessedWebhookResult,
  type ReplySendResult,
} from "@/lib/line-webhook";
import { reportOperationalError } from "@/lib/monitoring";
import { splitWebhookResultsByDuplicate } from "@/lib/webhook-dedupe";
import { appendWebhookAuditLog } from "@/lib/webhook-audit-log";

export const runtime = "nodejs";

function buildWebhookResponse(input: {
  duplicateEventIds: string[];
  eventCount: number;
  failedReplyCount?: number;
  ok: boolean;
  requestError?: string;
  sendReply: boolean;
  signatureVerified: boolean | "skipped";
  status: number;
}) {
  return {
    ok: input.ok,
    error: input.requestError,
    event_count: input.eventCount,
    duplicate_event_count: input.duplicateEventIds.length,
    failed_reply_count: input.failedReplyCount ?? 0,
    send_reply: input.sendReply,
    signature_verified: input.signatureVerified,
    status: input.status,
  };
}

class WebhookRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "WebhookRequestError";
    this.status = status;
  }
}

function scheduleWebhookPostProcessing(input: {
  duplicateEventIds: string[];
  eventCount: number;
  loggedAt: string;
  rawBody: string;
  replyResults: ReplySendResult[];
  requestError?: string;
  results: ProcessedWebhookResult[];
  sendReply: boolean;
  signatureVerified: boolean | "skipped";
}) {
  after(async () => {
    await syncWebhookResultsToAdminDb({
      loggedAt: input.loggedAt,
      replyResults: input.replyResults,
      results: input.results,
    });

    const googleSheetsSync = await syncWebhookResultsToGoogleSheetsWithRetry({
      duplicateEventIds: input.duplicateEventIds,
      loggedAt: input.loggedAt,
      replyResults: input.replyResults,
      requestError: input.requestError,
      results: input.results,
    });

    try {
      await appendWebhookAuditLog({
        eventCount: input.eventCount,
        duplicateEventIds: input.duplicateEventIds,
        googleSheetsSync,
        loggedAt: input.loggedAt,
        rawBody: input.rawBody,
        replyResults: input.replyResults,
        requestError: input.requestError,
        results: input.results,
        sendReply: input.sendReply,
        signatureVerified: input.signatureVerified,
      });
    } catch (error) {
      await reportOperationalError({
        error,
        extra: {
          event_count: input.eventCount,
        },
        source: "line_webhook_audit_log",
      });
    }
  });
}

export async function POST(request: Request) {
  const config = getRuntimeConfig();
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature") ?? "";

  let eventCount = 0;
  let requestError: string | undefined;
  let replyResults: ReplySendResult[] = [];
  let results: ProcessedWebhookResult[] = [];
  let duplicateEventIds: string[] = [];
  let signatureVerified: boolean | "skipped" = config.skipSignatureVerify ? "skipped" : false;
  let status = 200;
  let responseBody: Record<string, unknown> = { ok: true };
  const loggedAt = new Date().toISOString();

  try {
    if (!config.skipSignatureVerify) {
      if (!config.lineChannelSecret) {
        throw new WebhookRequestError(500, "LINE_CHANNEL_SECRET is missing");
      }
      if (!verifyLineSignature(rawBody, config.lineChannelSecret, signature)) {
        throw new WebhookRequestError(401, "Invalid LINE signature");
      }
      signatureVerified = true;
    }

    const result = await processWebhookRequestBody(rawBody, {
      includePending: config.includePending,
    });

    eventCount = result.eventCount;
    const dedupeResult = await splitWebhookResultsByDuplicate(result.results);
    duplicateEventIds = dedupeResult.duplicateEventIds;
    results = dedupeResult.acceptedResults;

    if (config.sendReply) {
      if (!config.lineAccessToken) {
        throw new WebhookRequestError(500, "LINE_CHANNEL_ACCESS_TOKEN is missing");
      }
      replyResults = await sendReplyPayloads(results, config.lineAccessToken, {
        retryCount: config.lineReplyRetryCount,
        timeoutMs: config.lineReplyTimeoutMs,
      });
    }

    const failedReplyResults = replyResults.filter(
      (replyResult) => !replyResult.ok && replyResult.responseBody !== "No reply payload generated",
    );
    if (failedReplyResults.length > 0) {
      requestError = `LINE reply failed for ${failedReplyResults.length} event(s)`;
      await reportOperationalError({
        error: new Error(requestError),
        extra: {
          failed_reply_count: failedReplyResults.length,
        },
        source: "line_webhook_reply",
      });
      status = 502;
      responseBody = buildWebhookResponse({
        duplicateEventIds,
        eventCount,
        failedReplyCount: failedReplyResults.length,
        ok: false,
        requestError,
        sendReply: config.sendReply,
        signatureVerified,
        status,
      });
    } else {
      responseBody = buildWebhookResponse({
        duplicateEventIds,
        eventCount,
        ok: true,
        sendReply: config.sendReply,
        signatureVerified,
        status,
      });
    }
  } catch (error) {
    if (error instanceof WebhookRequestError) {
      requestError = error.message;
      status = error.status;
    } else if (error instanceof InvalidWebhookPayloadError) {
      requestError = error.message;
      status = 400;
    } else {
      requestError = error instanceof Error ? error.message : "Unexpected webhook error";
      status = 500;
    }

    await reportOperationalError({
      error,
      extra: {
        event_count: eventCount,
        status,
      },
      source: "line_webhook_route",
    });

    responseBody = buildWebhookResponse({
      duplicateEventIds,
      eventCount,
      failedReplyCount: replyResults.filter((replyResult) => !replyResult.ok).length,
      ok: false,
      requestError,
      sendReply: config.sendReply,
      signatureVerified,
      status,
    });
  }

  scheduleWebhookPostProcessing({
    duplicateEventIds,
    eventCount,
    loggedAt,
    rawBody,
    replyResults,
    requestError,
    results,
    sendReply: config.sendReply,
    signatureVerified,
  });

  return NextResponse.json(responseBody, { status });
}
