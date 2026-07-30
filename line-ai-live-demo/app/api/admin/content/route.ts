import { NextResponse } from "next/server";

import { canCreateContentDraft, canPublishContent, canReviewContent, canViewContent, requireAdminStaff } from "@/lib/admin-auth";
import { createAdminContentDraft, loadAdminContent, updateAdminContentVersion } from "@/lib/admin-content-data";
import type { EditableContentType } from "@/lib/content-versioning";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) return NextResponse.json({ ok: false, error: "請先登入。" }, { status: 401 });
  if (!canViewContent(staff.role)) return NextResponse.json({ ok: false, error: "你沒有查看內容管理的權限。" }, { status: 403 });
  try {
    return NextResponse.json({ items: await loadAdminContent(staff), ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "內容資料暫時無法讀取，請稍後再試。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) return NextResponse.json({ ok: false, error: "請先登入。" }, { status: 401 });
  if (!canCreateContentDraft(staff.role)) return NextResponse.json({ ok: false, error: "你沒有建立內容草稿的權限。" }, { status: 403 });
  const body = (await request.json()) as {
    change_reason?: string;
    content_key?: string;
    content_type?: EditableContentType;
    display_name?: string;
    end_at?: string | null;
    payload?: Record<string, unknown>;
    start_at?: string | null;
  };
  if (!body.content_type || !body.payload || !body.change_reason || !body.display_name) {
    return NextResponse.json({ ok: false, error: "請完整填寫中文內容名稱、內容與修改原因。" }, { status: 400 });
  }
  try {
    await createAdminContentDraft({
      changeReason: body.change_reason,
      contentKey: body.content_key ?? "",
      contentType: body.content_type,
      displayName: body.display_name,
      endAt: body.end_at ?? null,
      payload: body.payload,
      staff,
      startAt: body.start_at ?? null,
    });
    return NextResponse.json({ items: await loadAdminContent(staff), ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "建立內容草稿失敗。" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) return NextResponse.json({ ok: false, error: "請先登入。" }, { status: 401 });
  const body = (await request.json()) as { action?: "submit" | "approve" | "request_changes" | "publish" | "disable"; review_note?: string; version_id?: string };
  if (!body.action || !body.version_id) return NextResponse.json({ ok: false, error: "缺少內容操作。" }, { status: 400 });
  const canAct = body.action === "submit"
    ? canCreateContentDraft(staff.role)
    : body.action === "approve" || body.action === "request_changes"
      ? canReviewContent(staff.role)
      : canPublishContent(staff.role);
  if (!canAct) return NextResponse.json({ ok: false, error: "你沒有執行此內容操作的權限。" }, { status: 403 });
  try {
    await updateAdminContentVersion({ action: body.action, reviewNote: body.review_note, staff, versionId: body.version_id });
    return NextResponse.json({ items: await loadAdminContent(staff), ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "內容操作失敗。" }, { status: 400 });
  }
}
