import { redirect } from "next/navigation";

import { canEditContent, canUseWorkbench, canViewContent, canViewReports, getAdminStaffFromCookies } from "@/lib/admin-auth";
import { loadAdminScheduleMonths } from "@/lib/admin-schedule-data";

import { SchedulesClient } from "./SchedulesClient";

export default async function AdminSchedulesPage() {
  const staff = await getAdminStaffFromCookies();
  if (!staff) redirect("/admin/login");
  if (!canViewContent(staff.role)) redirect(canViewReports(staff.role) ? "/admin/reports" : "/admin/forbidden");

  return <SchedulesClient canEdit={canEditContent(staff.role)} canUseWorkbench={canUseWorkbench(staff.role)} initialMonths={await loadAdminScheduleMonths(staff)} />;
}
