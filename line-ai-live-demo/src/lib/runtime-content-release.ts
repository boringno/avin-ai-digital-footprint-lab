import type { FaqEntry, PricingCampaign } from "@/lib/seed-loader";
import { getLatencyCriticalSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

const DEFAULT_TENANT_ID = "tenant_001";

type ReleaseRow = {
  id: string;
  rollout_percentage: number;
};

type ReleaseEntryRow = {
  content_key: string;
  content_type: "campaign" | "faq";
  end_at: string | null;
  payload_json: Record<string, unknown>;
  start_at: string | null;
};

export type RuntimeContentOverlay = {
  faqEntries: FaqEntry[];
  pricingCampaigns: PricingCampaign[];
  releaseId: string | null;
};

export async function loadRuntimeContentOverlayForRelease(input: {
  now: Date;
  releaseId: string;
  tenantId?: string;
}): Promise<RuntimeContentOverlay> {
  if (!hasSupabaseServerConfig()) return emptyOverlay();

  const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
  const supabase = getLatencyCriticalSupabaseServerClient();
  const { data: release, error: releaseError } = await supabase
    .from("runtime_content_releases")
    .select("id, rollout_percentage")
    .eq("id", input.releaseId)
    .eq("tenant_id", tenantId)
    .in("status", ["draft", "ready", "active"])
    .maybeSingle<ReleaseRow>()
    .retry(false);
  if (releaseError || !release) return emptyOverlay();

  return loadEntriesForRelease({ now: input.now, releaseId: release.id, tenantId });
}

export function isReleaseAudienceIncluded(audienceKey: string, rolloutPercentage: number) {
  if (rolloutPercentage >= 100) return true;
  if (rolloutPercentage <= 0 || !audienceKey) return false;

  let hash = 2166136261;
  for (const character of audienceKey) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100 < rolloutPercentage;
}

export async function loadRuntimeContentOverlay(input: {
  audienceKey: string;
  now: Date;
  tenantId?: string;
}): Promise<RuntimeContentOverlay> {
  if (!hasSupabaseServerConfig()) return emptyOverlay();

  const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
  const supabase = getLatencyCriticalSupabaseServerClient();
  const { data: settings, error: settingsError } = await supabase
    .from("runtime_content_release_settings")
    .select("active_release_id")
    .eq("tenant_id", tenantId)
    .maybeSingle<{ active_release_id: string | null }>()
    .retry(false);
  if (settingsError || !settings?.active_release_id) return emptyOverlay();

  const { data: release, error: releaseError } = await supabase
    .from("runtime_content_releases")
    .select("id, rollout_percentage")
    .eq("id", settings.active_release_id)
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .maybeSingle<ReleaseRow>()
    .retry(false);
  if (releaseError || !release || !isReleaseAudienceIncluded(input.audienceKey, release.rollout_percentage)) {
    return emptyOverlay();
  }

  return loadEntriesForRelease({ now: input.now, releaseId: release.id, tenantId });
}

async function loadEntriesForRelease(input: { now: Date; releaseId: string; tenantId: string }): Promise<RuntimeContentOverlay> {
  const supabase = getLatencyCriticalSupabaseServerClient();
  const { data: entries, error: entriesError } = await supabase
    .from("runtime_content_release_entries")
    .select("content_key, content_type, payload_json, start_at, end_at")
    .eq("tenant_id", input.tenantId)
    .eq("release_id", input.releaseId)
    .returns<ReleaseEntryRow[]>()
    .retry(false);
  if (entriesError) return emptyOverlay();

  const activeEntries = (entries ?? []).filter((entry) => isEntryInWindow(entry, input.now));
  return {
    faqEntries: activeEntries.filter((entry) => entry.content_type === "faq").map(toFaqEntry),
    pricingCampaigns: activeEntries.filter((entry) => entry.content_type === "campaign").map(toPricingCampaign),
    releaseId: input.releaseId,
  };
}

function emptyOverlay(): RuntimeContentOverlay {
  return { faqEntries: [], pricingCampaigns: [], releaseId: null };
}

function isEntryInWindow(entry: ReleaseEntryRow, now: Date) {
  const nowMs = now.getTime();
  return (!entry.start_at || new Date(entry.start_at).getTime() <= nowMs) && (!entry.end_at || nowMs <= new Date(entry.end_at).getTime());
}

function text(payload: Record<string, unknown>, key: string) {
  return typeof payload[key] === "string" ? payload[key].trim() : "";
}

function aliases(payload: Record<string, unknown>) {
  return Array.isArray(payload.aliases) ? payload.aliases.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).join("|") : "";
}

function toFaqEntry(entry: ReleaseEntryRow): FaqEntry {
  return {
    answer_text: text(entry.payload_json, "answer_text"),
    approval_status: "approved",
    is_active: "true",
    notes: `runtime_release:${entry.content_key}`,
    question_pattern: text(entry.payload_json, "question_pattern"),
    reviewed_at: "",
    topic: text(entry.payload_json, "topic"),
  };
}

function toPricingCampaign(entry: ReleaseEntryRow): PricingCampaign {
  return {
    approval_status: "approved",
    asset_urls: "",
    branch_scope: text(entry.payload_json, "branch_scope"),
    campaign_aliases: aliases(entry.payload_json),
    campaign_name: text(entry.payload_json, "campaign_name"),
    end_date: entry.end_at?.slice(0, 10) ?? "",
    fallback_message: text(entry.payload_json, "fallback_message"),
    id: entry.content_key,
    is_active: "true",
    notes: `runtime_release:${entry.content_key}`,
    price_text: text(entry.payload_json, "price_text"),
    start_date: entry.start_at?.slice(0, 10) ?? "",
    treatment_name: text(entry.payload_json, "treatment_name"),
  };
}
