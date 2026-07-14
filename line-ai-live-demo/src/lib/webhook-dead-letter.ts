import fs from "node:fs/promises";
import path from "node:path";

import { getRuntimeConfig } from "@/lib/live-demo-config";
import { sanitizeDeadLetterEntry } from "@/lib/security-redaction";

type ReplyDeadLetterEntry = {
  attemptedAt: string;
  attempts: number;
  decisionType: string;
  errorMessage?: string;
  matchedKey: string;
  messageId: string;
  responseBody: string;
  status: number;
  webhookEventId: string;
};

const DEAD_LETTER_FILENAME = "line-reply-dead-letter.jsonl";

function getDeadLetterPath() {
  const { logDir } = getRuntimeConfig();
  return path.join(logDir, DEAD_LETTER_FILENAME);
}

export async function appendReplyDeadLetter(entry: ReplyDeadLetterEntry) {
  const { logDir } = getRuntimeConfig();
  await fs.mkdir(logDir, { recursive: true });
  const sanitizedEntry = sanitizeDeadLetterEntry(entry);
  await fs.appendFile(getDeadLetterPath(), `${JSON.stringify(sanitizedEntry)}\n`, "utf8");
}
