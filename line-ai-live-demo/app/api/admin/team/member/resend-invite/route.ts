import { NextResponse } from "next/server";

import { requireAdminStaff } from "@/lib/admin-auth";
import { resendAdminTeamInvitation } from "@/lib/admin-team-data";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { member_id?: string };
  if (!body.member_id) {
    return NextResponse.json({ ok: false, error: "member_id is required" }, { status: 400 });
  }

  try {
    const result = await resendAdminTeamInvitation({ memberId: body.member_id, staff });
    return NextResponse.json({ ok: true, mode: result.mode });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to resend invitation", ok: false }, { status: 400 });
  }
}
