import {
  BATCH_SIZE,
  buildRetentionCutoffIso,
  buildRetentionSweepAuditPayload,
  isBookingLeadEligible,
  resolveRetentionSweepMode,
  runRetentionSweep,
  type RetentionSweepClient,
  type RetentionSweepTables,
} from "../src/lib/retention-sweep";

type FakeRow = Record<string, unknown>;

type CheckResult = {
  name: string;
  passed: boolean;
};

const results: CheckResult[] = [];

function check(name: string, passed: boolean) {
  results.push({ name, passed });
}

function createFakeSupabase(tables: Record<string, FakeRow[]>): RetentionSweepClient {
  return {
    from(table: string) {
      const rows = tables[table] ?? (tables[table] = []);
      return {
        select(_columns: string) {
          const filters: Array<(row: FakeRow) => boolean> = [];
          let order: { ascending: boolean; column: string } | null = null;
          const builder = {
            eq(column: string, value: unknown) {
              filters.push((row) => row[column] === value);
              return builder;
            },
            lt(column: string, value: unknown) {
              filters.push((row) => (row[column] as string) < (value as string));
              return builder;
            },
            limit(count: number) {
              return execute(undefined, count);
            },
            not(column: string, operator: string, value: unknown) {
              if (operator === "is" && value === null) {
                filters.push((row) => row[column] !== null && row[column] !== undefined);
              }
              return builder;
            },
            order(column: string, options: { ascending: boolean }) {
              order = { ascending: options.ascending, column };
              return builder;
            },
            range(from: number, to: number) {
              return execute([from, to]);
            },
          };

          function execute(range?: [number, number], limit?: number) {
            let matched = rows.filter((row) => filters.every((filterFn) => filterFn(row)));
            if (order) {
              const { ascending, column } = order;
              matched = [...matched].sort((a, b) => {
                const left = a[column] as string;
                const right = b[column] as string;
                if (left < right) return ascending ? -1 : 1;
                if (left > right) return ascending ? 1 : -1;
                return 0;
              });
            }
            if (range) {
              matched = matched.slice(range[0], range[1] + 1);
            } else if (typeof limit === "number") {
              matched = matched.slice(0, limit);
            }
            return Promise.resolve({ data: matched.map((row) => ({ ...row })), error: null });
          }

          return builder;
        },
        update(patch: FakeRow, _options?: { count: string }) {
          const filters: Array<(row: FakeRow) => boolean> = [];
          const builder = {
            eq(column: string, value: unknown) {
              filters.push((row) => row[column] === value);
              return builder;
            },
            in(column: string, ids: unknown[]) {
              filters.push((row) => ids.includes(row[column]));
              const matched = rows.filter((row) => filters.every((filterFn) => filterFn(row)));
              matched.forEach((row) => Object.assign(row, patch));
              return Promise.resolve({ count: matched.length, error: null });
            },
          };
          return builder;
        },
        delete(_options?: { count: string }) {
          const filters: Array<(row: FakeRow) => boolean> = [];
          const builder = {
            eq(column: string, value: unknown) {
              filters.push((row) => row[column] === value);
              return builder;
            },
            in(column: string, values: unknown[]) {
              filters.push((row) => values.includes(row[column]));
              const matchedIds = new Set(rows.filter((row) => filters.every((filterFn) => filterFn(row))).map((row) => row.id));
              const remaining = rows.filter((row) => !matchedIds.has(row.id));
              rows.length = 0;
              rows.push(...remaining);
              return Promise.resolve({ count: matchedIds.size, error: null });
            },
          };
          return builder;
        },
        insert(row: FakeRow) {
          rows.push({ ...row });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

const FIXED_NOW = new Date("2026-07-14T00:00:00.000Z");

function buildOldRows() {
  const cutoff = buildRetentionCutoffIso(FIXED_NOW, 180);
  const justInsideRetention = new Date(new Date(cutoff).getTime() + 24 * 60 * 60 * 1000).toISOString();
  const justPastRetention = new Date(new Date(cutoff).getTime() - 24 * 60 * 60 * 1000).toISOString();
  return { cutoff, justInsideRetention, justPastRetention };
}

async function checkBoundaryLogic() {
  const { cutoff, justInsideRetention, justPastRetention } = buildOldRows();
  check("180-day cutoff keeps a message one day inside the window", justInsideRetention >= cutoff);
  check("180-day cutoff sweeps a message one day past the window", justPastRetention < cutoff);
}

async function checkDefaultModeNeverDeletes() {
  const { justPastRetention } = buildOldRows();
  const tables: Record<string, FakeRow[]> = {
    audit_logs: [],
    booking_leads_db: [
      {
        booking_status: "won",
        created_at: justPastRetention,
        customer_name: "王小明",
        id: "lead-1",
        notes: "0912-345-678",
        phone: "0912-345-678",
        preferred_time_slots: ["monday-am"],
        tenant_id: "tenant_001",
        updated_at: justPastRetention,
      },
    ],
    conversation_messages: [{ content: "患者原話", created_at: justPastRetention, id: "msg-1", tenant_id: "tenant_001" }],
    conversation_runtime_state: [
      { is_soft_deleted: false, line_user_id: "U1", retention_expiry: justPastRetention, soft_deleted_at: null, tenant_id: "tenant_001" },
    ],
    conversations: [{ display_name: "張小姐", id: "conv-1", last_seen_at: justPastRetention, tenant_id: "tenant_001" }],
  };
  const fakeClient = createFakeSupabase(tables);

  const noEnvGateResult = await runRetentionSweep({ applyRequested: true, now: FIXED_NOW, supabaseClient: fakeClient, tenantId: "tenant_001" });
  check("apply requested without env gate stays dry_run", noEnvGateResult.mode === "dry_run");
  check("dry_run scans but does not apply conversation_messages", noEnvGateResult.tables.conversation_messages.scanned === 1 && noEnvGateResult.tables.conversation_messages.appliedCount === 0);
  check("dry_run scans but does not apply booking_leads_db", noEnvGateResult.tables.booking_leads_db.plannedCount === 1 && noEnvGateResult.tables.booking_leads_db.appliedCount === 0);
  check("dry_run scans but does not apply conversation_runtime_state", noEnvGateResult.tables.conversation_runtime_state.appliedCount === 0);
  check("dry_run scans but does not apply conversations display_name", noEnvGateResult.tables.conversations_display_name.appliedCount === 0);
  check("dry_run does not mutate conversation_messages content", tables.conversation_messages[0]?.content === "患者原話");
  check("dry_run does not mutate booking_leads_db customer_name", tables.booking_leads_db[0]?.customer_name === "王小明");
  check("dry_run does not soft-delete conversation_runtime_state", tables.conversation_runtime_state[0]?.is_soft_deleted === false);
  check("dry_run does not write audit_logs", tables.audit_logs.length === 0);

  const noCallerFlagResult = await runRetentionSweep({ now: FIXED_NOW, supabaseClient: fakeClient, tenantId: "tenant_001" });
  check("no applyRequested flag stays dry_run by default", noCallerFlagResult.mode === "dry_run" && noCallerFlagResult.tables.conversation_messages.appliedCount === 0);
}

async function checkApplyModeWhenBothGatesSet() {
  const { justPastRetention } = buildOldRows();
  const tables: Record<string, FakeRow[]> = {
    audit_logs: [],
    booking_leads_db: [
      { booking_status: "won", created_at: justPastRetention, customer_name: "陳先生", id: "lead-1", notes: "n", phone: "p", preferred_time_slots: ["a"], tenant_id: "tenant_001", updated_at: justPastRetention },
    ],
    conversation_messages: [{ content: "hi", created_at: justPastRetention, id: "msg-1", tenant_id: "tenant_001" }],
    conversation_runtime_state: [
      { is_soft_deleted: false, line_user_id: "U1", retention_expiry: justPastRetention, soft_deleted_at: null, tenant_id: "tenant_001" },
    ],
    conversations: [{ display_name: "name", id: "conv-1", last_seen_at: justPastRetention, tenant_id: "tenant_001" }],
  };
  const fakeClient = createFakeSupabase(tables);

  const previousEnv = process.env.RETENTION_SWEEP_MODE;
  process.env.RETENTION_SWEEP_MODE = "apply";
  try {
    const result = await runRetentionSweep({ applyRequested: true, now: FIXED_NOW, supabaseClient: fakeClient, tenantId: "tenant_001" });
    check("both gates set results in apply mode", result.mode === "apply");
    check("apply mode deletes conversation_messages", result.tables.conversation_messages.appliedCount === 1 && tables.conversation_messages.length === 0);
    check("apply mode anonymizes conversations.display_name", result.tables.conversations_display_name.appliedCount === 1 && tables.conversations[0]?.display_name === null);
    check("apply mode anonymizes booking_leads_db PII", result.tables.booking_leads_db.appliedCount === 1 && tables.booking_leads_db[0]?.customer_name === null && tables.booking_leads_db[0]?.booking_status === "won");
    check("apply mode soft-deletes conversation_runtime_state", result.tables.conversation_runtime_state.appliedCount === 1 && tables.conversation_runtime_state[0]?.is_soft_deleted === true);
    check("apply mode writes exactly one audit_logs row", tables.audit_logs.length === 1);
  } finally {
    if (previousEnv === undefined) {
      delete process.env.RETENTION_SWEEP_MODE;
    } else {
      process.env.RETENTION_SWEEP_MODE = previousEnv;
    }
  }
}

async function checkTenantIsolation() {
  const { justPastRetention } = buildOldRows();
  const tables: Record<string, FakeRow[]> = {
    audit_logs: [],
    booking_leads_db: [],
    conversation_messages: [
      { content: "tenant 001 message", created_at: justPastRetention, id: "msg-t1", tenant_id: "tenant_001" },
      { content: "tenant 002 message", created_at: justPastRetention, id: "msg-t2", tenant_id: "tenant_002" },
    ],
    conversation_runtime_state: [],
    conversations: [],
  };
  const fakeClient = createFakeSupabase(tables);

  const tenant001Result = await runRetentionSweep({ now: FIXED_NOW, supabaseClient: fakeClient, tenantId: "tenant_001" });
  check("tenant_001 sweep only scans its own conversation_messages", tenant001Result.tables.conversation_messages.scanned === 1);

  const tenant002Result = await runRetentionSweep({ now: FIXED_NOW, supabaseClient: fakeClient, tenantId: "tenant_002" });
  check("tenant_002 sweep only scans its own conversation_messages", tenant002Result.tables.conversation_messages.scanned === 1);
  check("tenant isolation leaves both rows untouched in dry_run", tables.conversation_messages.length === 2);
}

async function checkBatchCap() {
  check("batch size is capped at 1000", BATCH_SIZE === 1000);
}

async function checkBookingLeadEligibility() {
  check(
    "terminal booking_status is eligible",
    isBookingLeadEligible({ booking_status: "won", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-06-01T00:00:00.000Z" }),
  );
  check(
    "never-updated lead is eligible",
    isBookingLeadEligible({ booking_status: "new", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" }),
  );
  check(
    "active non-terminal updated lead is not eligible",
    !isBookingLeadEligible({ booking_status: "contacted", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-06-01T00:00:00.000Z" }),
  );
}

async function checkAuditPayloadExcludesPii() {
  const piiBearingTables: RetentionSweepTables = {
    booking_leads_db: { appliedCount: 1, errorSummary: "王小明 0912-345-678 update failed", plannedCount: 1, scanned: 1 },
    conversation_messages: { appliedCount: 2, errorSummary: "LINE ID chen0912tw 患者原話 delete failed", plannedCount: 2, scanned: 2 },
    conversation_runtime_state: { appliedCount: 0, errorSummary: null, plannedCount: 0, scanned: 0 },
    conversations_display_name: { appliedCount: 1, errorSummary: null, plannedCount: 1, scanned: 1 },
  };
  const payload = buildRetentionSweepAuditPayload(piiBearingTables);
  const serialized = JSON.stringify(payload);
  const blockedValues = ["王小明", "0912-345-678", "chen0912tw", "患者原話", "errorSummary"];
  const retained = blockedValues.filter((value) => serialized.includes(value));
  check("audit payload excludes PII and raw error text", retained.length === 0);
  check(
    "audit payload only stores numeric counts",
    Object.values(payload).every(
      (entry) => typeof entry === "object" && entry !== null && Object.keys(entry).sort().join(",") === "appliedCount,plannedCount,scanned",
    ),
  );
}

async function checkModeResolutionGateLogic() {
  check("default dry_run when neither gate set", resolveRetentionSweepMode(false, "") === "dry_run");
  check("dry_run when only caller flag set", resolveRetentionSweepMode(true, "") === "dry_run");
  check("dry_run when only env gate set", resolveRetentionSweepMode(false, "apply") === "dry_run");
  check("apply only when both gates set", resolveRetentionSweepMode(true, "apply") === "apply");
}

async function main() {
  await checkModeResolutionGateLogic();
  await checkBoundaryLogic();
  await checkDefaultModeNeverDeletes();
  await checkApplyModeWhenBothGatesSet();
  await checkTenantIsolation();
  await checkBatchCap();
  await checkBookingLeadEligibility();
  await checkAuditPayloadExcludesPii();

  console.log(JSON.stringify(results, null, 2));

  if (results.some((result) => !result.passed)) {
    console.error("FAIL validate-retention-sweep");
    process.exitCode = 1;
  } else {
    console.log("PASS validate-retention-sweep: all checks passed");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
