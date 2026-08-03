import { canViewTeam, type AdminStaffUser, type StaffRole } from "@/lib/admin-auth";
import { writeAdminAuditLog } from "@/lib/admin-audit";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type ClientManagedRole = "agent" | "analyst" | "manager";
export type TeamAccessEmailMode = "invitation" | "password_reset";

export type TeamMember = {
  createdAt: string;
  displayName: string;
  email: string;
  id: string;
  invitedAt: string | null;
  isActive: boolean;
  lastInvitedAt: string | null;
  role: StaffRole;
};

type StaffUserRow = {
  auth_user_id: string;
  created_at: string;
  display_name: string;
  email: string | null;
  id: string;
  invited_at: string | null;
  is_active: boolean;
  last_invited_at: string | null;
  removed_at: string | null;
  role: StaffRole;
  tenant_id: string;
};

const clientManagedRoles: ClientManagedRole[] = ["manager", "agent", "analyst"];

export function canManageTeam(staff: AdminStaffUser) {
  return staff.role === "owner";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isSelfTeamInvitation(input: {
  actorAuthUserId: string;
  actorEmail: string;
  targetAuthUserId?: string;
  targetEmail: string;
}) {
  const matchesEmail = normalizeEmail(input.actorEmail) === normalizeEmail(input.targetEmail);
  const matchesAuthUser = Boolean(input.targetAuthUserId) && input.actorAuthUserId === input.targetAuthUserId;
  return matchesEmail || matchesAuthUser;
}

export function getTeamAccessEmailMode(emailConfirmedAt: string | null | undefined): TeamAccessEmailMode {
  return emailConfirmedAt ? "password_reset" : "invitation";
}

export function canRemoveTeamMember(input: { actorStaffId: string; targetRole: StaffRole; targetStaffId: string }) {
  return input.actorStaffId !== input.targetStaffId && input.targetRole !== "owner" && input.targetRole !== "maintainer";
}

function assertClientManagedRole(role: string): asserts role is ClientManagedRole {
  if (!clientManagedRoles.includes(role as ClientManagedRole)) {
    throw new Error("Only manager, agent, or analyst can be assigned from the client team page.");
  }
}

function getInvitationErrorMessage(error: { message?: string } | null) {
  const message = error?.message ?? "";
  if (/email address not authorized|smtp/i.test(message)) {
    return "系統尚未設定正式寄信服務，暫時無法寄送帳號邀請。";
  }
  if (/rate limit|too many/i.test(message)) {
    return "寄信次數暫時超過限制，請稍後再試。";
  }
  return "帳號邀請寄送失敗，請稍後再試或聯絡系統管理者。";
}

async function getAuthEmailById(authUserId: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.admin.getUserById(authUserId);
  if (error || !data.user) {
    return "";
  }

  return normalizeEmail(data.user.email ?? "");
}

async function findAuthUserByEmail(email: string) {
  const supabase = getSupabaseServerClient();
  let page = 1;

  while (page < 50) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) {
      throw new Error(`Failed to look up the account: ${error.message}`);
    }

    const user = data.users.find((candidate) => normalizeEmail(candidate.email ?? "") === email);
    if (user) {
      return user;
    }
    if (data.users.length < 100) {
      return null;
    }
    page += 1;
  }

  return null;
}

function toMember(row: StaffUserRow, fallbackEmail: string): TeamMember {
  return {
    createdAt: row.created_at,
    displayName: row.display_name,
    email: normalizeEmail(row.email ?? fallbackEmail),
    id: row.id,
    invitedAt: row.invited_at,
    isActive: row.is_active,
    lastInvitedAt: row.last_invited_at,
    role: row.role,
  };
}

