import { NextResponse } from "next/server";

import { canViewHandoffNotifications, requireAdminStaff } from "@/lib/admin-auth";
import {
  loadNotificationSettingsPageData,
  replaceHandoffNotificationRecipients,
} from "@/lib/admin-handoff-notification-settings";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "尚未登入", ok: false }, { status: 401 });
  }
  if (!canViewHandoffNotifications(staff.role)) {
    return NextResponse.json({ error: "沒有權限查看通知設定", ok: false }, { status: 403 });
  }

  try {
    return NextResponse.json({
      ok: true,
      ...(await loadNotificationSettingsPageData(staff)),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "讀取通知設定失敗",
        ok: false,
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "尚未登入", ok: false }, { status: 401 });
  }
  if (!canViewHandoffNotifications(staff.role)) {
    return NextResponse.json({ error: "沒有權限修改通知設定", ok: false }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    branch?: string;
    emails?: unknown;
    lineGroups?: unknown;
  };
  if (
    !body.branch ||
    !Array.isArray(body.emails) ||
    body.emails.some((email) => typeof email !== "string") ||
    !Array.isArray(body.lineGroups) ||
    body.lineGroups.some((groupId) => typeof groupId !== "string")
  ) {
    return NextResponse.json({ error: "請提供 branch、emails、lineGroups", ok: false }, { status: 400 });
  }

  try {
    return NextResponse.json({
      ok: true,
      recipients: await replaceHandoffNotificationRecipients({
        branch: body.branch,
        emails: body.emails,
        lineGroups: body.lineGroups,
        staff,
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "儲存通知設定失敗",
        ok: false,
      },
      { status: 400 },
    );
  }
}
