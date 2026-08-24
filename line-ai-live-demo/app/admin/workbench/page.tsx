import { redirect } from "next/navigation";

import { canAccessSystemAdmin, canUseWorkbench, getAdminStaffFromCookies } from "@/lib/admin-auth";
import { loadWorkbenchData } from "@/lib/admin-workbench-data";

import { AdminPageHeader } from "../_components/AdminPageHeader";

import { WorkbenchClient } from "./WorkbenchClient";

export default async function AdminWorkbenchPage() {
  const staff = await getAdminStaffFromCookies();
  if (!staff) {
    redirect("/admin/login");
  }
  if (!canUseWorkbench(staff.role)) {
    redirect("/admin/reports");
  }

  const initialData = await loadWorkbenchData(staff);

  return (
    <main style={{ background: "#f6faf8", minHeight: "100vh", padding: "16px 12px 128px" }}>
      <div style={{ margin: "0 auto", maxWidth: 1180 }}>
        <AdminPageHeader
          activeHref="/admin/workbench"
          description="集中處理待接手、真人追蹤與今日聯繫事項。"
          eyebrow="客服工作台"
          staff={staff}
          title="真人客服接手工作台"
        />

        <WorkbenchClient
          canResetTestCustomer={canAccessSystemAdmin(staff.role)}
          initialData={initialData}
          staffName={staff.displayName}
        />
      </div>
    </main>
  );
}
