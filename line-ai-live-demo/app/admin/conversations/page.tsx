import { redirect } from "next/navigation";

import { canUseWorkbench, getAdminStaffFromCookies } from "@/lib/admin-auth";
import { loadConversationInboxData } from "@/lib/admin-conversation-inbox-data";

import { ConversationInboxClient } from "./ConversationInboxClient";

export default async function AdminConversationsPage() {
  const staff = await getAdminStaffFromCookies();
  if (!staff) {
    redirect("/admin/login");
  }
  if (!canUseWorkbench(staff.role)) {
    redirect("/admin/reports");
  }

  const initialData = await loadConversationInboxData(staff);

  return (
    <main style={{ background: "#f6faf8", minHeight: "100vh", padding: "16px 12px 96px" }}>
      <div style={{ margin: "0 auto", maxWidth: 1360 }}>
        <header style={headerStyle}>
          <div>
            <p style={{ color: "#5e7a72", fontSize: 14, margin: 0 }}>客服對話收件匣</p>
            <h1 style={{ margin: "4px 0 0" }}>全部客人對話</h1>
            <p style={{ color: "#66756f", fontSize: 14, margin: "6px 0 0" }}>請在此後台接手與回覆，避免直接從 LINE 官方後台回覆造成重複訊息。</p>
          </div>
          <div style={headerActionsStyle}>
            <a href="/admin/workbench" style={pillStyle}>接手工作台</a>
            <a href="/admin/leads" style={pillStyle}>預約線索</a>
            <form action="/api/admin/auth/logout" method="post">
              <button style={{ ...pillStyle, cursor: "pointer", font: "inherit" }} type="submit">登出</button>
            </form>
          </div>
        </header>
        <ConversationInboxClient initialData={initialData} staffName={staff.displayName} />
      </div>
    </main>
  );
}

const headerStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  justifyContent: "space-between",
  marginBottom: 18,
} satisfies React.CSSProperties;

const headerActionsStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
} satisfies React.CSSProperties;

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
