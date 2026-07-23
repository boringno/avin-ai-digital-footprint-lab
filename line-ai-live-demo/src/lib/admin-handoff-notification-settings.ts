import type { AdminStaffUser } from "@/lib/admin-auth";
import { canManageClinicHandoffNotifications, canManagePlatformHandoffNotifications } from "@/lib/admin-auth";
import { writeAdminAuditLog } from "@/lib/admin-audit";
import type { HandoffDigestBranch } from "@/lib/handoff-digest";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type NotificationRecipientScope = "clinic" | "platform";

export type HandoffNotificationRecipient = {
  branch: HandoffDigestBranch;
  email: string;
  id: string;
  scope: NotificationRecipientScope;
};

type RecipientRow = {
  branch: HandoffDigestBranch;
  id: string;
  recipient_email: string;
  recipient_scope: NotificationRecipientScope;
};

const branches: HandoffDigestBranch[] = ["高雄館", "台中館", "桃園館", "林口館"];
const maxClinicRecipientsPerBranch = 3;
const maxPlatformRecipientsPerBranch = 10;

export function getNotificationRecipientScope(staff: AdminStaffUser): NotificationRecipientScope {
  if (canManageClinicHandoffNotifications(staff.role)) return "clinic";
  if (canManagePlatformHandoffNotifications(staff.role)) return "platform";
  throw new Error("您沒有管理通知收件人的權限。");
}

export function getNotificationRecipientLimit(scope: NotificationRecipientScope) {
  return scope === "clinic" ? maxClinicRecipientsPerBranch : maxPlatformRecipientsPerBranch;
}

export async function loadHandoffNotificationRecipients(staff: AdminStaffUser) {
  const scope = getNotificationRecipientScope(staff);
  const { data, error } = await getSupabaseServerClient()
    .from("handoff_notification_recipients")
    .select("id, branch, recipient_scope, recipient_email")
    .eq("tenant_id", staff.tenantId)
    .eq("recipient_scope", scope)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .returns<RecipientRow[]>();
  if (error) throw new Error(`Failed to load notification recipients: ${error.message}`);

  return (data ?? []).map((row) => ({ branch: row.branch, email: row.recipient_email, id: row.id, scope: row.recipient_scope }));
}

export async function replaceHandoffNotificationRecipients(input: { branch: string; emails: string[]; staff: AdminStaffUser }) {
  const scope = getNotificationRecipientScope(input.staff);
  if (!branches.includes(input.branch as HandoffDigestBranch)) throw new Error("館別設定不正確。");

  const emails = normalizeEmails(input.emails);
  const limit = getNotificationRecipientLimit(scope);
  if (emails.length > limit) throw new Error(scope === "clinic" ? "每館最多可設定 3 個收件信箱。" : "工程測試每館最多可設定 10 個收件信箱。");

  const { error } = await getSupabaseServerClient().rpc("replace_handoff_notification_recipients", {
    p_branch: input.branch,
    p_emails: emails,
    p_scope: scope,
    p_tenant_id: input.staff.tenantId,
  });
  if (error) throw new Error(`Failed to save notification recipients: ${error.message}`);

  await writeAdminAuditLog({
    action: "handoff_notification_recipients_updated",
    after: { branch: input.branch, recipient_count: emails.length, scope },
    staff: input.staff,
    targetId: `${scope}:${input.branch}`,
    targetTable: "handoff_notification_recipients",
  });
  return loadHandoffNotificationRecipients(input.staff);
}

function normalizeEmails(values: string[]) {
  const emails = [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
  if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error("請確認所有收件信箱格式正確。");
  return emails;
}
