import { NextResponse } from "next/server";

import { canViewExecutiveSummary, canViewReports, requireAdminStaff } from "@/lib/admin-auth";
import { loadAdminReportsData } from "@/lib/admin-reports-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized", ok: false }, { status: 401 });
  }
  if (!canViewReports(staff.role)) {
    return NextResponse.json({ error: "Forbidden", ok: false }, { status: 403 });
  }

  try {
    return NextResponse.json({
      ...(await loadAdminReportsData(staff, { includeExecutiveSummary: canViewExecutiveSummary(staff.role) })),
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load reports", ok: false },
      { status: 500 },
    );
  }
}
