import { NextResponse } from "next/server";

import { syncWebhookResultsToGoogleSheets } from "@/lib/google-sheets-log";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import {
  InvalidWebhookPayloadError,
  processWebhookRequestBody,
  sendReplyPayloads,
  verifyLineSignature,
  type ProcessedWebhookResult,
  type ReplySendResult,
} from "@/lib/line-webhook";
import { splitWebhookResultsByDuplicate } from "@/lib/webhook-dedupe";
import { appendWebhookAuditLog } from "@/lib/webhook-audit-log";

export const runtime = "nodejs";

class WebhookRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "WebhookRequestError";
    this.status = status;
  }
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
      status = 502;
      responseBody = {
        ok: false,
        error: requestError,
        event_count: eventCount,
        duplicate_event_ids: duplicateEventIds,
        reply_results: replyResults,
        results,
        send_reply: config.sendReply,
        signature_verified: signatureVerified,
      };
    } else {
      responseBody = {
        ok: true,
        event_count: eventCount,
        duplicate_event_ids: duplicateEventIds,
        reply_results: replyResults,
        results,
        send_reply: config.sendReply,
        signature_verified: signatureVerified,
      };
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

    responseBody = {
      ok: false,
      error: requestError,
      event_count: eventCount,
      duplicate_event_ids: duplicateEventIds,
      reply_results: replyResults,
      results,
      send_reply: config.sendReply,
      signature_verified: signatureVerified,
    };
  }

  const googleSheetsSync = await syncWebhookResultsToGoogleSheets({
    duplicateEventIds,
    loggedAt,
    replyResults,
    requestError,
    results,
  });

  await appendWebhookAuditLog({
    eventCount,
    duplicateEventIds,
    googleSheetsSync,
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
