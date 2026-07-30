import crypto from "node:crypto";

import type { ProcessedWebhookResult, ReplySendResult } from "@/lib/line-webhook";

type StoredPayloadSummary = {
  eventCount: number;
  eventTypes: string[];
  hasTextMessages: boolean;
  messageTypes: string[];
  sourceTypes: string[];
};

export type SanitizedBookingDraft = {
  branch?: string;
  hasName: boolean;
  hasPhone: boolean;
  isFirstVisit?: "no" | "unknown" | "yes";
  requestedTimeSlotCount: number;
  timeSlotCount: number;
  treatment?: string;
};

export type SanitizedReplyPayloadSummary = {
  messageCount: number;
  types: string[];
};

export type SanitizedProcessedWebhookResult = {
  bookingDraft: SanitizedBookingDraft;
  conversationStatus: string;
  decision: {
    decisionType: string;
    matchedKey: string;
    matchedType: string;
  };
  eventType: string;
  messageId: string;
  replyPayloadSummary: SanitizedReplyPayloadSummary | null;
  sourceUserId: string;
  usedAiHumanizer: boolean;
  usedAiReplyGenerator: boolean;
  webhookEventId: string;
};

export type SanitizedReplySendResult = {
  attempts: number;
  hasError: boolean;
  messageId: string;
  ok: boolean;
  status: number;
  webhookEventId: string;
};

export type SanitizedWebhookAuditEntry = {
  duplicateEventIds?: string[];
  eventCount: number;
  googleSheetsSync?: unknown;
  loggedAt: string;
  payloadSummary: StoredPayloadSummary;
  replyResults: SanitizedReplySendResult[];
  hasRequestError: boolean;
  results: SanitizedProcessedWebhookResult[];
  sendReply: boolean;
  signatureVerified: boolean | "skipped";
};

export type SanitizedDeadLetterEntry = {
  attemptedAt: string;
  attempts: number;
  decisionType: string;
  errorMessage?: string;
  matchedKey: string;
  messageId: string;
  responsePreview: string;
  status: number;
  webhookEventId: string;
};

function stableHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function maskIdentifier(value: string, prefix = "id") {
  if (!value) {
    return "";
  }

  return `${prefix}_${stableHash(value)}`;
}

export function sanitizeTextPreview(value: string, maxLength = 120) {
  if (!value) {
    return "";
  }

  const masked = value
    .replace(/\d{8,}/g, "[masked-number]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[masked-email]")
    .replace(/\bU[a-zA-Z0-9]{8,}\b/g, "[masked-line-user]")
    .replace(/\b[a-z0-9_-]{20,}\b/gi, "[masked-token]");

  return masked.length > maxLength ? `${masked.slice(0, maxLength - 3)}...` : masked;
}

// Analytics candidates never need raw customer wording. Keep enough context for
// review while removing common contact and identifier formats before storage.
export function redactQuestionForAnalytics(value: string, maxLength = 240) {
  if (!value) {
    return "";
  }

  const masked = value
    .replace(/(?:\u6211\u53eb|\u6211\u662f|\u59d3\u540d\u662f|\u540d\u5b57\u662f)\s*[\u4e00-\u9fffA-Za-z]{2,12}/g, "[masked-name]")
    .replace(/[\u4e00-\u9fffA-Za-z]{1,12}(?:\u5c0f\u59d0|\u5148\u751f|\u592a\u592a|\u8b77\u58eb|\u91ab\u5e2b)/g, "[masked-name]")
    .replace(/\b(?:\+?886[-\s]?)?0?9\d{2}[-\s]?\d{3}[-\s]?\d{3}\b/g, "[masked-phone]")
    .replace(/\b0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}\b/g, "[masked-phone]")
    .replace(/\b[A-Z][12]\d{8}\b/gi, "[masked-id]")
    .replace(/\b\d{4}[-\s]?\d{6}[-\s]?\d{5}\b/g, "[masked-card]")
    .replace(/\b\d{4}(?:[-\s]?\d{4}){2,3}\b/g, "[masked-card]")
    .replace(
      /(?:LINE|line|\u6211\u7684\s*(?:LINE|line)?\s*(?:ID|id)|(?:LINE|line)?\s*(?:ID|id)|\u52a0(?:\u6211|\u4f60))\s*(?:(?:\u5e33\u865f)|ID|id|\u662f|\u70ba|[:\uFF1A])*\s*[@#]?[A-Za-z][A-Za-z0-9._-]{3,}/g,
      "[masked-line-id]",
    );

  return sanitizeTextPreview(masked, maxLength);
}

export function summarizeWebhookPayload(rawBody: string): StoredPayloadSummary {
  try {
    const parsed = JSON.parse(rawBody) as { events?: Array<Record<string, unknown>> };
    const events = Array.isArray(parsed.events) ? parsed.events : [];

    return {
      eventCount: events.length,
      eventTypes: [...new Set(events.map((event) => String(event.type ?? "unknown")))],
      hasTextMessages: events.some((event) => {
        const message = event.message as Record<string, unknown> | undefined;
        return message?.type === "text";
      }),
      messageTypes: [
        ...new Set(
          events
            .map((event) => {
              const message = event.message as Record<string, unknown> | undefined;
              return String(message?.type ?? "none");
            }),
        ),
      ],
      sourceTypes: [
        ...new Set(
          events
            .map((event) => {
              const source = event.source as Record<string, unknown> | undefined;
              return String(source?.type ?? "unknown");
            }),
        ),
      ],
    };
  } catch {
    return {
      eventCount: 0,
      eventTypes: ["invalid_json"],
      hasTextMessages: false,
      messageTypes: [],
      sourceTypes: [],
    };
  }
}

