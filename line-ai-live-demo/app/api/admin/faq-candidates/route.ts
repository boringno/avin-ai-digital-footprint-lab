import { NextResponse } from "next/server";

import { canReviewFaqMiss, requireAdminStaff } from "@/lib/admin-auth";
import { loadAdminFaqMissCandidates, updateAdminFaqMissCandidate } from "@/lib/admin-faq-miss-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canReviewFaqMiss(staff.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    return NextResponse.json({ items: await loadAdminFaqMissCandidates(staff), ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load FAQ miss candidates", ok: false },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canReviewFaqMiss(staff.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    candidate_id?: string;
    notes?: string;
    status?: "dismissed" | "open" | "promoted" | "reviewed";
  };
  if (!body.candidate_id) {
    return NextResponse.json({ ok: false, error: "candidate_id is required" }, { status: 400 });
  }
  if (body.status === undefined && body.notes === undefined) {
    return NextResponse.json({ ok: false, error: "status or notes is required" }, { status: 400 });
  }

  try {
    await updateAdminFaqMissCandidate({
      candidateId: body.candidate_id,
      notes: body.notes,
      staff,
      status: body.status,
    });
    return NextResponse.json({ items: await loadAdminFaqMissCandidates(staff), ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update FAQ miss candidate", ok: false },
      { status: 500 },
    );
  }
}
