import { NextResponse } from "next/server";

import { canUseWorkbench, requireAdminStaff } from "@/lib/admin-auth";
import { loadConversationInboxData } from "@/lib/admin-conversation-inbox-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canUseWorkbench(staff.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const data = await loadConversationInboxData(
    staff,
    searchParams.get("q") ?? "",
    searchParams.get("conversation_id") ?? undefined,
  );

  return NextResponse.json({ ...data, ok: true });
}
