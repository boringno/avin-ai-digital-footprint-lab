import type { AdminStaffUser, StaffRole } from "@/lib/admin-auth";
import { writeAdminAuditLog } from "@/lib/admin-audit";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type ClientManagedRole = "agent" | "analyst" | "manager";

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
  role: StaffRole;
  tenant_id: string;
};

const clientManagedRoles: ClientManagedRole[] = ["manager", "agent", "analyst"];

export function canManageTeam(staff: AdminStaffUser) {
  return staff.role === "owner";
}

export function canViewTeam(staff: AdminStaffUser) {
  return staff.role === "owner" || staff.role === "manager" || staff.role === "maintainer";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function assertClientManagedRole(role: string): asserts role is ClientManagedRole {
  if (!clientManagedRoles.includes(role as ClientManagedRole)) {
    throw new Error("Only manager, agent, or analyst can be assigned from the client team page.");
  }
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
  if (!canViewTeam(staff)) {
    throw new Error("You do not have permission to view the team.");
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("staff_users")
    .select("id, tenant_id, auth_user_id, email, display_name, role, is_active, invited_at, last_invited_at, created_at")
    .eq("tenant_id", staff.tenantId)
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
  const now = new Date().toISOString();
  let authUserId = existingAuthUser?.id ?? "";
  let invitationSent = false;

  if (!existingAuthUser) {
    const config = getRuntimeConfig();
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { name: displayName },
      redirectTo: `${config.appBaseUrl.replace(/\/$/, "")}/admin/login`,
    });
    if (error || !data.user) {
      throw new Error(`Failed to send invitation: ${error?.message ?? "No user was created"}`);
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
        role: input.role,
        tenant_id: input.staff.tenantId,
      },
      { onConflict: "auth_user_id" },
    )
    .select("id, tenant_id, auth_user_id, email, display_name, role, is_active, invited_at, last_invited_at, created_at")
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
    .select("id, tenant_id, auth_user_id, email, display_name, role, is_active, invited_at, last_invited_at, created_at")
    .eq("id", input.memberId)
    .eq("tenant_id", input.staff.tenantId)
    .maybeSingle<StaffUserRow>();

  if (loadError || !before) {
    throw new Error("Team member was not found.");
  }
  if (before.id === input.staff.id) {
    throw new Error("You cannot change your own role or access from this page.");
  }
  if (before.role === "owner" || before.role === "maintainer") {
    throw new Error("Owner and maintainer accounts are managed outside the client team page.");
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
    .select("id, tenant_id, auth_user_id, email, display_name, role, is_active, invited_at, last_invited_at, created_at")
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