export function sanitizeProcessedWebhookResult(result: ProcessedWebhookResult): SanitizedProcessedWebhookResult {
  return {
    bookingDraft: {
      branch: result.bookingDraft.branch,
      hasName: Boolean(result.bookingDraft.name),
      hasPhone: Boolean(result.bookingDraft.phone),
      isFirstVisit: result.bookingDraft.isFirstVisit,
      requestedTimeSlotCount: result.bookingDraft.requestedTimeSlots?.length ?? 0,
      timeSlotCount: result.bookingDraft.timeSlots.length,
      treatment: result.bookingDraft.treatment,
    },
    conversationStatus: result.conversationStatus,
    decision: {
      decisionType: result.decision.decisionType,
      matchedKey: result.decision.matchedKey,
      matchedType: result.decision.matchedType,
    },
    eventType: result.eventType,
    messageId: maskIdentifier(result.messageId, "msg"),
    replyPayloadSummary: result.replyPayload
      ? {
          messageCount: result.replyPayload.messages.length,
          types: result.replyPayload.messages.map((message) => message.type),
        }
      : null,
    sourceUserId: maskIdentifier(result.sourceUserId, "user"),
    usedAiHumanizer: result.usedAiHumanizer,
    usedAiReplyGenerator: result.usedAiReplyGenerator,
    webhookEventId: maskIdentifier(result.webhookEventId, "evt"),
  };
}

export function sanitizeReplySendResult(result: ReplySendResult): SanitizedReplySendResult {
  return {
    attempts: result.attempts,
    hasError: Boolean(result.errorMessage),
    messageId: maskIdentifier(result.messageId, "msg"),
    ok: result.ok,
    status: result.status,
    webhookEventId: maskIdentifier(result.webhookEventId, "evt"),
  };
}

export function sanitizeWebhookAuditEntry(input: {
  duplicateEventIds?: string[];
  eventCount: number;
  googleSheetsSync?: unknown;
  loggedAt: string;
  rawBody: string;
  replyResults: ReplySendResult[];
  requestError?: string;
  results: ProcessedWebhookResult[];
  sendReply: boolean;
  signatureVerified: boolean | "skipped";
}): SanitizedWebhookAuditEntry {
  return {
    duplicateEventIds: input.duplicateEventIds?.map((value) => maskIdentifier(value, "dup")),
    eventCount: input.eventCount,
    googleSheetsSync: input.googleSheetsSync,
    loggedAt: input.loggedAt,
    payloadSummary: summarizeWebhookPayload(input.rawBody),
    replyResults: input.replyResults.map(sanitizeReplySendResult),
    hasRequestError: Boolean(input.requestError),
    results: input.results.map(sanitizeProcessedWebhookResult),
    sendReply: input.sendReply,
    signatureVerified: input.signatureVerified,
  };
}

export function sanitizeDeadLetterEntry(input: {
  attemptedAt: string;
  attempts: number;
  decisionType: string;
  errorMessage?: string;
  matchedKey: string;
  messageId: string;
  responseBody: string;
  status: number;
  webhookEventId: string;
}): SanitizedDeadLetterEntry {
  return {
    attemptedAt: input.attemptedAt,
    attempts: input.attempts,
    decisionType: input.decisionType,
    errorMessage: input.errorMessage ? sanitizeTextPreview(input.errorMessage) : undefined,
    matchedKey: input.matchedKey,
    messageId: maskIdentifier(input.messageId, "msg"),
    responsePreview: sanitizeTextPreview(input.responseBody),
    status: input.status,
    webhookEventId: maskIdentifier(input.webhookEventId, "evt"),
  };
}

export function sanitizeLegacyWebhookAuditEntry(entry: Record<string, unknown>) {
  const rawBody = typeof entry.rawBody === "string" ? entry.rawBody : JSON.stringify(entry.rawBody ?? {});
  const replyResults = Array.isArray(entry.replyResults) ? (entry.replyResults as ReplySendResult[]) : [];
  const results = Array.isArray(entry.results) ? (entry.results as ProcessedWebhookResult[]) : [];

  return sanitizeWebhookAuditEntry({
    duplicateEventIds: Array.isArray(entry.duplicateEventIds) ? (entry.duplicateEventIds as string[]) : [],
    eventCount: typeof entry.eventCount === "number" ? entry.eventCount : results.length,
    googleSheetsSync: entry.googleSheetsSync,
    loggedAt: typeof entry.loggedAt === "string" ? entry.loggedAt : new Date(0).toISOString(),
    rawBody,
    replyResults,
    requestError: typeof entry.requestError === "string" ? entry.requestError : undefined,
    results,
    sendReply: Boolean(entry.sendReply),
    signatureVerified:
      entry.signatureVerified === true || entry.signatureVerified === false || entry.signatureVerified === "skipped"
        ? entry.signatureVerified
        : false,
  });
}
