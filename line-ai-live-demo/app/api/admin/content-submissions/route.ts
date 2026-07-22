import { NextResponse } from "next/server";

import { canReviewContent, canSubmitContentSource, canViewContent, requireAdminStaff } from "@/lib/admin-auth";
import { createContentSubmission, createContentSubmissionDownloadUrl, loadAdminContentSubmissions, reviewContentSubmission } from "@/lib/admin-content-submissions-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) return NextResponse.json({ ok: false, error: "Please sign in first" }, { status: 401 });
  if (!canViewContent(staff.role)) return NextResponse.json({ ok: false, error: "You do not have access to content submissions" }, { status: 403 });
  const attachmentId = new URL(request.url).searchParams.get("attachment_id");
  try {
    if (attachmentId) return NextResponse.json({ ok: true, signed_url: await createContentSubmissionDownloadUrl({ attachmentId, staff }) });
    return NextResponse.json({ ok: true, submissions: await loadAdminContentSubmissions(staff) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load content submissions" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) return NextResponse.json({ ok: false, error: "Please sign in first" }, { status: 401 });
  if (!canSubmitContentSource(staff.role)) return NextResponse.json({ ok: false, error: "Only clinic owners and managers can submit source files" }, { status: 403 });
  const formData = await request.formData();
  const files = formData.getAll("files").filter((value): value is File => value instanceof File);
  try {
    await createContentSubmission({
      displayName: String(formData.get("display_name") ?? ""),
      files,
      staff,
      submissionNote: String(formData.get("submission_note") ?? ""),
    });
    return NextResponse.json({ ok: true, submissions: await loadAdminContentSubmissions(staff) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to submit source files" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) return NextResponse.json({ ok: false, error: "Please sign in first" }, { status: 401 });
  if (!canReviewContent(staff.role)) return NextResponse.json({ ok: false, error: "Only platform maintainers can review source files" }, { status: 403 });
  const body = (await request.json()) as { action?: "start_review" | "approve" | "needs_changes" | "reject"; review_note?: string; submission_id?: string };
  if (!body.action || !body.submission_id) return NextResponse.json({ ok: false, error: "Missing submission review action" }, { status: 400 });
  try {
    await reviewContentSubmission({ action: body.action, reviewNote: body.review_note, staff, submissionId: body.submission_id });
    return NextResponse.json({ ok: true, submissions: await loadAdminContentSubmissions(staff) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to review source files" }, { status: 400 });
  }
}
