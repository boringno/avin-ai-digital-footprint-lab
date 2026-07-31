import type { AdminStaffUser } from "@/lib/admin-auth";
import { canManageClinicHandoffNotifications, canManagePlatformHandoffNotifications } from "@/lib/admin-auth";
import { writeAdminAuditLog } from "@/lib/admin-audit";
import { activeDigestBranches, type HandoffDigestBranch, type HandoffNotificationChannel } from "@/lib/handoff-digest";
import { isLineGroupId } from "@/lib/line-recipient-id";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type NotificationRecipientScope = "clinic" | "platform";

export type HandoffNotificationRecipient = {
  branch: HandoffDigestBranch;
  channel: HandoffNotificationChannel;
  id: string;
  isActive: boolean;
  scope: NotificationRecipientScope;
  target: string;
};

export type PendingLineGroupSource = {
  groupId: string;
  groupName: string | null;
  lastSeenAt: string;
};

type RecipientRow = {
  branch: HandoffDigestBranch;
  channel: HandoffNotificationChannel;
  id: string;
  is_active: boolean;
  recipient_scope: NotificationRecipientScope;
  target: string | null;
};

type PendingGroupRow = {
  group_id: string;
  group_name: string | null;
  last_seen_at: string;
};

type LineGroupSourceLookup = (tenantId: string, targets: string[]) => Promise<string[]>;

export function getNotificationRecipientScope(staff: AdminStaffUser): NotificationRecipientScope {
  if (canManageClinicHandoffNotifications(staff.role)) {
    return "clinic";
  }
  if (canManagePlatformHandoffNotifications(staff.role)) {
    return "platform";
  }
  throw new Error("Current role cannot manage handoff notification settings");
}

export function getNotificationRecipientLimit(scope: NotificationRecipientScope, channel: HandoffNotificationChannel) {
  if (channel === "line_group") {
    return 1;
  }
  return scope === "clinic" ? 3 : 10;
}

export function listNotificationBranches() {
  return activeDigestBranches();
}

export async function loadNotificationSettingsPageData(staff: AdminStaffUser) {
  return {
    pendingGroups: await loadPendingLineGroupSources(staff),
    recipients: await loadHandoffNotificationRecipients(staff),
  };
}

export async function loadHandoffNotificationRecipients(staff: AdminStaffUser) {
  const scope = getNotificationRecipientScope(staff);
  const supabase = getSupabaseServerClient();
  const rows: RecipientRow[] = [];

  for (const branch of listNotificationBranches()) {
    const { data, error } = await supabase
      .from("handoff_notification_recipients")
      .select("id, branch, channel, recipient_scope, target, is_active")
      .eq("tenant_id", staff.tenantId)
      .eq("branch", branch)
      .eq("recipient_scope", scope)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .returns<RecipientRow[]>();

    if (error) {
      throw new Error(`Failed to load notification recipients for ${branch}: ${error.message}`);
    }

    rows.push(...(data ?? []));
  }

  return rows
    .filter((row) => row.target)
    .map((row) => ({
      branch: row.branch,
      channel: row.channel,
      id: row.id,
      isActive: row.is_active,
      scope: row.recipient_scope,
      target: row.target ?? "",
    }));
}

export async function replaceHandoffNotificationRecipients(input: {
  branch: string;
  emails: string[];
  lineGroups: string[];
  staff: AdminStaffUser;
}) {
  const scope = getNotificationRecipientScope(input.staff);
  const branches = listNotificationBranches();
  if (!branches.includes(input.branch)) {
    throw new Error("Invalid branch");
  }

  const emailTargets = normalizeTargets("email", input.emails);
  const lineGroupTargets = normalizeTargets("line_group", input.lineGroups);
  validateTargets(scope, "email", emailTargets);
  validateTargets(scope, "line_group", lineGroupTargets);
  await assertKnownLineGroupTargets(input.staff.tenantId, lineGroupTargets);

  const supabase = getSupabaseServerClient();
  for (const [channel, targets] of [
    ["email", emailTargets],
    ["line_group", lineGroupTargets],
  ] as const) {
    const { error } = await supabase.rpc("replace_handoff_notification_recipients", {
      p_branch: input.branch,
      p_channel: channel,
      p_scope: scope,
      p_targets: targets,
      p_tenant_id: input.staff.tenantId,
    });

    if (error) {
      throw new Error(`Failed to save ${channel} recipients: ${error.message}`);
    }
  }

  await writeAdminAuditLog({
    action: "handoff_notification_recipients_updated",
    after: {
      branch: input.branch,
      email_targets: emailTargets,
      line_group_targets: lineGroupTargets,
      scope,
    },
    staff: input.staff,
    targetId: `${scope}:${input.branch}`,
    targetTable: "handoff_notification_recipients",
  });

  return loadHandoffNotificationRecipients(input.staff);
}

