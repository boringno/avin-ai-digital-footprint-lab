import { redirect } from "next/navigation";

import { canReviewContent, canSubmitContentSource, canUseWorkbench, canViewContent, canViewReports, getAdminStaffFromCookies } from "@/lib/admin-auth";
import { loadAdminContentSubmissions } from "@/lib/admin-content-submissions-data";

import { ContentSubmissionsClient } from "./ContentSubmissionsClient";

export default async function ContentSubmissionsPage() {
  const staff = await getAdminStaffFromCookies();
  if (!staff) redirect("/admin/login");
  if (!canViewContent(staff.role)) redirect(canViewReports(staff.role) ? "/admin/reports" : "/admin/forbidden");

  return (
    <ContentSubmissionsClient
      canReview={canReviewContent(staff.role)}
      canSubmit={canSubmitContentSource(staff.role)}
      canUseWorkbench={canUseWorkbench(staff.role)}
      initialSubmissions={await loadAdminContentSubmissions(staff)}
    />
  );
}
