import { getLatencyCriticalSupabaseServerClient, getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";
import { reportOperationalError } from "@/lib/monitoring";

const TABLE_NAME = "conversation_runtime_state";
const RETENTION_DAYS = 180;
export const DEFAULT_TENANT_ID = "tenant_001";
export type ConversationStoreMode = "durable" | "latency_critical";

function getConversationStoreClient(mode: ConversationStoreMode) {
  return mode === "durable"
    ? getSupabaseServerClient()
    : getLatencyCriticalSupabaseServerClient();
}

export type ConversationRuntimeStateRow = {
  booking_draft_json: null | Record<string, unknown>;
  context_json: null | Record<string, unknown>;
  created_at: string;
  is_soft_deleted: boolean;
  line_user_id: string;
  retention_expiry: string;
  soft_deleted_at: null | string;
  state_json: null | Record<string, unknown>;
  tenant_id: string;
  updated_at: string;
};

export type FreshConversationRuntimePatch = {
  booking_draft_json: Record<string, unknown>;
  context_json: Record<string, unknown>;
  state_json: Record<string, unknown>;
};

type ConversationRuntimeStatePatch = Partial<
  Pick<ConversationRuntimeStateRow, "booking_draft_json" | "context_json" | "is_soft_deleted" | "retention_expiry" | "soft_deleted_at" | "state_json">
>;

type ConversationRuntimeStateUpsertRow = Pick<ConversationRuntimeStateRow, "line_user_id" | "retention_expiry" | "tenant_id">
  & Partial<Pick<ConversationRuntimeStateRow, "booking_draft_json" | "context_json" | "is_soft_deleted" | "soft_deleted_at" | "state_json">>;

function buildRetentionExpiryIso(now = new Date()) {
  const retentionExpiry = new Date(now);
  retentionExpiry.setDate(retentionExpiry.getDate() + RETENTION_DAYS);
  return retentionExpiry.toISOString();
}

export function buildTenantScopeFilters(userId: string, tenantId: string = DEFAULT_TENANT_ID) {
  return {
    line_user_id: userId,
    tenant_id: tenantId,
  };
}

export function buildInsertRow(
  userId: string,
  patch: ConversationRuntimeStatePatch,
  tenantId: string = DEFAULT_TENANT_ID,
): Omit<ConversationRuntimeStateRow, "updated_at"> {
  return {
    booking_draft_json: patch.booking_draft_json ?? {},
    context_json: patch.context_json ?? {},
    created_at: new Date().toISOString(),
    is_soft_deleted: patch.is_soft_deleted ?? false,
    line_user_id: userId,
    retention_expiry: patch.retention_expiry ?? buildRetentionExpiryIso(),
    soft_deleted_at: patch.soft_deleted_at ?? null,
    state_json: patch.state_json ?? {},
    tenant_id: tenantId,
  };
}

export function buildConversationRuntimeStateUpsertRow(
  userId: string,
  patch: ConversationRuntimeStatePatch,
  tenantId: string = DEFAULT_TENANT_ID,
): ConversationRuntimeStateUpsertRow {
  const row: ConversationRuntimeStateUpsertRow = {
    line_user_id: userId,
    retention_expiry: patch.retention_expiry ?? buildRetentionExpiryIso(),
    tenant_id: tenantId,
  };

  if (Object.prototype.hasOwnProperty.call(patch, "booking_draft_json")) {
    row.booking_draft_json = patch.booking_draft_json ?? {};
  }
  if (Object.prototype.hasOwnProperty.call(patch, "context_json")) {
    row.context_json = patch.context_json ?? {};
  }
  if (Object.prototype.hasOwnProperty.call(patch, "is_soft_deleted")) {
    row.is_soft_deleted = patch.is_soft_deleted ?? false;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "soft_deleted_at")) {
    row.soft_deleted_at = patch.soft_deleted_at ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "state_json")) {
    row.state_json = patch.state_json ?? {};
  }

  return row;
}

export function isSupabaseConversationStoreEnabled() {
  return hasSupabaseServerConfig();
}

