import fs from "node:fs/promises";
import path from "node:path";

import { getRuntimeConfig } from "@/lib/live-demo-config";
import type { ProcessedWebhookResult } from "@/lib/line-webhook";

const DEDUPE_FILENAME = "processed-webhook-event-ids.jsonl";

function getDedupePath() {
  const { logDir } = getRuntimeConfig();
  return path.join(logDir, DEDUPE_FILENAME);
}

async function readProcessedEventIds() {
  try {
    const content = await fs.readFile(getDedupePath(), "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean);
    return new Set(lines);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return new Set<string>();
    }
    throw error;
  }
}

async function appendProcessedEventIds(eventIds: string[]) {
  if (eventIds.length === 0) {
    return;
  }

  const { logDir } = getRuntimeConfig();
  await fs.mkdir(logDir, { recursive: true });
  await fs.appendFile(getDedupePath(), `${eventIds.join("\n")}\n`, "utf8");
}

export function buildWebhookDedupeKey(result: Pick<ProcessedWebhookResult, "messageId" | "webhookEventId">) {
  const messageId = result.messageId.trim();
  if (messageId) {
    return `message:${messageId}`;
  }

  const webhookEventId = result.webhookEventId.trim();
  if (webhookEventId) {
    return `event:${webhookEventId}`;
  }

  return "";
}

export async function splitWebhookResultsByDuplicate(results: ProcessedWebhookResult[]) {
  const seenEventIds = await readProcessedEventIds();
  const acceptedResults: ProcessedWebhookResult[] = [];
  const duplicateEventIds: string[] = [];
  const acceptedEventIds: string[] = [];

  for (const result of results) {
    const eventId = buildWebhookDedupeKey(result);
    if (!eventId) {
      acceptedResults.push(result);
      continue;
    }

    if (seenEventIds.has(eventId)) {
      duplicateEventIds.push(eventId);
      continue;
    }

    seenEventIds.add(eventId);
    acceptedEventIds.push(eventId);
    acceptedResults.push(result);
  }

  await appendProcessedEventIds(acceptedEventIds);

  return {
    acceptedResults,
    duplicateEventIds,
  };
}
