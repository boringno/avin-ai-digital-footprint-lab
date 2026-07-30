import type { AdminStaffUser } from "@/lib/admin-auth";
import { reportOperationalError } from "@/lib/monitoring";
import { hasSupabaseServerConfig, getSupabaseServerClient } from "@/lib/supabase-server";

type AdminAuditInput = {
  action: string;
  after?: Record<string, unknown> | null;
  before?: Record<string, unknown> | null;
  staff: AdminStaffUser;
  targetId: string;
  targetTable: string;
};

export async function writeAdminAuditLog(input: AdminAuditInput) {
  try {
    if (!hasSupabaseServerConfig()) {
      return;
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("audit_logs").insert({
      action: input.action,
      actor_staff_id: input.staff.id,
      after: input.after ?? null,
      before: input.before ?? null,
      target_id: input.targetId,
      target_table: input.targetTable,
      tenant_id: input.staff.tenantId,
    });

    if (error) {
      await reportAdminAuditFailure(input, new Error(`Failed to write admin audit log: ${error.message}`));
    }
  } catch (error) {
    try {
      await reportAdminAuditFailure(input, error);
    } catch {
      // Audit logging is best-effort; it must never turn an applied admin action into a 500.
    }
  }
}

async function reportAdminAuditFailure(input: AdminAuditInput, error: unknown) {
  await reportOperationalError({
    alert: false,
    error,
    extra: {
      action: input.action,
      target_id: input.targetId,
      target_table: input.targetTable,
    },
    source: "admin_audit_log",
  });
}
