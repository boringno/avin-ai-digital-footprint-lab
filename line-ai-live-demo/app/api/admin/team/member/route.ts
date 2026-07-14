import { NextResponse } from "next/server";

import { requireAdminStaff } from "@/lib/admin-auth";
import { updateAdminTeamMember } from "@/lib/admin-team-data";

export const runtime = "nodejs";

type UpdateBody = { is_active?: boolean; member_id?: string; role?: string };

export async function POST(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as UpdateBody;
  if (!body.member_id) {
    return NextResponse.json({ ok: false, error: "member_id is required" }, { status: 400 });
  }

  try {
    const member = await updateAdminTeamMember({
      isActive: body.is_active,
      memberId: body.member_id,
      role: body.role,
      staff,
    });
    return NextResponse.json({ member, ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update team member", ok: false },
      { status: 400 },
    );
  }
}
