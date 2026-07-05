import fs from "node:fs/promises";
import path from "node:path";

import { getRuntimeConfig } from "@/lib/live-demo-config";

type ReplyDeadLetterEntry = {
  attemptedAt: string;
  attempts: number;
  decisionType: string;
  errorMessage?: string;
  matchedKey: string;
  messageId: string;
  replyToken: string;
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
  await fs.appendFile(getDeadLetterPath(), `${JSON.stringify(entry)}\n`, "utf8");
}