export async function loadConversationRuntimeState(
  userId: string,
  tenantId: string = DEFAULT_TENANT_ID,
  mode: ConversationStoreMode = "latency_critical",
) {
  if (!userId || !isSupabaseConversationStoreEnabled()) {
    return null;
  }

  const supabase = getConversationStoreClient(mode);
  const scopeFilters = buildTenantScopeFilters(userId, tenantId);
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("*")
    .eq("tenant_id", scopeFilters.tenant_id)
    .eq("line_user_id", scopeFilters.line_user_id)
    .eq("is_soft_deleted", false)
    .is("soft_deleted_at", null)
    .maybeSingle<ConversationRuntimeStateRow>()
    .retry(false);

  if (error) {
    const wrappedError = new Error(`Failed to load conversation runtime state: ${error.message}`);
    await reportOperationalError({
      alert: false,
      error: wrappedError,
      extra: {
        operation: "load_conversation_runtime_state",
      },
      source: "supabase_conversation_store",
    });
    throw wrappedError;
  }

  return data ?? null;
}

export async function saveConversationRuntimeState(
  userId: string,
  patch: ConversationRuntimeStatePatch,
  tenantId: string = DEFAULT_TENANT_ID,
) {
  if (!userId || !isSupabaseConversationStoreEnabled()) {
    return;
  }

  const supabase = getLatencyCriticalSupabaseServerClient();
  const { error } = await supabase
    .from(TABLE_NAME)
    .upsert(buildConversationRuntimeStateUpsertRow(userId, patch, tenantId), { onConflict: "line_user_id" })
    .retry(false);
  if (error) {
    const wrappedError = new Error(`Failed to upsert conversation runtime state: ${error.message}`);
    await reportOperationalError({
      alert: false,
      error: wrappedError,
      extra: {
        operation: "upsert_conversation_runtime_state",
      },
      source: "supabase_conversation_store",
    });
    throw wrappedError;
  }
}

/**
 * Atomically replace state_json only when the caller still owns the lifecycle
 * snapshot it loaded. This prevents a slower webhook from overwriting a staff
 * takeover/resume that happened while an LLM reply was being rendered.
 */
export async function saveConversationRuntimeStateIfCurrent(
  userId: string,
  stateJson: Record<string, unknown>,
  expectedUpdatedAt: string,
  expectedControlRevision: number,
  tenantId: string = DEFAULT_TENANT_ID,
  mode: ConversationStoreMode = "latency_critical",
) {
  if (!userId || !isSupabaseConversationStoreEnabled()) {
    return false;
  }

  const supabase = getConversationStoreClient(mode);
  const scopeFilters = buildTenantScopeFilters(userId, tenantId);
  const patch = {
    retention_expiry: buildRetentionExpiryIso(),
    state_json: stateJson,
  };
  const updateMatchingSnapshot = async (expected: string | null, expectedRevision: number | null) => {
    let query = supabase
      .from(TABLE_NAME)
      .update(patch)
      .eq("tenant_id", scopeFilters.tenant_id)
      .eq("line_user_id", scopeFilters.line_user_id)
      .eq("is_soft_deleted", false)
      .is("soft_deleted_at", null);

    query = expected === null
      ? query.is("state_json->>updatedAt", null)
      : query.eq("state_json->>updatedAt", expected);
    query = expectedRevision === null
      ? query.is("state_json->>controlRevision", null)
      : query.eq("state_json->>controlRevision", String(expectedRevision));

    const { data, error } = await query.select("line_user_id").retry(false);
    if (error) {
      throw new Error(`Failed to compare-and-swap conversation runtime state: ${error.message}`);
    }
    return Array.isArray(data) && data.length === 1;
  };

  if (await updateMatchingSnapshot(expectedUpdatedAt, expectedControlRevision)) {
    return true;
  }

  const { data: current, error: currentError } = await supabase
    .from(TABLE_NAME)
    .select("state_json")
    .eq("tenant_id", scopeFilters.tenant_id)
    .eq("line_user_id", scopeFilters.line_user_id)
    .eq("is_soft_deleted", false)
    .is("soft_deleted_at", null)
    .maybeSingle<Pick<ConversationRuntimeStateRow, "state_json">>()
    .retry(false);

  if (currentError) {
    throw new Error(`Failed to inspect conversation runtime state after compare-and-swap conflict: ${currentError.message}`);
  }

  if (current) {
    const currentUpdatedAt = typeof current.state_json?.updatedAt === "string"
      ? current.state_json.updatedAt
      : null;
    const rawRevision = current.state_json?.controlRevision;
    const currentControlRevision = Number.isSafeInteger(rawRevision) && Number(rawRevision) >= 0
      ? Number(rawRevision)
      : 0;
    if (
      (currentUpdatedAt !== null && currentUpdatedAt !== expectedUpdatedAt) ||
      currentControlRevision !== expectedControlRevision
    ) {
      return false;
    }

    // Older rows may predate one or both lifecycle version fields. Claim the
    // exact raw snapshot atomically; another writer can only win one claim.
    return updateMatchingSnapshot(
      currentUpdatedAt,
      Number.isSafeInteger(rawRevision) && Number(rawRevision) >= 0 ? Number(rawRevision) : null,
    );
  }

  const { error: insertError } = await supabase
    .from(TABLE_NAME)
    .insert(buildInsertRow(userId, { state_json: stateJson }, tenantId))
    .retry(false);
  if (!insertError) {
    return true;
  }
  if (insertError.code === "23505") {
    return false;
  }
  throw new Error(`Failed to insert conversation runtime state during compare-and-swap: ${insertError.message}`);
}

