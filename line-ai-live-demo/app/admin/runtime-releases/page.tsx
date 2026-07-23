import { redirect } from "next/navigation";

import { canManageRuntimeContentReleases, getAdminStaffFromCookies } from "@/lib/admin-auth";
import { loadRuntimeReleaseAdminData } from "@/lib/admin-runtime-release-data";

import { RuntimeReleasesClient } from "./RuntimeReleasesClient";

export default async function RuntimeReleasesPage() {
  const staff = await getAdminStaffFromCookies();
  if (!staff) redirect("/admin/login");
  if (!canManageRuntimeContentReleases(staff.role)) redirect("/admin/forbidden");

  const data = await loadRuntimeReleaseAdminData(staff);
  return <RuntimeReleasesClient initialCases={data.cases} initialReleases={data.releases} staffName={staff.displayName} />;
}
