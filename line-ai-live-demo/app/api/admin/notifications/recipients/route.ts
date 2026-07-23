import { NextResponse } from "next/server";

import { requireAdminStaff, canViewHandoffNotifications } from "@/lib/admin-auth";
import { loadHandoffNotificationRecipients, replaceHandoffNotificationRecipients } from "@/lib/admin-handoff-notification-settings";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) return NextResponse.json({ error: "請先登入後台。", ok: false }, { status: 401 });
  if (!canViewHandoffNotifications(staff.role)) return NextResponse.json({ error: "沒有通知設定權限。", ok: false }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, recipients: await loadHandoffNotificationRecipients(staff) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "讀取通知設定失敗。", ok: false }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) return NextResponse.json({ error: "請先登入後台。", ok: false }, { status: 401 });
  if (!canViewHandoffNotifications(staff.role)) return NextResponse.json({ error: "沒有通知設定權限。", ok: false }, { status: 403 });
  const body = (await request.json()) as { branch?: string; emails?: unknown };
  if (!body.branch || !Array.isArray(body.emails) || body.emails.some((email) => typeof email !== "string")) {
    return NextResponse.json({ error: "請提供館別與收件信箱。", ok: false }, { status: 400 });
  }
  try {
    return NextResponse.json({ ok: true, recipients: await replaceHandoffNotificationRecipients({ branch: body.branch, emails: body.emails, staff }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "儲存通知設定失敗。", ok: false }, { status: 400 });
  }
}
