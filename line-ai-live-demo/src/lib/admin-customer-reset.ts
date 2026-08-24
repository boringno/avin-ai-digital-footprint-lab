import type { AdminStaffUser } from "@/lib/admin-auth";
import { createEmptyConversationContext } from "@/lib/conversation-context";
import { createEmptyConversationState } from "@/lib/conversation-state";
import {
  loadConversationRuntimeState,
  type ConversationRuntimeStateRow,
  type FreshConversationRuntimePatch,
} from "@/lib/conversation-store";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

type ResettableRuntimeSnapshot = Pick<
  ConversationRuntimeStateRow,
  "context_json" | "state_json" | "updated_at"
>;

export type AdminCustomerResetSummary = {
  bookingLeadReset: boolean;
  conversationId: string;
  handoffTasksResolved: number;
  previousBookingStatus: null | string;
  previousLeadStage: string;
  previousLifecycleStatus: null | string;
  runtimeReset: true;
};

export class AdminCustomerResetError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409 | 500) {
    super(message);
    this.name = "AdminCustomerResetError";
  }
}

function nonNegativeInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

export function buildFreshCustomerRuntimePatch(input: {
  current: null | ResettableRuntimeSnapshot;
  nowIso: string;
  userId: string;
}): FreshConversationRuntimePatch {
  const state = createEmptyConversationState(input.userId);
  state.controlRevision = nonNegativeInteger(input.current?.state_json?.controlRevision) + 1;
  state.updatedAt = input.nowIso;

  const context = createEmptyConversationContext(input.userId);
  context.contextRevision = nonNegativeInteger(input.current?.context_json?.contextRevision) + 1;

  return {
    booking_draft_json: { requestedTimeSlots: [], timeSlots: [] },
    context_json: context as unknown as Record<string, unknown>,
    state_json: state as unknown as Record<string, unknown>,
  };
}

export function isResettableCanaryCustomer(userId: string, allowlistedUserIds: readonly string[]) {
  return Boolean(userId) && allowlistedUserIds.includes(userId);
}

export async function resetAdminCustomerToFreshState(
  staff: AdminStaffUser,
  userId: string,
  now = new Date(),
): Promise<AdminCustomerResetSummary> {
  if (!hasSupabaseServerConfig()) {
    throw new AdminCustomerResetError("Supabase server config is incomplete", 500);
  }

  if (!isResettableCanaryCustomer(userId, getRuntimeConfig().conversationV2CanaryUserIds)) {
    throw new AdminCustomerResetError("Only an allowlisted Conversation V2 test customer can be reset", 403);
  }

  const supabase = getSupabaseServerClient();
  const currentRuntime = await loadConversationRuntimeState(userId, staff.tenantId, "durable");
  const runtimePatch = buildFreshCustomerRuntimePatch({
    current: currentRuntime,
    nowIso: now.toISOString(),
    userId,
  });

  const { data, error } = await supabase.rpc("admin_reset_canary_customer_state", {
    p_actor_staff_id: staff.id,
    p_expected_runtime_updated_at: currentRuntime?.updated_at ?? null,
    p_fresh_booking_draft: runtimePatch.booking_draft_json,
    p_fresh_context: runtimePatch.context_json,
    p_fresh_state: runtimePatch.state_json,
    p_line_user_id: userId,
    p_reset_at: now.toISOString(),
    p_tenant_id: staff.tenantId,
  });
  if (error) {
    const status = error.code === "40001" ? 409 : error.code === "P0002" ? 404 : 500;
    throw new AdminCustomerResetError(`Failed to reset customer state: ${error.message}`, status);
  }
  if (!data || typeof data !== "object") {
    throw new AdminCustomerResetError("Customer reset did not return a summary", 500);
  }
  return data as AdminCustomerResetSummary;
}
