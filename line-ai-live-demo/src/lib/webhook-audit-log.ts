import fs from "node:fs/promises";
import path from "node:path";

import type { GoogleSheetsSyncResult } from "@/lib/google-sheets-log";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import type { ProcessedWebhookResult, ReplySendResult } from "@/lib/line-webhook";
import {
  sanitizeLegacyWebhookAuditEntry,
  sanitizeWebhookAuditEntry,
  type SanitizedWebhookAuditEntry,
} from "@/lib/security-redaction";

type WebhookAuditEntryInput = {
  duplicateEventIds?: string[];
  eventCount: number;
  googleSheetsSync?: GoogleSheetsSyncResult;
  loggedAt: string;
  rawBody: string;
  replyResults: ReplySendResult[];
  requestError?: string;
  results: ProcessedWebhookResult[];
  sendReply: boolean;
  signatureVerified: boolean | "skipped";
};

const AUDIT_FILENAME = "webhook-audit.jsonl";

function getAuditPath() {
  const { logDir } = getRuntimeConfig();
  return path.join(logDir, AUDIT_FILENAME);
}

export async function appendWebhookAuditLog(entry: WebhookAuditEntryInput) {
  const { logDir } = getRuntimeConfig();
  await fs.mkdir(logDir, { recursive: true });
  const sanitizedEntry = sanitizeWebhookAuditEntry(entry);
  await fs.appendFile(getAuditPath(), `${JSON.stringify(sanitizedEntry)}\n`, "utf8");
}

export async function readRecentWebhookAudit(limit = 20) {
  try {
    const content = await fs.readFile(getAuditPath(), "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean);
    return lines
      .slice(-limit)
      .reverse()
      .map((line) => {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        if ("payloadSummary" in parsed) {
          return parsed as unknown as SanitizedWebhookAuditEntry;
        }
        return sanitizeLegacyWebhookAuditEntry(parsed);
      });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
