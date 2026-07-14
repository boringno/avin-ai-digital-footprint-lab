import { loadEnvConfig } from "@next/env";

import { storeRuleIntentLabel } from "../src/lib/intent-label-store";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "../src/lib/supabase-server";

loadEnvConfig(process.cwd());

type Cursor = { createdAt: string; id: string };
type MessageRow = {
  created_at: string;
  direction: string;
  id: string;
  payload_json: Record<string, unknown> | null;
  tenant_id: string;
};

const MAX_BATCH_SIZE = 1000;

function parseArguments(args: string[]) {
  const getValue = (name: string) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
  const requestedBatchSize = Number(getValue("--batch") ?? "500");
  const cursorValue = getValue("--cursor");
  const [createdAt, id] = cursorValue?.split("|") ?? [];

  return {
    batchSize: Number.isFinite(requestedBatchSize) ? Math.min(Math.max(1, requestedBatchSize), MAX_BATCH_SIZE) : 500,
    cursor: createdAt && id ? { createdAt, id } : null,
    dryRun: args.includes("--dry-run"),
    maxBatches: Math.max(1, Number(getValue("--max-batches") ?? "1") || 1),
  };
}

function getMetadata(row: MessageRow) {
  const payload = row.payload_json ?? {};
  return {
    decisionType: typeof payload.decision_type === "string" ? payload.decision_type : null,
    direction: row.direction,
    matchedKey: typeof payload.matched_key === "string" ? payload.matched_key : null,
    matchedType: typeof payload.matched_type === "string" ? payload.matched_type : null,
  };
}

async function loadBatch(cursor: Cursor | null, batchSize: number) {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("conversation_messages")
    .select("id, tenant_id, direction, payload_json, created_at")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(batchSize);

  if (cursor) {
    query = query.or(`created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`);
  }

  const { data, error } = await query.returns<MessageRow[]>();
  if (error) {
    throw new Error(`Failed to load conversation message batch: ${error.message}`);
  }

  return data ?? [];
}

async function main() {
  if (!hasSupabaseServerConfig()) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for backfill.");
  }

  const options = parseArguments(process.argv.slice(2));
  let cursor = options.cursor;
  let processed = 0;

  for (let batchNumber = 1; batchNumber <= options.maxBatches; batchNumber += 1) {
    const rows = await loadBatch(cursor, options.batchSize);
    if (rows.length === 0) {
      console.log("No additional conversation messages found.");
      break;
    }

    for (const row of rows) {
      if (!options.dryRun) {
        await storeRuleIntentLabel({ messageId: row.id, tenantId: row.tenant_id, ...getMetadata(row) });
      }
      processed += 1;
    }

    const last = rows.at(-1)!;
    cursor = { createdAt: last.created_at, id: last.id };
    console.log(`Processed ${processed} message(s). Resume with: --cursor=${cursor.createdAt}|${cursor.id}`);

    if (rows.length < options.batchSize) {
      break;
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
