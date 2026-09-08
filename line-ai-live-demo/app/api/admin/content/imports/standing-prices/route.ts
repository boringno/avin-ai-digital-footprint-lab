import { NextResponse } from "next/server";

import { canCreateContentDraft, canViewContent, requireAdminStaff } from "@/lib/admin-auth";
import {
  createApprovedStandingPriceDraftBatch,
  getApprovedStandingPriceImportPreview,
  StandingPriceImportConflictError,
} from "@/lib/admin-standing-price-import";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) return NextResponse.json({ ok: false, error: "請先登入。" }, { status: 401 });
  if (!canViewContent(staff.role)) {
    return NextResponse.json({ ok: false, error: "你沒有查看內容管理的權限。" }, { status: 403 });
  }
  try {
    return NextResponse.json({ ok: true, preview: await getApprovedStandingPriceImportPreview(staff) });
  } catch (error) {
    console.error("standing price draft batch preview failed", error);
    return NextResponse.json({ ok: false, error: "無法載入匯入預覽，請交由工程師查看錯誤紀錄。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) return NextResponse.json({ ok: false, error: "請先登入。" }, { status: 401 });
  if (!canCreateContentDraft(staff.role)) {
    return NextResponse.json({ ok: false, error: "你沒有建立內容草稿的權限。" }, { status: 403 });
  }

  let body: { confirm_count?: number; expected_fingerprint?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "請提供有效的匯入確認資料。" }, { status: 400 });
  }
  if (!Number.isInteger(body.confirm_count) || typeof body.expected_fingerprint !== "string") {
    return NextResponse.json({ ok: false, error: "請先載入匯入預覽，再確認筆數與資料指紋。" }, { status: 400 });
  }

  try {
    const result = await createApprovedStandingPriceDraftBatch({
      expectedCount: body.confirm_count as number,
      expectedFingerprint: body.expected_fingerprint,
      staff,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (!(error instanceof StandingPriceImportConflictError)) {
      console.error("standing price draft batch import failed", error);
      return NextResponse.json({
        ok: false,
        error: "批次建立草稿失敗，資料庫不會保留半批資料；請交由工程師查看錯誤紀錄。",
      }, { status: 500 });
    }
    return NextResponse.json({
      ok: false,
      error: error.message,
    }, { status: 409 });
  }
}
