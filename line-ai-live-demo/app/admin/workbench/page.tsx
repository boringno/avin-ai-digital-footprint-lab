import { redirect } from "next/navigation";

import { canReviewFaqMiss, canUseWorkbench, canViewContent, canViewReports, getAdminStaffFromCookies } from "@/lib/admin-auth";
import { staffRoleLabels } from "@/lib/admin-display-maps";
import { loadWorkbenchData } from "@/lib/admin-workbench-data";

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
            <p style={{ color: "#5e7a72", fontSize: 14, margin: 0 }}>客服工作台</p>
            <h1 style={{ margin: "4px 0 0" }}>真人客服接手工作台</h1>
            <p style={{ color: "#66756f", fontSize: 14, margin: "6px 0 0" }}>
              登入：{staff.displayName} · {staffRoleLabels[staff.role]}
            </p>
          </div>
          <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8 }}>
            {canViewReports(staff.role) ? <a href="/admin/reports" style={pillStyle}>月報</a> : null}
            {canReviewFaqMiss(staff.role) ? <a href="/admin/faq-candidates" style={pillStyle}>問題補強</a> : null}
            {canViewContent(staff.role) ? <a href="/admin/content" style={pillStyle}>內容管理</a> : null}
            {staff.role === "owner" || staff.role === "manager" || staff.role === "maintainer" ? (
              <a href="/admin/team" style={pillStyle}>
                團隊管理
              </a>
            ) : null}
            <a href="/admin/leads" style={pillStyle}>
              預約線索
            </a>
            <form action="/api/admin/auth/logout" method="post">
              <button type="submit" style={{ ...pillStyle, cursor: "pointer", font: "inherit" }}>
                登出
              </button>
            </form>
          </div>
        </header>

        <WorkbenchClient initialData={initialData} staffName={staff.displayName} />
      </div>
    </main>
  );
}

const pillStyle = {
  background: "#fff",
  border: "1px solid #b9cbc5",
  borderRadius: 999,
  color: "#16302b",
  display: "inline-flex",
  minHeight: 44,
  padding: "10px 14px",
  textDecoration: "none",
} satisfies React.CSSProperties;
