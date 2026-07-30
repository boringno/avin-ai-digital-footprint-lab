import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin-audit";
import { canManageClinicHandoffNotifications, canManagePlatformHandoffNotifications, requireAdminStaff } from "@/lib/admin-auth";
import { activeDigestBranches, sendHandoffDigestTest, type HandoffNotificationChannel } from "@/lib/handoff-digest";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "尚未登入", ok: false }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { branch?: string; channel?: string };
  const branch = body.branch ?? "高雄館";
  const channel = body.channel === "line_group" ? "line_group" : "email";

  if (!activeDigestBranches().includes(branch)) {
    return NextResponse.json({ error: "館別不正確", ok: false }, { status: 400 });
  }

  const recipientScope = canManageClinicHandoffNotifications(staff.role)
    ? "clinic"
    : canManagePlatformHandoffNotifications(staff.role)
      ? "platform"
      : null;
  if (!recipientScope) {
    return NextResponse.json({ error: "目前角色不能發送測試通知", ok: false }, { status: 403 });
  }

  const result = await sendHandoffDigestTest(branch, recipientScope, staff.tenantId, channel as HandoffNotificationChannel);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: "測試通知發送失敗，請先檢查收件人與正式環境設定",
        ok: false,
      },
      { status: 503 },
    );
  }

  await writeAdminAuditLog({
    action: "handoff_digest_test_sent",
    after: { branch, channel, scope: recipientScope },
    staff,
    targetId: `${channel}:${branch}`,
    targetTable: "handoff_digest_notifications",
  });

  return NextResponse.json({ ok: true });
}
