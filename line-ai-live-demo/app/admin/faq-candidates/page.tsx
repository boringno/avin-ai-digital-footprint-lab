import { redirect } from "next/navigation";

import { canReviewFaqMiss, canUseWorkbench, canViewReports, getAdminStaffFromCookies } from "@/lib/admin-auth";
import { loadAdminFaqMissCandidates } from "@/lib/admin-faq-miss-data";

import { FaqCandidatesClient } from "./FaqCandidatesClient";

export default async function AdminFaqCandidatesPage() {
  const staff = await getAdminStaffFromCookies();
  if (!staff) {
    redirect("/admin/login");
  }
  if (!canReviewFaqMiss(staff.role)) {
    redirect(canViewReports(staff.role) ? "/admin/reports" : "/admin/forbidden");
  }

  const initialItems = await loadAdminFaqMissCandidates(staff);

  return (
    <FaqCandidatesClient
      canUseWorkbench={canUseWorkbench(staff.role)}
      initialItems={initialItems}
      showReportsLink={canViewReports(staff.role)}
      staffName={staff.displayName}
    />
  );
}
