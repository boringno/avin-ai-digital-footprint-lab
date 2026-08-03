import { NextResponse } from "next/server";

import { canViewTeam, requireAdminStaff } from "@/lib/admin-auth";
import { loadAdminTeam } from "@/lib/admin-team-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canViewTeam(staff.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    return NextResponse.json({ members: await loadAdminTeam(staff), ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load team", ok: false },
      { status: 500 },
    );
  }
}
