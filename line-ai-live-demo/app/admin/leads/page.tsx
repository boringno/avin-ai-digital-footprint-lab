import { redirect } from "next/navigation";

import { canEditLeads, canViewLeads, getAdminStaffFromCookies } from "@/lib/admin-auth";
import { loadAdminLeadsData } from "@/lib/admin-leads-data";

import { AdminPageHeader } from "../_components/AdminPageHeader";
import { LeadsClient } from "./LeadsClient";

export default async function AdminLeadsPage() {
  const staff = await getAdminStaffFromCookies();
  if (!staff) {
    redirect("/admin/login");
  }
  if (!canViewLeads(staff.role)) {
    redirect("/admin/forbidden");
  }

  const initialData = await loadAdminLeadsData(staff);

  return (
    <main style={{ background: "#f6faf8", minHeight: "100vh", padding: "16px 12px 108px" }}>
      <div style={{ margin: "0 auto", maxWidth: 1260 }}>
        <AdminPageHeader
          activeHref="/admin/leads"
          description="整理預約需求、追蹤進度與真人聯繫紀錄。"
          eyebrow="預約管理"
          staff={staff}
          title="預約線索看板"
        />

        <LeadsClient canEdit={canEditLeads(staff.role)} initialData={initialData} staffId={staff.id} />
      </div>
    </main>
  );
}
