import { NextResponse } from "next/server";

import { canEditContent, canViewContent, requireAdminStaff } from "@/lib/admin-auth";
import { createAdminScheduleDraft, loadAdminScheduleMonths, SCHEDULE_BRANCHES, updateAdminScheduleMonth } from "@/lib/admin-schedule-data";

export const runtime = "nodejs";

function filesFor(formData: FormData, kind: "original" | "preview") {
  const files: Record<string, File> = {};
  for (const branch of SCHEDULE_BRANCHES) {
    const value = formData.get(`${kind}_${branch}`);
    if (!(value instanceof File) || value.size === 0) {
      throw new Error(`請補上${branch}的${kind === "original" ? "原始班表圖" : "預覽縮圖"}。`);
    }
    files[branch] = value;
  }
  return files;
}

export async function GET(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) return NextResponse.json({ error: "請先登入後台。", ok: false }, { status: 401 });
  if (!canViewContent(staff.role)) return NextResponse.json({ error: "您沒有查看班表管理的權限。", ok: false }, { status: 403 });

  try {
    return NextResponse.json({ months: await loadAdminScheduleMonths(staff), ok: true });
  } catch {
    return NextResponse.json({ error: "暫時無法讀取班表資料，請稍後再試。", ok: false }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) return NextResponse.json({ error: "請先登入後台。", ok: false }, { status: 401 });
  if (!canEditContent(staff.role)) return NextResponse.json({ error: "您沒有建立班表草稿的權限。", ok: false }, { status: 403 });

  try {
    const formData = await request.formData();
    await createAdminScheduleDraft({
      changeReason: String(formData.get("change_reason") ?? ""),
      originals: filesFor(formData, "original"),
      previews: filesFor(formData, "preview"),
      sourceMonth: String(formData.get("source_month") ?? ""),
      staff,
    });
    return NextResponse.json({ months: await loadAdminScheduleMonths(staff), ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "建立班表草稿失敗，請檢查資料後再試。", ok: false }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) return NextResponse.json({ error: "請先登入後台。", ok: false }, { status: 401 });
  if (!canEditContent(staff.role)) return NextResponse.json({ error: "您沒有發布或停用班表的權限。", ok: false }, { status: 403 });

  const body = (await request.json()) as { action?: "disable" | "publish"; version_id?: string };
  if (!body.action || !body.version_id) return NextResponse.json({ error: "班表操作資料不完整。", ok: false }, { status: 400 });

  try {
    await updateAdminScheduleMonth({ action: body.action, staff, versionId: body.version_id });
    return NextResponse.json({ months: await loadAdminScheduleMonths(staff), ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "班表操作失敗，請稍後再試。", ok: false }, { status: 400 });
  }
}
