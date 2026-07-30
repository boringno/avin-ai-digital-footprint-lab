import { getRuntimeConfig } from "@/lib/live-demo-config";
import { reportOperationalError } from "@/lib/monitoring";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

export const DEFAULT_TENANT_ID = "tenant_001";
export const RETENTION_DAYS = 180;
export const BATCH_SIZE = 1000;
export const MAX_BATCHES_PER_TABLE = 5;

const TERMINAL_BOOKING_STATUSES = new Set(["won", "lost", "arrived"]);

export type RetentionSweepMode = "apply" | "dry_run";

export type RetentionSweepTableResult = {
  appliedCount: number;
  errorSummary: string | null;
  plannedCount: number;
  scanned: number;
};

export type RetentionSweepTables = {
  booking_leads_db: RetentionSweepTableResult;
  conversation_messages: RetentionSweepTableResult;
  conversation_runtime_state: RetentionSweepTableResult;
  conversations_display_name: RetentionSweepTableResult;
};

export type RetentionSweepResult = {
  mode: RetentionSweepMode;
  tables: RetentionSweepTables;
  tenantId: string;
};

export type RetentionSweepClient = {
  from(table: string): any;
};

type BookingLeadRow = {
  booking_status: string;
  created_at: string;
  id: string;
  updated_at: string;
};

function emptyResult(): RetentionSweepTableResult {
  return { appliedCount: 0, errorSummary: null, plannedCount: 0, scanned: 0 };
}

export function resolveRetentionSweepMode(applyRequested: boolean, envMode: string = getRuntimeConfig().retentionSweepMode): RetentionSweepMode {
  return applyRequested && envMode === "apply" ? "apply" : "dry_run";
}

export function buildRetentionCutoffIso(now: Date = new Date(), retentionDays: number = RETENTION_DAYS) {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  return cutoff.toISOString();
}

export function isBookingLeadEligible(row: Pick<BookingLeadRow, "booking_status" | "created_at" | "updated_at">) {
  return TERMINAL_BOOKING_STATUSES.has(row.booking_status) || row.updated_at === row.created_at;
}

export function buildRetentionSweepAuditPayload(tables: RetentionSweepTables) {
  return Object.fromEntries(
    Object.entries(tables).map(([table, result]) => [
      table,
      { appliedCount: result.appliedCount, plannedCount: result.plannedCount, scanned: result.scanned },
    ]),
  );
}

export async function runRetentionSweep(
  input: {
    applyRequested?: boolean;
    now?: Date;
    supabaseClient?: RetentionSweepClient;
    tenantId?: string;
  } = {},
): Promise<RetentionSweepResult> {
  const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
  const now = input.now ?? new Date();
  const mode = resolveRetentionSweepMode(Boolean(input.applyRequested));
  const cutoffIso = buildRetentionCutoffIso(now);

  const supabase = input.supabaseClient ?? (hasSupabaseServerConfig() ? getSupabaseServerClient() : null);
  if (!supabase) {
    const skipped = emptyResult();
    return {
      mode,
      tables: {
        booking_leads_db: skipped,
        conversation_messages: skipped,
        conversation_runtime_state: skipped,
        conversations_display_name: skipped,
      },
      tenantId,
    };
  }

  const tables: RetentionSweepTables = {
    conversation_messages: await sweepConversationMessages(supabase, tenantId, cutoffIso, mode),
    conversations_display_name: await sweepConversationsDisplayName(supabase, tenantId, cutoffIso, mode),
    booking_leads_db: await sweepBookingLeadsDb(supabase, tenantId, cutoffIso, mode),
    conversation_runtime_state: await sweepConversationRuntimeState(supabase, tenantId, now.toISOString(), mode),
  };

  if (mode === "apply") {
    await writeRetentionSweepAuditLog(supabase, tenantId, tables);
  }

  return { mode, tables, tenantId };
}

