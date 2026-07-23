import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin-audit";
import { canManageClinicHandoffNotifications, canManagePlatformHandoffNotifications, requireAdminStaff } from "@/lib/admin-auth";
import { sendHandoffDigestTest } from "@/lib/handoff-digest";

export const runtime = "nodejs";

const branches = ["高雄館", "台中館", "桃園館", "林口館"] as const;

export async function POST(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) return NextResponse.json({ error: "請先登入後台。", ok: false }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { branch?: string };
  const branch = body.branch ?? "高雄館";
  if (!branches.includes(branch as (typeof branches)[number])) {
    return NextResponse.json({ error: "館別設定不正確。", ok: false }, { status: 400 });
  }
  const recipientScope = canManageClinicHandoffNotifications(staff.role) ? "clinic" : canManagePlatformHandoffNotifications(staff.role) ? "platform" : null;
  if (!recipientScope) return NextResponse.json({ error: "只有診所管理者或系統維運可以寄送通知測試。", ok: false }, { status: 403 });

  const result = await sendHandoffDigestTest(branch as (typeof branches)[number], recipientScope, staff.tenantId);
  if (!result.ok) return NextResponse.json({ error: "通知測試未送出，請確認寄件網域與 Production 環境變數。", ok: false }, { status: 503 });
  await writeAdminAuditLog({
    action: "handoff_digest_test_sent",
    after: { branch, scope: recipientScope },
    staff,
    targetId: branch,
    targetTable: "handoff_digest_notifications",
  });
  return NextResponse.json({ ok: true });
}