export async function loadAdminTeam(staff: AdminStaffUser) {
  if (!canViewTeam(staff.role)) {
    throw new Error("You do not have permission to view the team.");
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("staff_users")
    .select("id, tenant_id, auth_user_id, email, display_name, role, is_active, invited_at, last_invited_at, removed_at, created_at")
    .eq("tenant_id", staff.tenantId)
    .is("removed_at", null)
    .order("created_at", { ascending: true })
    .returns<StaffUserRow[]>();

  if (error) {
    throw new Error(`Failed to load the team: ${error.message}`);
  }

  return Promise.all((data ?? []).map(async (row) => toMember(row, row.email ?? (await getAuthEmailById(row.auth_user_id)))));
}

export async function inviteAdminTeamMember(input: {
  displayName: string;
  email: string;
  role: string;
  staff: AdminStaffUser;
}) {
  if (!canManageTeam(input.staff)) {
    throw new Error("Only the clinic owner can invite team members.");
  }

  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim();
  if (!email || !email.includes("@") || !displayName) {
    throw new Error("A display name and valid email are required.");
  }
  assertClientManagedRole(input.role);

  const supabase = getSupabaseServerClient();
  const existingAuthUser = await findAuthUserByEmail(email);
  if (
    isSelfTeamInvitation({
      actorAuthUserId: input.staff.authUserId,
      actorEmail: input.staff.email,
      targetAuthUserId: existingAuthUser?.id,
      targetEmail: email,
    })
  ) {
    throw new Error("不可透過邀請流程變更自己的帳號或權限。");
  }

  const now = new Date().toISOString();
  let authUserId = existingAuthUser?.id ?? "";
  let invitationSent = false;

  if (!existingAuthUser || !existingAuthUser.email_confirmed_at) {
    const config = getRuntimeConfig();
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { name: displayName },
      redirectTo: `${config.appBaseUrl.replace(/\/$/, "")}/admin/activate`,
    });
    if (error || !data.user) {
      throw new Error(getInvitationErrorMessage(error));
    }
    authUserId = data.user.id;
    invitationSent = true;
  }

  const { data: existingStaff, error: existingStaffError } = await supabase
    .from("staff_users")
    .select("id, tenant_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle<{ id: string; tenant_id: string }>();
  if (existingStaffError) {
    throw new Error(`Failed to check existing team access: ${existingStaffError.message}`);
  }
  if (existingStaff && existingStaff.tenant_id !== input.staff.tenantId) {
    throw new Error("This account already belongs to a different clinic tenant.");
  }

  const { data, error } = await supabase
    .from("staff_users")
    .upsert(
      {
        auth_user_id: authUserId,
        display_name: displayName,
        email,
        invited_at: invitationSent ? now : undefined,
        is_active: true,
        last_invited_at: invitationSent ? now : undefined,
        removed_at: null,
        role: input.role,
        tenant_id: input.staff.tenantId,
      },
      { onConflict: "auth_user_id" },
    )
    .select("id, tenant_id, auth_user_id, email, display_name, role, is_active, invited_at, last_invited_at, removed_at, created_at")
    .single<StaffUserRow>();

  if (error || !data) {
    throw new Error(`Failed to grant team access: ${error?.message ?? "Unknown error"}`);
  }

  await writeAdminAuditLog({
    action: invitationSent ? "team_member_invited" : "team_member_access_granted",
    after: { display_name: data.display_name, is_active: data.is_active, role: data.role },
    staff: input.staff,
    targetId: data.id,
    targetTable: "staff_users",
  });

  return { invitationSent, member: toMember(data, email) };
}

export async function resendAdminTeamInvitation(input: { memberId: string; staff: AdminStaffUser }) {
  if (!canManageTeam(input.staff)) {
    throw new Error("Only the clinic owner can resend team invitations.");
  }

  const supabase = getSupabaseServerClient();
  const { data: member, error: memberError } = await supabase
    .from("staff_users")
    .select("id, tenant_id, auth_user_id, email, display_name, role, is_active, invited_at, last_invited_at, removed_at, created_at")
    .eq("id", input.memberId)
    .eq("tenant_id", input.staff.tenantId)
    .maybeSingle<StaffUserRow>();
  if (memberError || !member) {
    throw new Error("Team member was not found.");
  }
  if (member.removed_at || !member.is_active) {
    throw new Error("This account is disabled and cannot receive an invitation.");
  }

  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(member.auth_user_id);
  if (authError || !authData.user) {
    throw new Error("The account could not be found in authentication.");
  }
  const email = normalizeEmail(authData.user.email ?? member.email ?? "");
  if (!email) {
    throw new Error("This account does not have an email address.");
  }
  const config = getRuntimeConfig();
  const redirectTo = `${config.appBaseUrl.replace(/\/$/, "")}/admin/activate`;
  const mode = getTeamAccessEmailMode(authData.user.email_confirmed_at);

  if (mode === "invitation") {
    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { name: member.display_name },
      redirectTo,
    });
    if (inviteError) {
      throw new Error(getInvitationErrorMessage(inviteError));
    }
  } else {
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (resetError) {
      throw new Error(getInvitationErrorMessage(resetError));
    }
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("staff_users")
    .update({ last_invited_at: now })
    .eq("id", member.id)
    .eq("tenant_id", input.staff.tenantId);
  if (updateError) {
    throw new Error("The invitation was sent but its record could not be updated.");
  }

  await writeAdminAuditLog({
    action: mode === "invitation" ? "team_member_invitation_resent" : "team_member_password_reset_sent",
    after: { mode, role: member.role },
    staff: input.staff,
    targetId: member.id,
    targetTable: "staff_users",
  });
  return { mode };
}