async function sweepConversationMessages(
  supabase: RetentionSweepClient,
  tenantId: string,
  cutoffIso: string,
  mode: RetentionSweepMode,
): Promise<RetentionSweepTableResult> {
  let scanned = 0;
  let planned = 0;
  let applied = 0;
  let offset = 0;

  try {
    for (let batch = 0; batch < MAX_BATCHES_PER_TABLE; batch += 1) {
      const baseQuery = () =>
        supabase
          .from("conversation_messages")
          .select("id")
          .eq("tenant_id", tenantId)
          .lt("created_at", cutoffIso)
          .order("created_at", { ascending: true });

      const { data, error } = mode === "apply" ? await baseQuery().limit(BATCH_SIZE) : await baseQuery().range(offset, offset + BATCH_SIZE - 1);
      if (error) {
        throw new Error(`Failed to scan conversation_messages: ${error.message}`);
      }

      const rows = (data ?? []) as Array<{ id: string }>;
      scanned += rows.length;
      planned += rows.length;

      if (rows.length === 0) {
        break;
      }

      if (mode === "apply") {
        const ids = rows.map((row) => row.id);
        const { error: deleteError, count } = await supabase
          .from("conversation_messages")
          .delete({ count: "exact" })
          .eq("tenant_id", tenantId)
          .in("id", ids);
        if (deleteError) {
          throw new Error(`Failed to delete conversation_messages: ${deleteError.message}`);
        }
        applied += count ?? ids.length;
      } else {
        offset += rows.length;
      }

      if (rows.length < BATCH_SIZE) {
        break;
      }
    }

    return { appliedCount: applied, errorSummary: null, plannedCount: planned, scanned };
  } catch (error) {
    await reportSweepStepError("conversation_messages", error, tenantId);
    return { appliedCount: applied, errorSummary: toErrorMessage(error), plannedCount: planned, scanned };
  }
}

async function sweepConversationsDisplayName(
  supabase: RetentionSweepClient,
  tenantId: string,
  cutoffIso: string,
  mode: RetentionSweepMode,
): Promise<RetentionSweepTableResult> {
  let scanned = 0;
  let planned = 0;
  let applied = 0;
  let offset = 0;

  try {
    for (let batch = 0; batch < MAX_BATCHES_PER_TABLE; batch += 1) {
      const baseQuery = () =>
        supabase
          .from("conversations")
          .select("id")
          .eq("tenant_id", tenantId)
          .lt("last_seen_at", cutoffIso)
          .not("display_name", "is", null)
          .order("last_seen_at", { ascending: true });

      const { data, error } = mode === "apply" ? await baseQuery().limit(BATCH_SIZE) : await baseQuery().range(offset, offset + BATCH_SIZE - 1);
      if (error) {
        throw new Error(`Failed to scan conversations: ${error.message}`);
      }

      const rows = (data ?? []) as Array<{ id: string }>;
      scanned += rows.length;
      planned += rows.length;

      if (rows.length === 0) {
        break;
      }

      if (mode === "apply") {
        const ids = rows.map((row) => row.id);
        const { error: updateError, count } = await supabase
          .from("conversations")
          .update({ display_name: null }, { count: "exact" })
          .eq("tenant_id", tenantId)
          .in("id", ids);
        if (updateError) {
          throw new Error(`Failed to anonymize conversations: ${updateError.message}`);
        }
        applied += count ?? ids.length;
      } else {
        offset += rows.length;
      }

      if (rows.length < BATCH_SIZE) {
        break;
      }
    }

    return { appliedCount: applied, errorSummary: null, plannedCount: planned, scanned };
  } catch (error) {
    await reportSweepStepError("conversations_display_name", error, tenantId);
    return { appliedCount: applied, errorSummary: toErrorMessage(error), plannedCount: planned, scanned };
  }
}

