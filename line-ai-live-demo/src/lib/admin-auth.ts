import { cookies } from "next/headers";

import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

export const ADMIN_ACCESS_COOKIE = "line_ai_admin_access";
export const ADMIN_REFRESH_COOKIE = "line_ai_admin_refresh";

export type StaffRole = "agent" | "analyst" | "maintainer" | "manager" | "owner";

export type AdminStaffUser = {
  authUserId: string;
  displayName: string;
  email: string;
  id: string;
  isActive: boolean;
  role: StaffRole;
  tenantId: string;
};

type StaffUserRow = {
  auth_user_id: string;
  display_name: string;
  id: string;
  is_active: boolean;
  role: StaffRole;
  tenant_id: string;
};

function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return "";
  }

  const prefix = `${name}=`;
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return match ? decodeURIComponent(match.slice(prefix.length)) : "";
}

async function findStaffByAuthUserId(authUserId: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("staff_users")
    .select("id, tenant_id, auth_user_id, display_name, role, is_active")
    .eq("auth_user_id", authUserId)
    .maybeSingle<StaffUserRow>();

  if (error) {
    throw new Error(`Failed to load staff user: ${error.message}`);
  }

  return data ?? null;
}

export async function getAdminStaffFromAccessToken(accessToken: string): Promise<AdminStaffUser | null> {
  if (!accessToken || !hasSupabaseServerConfig()) {
    return null;
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    return null;
  }

  const staff = await findStaffByAuthUserId(data.user.id);
  if (!staff || !staff.is_active) {
    return null;
  }

  return {
    authUserId: staff.auth_user_id,
    displayName: staff.display_name,
    email: data.user.email ?? "",
    id: staff.id,
    isActive: staff.is_active,
    role: staff.role,
    tenantId: staff.tenant_id,
  };
}

export async function getAdminStaffFromRequest(request: Request) {
  const accessToken = getCookieValue(request.headers.get("cookie"), ADMIN_ACCESS_COOKIE);
  return getAdminStaffFromAccessToken(accessToken);
}

export async function getAdminStaffFromCookies() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ADMIN_ACCESS_COOKIE)?.value ?? "";
  return getAdminStaffFromAccessToken(accessToken);
}

export async function requireAdminStaff(request: Request) {
  const staff = await getAdminStaffFromRequest(request);
  if (!staff) {
    return null;
  }

  return staff;
}

export function canAccessSystemAdmin(role: StaffRole) {
  return role === "owner" || role === "manager" || role === "maintainer";
}

// Keep role checks on the server so hiding a button never becomes the only control.
export function canUseWorkbench(role: StaffRole) {
  return role === "owner" || role === "manager" || role === "agent" || role === "maintainer";
}

export function canViewLeads(role: StaffRole) {
  return role === "owner" || role === "manager" || role === "agent" || role === "maintainer";
}

export function canEditLeads(role: StaffRole) {
  return role === "owner" || role === "manager" || role === "agent" || role === "maintainer";
}

export function canViewReports(role: StaffRole) {
  return role === "owner" || role === "manager" || role === "agent" || role === "analyst" || role === "maintainer";
}

export function canViewExecutiveSummary(role: StaffRole) {
  return role === "owner" || role === "manager" || role === "analyst" || role === "maintainer";
}

export function canViewOperationalDebug(role: StaffRole) {
  return role === "owner" || role === "maintainer";
}

export function canReviewFaqMiss(role: StaffRole) {
  return role === "owner" || role === "manager";
}
