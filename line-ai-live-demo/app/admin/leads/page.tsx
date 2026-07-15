import { redirect } from "next/navigation";

import { canEditLeads, canReviewFaqMiss, canViewContent, canViewLeads, canViewReports, getAdminStaffFromCookies } from "@/lib/admin-auth";
import { staffRoleLabels } from "@/lib/admin-display-maps";
import { loadAdminLeadsData } from "@/lib/admin-leads-data";

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
        <header
          style={{
            alignItems: "center",
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            justifyContent: "space-between",
            marginBottom: 18,
          }}
        >
          <div>
            <p style={{ color: "#5e7a72", fontSize: 14, margin: 0 }}>預約管理</p>
            <h1 style={{ margin: "4px 0 0" }}>預約線索看板</h1>
            <p style={{ color: "#66756f", fontSize: 14, margin: "6px 0 0" }}>
              登入：{staff.displayName} · {staffRoleLabels[staff.role]}
            </p>
          </div>
          <div style={{ alignItems: "center", display: "flex", flexBasis: "100%", flexWrap: "wrap", gap: 8, justifyContent: "flex-end", minWidth: 0 }}>
            {canViewReports(staff.role) ? <a href="/admin/reports" style={linkButtonStyle}>月報</a> : null}
            {canReviewFaqMiss(staff.role) ? <a href="/admin/faq-candidates" style={linkButtonStyle}>問題補強</a> : null}
            {canViewContent(staff.role) ? <a href="/admin/content" style={linkButtonStyle}>內容管理</a> : null}
            {canViewContent(staff.role) ? <a href="/admin/schedules" style={linkButtonStyle}>門診班表</a> : null}
            {staff.role === "owner" || staff.role === "manager" || staff.role === "maintainer" ? (
              <a href="/admin/team" style={linkButtonStyle}>
                團隊管理
              </a>
            ) : null}
            <a href="/admin/workbench" style={linkButtonStyle}>
              接手工作台
            </a>
            <form action="/api/admin/auth/logout" method="post">
              <button type="submit" style={ghostButtonStyle}>
                登出
              </button>
            </form>
          </div>
        </header>

        <LeadsClient canEdit={canEditLeads(staff.role)} initialData={initialData} staffId={staff.id} />
      </div>
    </main>
  );
}

const ghostButtonStyle = {
  background: "#fff",
  border: "1px solid #b9cbc5",
  borderRadius: 999,
  color: "#16302b",
  cursor: "pointer",
  display: "inline-flex",
  font: "inherit",
  minHeight: 44,
  padding: "10px 14px",
  textDecoration: "none",
} satisfies React.CSSProperties;

const linkButtonStyle = {
  ...ghostButtonStyle,
  display: "inline-block",
} satisfies React.CSSProperties;