async function sweepBookingLeadsDb(
  supabase: RetentionSweepClient,
  tenantId: string,
  cutoffIso: string,
  mode: RetentionSweepMode,
): Promise<RetentionSweepTableResult> {
  let scanned = 0;
  let planned = 0;
  let applied = 0;
  let offset = 0;

  try {
    for (let batch = 0; batch < MAX_BATCHES_PER_TABLE; batch += 1) {
      const baseQuery = () =>
        supabase
          .from("booking_leads_db")
          .select("id, booking_status, updated_at, created_at")
          .eq("tenant_id", tenantId)
          .lt("updated_at", cutoffIso)
          .order("updated_at", { ascending: true });

      const { data, error } = mode === "apply" ? await baseQuery().limit(BATCH_SIZE) : await baseQuery().range(offset, offset + BATCH_SIZE - 1);
      if (error) {
        throw new Error(`Failed to scan booking_leads_db: ${error.message}`);
      }

      const rows = (data ?? []) as BookingLeadRow[];
      scanned += rows.length;

      if (rows.length === 0) {
        break;
      }

      const eligibleIds = rows.filter(isBookingLeadEligible).map((row) => row.id);
      planned += eligibleIds.length;

      if (mode === "apply" && eligibleIds.length > 0) {
        const { error: updateError, count } = await supabase
          .from("booking_leads_db")
          .update({ customer_name: null, notes: "", phone: null, preferred_time_slots: [] }, { count: "exact" })
          .eq("tenant_id", tenantId)
          .in("id", eligibleIds);
        if (updateError) {
          throw new Error(`Failed to anonymize booking_leads_db: ${updateError.message}`);
        }
        applied += count ?? eligibleIds.length;
      }

      if (mode === "apply" && eligibleIds.length === 0) {
        break;
      }

      if (mode !== "apply") {
        offset += rows.length;
      }

      if (rows.length < BATCH_SIZE) {
        break;
      }
    }

    return { appliedCount: applied, errorSummary: null, plannedCount: planned, scanned };
  } catch (error) {
    await reportSweepStepError("booking_leads_db", error, tenantId);
    return { appliedCount: applied, errorSummary: toErrorMessage(error), plannedCount: planned, scanned };
  }
}

async function sweepConversationRuntimeState(
  supabase: RetentionSweepClient,
  tenantId: string,
  nowIso: string,
  mode: RetentionSweepMode,
): Promise<RetentionSweepTableResult> {
  let scanned = 0;
  let planned = 0;
  let applied = 0;
  let offset = 0;

  try {
    for (let batch = 0; batch < MAX_BATCHES_PER_TABLE; batch += 1) {
      const baseQuery = () =>
        supabase
          .from("conversation_runtime_state")
          .select("line_user_id")
          .eq("tenant_id", tenantId)
          .eq("is_soft_deleted", false)
          .lt("retention_expiry", nowIso)
          .order("retention_expiry", { ascending: true });

      const { data, error } = mode === "apply" ? await baseQuery().limit(BATCH_SIZE) : await baseQuery().range(offset, offset + BATCH_SIZE - 1);
      if (error) {
        throw new Error(`Failed to scan conversation_runtime_state: ${error.message}`);
      }

      const rows = (data ?? []) as Array<{ line_user_id: string }>;
      scanned += rows.length;
      planned += rows.length;

      if (rows.length === 0) {
        break;
      }

      if (mode === "apply") {
        const userIds = rows.map((row) => row.line_user_id);
        const { error: updateError, count } = await supabase
          .from("conversation_runtime_state")
          .update({ is_soft_deleted: true, soft_deleted_at: nowIso }, { count: "exact" })
          .eq("tenant_id", tenantId)
          .in("line_user_id", userIds);
        if (updateError) {
          throw new Error(`Failed to soft-delete conversation_runtime_state: ${updateError.message}`);
        }
        applied += count ?? userIds.length;
      } else {
        offset += rows.length;
      }

      if (rows.length < BATCH_SIZE) {
        break;
      }
    }

    return { appliedCount: applied, errorSummary: null, plannedCount: planned, scanned };
  } catch (error) {
    await reportSweepStepError("conversation_runtime_state", error, tenantId);
    return { appliedCount: applied, errorSummary: toErrorMessage(error), plannedCount: planned, scanned };
  }
}

async function writeRetentionSweepAuditLog(supabase: RetentionSweepClient, tenantId: string, tables: RetentionSweepTables) {
  try {
    const { error } = await supabase.from("audit_logs").insert({
      action: "retention.sweep",
      actor_staff_id: null,
      after: buildRetentionSweepAuditPayload(tables),
      before: null,
      target_id: tenantId,
      target_table: "retention_sweep",
      tenant_id: tenantId,
    });
    if (error) {
      throw new Error(`Failed to write retention sweep audit log: ${error.message}`);
    }
  } catch (error) {
    await reportOperationalError({
      alert: false,
      error,
      extra: { action: "retention.sweep", tenant_id: tenantId },
      source: "retention_sweep_audit_log",
    });
  }
}

async function reportSweepStepError(step: string, error: unknown, tenantId: string) {
  await reportOperationalError({
    alert: true,
    error,
    extra: { step, tenant_id: tenantId },
    source: "retention_sweep",
  });
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown retention sweep error";
}
