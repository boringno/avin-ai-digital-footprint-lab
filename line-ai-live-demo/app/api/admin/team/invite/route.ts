import { NextResponse } from "next/server";

import { requireAdminStaff } from "@/lib/admin-auth";
import { inviteAdminTeamMember } from "@/lib/admin-team-data";

export const runtime = "nodejs";

type InviteBody = { display_name?: string; email?: string; role?: string };

export async function POST(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as InviteBody;
  try {
    const result = await inviteAdminTeamMember({
      displayName: body.display_name ?? "",
      email: body.email ?? "",
      role: body.role ?? "",
      staff,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to invite team member", ok: false },
      { status: 400 },
    );
  }
}
