import { cookies } from "next/headers";

import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

export const ADMIN_ACCESS_COOKIE = "line_ai_admin_access";
export const ADMIN_REFRESH_COOKIE = "line_ai_admin_refresh";

export type StaffRole = "agent" | "analyst" | "maintainer" | "manager" | "owner";

export const PLATFORM_DEVELOPER_ROLE = "maintainer" as const;

const SUPABASE_AUTH_USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function isPlatformDeveloperRole(role: StaffRole) {
  return role === PLATFORM_DEVELOPER_ROLE;
}

export function parsePlatformDeveloperAuthUserIds(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => SUPABASE_AUTH_USER_ID_PATTERN.test(item)),
  );
}

/**
 * Platform developer access requires both the protected database role and an
 * exact server-side Auth User ID allowlist entry. Missing configuration fails
 * closed, so changing only staff_users.role can never grant developer access.
 */
export function isStaffAuthenticationAllowed(input: {
  authUserId: string;
  platformDeveloperAuthUserIds?: string;
  role: StaffRole;
}) {
  if (!isPlatformDeveloperRole(input.role)) return true;
  return parsePlatformDeveloperAuthUserIds(input.platformDeveloperAuthUserIds)
    .has(input.authUserId.trim().toLowerCase());
}

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
  if (!isStaffAuthenticationAllowed({
    authUserId: staff.auth_user_id,
    platformDeveloperAuthUserIds: process.env.PLATFORM_DEVELOPER_AUTH_USER_IDS,
    role: staff.role,
  })) {
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

export function canManageClinicHandoffNotifications(role: StaffRole) {
  return role === "owner";
}

export function canManagePlatformHandoffNotifications(role: StaffRole) {
  return role === "maintainer";
}

export function canViewHandoffNotifications(role: StaffRole) {
  return canManageClinicHandoffNotifications(role) || canManagePlatformHandoffNotifications(role);
}

// Keep role checks on the server so hiding a button never becomes the only control.
export function canUseWorkbench(role: StaffRole) {
  return role === "owner" || role === "manager" || role === "agent" || role === "maintainer";
}

export function canViewLeads(role: StaffRole) {
  return role === "owner" || role === "manager" || role === "agent" || role === "maintainer";
}

export function canViewTeam(role: StaffRole) {
  return role === "owner" || role === "manager" || role === "maintainer";
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

// NLU disagreement review can join diagnostics back to customer messages.
// Analysts remain limited to de-identified aggregate reports.
export function canReviewNluDisagreements(role: StaffRole) {
  return role === "owner" || role === "maintainer";
}

// Engineering knowledge includes internal routing and source metadata. It is
// intentionally narrower than ordinary content management.
export function canViewEngineeringKnowledge(role: StaffRole) {
  return role === "owner" || role === "maintainer";
}

export function canReviewFaqMiss(role: StaffRole) {
  return role === "owner" || role === "manager" || isPlatformDeveloperRole(role);
}

export function canViewContent(role: StaffRole) {
  return role === "owner" || role === "manager" || role === "maintainer";
}

export function canEditContent(role: StaffRole) {
  return role === "owner" || role === "manager" || isPlatformDeveloperRole(role);
}

export function canCreateContentDraft(role: StaffRole) {
  return role === "owner" || role === "manager" || role === "maintainer";
}

export function canReviewContent(role: StaffRole) {
  return role === "maintainer";
}

// Publishing remains gated by review, but either the clinic owner or platform maintainer may release it.
export function canPublishContent(role: StaffRole) {
  return role === "owner" || role === "maintainer";
}

export function canSubmitContentSource(role: StaffRole) {
  return role === "owner" || role === "manager" || isPlatformDeveloperRole(role);
}

// Runtime releases alter live LINE answers. They remain separate from ordinary
// content drafting and require either the clinic owner or platform maintainer.
export function canManageRuntimeContentReleases(role: StaffRole) {
  return role === "owner" || role === "maintainer";
}
