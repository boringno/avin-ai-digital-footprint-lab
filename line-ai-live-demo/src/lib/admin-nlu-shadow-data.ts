import { canReviewNluDisagreements, type AdminStaffUser } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function loadNluDisagreementReviewQueue(staff: AdminStaffUser) {
  if (!canReviewNluDisagreements(staff.role)) {
    throw new Error("You do not have access to customer-linked NLU diagnostics");
  }

  const { data, error } = await getSupabaseServerClient()
    .from("nlu_shadow_observations")
    .select("id,message_id,prompt_version,model,nlu_frame,deterministic_decision,divergence_categories,confidence,latency_ms,error_code,review_status,created_at,conversation_messages(content)")
    .not("divergence_categories", "eq", "{}")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(`Failed to load NLU disagreement queue: ${error.message}`);
  return data ?? [];
}