export async function updateAdminTeamMember(input: {
  isActive?: boolean;
  memberId: string;
  role?: string;
  staff: AdminStaffUser;
}) {
  if (!canManageTeam(input.staff)) {
    throw new Error("Only the clinic owner can update team members.");
  }

  const supabase = getSupabaseServerClient();
  const { data: before, error: loadError } = await supabase
    .from("staff_users")
    .select("id, tenant_id, auth_user_id, email, display_name, role, is_active, invited_at, last_invited_at, removed_at, created_at")
    .eq("id", input.memberId)
    .eq("tenant_id", input.staff.tenantId)
    .maybeSingle<StaffUserRow>();

  if (loadError || !before) {
    throw new Error("Team member was not found.");
  }
  if (!canRemoveTeamMember({ actorStaffId: input.staff.id, targetRole: before.role, targetStaffId: before.id })) {
    throw new Error("Owner and maintainer accounts are managed outside the client team page.");
  }
  if (before.removed_at) {
    throw new Error("This team member has already been removed.");
  }

  const patch: { is_active?: boolean; role?: ClientManagedRole } = {};
  if (typeof input.isActive === "boolean") {
    patch.is_active = input.isActive;
  }
  if (input.role !== undefined) {
    assertClientManagedRole(input.role);
    patch.role = input.role;
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("No team member change was supplied.");
  }

  const { data, error } = await supabase
    .from("staff_users")
    .update(patch)
    .eq("id", before.id)
    .eq("tenant_id", input.staff.tenantId)
    .select("id, tenant_id, auth_user_id, email, display_name, role, is_active, invited_at, last_invited_at, removed_at, created_at")
    .single<StaffUserRow>();

  if (error || !data) {
    throw new Error(`Failed to update team member: ${error?.message ?? "Unknown error"}`);
  }

  await writeAdminAuditLog({
    action: "team_member_updated",
    after: { is_active: data.is_active, role: data.role },
    before: { is_active: before.is_active, role: before.role },
    staff: input.staff,
    targetId: data.id,
    targetTable: "staff_users",
  });

  return toMember(data, await getAuthEmailById(data.auth_user_id));
}

export async function removeAdminTeamMember(input: { memberId: string; staff: AdminStaffUser }) {
  if (!canManageTeam(input.staff)) {
    throw new Error("Only the clinic owner can remove team members.");
  }

  const supabase = getSupabaseServerClient();
  const { data: before, error: loadError } = await supabase
    .from("staff_users")
    .select("id, tenant_id, auth_user_id, email, display_name, role, is_active, invited_at, last_invited_at, removed_at, created_at")
    .eq("id", input.memberId)
    .eq("tenant_id", input.staff.tenantId)
    .maybeSingle<StaffUserRow>();
  if (loadError || !before) {
    throw new Error("Team member was not found.");
  }
  if (!canRemoveTeamMember({ actorStaffId: input.staff.id, targetRole: before.role, targetStaffId: before.id })) {
    throw new Error("You cannot remove your own, owner, or maintainer account from this page.");
  }
  if (before.removed_at) {
    throw new Error("This team member has already been removed.");
  }

  const { error: updateError } = await supabase
    .from("staff_users")
    .update({ is_active: false, removed_at: new Date().toISOString() })
    .eq("id", before.id)
    .eq("tenant_id", input.staff.tenantId);
  if (updateError) {
    throw new Error(`Failed to remove team member: ${updateError.message}`);
  }

  await writeAdminAuditLog({
    action: "team_member_removed",
    after: { is_active: false, role: before.role },
    before: { is_active: before.is_active, role: before.role },
    staff: input.staff,
    targetId: before.id,
    targetTable: "staff_users",
  });
}
