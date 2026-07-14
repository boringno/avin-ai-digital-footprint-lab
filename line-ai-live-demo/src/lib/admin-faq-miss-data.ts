import type { AdminStaffUser } from "@/lib/admin-auth";
import { writeAdminAuditLog } from "@/lib/admin-audit";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

export type AdminFaqMissCandidate = {
  candidateType: "no_approved_answer" | "repeated_question";
  firstSeenAt: string;
  id: string;
  intentKey: string;
  lastSeenAt: string;
  notes: string;
  occurrenceCount: number;
  questionRedacted: string | null;
  reviewedAt: string | null;
  status: "open" | "reviewed" | "dismissed" | "promoted";
};

type FaqMissCandidateRow = {
  candidate_type: AdminFaqMissCandidate["candidateType"];
  first_seen_at: string;
  id: string;
  intent_key: string;
  last_seen_at: string;
  notes: string;
  occurrence_count: number;
  question_redacted: string | null;
  reviewed_at: string | null;
  status: AdminFaqMissCandidate["status"];
};

export async function loadAdminFaqMissCandidates(staff: AdminStaffUser) {
  if (!hasSupabaseServerConfig()) {
    return [] satisfies AdminFaqMissCandidate[];
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("faq_miss_candidates")
    .select("id, candidate_type, status, intent_key, question_redacted, occurrence_count, first_seen_at, last_seen_at, reviewed_at, notes")
    .eq("tenant_id", staff.tenantId)
    .in("status", ["open", "reviewed"])
    .order("occurrence_count", { ascending: false })
    .order("last_seen_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Failed to load FAQ miss candidates: ${error.message}`);
  }

  return ((data ?? []) as FaqMissCandidateRow[]).map((row) => ({
    candidateType: row.candidate_type,
    firstSeenAt: row.first_seen_at,
    id: row.id,
    intentKey: row.intent_key,
    lastSeenAt: row.last_seen_at,
    notes: row.notes,
    occurrenceCount: row.occurrence_count,
    questionRedacted: row.question_redacted,
    reviewedAt: row.reviewed_at,
    status: row.status,
  }));
}

export async function updateAdminFaqMissCandidate(input: {
  candidateId: string;
  notes?: string;
  staff: AdminStaffUser;
  status?: "dismissed" | "open" | "promoted" | "reviewed";
}) {
  if (!hasSupabaseServerConfig()) {
    throw new Error("Supabase server config is incomplete");
  }

  const supabase = getSupabaseServerClient();
  const { data: before, error: beforeError } = await supabase
    .from("faq_miss_candidates")
    .select("id, status, notes, reviewed_by, reviewed_at")
    .eq("tenant_id", input.staff.tenantId)
    .eq("id", input.candidateId)
    .maybeSingle<Record<string, unknown>>();

  if (beforeError) {
    throw new Error(`Failed to load FAQ miss candidate before update: ${beforeError.message}`);
  }
  if (!before) {
    throw new Error("FAQ miss candidate not found");
  }

  const nextStatus = input.status ?? String(before.status ?? "open");
  const patch: Record<string, string | null> = {
    reviewed_at: new Date().toISOString(),
    reviewed_by: input.staff.id,
    status: nextStatus,
  };
  if (input.notes !== undefined) {
    patch.notes = input.notes;
  }

  const { data: after, error: updateError } = await supabase
    .from("faq_miss_candidates")
    .update(patch)
    .eq("tenant_id", input.staff.tenantId)
    .eq("id", input.candidateId)
    .select("id, status, notes, reviewed_by, reviewed_at")
    .single<Record<string, unknown>>();

  if (updateError || !after) {
    throw new Error(`Failed to update FAQ miss candidate: ${updateError?.message ?? "missing row"}`);
  }

  await writeAdminAuditLog({
    action: `faq_miss_candidate.${nextStatus}`,
    after,
    before,
    staff: input.staff,
    targetId: input.candidateId,
    targetTable: "faq_miss_candidates",
  });

  return after;
}
