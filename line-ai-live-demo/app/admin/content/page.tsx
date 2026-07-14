import { redirect } from "next/navigation";

import { canEditContent, canReviewContent, canUseWorkbench, canViewContent, canViewReports, getAdminStaffFromCookies } from "@/lib/admin-auth";
import { loadAdminContent } from "@/lib/admin-content-data";

import { ContentClient } from "./ContentClient";

export default async function AdminContentPage() {
  const staff = await getAdminStaffFromCookies();
  if (!staff) redirect("/admin/login");
  if (!canViewContent(staff.role)) redirect(canViewReports(staff.role) ? "/admin/reports" : "/admin/forbidden");

  return (
    <ContentClient
      canEdit={canEditContent(staff.role)}
      canReview={canReviewContent(staff.role)}
      canUseWorkbench={canUseWorkbench(staff.role)}
      initialItems={await loadAdminContent(staff)}
      staffName={staff.displayName}
    />
  );
}