export async function loadPendingLineGroupSources(staff: AdminStaffUser) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("line_group_sources")
    .select("group_id, group_name, last_seen_at")
    .eq("tenant_id", staff.tenantId)
    .order("last_seen_at", { ascending: false })
    .returns<PendingGroupRow[]>();

  if (error) {
    throw new Error(`Failed to load LINE group sources: ${error.message}`);
  }

  const boundTargets = new Set<string>();
  for (const branch of listNotificationBranches()) {
    const { data: boundRows, error: boundError } = await supabase
      .from("handoff_notification_recipients")
      .select("target")
      .eq("tenant_id", staff.tenantId)
      .eq("branch", branch)
      .eq("channel", "line_group")
      .eq("is_active", true)
      .returns<Array<{ target: string | null }>>();

    if (boundError) {
      throw new Error(`Failed to load bound LINE groups for ${branch}: ${boundError.message}`);
    }

    for (const row of boundRows ?? []) {
      if (row.target?.trim()) {
        boundTargets.add(row.target.trim());
      }
    }
  }

  return (data ?? [])
    .filter((row) => !boundTargets.has(row.group_id))
    .map((row) => ({
      groupId: row.group_id,
      groupName: row.group_name,
      lastSeenAt: row.last_seen_at,
    }));
}

function normalizeTargets(channel: HandoffNotificationChannel, values: string[]) {
  return [...new Set(values.map((value) => normalizeTarget(channel, value)).filter(Boolean))];
}

function normalizeTarget(channel: HandoffNotificationChannel, value: string) {
  const trimmed = value.trim();
  return channel === "email" ? trimmed.toLowerCase() : trimmed;
}

export function validateTargets(scope: NotificationRecipientScope, channel: HandoffNotificationChannel, targets: string[]) {
  const limit = getNotificationRecipientLimit(scope, channel);
  if (targets.length > limit) {
    throw new Error(channel === "line_group" ? "每個館別目前只能綁定 1 個 LINE 群組" : `收件 Email 最多只能設定 ${limit} 組`);
  }

  if (channel === "email" && targets.some((target) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target))) {
    throw new Error("Email 格式不正確");
  }

  if (channel === "line_group" && targets.some((target) => !isLineGroupId(target))) {
    throw new Error("LINE 群組 ID 格式不正確");
  }
}

export async function assertKnownLineGroupTargets(
  tenantId: string,
  targets: string[],
  lookup: LineGroupSourceLookup = loadKnownLineGroupIds,
) {
  if (targets.length === 0) {
    return;
  }

  const knownTargets = new Set(await lookup(tenantId, targets));
  if (targets.some((target) => !knownTargets.has(target))) {
    throw new Error("LINE 群組尚未由本診所 webhook 偵測，請先在群組傳送訊息後再綁定");
  }
}

async function loadKnownLineGroupIds(tenantId: string, targets: string[]) {
  const { data, error } = await getSupabaseServerClient()
    .from("line_group_sources")
    .select("group_id")
    .eq("tenant_id", tenantId)
    .in("group_id", targets)
    .returns<Array<{ group_id: string }>>();

  if (error) {
    throw new Error(`Failed to verify LINE group sources: ${error.message}`);
  }

  return (data ?? []).map((row) => row.group_id);
}
