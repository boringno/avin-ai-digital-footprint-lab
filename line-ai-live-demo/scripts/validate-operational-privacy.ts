import { canViewExecutiveSummary, canViewOperationalDebug } from "../src/lib/admin-auth";
import { sanitizeWebhookAuditEntry } from "../src/lib/security-redaction";

const rawCustomerMessage = "王小明的電話是0912345678，術後很痛";
const rawReplyText = "您好王小明，請回覆電話0912345678";

const auditEntry = sanitizeWebhookAuditEntry({
  eventCount: 1,
  loggedAt: "2026-07-14T00:00:00.000Z",
  rawBody: JSON.stringify({ events: [{ message: { text: rawCustomerMessage, type: "text" }, type: "message" }] }),
  replyResults: [{
    attempts: 1,
    errorMessage: rawReplyText,
    messageId: "message-id",
    ok: false,
    responseBody: rawReplyText,
    status: 500,
    webhookEventId: "event-id",
  }] as never,
  results: [{
    bookingDraft: { phone: "0912345678", timeSlots: [] },
    conversationStatus: "ai_active",
    decision: { decisionType: "fallback_reply", matchedKey: "fallback", matchedType: "fallback", replyText: rawReplyText },
    eventType: "message",
    messageId: "message-id",
    messageText: rawCustomerMessage,
    replyPayload: { messages: [{ text: rawReplyText, type: "text" }] },
    sourceUserId: "U0123456789",
    usedAiHumanizer: false,
    usedAiReplyGenerator: false,
    webhookEventId: "event-id",
  }] as never,
  sendReply: true,
  signatureVerified: true,
});

const serializedAudit = JSON.stringify(auditEntry);
const passed = !serializedAudit.includes(rawCustomerMessage)
  && !serializedAudit.includes(rawReplyText)
  && !("messagePreview" in auditEntry.results[0])
  && !("replyPreview" in auditEntry.results[0].decision)
  && !canViewOperationalDebug("agent")
  && !canViewOperationalDebug("manager")
  && canViewOperationalDebug("owner")
  && !canViewExecutiveSummary("agent")
  && canViewExecutiveSummary("manager");

if (!passed) {
  console.error("FAIL operational privacy validation");
  process.exitCode = 1;
} else {
  console.log("PASS operational privacy validation");
}
