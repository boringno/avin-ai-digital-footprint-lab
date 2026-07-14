import { NextResponse } from "next/server";

import { requireAdminStaff } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    staff: {
      display_name: staff.displayName,
      email: staff.email,
      id: staff.id,
      role: staff.role,
      tenant_id: staff.tenantId,
    },
  });
}
