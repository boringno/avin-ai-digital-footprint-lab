import { redirect } from "next/navigation";

import { canReviewFaqMiss, canUseWorkbench, canViewExecutiveSummary, canViewReports, getAdminStaffFromCookies } from "@/lib/admin-auth";
import { loadAdminReportsData } from "@/lib/admin-reports-data";

import { ReportsClient } from "./ReportsClient";

export default async function AdminReportsPage() {
  const staff = await getAdminStaffFromCookies();
  if (!staff) {
    redirect("/admin/login");
  }
  if (!canViewReports(staff.role)) {
    redirect("/admin/forbidden");
  }

  const initialData = await loadAdminReportsData(staff);
  return (
    <ReportsClient
      canViewExecutiveSummary={canViewExecutiveSummary(staff.role)}
      canReviewFaqMiss={canReviewFaqMiss(staff.role)}
      canUseWorkbench={canUseWorkbench(staff.role)}
      initialData={initialData}
      staff={staff}
    />
  );
}
