import type { NluFrame } from "@/lib/nlu-frame";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

const TENANT_ID = "tenant_001";

export type NluShadowObservation = {
  confidence: number | null;
  deterministicDecision: { decisionType: string; matchedKey: string; matchedType: string };
  divergenceCategories: string[];
  errorCode: string | null;
  frame: NluFrame | null;
  latencyMs: number;
  messageId: string;
  model: string;
  promptVersion: string;
  tokensIn: number;
  tokensOut: number;
};

export async function storeNluShadowObservation(input: NluShadowObservation) {
  if (!input.messageId || !hasSupabaseServerConfig()) return;

  const { error } = await getSupabaseServerClient().from("nlu_shadow_observations").upsert(
    {
      confidence: input.confidence,
      deterministic_decision: input.deterministicDecision,
      divergence_categories: input.divergenceCategories,
      error_code: input.errorCode,
      latency_ms: input.latencyMs,
      message_id: input.messageId,
      model: input.model,
      nlu_frame: input.frame,
      prompt_version: input.promptVersion,
      tenant_id: TENANT_ID,
      tokens_in: input.tokensIn,
      tokens_out: input.tokensOut,
    },
    { onConflict: "tenant_id,message_id,prompt_version" },
  );

  if (error) throw new Error(`Failed to store NLU shadow observation: ${error.message}`);
}
