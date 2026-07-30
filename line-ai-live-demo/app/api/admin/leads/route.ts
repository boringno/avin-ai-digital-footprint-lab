import { NextResponse } from "next/server";

import { canViewLeads, requireAdminStaff } from "@/lib/admin-auth";
import { loadAdminLeadsData } from "@/lib/admin-leads-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canViewLeads(staff.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const data = await loadAdminLeadsData(staff);
  return NextResponse.json({
    ...data,
    ok: true,
  });
}
