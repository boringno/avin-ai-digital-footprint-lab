import { redirect } from "next/navigation";

import { canUseWorkbench, getAdminStaffFromCookies } from "@/lib/admin-auth";
import { loadConversationInboxData } from "@/lib/admin-conversation-inbox-data";

import { AdminPageHeader } from "../_components/AdminPageHeader";
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
        <AdminPageHeader
          activeHref="/admin/conversations"
          description="請在此後台接手與回覆，避免直接從 LINE 官方後台回覆造成重複訊息。"
          eyebrow="客服對話收件匣"
          staff={staff}
          title="全部客人對話"
        />
        <ConversationInboxClient initialData={initialData} staffName={staff.displayName} />
      </div>
    </main>
  );
}
