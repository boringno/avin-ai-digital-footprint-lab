import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin-audit";
import { canUseWorkbench, requireAdminStaff } from "@/lib/admin-auth";
import {
  insertStaffMessageRecord,
  markHandoffTaskTaken,
  sendLinePushText,
  updateStaffMessageSendStatus,
} from "@/lib/admin-workbench-data";
import {
  applyAuthoritativeConversationTransition,
  markHumanTakeover,
} from "@/lib/conversation-state";
import { reportOperationalError } from "@/lib/monitoring";

export const runtime = "nodejs";

type StaffMessageBody = {
  assigned_to?: string;
  auto_resume_after_minutes?: number;
  message_text?: string;
  sent_at?: string;
  user_id?: string;
};

export async function POST(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canUseWorkbench(staff.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as StaffMessageBody;
  if (!body.user_id) {
    return NextResponse.json({ ok: false, error: "user_id is required" }, { status: 400 });
  }

  const messageText = body.message_text?.trim() ?? "";
  if (!messageText) {
    return NextResponse.json({ ok: false, error: "message_text is required" }, { status: 400 });
  }

  const messageId = await insertStaffMessageRecord({
    content: messageText,
    lineUserId: body.user_id,
    staff,
  });

  const sentAt = body.sent_at ?? new Date().toISOString();
  const { after, before } = await applyAuthoritativeConversationTransition(
    body.user_id,
    (state) => markHumanTakeover(state, {
      assignedTo: body.assigned_to ?? staff.displayName,
      autoResumeAfterMinutes: body.auto_resume_after_minutes,
      sentAt,
    }),
    staff.tenantId,
  );
  await markHandoffTaskTaken(staff, body.user_id);

  let linePushResult: { body: string; ok: boolean; status: number };
  try {
    linePushResult = await sendLinePushText({
      text: messageText,
      to: body.user_id,
    });
  } catch (error) {
    await reportOperationalError({
      alert: false,
      error,
      extra: {
        line_user_id: body.user_id,
        message_id: messageId,
      },
      source: "admin_staff_message_line_push",
    });
    linePushResult = {
      body: error instanceof Error ? error.message : "Unknown LINE push error",
      ok: false,
      status: 0,
    };
  }
  await updateStaffMessageSendStatus({
    errorMessage: linePushResult.ok ? undefined : linePushResult.body,
    messageId,
    sendStatus: linePushResult.ok ? "sent" : "failed",
    staff,
  });

  await writeAdminAuditLog({
    action: "conversation.staff_message",
    after: {
      line_push_status: linePushResult.status,
      message_id: messageId,
      message_text: messageText,
      state: after,
    },
    before: before as unknown as Record<string, unknown>,
    staff,
    targetId: body.user_id,
    targetTable: "conversation_runtime_state",
  });

  return NextResponse.json({
    line_push: linePushResult,
    message_id: messageId,
    message_logged: messageText,
    ok: true,
    state: after,
  });
}
