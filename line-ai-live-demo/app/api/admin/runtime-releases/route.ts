import { NextResponse } from "next/server";

import { canManageRuntimeContentReleases, requireAdminStaff } from "@/lib/admin-auth";
import { activateRuntimeRelease, createRuntimeRelease, loadRuntimeReleaseAdminData, rollbackRuntimeRelease, runRuntimeReleaseRegression } from "@/lib/admin-runtime-release-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) return NextResponse.json({ ok: false, error: "請先登入。" }, { status: 401 });
  if (!canManageRuntimeContentReleases(staff.role)) return NextResponse.json({ ok: false, error: "您沒有此權限。" }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, ...(await loadRuntimeReleaseAdminData(staff)) });
  } catch {
    return NextResponse.json({ ok: false, error: "目前無法讀取發布資料。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) return NextResponse.json({ ok: false, error: "請先登入。" }, { status: 401 });
  if (!canManageRuntimeContentReleases(staff.role)) return NextResponse.json({ ok: false, error: "您沒有此權限。" }, { status: 403 });
  const body = (await request.json()) as { action?: "create" | "test"; release_id?: string; release_name?: string };
  try {
    if (body.action === "create" && body.release_name) {
      await createRuntimeRelease(staff, body.release_name);
      return NextResponse.json({ ok: true, ...(await loadRuntimeReleaseAdminData(staff)) });
    }
    if (body.action === "test" && body.release_id) {
      return NextResponse.json({ ok: true, results: await runRuntimeReleaseRegression(staff, body.release_id) });
    }
    return NextResponse.json({ ok: false, error: "請提供有效操作。" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "操作失敗。" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) return NextResponse.json({ ok: false, error: "請先登入。" }, { status: 401 });
  if (!canManageRuntimeContentReleases(staff.role)) return NextResponse.json({ ok: false, error: "您沒有此權限。" }, { status: 403 });
  const body = (await request.json()) as { action?: "activate" | "rollback"; reason?: string; release_id?: string; rollout_percentage?: number };
  try {
    if (body.action === "activate" && body.release_id && typeof body.rollout_percentage === "number") {
      await activateRuntimeRelease(staff, body.release_id, body.rollout_percentage);
    } else if (body.action === "rollback") {
      await rollbackRuntimeRelease(staff, body.reason ?? "");
    } else {
      return NextResponse.json({ ok: false, error: "請提供有效操作。" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ...(await loadRuntimeReleaseAdminData(staff)) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "操作失敗。" }, { status: 400 });
  }
}
