import { classifyMessageIntent, type IntentClassificationInput } from "@/lib/intent-classify";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

const TENANT_ID = "tenant_001";

export async function storeRuleIntentLabel(input: IntentClassificationInput & { messageId: string; tenantId?: string }) {
  if (!input.messageId || !hasSupabaseServerConfig()) {
    return;
  }

  const classification = classifyMessageIntent(input);
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("message_intent_labels").upsert(
    {
      classifier_version: classification.classifierVersion,
      intent_key: classification.intentKey,
      label_source: "rule",
      message_id: input.messageId,
      rule_snapshot: classification.ruleSnapshot,
      tenant_id: input.tenantId ?? TENANT_ID,
    },
    { onConflict: "tenant_id,message_id,classifier_version" },
  );

  if (error) {
    throw new Error(`Failed to store message intent label: ${error.message}`);
  }
}
