import { redirect } from "next/navigation";

import { getAdminStaffFromCookies } from "@/lib/admin-auth";
import { canViewTeam, loadAdminTeam } from "@/lib/admin-team-data";

import { TeamClient } from "./TeamClient";

export default async function AdminTeamPage() {
  const staff = await getAdminStaffFromCookies();
  if (!staff) {
    redirect("/admin/login");
  }
  if (!canViewTeam(staff)) {
    redirect("/admin/forbidden");
  }

  const members = await loadAdminTeam(staff);
  return <TeamClient canManage={staff.role === "owner"} initialMembers={members} />;
}
