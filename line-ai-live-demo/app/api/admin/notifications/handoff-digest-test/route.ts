import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin-audit";
import { requireAdminStaff } from "@/lib/admin-auth";
import { sendHandoffDigestTest } from "@/lib/handoff-digest";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) return NextResponse.json({ error: "請先登入後台。", ok: false }, { status: 401 });
  if (staff.role !== "owner") return NextResponse.json({ error: "只有診所管理者可以寄送通知測試。", ok: false }, { status: 403 });

  const result = await sendHandoffDigestTest();
  if (!result.ok) return NextResponse.json({ error: "通知測試未送出，請確認寄件網域與 Production 環境變數。", ok: false }, { status: 503 });
  await writeAdminAuditLog({
    action: "handoff_digest_test_sent",
    after: { branch: "高雄館" },
    staff,
    targetId: "高雄館",
    targetTable: "handoff_digest_notifications",
  });
  return NextResponse.json({ ok: true });
}
