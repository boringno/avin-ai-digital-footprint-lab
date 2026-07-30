import { redirect } from "next/navigation";

import { canViewReports, getAdminStaffFromCookies } from "@/lib/admin-auth";

export default async function AdminIndexPage() {
  const staff = await getAdminStaffFromCookies();
  if (!staff) {
    redirect("/admin/login");
  }

  redirect(canViewReports(staff.role) && staff.role === "analyst" ? "/admin/reports" : "/admin/workbench");
}
