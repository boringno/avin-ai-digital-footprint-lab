import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "This endpoint moved to /api/admin/conversations/staff-message and requires admin auth.",
    },
    { status: 410 },
  );
}
