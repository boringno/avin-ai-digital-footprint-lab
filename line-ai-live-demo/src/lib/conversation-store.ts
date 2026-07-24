import { hasSupabaseServerConfig, getSupabaseServerClient } from "@/lib/supabase-server";
import { reportOperationalError } from "@/lib/monitoring";

const TABLE_NAME = "conversation_runtime_state";
const RETENTION_DAYS = 180;
export const DEFAULT_TENANT_ID = "tenant_001";

type ConversationRuntimeStateRow = {
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

export async function loadConversationRuntimeState(userId: string, tenantId: string = DEFAULT_TENANT_ID) {
  if (!userId || !isSupabaseConversationStoreEnabled()) {
    return null;
  }

  const supabase = getSupabaseServerClient();
  const scopeFilters = buildTenantScopeFilters(userId, tenantId);
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("*")
    .eq("tenant_id", scopeFilters.tenant_id)
    .eq("line_user_id", scopeFilters.line_user_id)
    .eq("is_soft_deleted", false)
    .is("soft_deleted_at", null)
    .maybeSingle<ConversationRuntimeStateRow>();

  if (error) {
    const wrappedError = new Error(`Failed to load conversation runtime state: ${error.message}`);
    await reportOperationalError({
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

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from(TABLE_NAME)
    .upsert(buildConversationRuntimeStateUpsertRow(userId, patch, tenantId), { onConflict: "line_user_id" });
  if (error) {
    const wrappedError = new Error(`Failed to upsert conversation runtime state: ${error.message}`);
    await reportOperationalError({
      error: wrappedError,
      extra: {
        operation: "upsert_conversation_runtime_state",
      },
      source: "supabase_conversation_store",
    });
    throw wrappedError;
  }
}
