import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "This endpoint moved to /api/admin/conversations/control and requires admin auth.",
    },
    { status: 410 },
  );
}

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "This endpoint moved to /api/admin/conversations/control and requires admin auth.",
    },
    { status: 410 },
  );
}
