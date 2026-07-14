import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "This endpoint moved to /api/admin/debug/recent and requires admin auth.",
    },
    { status: 410 },
  );
}
