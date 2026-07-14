import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin-audit";
import { canUseWorkbench, requireAdminStaff } from "@/lib/admin-auth";
import { markHandoffTaskResolved, markHandoffTaskTaken } from "@/lib/admin-workbench-data";
import { loadConversationState, saveConversationState, updateConversationStatus } from "@/lib/conversation-state";

export const runtime = "nodejs";

type ControlRequestBody = {
  action?: "close" | "complete" | "mark_human_active" | "pause_ai" | "resume_ai";
  assigned_to?: string;
  auto_resume_after_minutes?: number;
  user_id?: string;
};

export async function GET(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canUseWorkbench(staff.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id") ?? "";
  if (!userId) {
    return NextResponse.json({ ok: false, error: "user_id is required" }, { status: 400 });
  }

  const state = await loadConversationState(userId, staff.tenantId);
  return NextResponse.json({ ok: true, state });
}

export async function POST(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canUseWorkbench(staff.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as ControlRequestBody;
  if (!body.user_id || !body.action) {
    return NextResponse.json({ ok: false, error: "user_id and action are required" }, { status: 400 });
  }

  const before = await loadConversationState(body.user_id, staff.tenantId);
  const after = updateConversationStatus(before, {
    action: body.action,
    assignedTo: body.assigned_to ?? staff.displayName,
    autoResumeAfterMinutes: body.auto_resume_after_minutes,
    sentAt: new Date().toISOString(),
  } as Parameters<typeof updateConversationStatus>[1]);

  await saveConversationState(after, staff.tenantId);
  if (body.action === "mark_human_active") {
    await markHandoffTaskTaken(staff, body.user_id);
  } else if (body.action === "resume_ai" || body.action === "complete" || body.action === "close") {
    await markHandoffTaskResolved(staff, body.user_id);
  }

  await writeAdminAuditLog({
    action: `conversation.${body.action}`,
    after: after as unknown as Record<string, unknown>,
    before: before as unknown as Record<string, unknown>,
    staff,
    targetId: body.user_id,
    targetTable: "conversation_runtime_state",
  });

  return NextResponse.json({
    ok: true,
    state: after,
  });
}