/**
 * Atomically replace the dialogue context while the caller still owns the
 * context revision it loaded. The revision lives inside JSONB so this works
 * with the existing schema and can protect concurrent LINE webhook turns.
 */
export async function saveConversationRuntimeContextIfCurrent(
  userId: string,
  contextJson: Record<string, unknown>,
  bookingDraftJson: Record<string, unknown>,
  expectedContextRevision: number,
  tenantId: string = DEFAULT_TENANT_ID,
) {
  if (!userId || !isSupabaseConversationStoreEnabled()) {
    return false;
  }

  const supabase = getLatencyCriticalSupabaseServerClient();
  const scopeFilters = buildTenantScopeFilters(userId, tenantId);
  const patch = {
    booking_draft_json: bookingDraftJson,
    context_json: contextJson,
    retention_expiry: buildRetentionExpiryIso(),
  };
  const updateMatchingRevision = async (expectedRevision: number | null) => {
    let query = supabase
      .from(TABLE_NAME)
      .update(patch)
      .eq("tenant_id", scopeFilters.tenant_id)
      .eq("line_user_id", scopeFilters.line_user_id)
      .eq("is_soft_deleted", false)
      .is("soft_deleted_at", null);

    query = expectedRevision === null
      ? query.is("context_json->>contextRevision", null)
      : query.eq("context_json->>contextRevision", String(expectedRevision));

    const { data, error } = await query.select("line_user_id").retry(false);
    if (error) {
      throw new Error(`Failed to compare-and-swap conversation context: ${error.message}`);
    }
    return Array.isArray(data) && data.length === 1;
  };

  if (await updateMatchingRevision(expectedContextRevision)) {
    return true;
  }

  const { data: current, error: currentError } = await supabase
    .from(TABLE_NAME)
    .select("context_json")
    .eq("tenant_id", scopeFilters.tenant_id)
    .eq("line_user_id", scopeFilters.line_user_id)
    .eq("is_soft_deleted", false)
    .is("soft_deleted_at", null)
    .maybeSingle<Pick<ConversationRuntimeStateRow, "context_json">>()
    .retry(false);

  if (currentError) {
    throw new Error(`Failed to inspect conversation context after compare-and-swap conflict: ${currentError.message}`);
  }

  if (current) {
    const rawRevision = current.context_json?.contextRevision;
    const currentContextRevision = Number.isSafeInteger(rawRevision) && Number(rawRevision) >= 0
      ? Number(rawRevision)
      : 0;
    if (currentContextRevision !== expectedContextRevision) {
      return false;
    }

    // A legacy context has no revision yet. Claim that exact null revision
    // atomically so only one concurrent writer can initialize it.
    return updateMatchingRevision(
      Number.isSafeInteger(rawRevision) && Number(rawRevision) >= 0 ? Number(rawRevision) : null,
    );
  }

  const { error: insertError } = await supabase
    .from(TABLE_NAME)
    .insert(buildInsertRow(userId, {
      booking_draft_json: bookingDraftJson,
      context_json: contextJson,
    }, tenantId))
    .retry(false);
  if (!insertError) {
    return true;
  }
  if (insertError.code === "23505") {
    return false;
  }
  throw new Error(`Failed to insert conversation context during compare-and-swap: ${insertError.message}`);
}
