import type { AdminStaffUser } from "@/lib/admin-auth";
import { canReviewContent, canSubmitContentSource, canViewContent } from "@/lib/admin-auth";
import { writeAdminAuditLog } from "@/lib/admin-audit";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

const BUCKET = "content-submissions";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const allowedMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type ContentSubmissionStatus = "submitted" | "in_review" | "needs_changes" | "approved" | "rejected";

export type AdminContentSubmission = {
  attachments: Array<{ byteSize: number; id: string; originalFilename: string; mimeType: string }>;
  createdAt: string;
  displayName: string;
  id: string;
  reviewNote: string | null;
  status: ContentSubmissionStatus;
  submissionNote: string;
};

type SubmissionRow = {
  created_at: string;
  display_name: string;
  id: string;
  review_note: string | null;
  status: ContentSubmissionStatus;
  submission_note: string;
};

type AttachmentRow = {
  byte_size: number;
  id: string;
  mime_type: string;
  original_filename: string;
  submission_id: string;
  storage_path: string;
};

export async function loadAdminContentSubmissions(staff: AdminStaffUser) {
  if (!canViewContent(staff.role)) throw new Error("You do not have access to content submissions");
  if (!hasSupabaseServerConfig()) return [] satisfies AdminContentSubmission[];

  const supabase = getSupabaseServerClient();
  const { data: submissions, error } = await supabase
    .from("content_submission_requests")
    .select("id, display_name, submission_note, status, review_note, created_at")
    .eq("tenant_id", staff.tenantId)
    .order("created_at", { ascending: false })
    .returns<SubmissionRow[]>();
  if (error) throw new Error(`Unable to load submissions: ${error.message}`);

  const ids = (submissions ?? []).map((item) => item.id);
  if (ids.length === 0) return [] satisfies AdminContentSubmission[];
  const { data: attachments, error: attachmentError } = await supabase
    .from("content_submission_attachments")
    .select("id, submission_id, original_filename, mime_type, byte_size, storage_path")
    .eq("tenant_id", staff.tenantId)
    .in("submission_id", ids)
    .returns<AttachmentRow[]>();
  if (attachmentError) throw new Error(`Unable to load submission files: ${attachmentError.message}`);

  return (submissions ?? []).map((submission) => ({
    attachments: (attachments ?? []).filter((attachment) => attachment.submission_id === submission.id).map((attachment) => ({
      byteSize: attachment.byte_size,
      id: attachment.id,
      mimeType: attachment.mime_type,
      originalFilename: attachment.original_filename,
    })),
    createdAt: submission.created_at,
    displayName: submission.display_name,
    id: submission.id,
    reviewNote: submission.review_note,
    status: submission.status,
    submissionNote: submission.submission_note,
  }));
}

export async function createContentSubmission(input: { displayName: string; files: File[]; staff: AdminStaffUser; submissionNote: string }) {
  if (!canSubmitContentSource(input.staff.role)) throw new Error("You do not have permission to submit content source files");
  if (!hasSupabaseServerConfig()) throw new Error("Content submission storage is not configured");
  if (!input.displayName.trim() || !input.submissionNote.trim()) throw new Error("A Chinese title and submission note are required");
  if (input.files.length === 0) throw new Error("Upload at least one Word, PDF, or image file");
  if (input.files.some((file) => !allowedMimeTypes.has(file.type) || file.size <= 0 || file.size > MAX_FILE_BYTES)) {
    throw new Error("Only Word, PDF, JPG, PNG, or WEBP files up to 10 MB are allowed");
  }

  const supabase = getSupabaseServerClient();
  const { data: submission, error } = await supabase
    .from("content_submission_requests")
    .insert({ display_name: input.displayName.trim(), submission_note: input.submissionNote.trim(), submitted_by: input.staff.id, tenant_id: input.staff.tenantId })
    .select("id")
    .single<{ id: string }>();
  if (error || !submission) throw new Error(`Unable to create submission: ${error?.message ?? "unknown error"}`);

  const createdPaths: string[] = [];
  try {
    for (const file of input.files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "upload";
      const storagePath = `${input.staff.tenantId}/${submission.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
      if (uploadError) throw new Error(`Unable to upload ${file.name}: ${uploadError.message}`);
      createdPaths.push(storagePath);
      const { error: attachmentError } = await supabase.from("content_submission_attachments").insert({
        byte_size: file.size,
        mime_type: file.type,
        original_filename: file.name,
        storage_path: storagePath,
        submission_id: submission.id,
        tenant_id: input.staff.tenantId,
      });
      if (attachmentError) throw new Error(`Unable to save ${file.name}: ${attachmentError.message}`);
    }
  } catch (caught) {
    if (createdPaths.length) await supabase.storage.from(BUCKET).remove(createdPaths);
    await supabase.from("content_submission_requests").delete().eq("id", submission.id).eq("tenant_id", input.staff.tenantId);
    throw caught;
  }

  await writeAdminAuditLog({
    action: "content_submission.created",
    after: { attachment_count: input.files.length, display_name: input.displayName.trim() },
    staff: input.staff,
    targetId: submission.id,
    targetTable: "content_submission_requests",
  });
}

export async function reviewContentSubmission(input: { action: "start_review" | "approve" | "needs_changes" | "reject"; reviewNote?: string; staff: AdminStaffUser; submissionId: string }) {
  if (!canReviewContent(input.staff.role)) throw new Error("Only platform maintainers can review submitted source files");
  if (!hasSupabaseServerConfig()) throw new Error("Content submission storage is not configured");
  if ((input.action === "needs_changes" || input.action === "reject") && !input.reviewNote?.trim()) throw new Error("A review note is required");

  const nextStatus: ContentSubmissionStatus = input.action === "start_review" ? "in_review" : input.action === "approve" ? "approved" : input.action === "needs_changes" ? "needs_changes" : "rejected";
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("content_submission_requests")
    .update({ review_note: input.reviewNote?.trim() || null, reviewed_by: input.staff.id, status: nextStatus })
    .eq("id", input.submissionId)
    .eq("tenant_id", input.staff.tenantId);
  if (error) throw new Error(`Unable to update review status: ${error.message}`);

  await writeAdminAuditLog({
    action: `content_submission.${input.action}`,
    after: { status: nextStatus },
    staff: input.staff,
    targetId: input.submissionId,
    targetTable: "content_submission_requests",
  });
}

export async function createContentSubmissionDownloadUrl(input: { attachmentId: string; staff: AdminStaffUser }) {
  if (!canViewContent(input.staff.role)) throw new Error("You do not have access to content submissions");
  if (!hasSupabaseServerConfig()) throw new Error("Content submission storage is not configured");
  const supabase = getSupabaseServerClient();
  const { data: attachment, error } = await supabase
    .from("content_submission_attachments")
    .select("storage_path")
    .eq("id", input.attachmentId)
    .eq("tenant_id", input.staff.tenantId)
    .single<{ storage_path: string }>();
  if (error || !attachment) throw new Error("Submission file not found");
  const { data, error: signedUrlError } = await supabase.storage.from(BUCKET).createSignedUrl(attachment.storage_path, 60);
  if (signedUrlError || !data?.signedUrl) throw new Error("Unable to create private download link");
  return data.signedUrl;
}
