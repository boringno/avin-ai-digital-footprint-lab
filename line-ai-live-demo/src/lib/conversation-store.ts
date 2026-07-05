import { hasSupabaseServerConfig, getSupabaseServerClient } from "@/lib/supabase-server";
import { reportOperationalError } from "@/lib/monitoring";

const TABLE_NAME = "conversation_runtime_state";
const RETENTION_DAYS = 180;

type ConversationRuntimeStateRow = {
  booking_draft_json: null | Record<string, unknown>;
  context_json: null | Record<string, unknown>;
  created_at: string;
  is_soft_deleted: boolean;
  line_user_id: string;
  retention_expiry: string;
  soft_deleted_at: null | string;
  state_json: null | Record<string, unknown>;
  updated_at: string;
};

type ConversationRuntimeStatePatch = Partial<
  Pick<ConversationRuntimeStateRow, "booking_draft_json" | "context_json" | "is_soft_deleted" | "retention_expiry" | "soft_deleted_at" | "state_json">
>;

function buildRetentionExpiryIso(now = new Date()) {
  const retentionExpiry = new Date(now);
  retentionExpiry.setDate(retentionExpiry.getDate() + RETENTION_DAYS);
  return retentionExpiry.toISOString();
}

function buildInsertRow(
  userId: string,
  patch: ConversationRuntimeStatePatch,
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
  };
}

export function isSupabaseConversationStoreEnabled() {
  return hasSupabaseServerConfig();
}

export async function loadConversationRuntimeState(userId: string) {
  if (!userId || !isSupabaseConversationStoreEnabled()) {
    return null;
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("*")
    .eq("line_user_id", userId)
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

export async function saveConversationRuntimeState(userId: string, patch: ConversationRuntimeStatePatch) {
  if (!userId || !isSupabaseConversationStoreEnabled()) {
    return;
  }

  const supabase = getSupabaseServerClient();
  const existing = await loadConversationRuntimeState(userId);
  const patchWithRetention: ConversationRuntimeStatePatch = {
    ...patch,
    retention_expiry: patch.retention_expiry ?? buildRetentionExpiryIso(),
  };

  if (!existing) {
    const insertRow = buildInsertRow(userId, patchWithRetention);
    const { error } = await supabase.from(TABLE_NAME).insert(insertRow);
    if (error) {
      const wrappedError = new Error(`Failed to insert conversation runtime state: ${error.message}`);
      await reportOperationalError({
        error: wrappedError,
        extra: {
          operation: "insert_conversation_runtime_state",
        },
        source: "supabase_conversation_store",
      });
      throw wrappedError;
    }
    return;
  }

  const { error } = await supabase.from(TABLE_NAME).update(patchWithRetention).eq("line_user_id", userId);
  if (error) {
    const wrappedError = new Error(`Failed to update conversation runtime state: ${error.message}`);
    await reportOperationalError({
      error: wrappedError,
      extra: {
        operation: "update_conversation_runtime_state",
      },
      source: "supabase_conversation_store",
    });
    throw wrappedError;
  }
}
