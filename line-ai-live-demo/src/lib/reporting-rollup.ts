import crypto from "node:crypto";

import { INTENT_CLASSIFIER_VERSION } from "@/lib/intent-classify";
import { getPreviousTaipeiDate, getTaipeiDateRange, isTaipeiNight } from "@/lib/reporting-time";
import { redactQuestionForAnalytics } from "@/lib/security-redaction";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

const TENANT_ID = "tenant_001";
const PAGE_SIZE = 1000;

type JsonRecord = Record<string, unknown>;

type ConversationMessage = {
  ai_model: string | null;
  ai_tokens_in: number | null;
  ai_tokens_out: number | null;
  content: string;
  conversation_id: string;
  created_at: string;
  direction: "ai" | "customer" | "staff" | "system";
  id: string;
  payload_json: JsonRecord | null;
};

type IntentLabel = { intent_key: string; message_id: string };
type HandoffTask = { reason: string };
type BookingLead = { interested_treatments: unknown; preferred_branch: string | null };

export type DailyRollupResult = {
  dryRun: boolean;
  faqMissCandidates: number;
  metricDate: string;
  metrics: Record<string, unknown>;
};

export async function runDailyRollup(input: { dryRun?: boolean; metricDate?: string; tenantId?: string } = {}): Promise<DailyRollupResult> {
  if (!hasSupabaseServerConfig()) {
    throw new Error("Supabase server config is incomplete");
  }

  const metricDate = input.metricDate ?? getPreviousTaipeiDate();
  const tenantId = input.tenantId ?? TENANT_ID;
  const range = getTaipeiDateRange(metricDate);
  const supabase = getSupabaseServerClient();
  const messages = await loadRows<ConversationMessage>("conversation_messages", "id, conversation_id, direction, content, created_at, payload_json, ai_model, ai_tokens_in, ai_tokens_out", tenantId, range.start, range.end);
  const customerMessages = messages.filter((message) => message.direction === "customer");
  const labels = await loadLabels(customerMessages.map((message) => message.id), tenantId);
  const labelsByMessageId = new Map(labels.map((label) => [label.message_id, label.intent_key]));
  const handoffs = await loadRows<HandoffTask>("handoff_tasks", "reason", tenantId, range.start, range.end);
  const leads = await loadRows<BookingLead>("booking_leads_db", "preferred_branch, interested_treatments", tenantId, range.start, range.end, "updated_at");
  const conversations = await loadRows<{ id: string }>("conversations", "id", tenantId, range.start, range.end, "first_seen_at");
  const faqMissCandidates = customerMessages.filter((message) => labelsByMessageId.get(message.id) === "unclassified" && isUsefulQuestion(message.content));
  const metrics = buildMetrics({ conversations, customerMessages, faqMissCandidates, handoffs, labelsByMessageId, leads, messages });

  if (!input.dryRun) {
    await recordFaqMissCandidates(faqMissCandidates, tenantId);
    const { error } = await supabase.from("daily_metrics").upsert(
      { ...metrics, computed_at: new Date().toISOString(), metric_date: metricDate, tenant_id: tenantId },
      { onConflict: "tenant_id,metric_date" },
    );
    if (error) {
      throw new Error(`Failed to write daily metrics: ${error.message}`);
    }

    await rebuildMonthlyMetrics(metricDate, tenantId);
  }

  return { dryRun: Boolean(input.dryRun), faqMissCandidates: faqMissCandidates.length, metricDate, metrics };
}

async function loadRows<T>(
  table: string,
  columns: string,
  tenantId: string,
  start: string,
  end: string,
  timestampColumn = "created_at",
) {
  const supabase = getSupabaseServerClient();
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("tenant_id", tenantId)
      .gte(timestampColumn, start)
      .lt(timestampColumn, end)
      .order(timestampColumn, { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      throw new Error(`Failed to read ${table}: ${error.message}`);
    }

    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) {
      return rows;
    }
    offset += PAGE_SIZE;
  }
}

async function loadLabels(messageIds: string[], tenantId: string) {
  const supabase = getSupabaseServerClient();
  const labels: IntentLabel[] = [];
  for (let index = 0; index < messageIds.length; index += PAGE_SIZE) {
    const ids = messageIds.slice(index, index + PAGE_SIZE);
    if (ids.length === 0) {
      continue;
    }
    const { data, error } = await supabase
      .from("message_intent_labels")
      .select("message_id, intent_key")
      .eq("tenant_id", tenantId)
      .eq("classifier_version", INTENT_CLASSIFIER_VERSION)
      .in("message_id", ids);
    if (error) {
      throw new Error(`Failed to read intent labels: ${error.message}`);
    }
    labels.push(...((data ?? []) as IntentLabel[]));
  }
  return labels;
}

function buildMetrics(input: {
  conversations: Array<{ id: string }>;
  customerMessages: ConversationMessage[];
  faqMissCandidates: ConversationMessage[];
  handoffs: HandoffTask[];
  labelsByMessageId: Map<string, string>;
  leads: BookingLead[];
  messages: ConversationMessage[];
}) {
  const aiMessages = input.messages.filter((message) => message.direction === "ai");
  const staffMessages = input.messages.filter((message) => message.direction === "staff");
  const intentDistribution = countBy(input.customerMessages, (message) => input.labelsByMessageId.get(message.id) ?? "unclassified");
  const handoffReasons = countBy(input.handoffs, (task) => task.reason || "unknown");
  const branchDistribution = countBy(input.leads.filter((lead) => lead.preferred_branch), (lead) => lead.preferred_branch ?? "unknown");
  const treatmentDistribution = countStringArrayValues(input.leads.map((lead) => lead.interested_treatments));

  return {
    active_users: new Set(input.customerMessages.map((message) => message.conversation_id)).size,
    ai_replies: aiMessages.length,
    ai_tokens_in: sum(aiMessages.map((message) => message.ai_tokens_in ?? 0)),
    ai_tokens_out: sum(aiMessages.map((message) => message.ai_tokens_out ?? 0)),
    branch_distribution_json: branchDistribution,
    faq_hits: aiMessages.filter((message) => decisionType(message) === "faq_auto_reply").length,
    faq_miss: input.faqMissCandidates.length,
    fallback_replies: aiMessages.filter((message) => decisionType(message) === "fallback_reply").length,
    handoff_created: input.handoffs.length,
    handoff_reason_json: handoffReasons,
    inbound_messages: input.customerMessages.length,
    intent_distribution_json: intentDistribution,
    llm_requests: aiMessages.filter((message) => Boolean(message.ai_model) || payloadBoolean(message, "used_ai_reply_generator")).length,
    new_conversations: input.conversations.length,
    night_inbound: input.customerMessages.filter((message) => isTaipeiNight(message.created_at)).length,
    staff_messages: staffMessages.length,
    treatment_distribution_json: treatmentDistribution,
    unclassified_count: intentDistribution.unclassified ?? 0,
  };
}

async function recordFaqMissCandidates(messages: ConversationMessage[], tenantId: string) {
  const supabase = getSupabaseServerClient();
  for (const message of messages) {
    const questionRedacted = redactQuestionForAnalytics(message.content);
    const questionHash = crypto.createHash("sha256").update(normalizeQuestion(questionRedacted)).digest("hex");
    const candidateType = "no_approved_answer";
    const { data: observation, error: observationError } = await supabase
      .from("faq_miss_observations")
      .upsert(
        {
          candidate_type: candidateType,
          classifier_version: INTENT_CLASSIFIER_VERSION,
          message_id: message.id,
          question_hash: questionHash,
          question_redacted: questionRedacted,
          tenant_id: tenantId,
        },
        { ignoreDuplicates: true, onConflict: "tenant_id,classifier_version,message_id,candidate_type" },
      )
      .select("id");
    if (observationError) {
      throw new Error(`Failed to store FAQ miss observation: ${observationError.message}`);
    }
    if (!observation || observation.length === 0) {
      continue;
    }

    const { data: existing, error: existingError } = await supabase
      .from("faq_miss_candidates")
      .select("id, occurrence_count")
      .eq("tenant_id", tenantId)
      .eq("classifier_version", INTENT_CLASSIFIER_VERSION)
      .eq("candidate_type", candidateType)
      .eq("question_hash", questionHash)
      .maybeSingle<{ id: string; occurrence_count: number }>();
    if (existingError) {
      throw new Error(`Failed to read FAQ miss candidate: ${existingError.message}`);
    }

    if (existing) {
      const { error } = await supabase
        .from("faq_miss_candidates")
        .update({
          last_seen_at: message.created_at,
          occurrence_count: existing.occurrence_count + 1,
          question_redacted: questionRedacted,
          source_message_id: message.id,
        })
        .eq("id", existing.id)
        .eq("tenant_id", tenantId);
      if (error) {
        throw new Error(`Failed to update FAQ miss candidate: ${error.message}`);
      }
    } else {
      const { error } = await supabase.from("faq_miss_candidates").insert({
        candidate_type: candidateType,
        classifier_version: INTENT_CLASSIFIER_VERSION,
        first_seen_at: message.created_at,
        intent_key: "unclassified",
        last_seen_at: message.created_at,
        occurrence_count: 1,
        question_hash: questionHash,
        question_redacted: questionRedacted,
        source_message_id: message.id,
        tenant_id: tenantId,
      });
      if (error) {
        throw new Error(`Failed to create FAQ miss candidate: ${error.message}`);
      }
    }
  }
}

async function rebuildMonthlyMetrics(metricDate: string, tenantId: string) {
  const supabase = getSupabaseServerClient();
  const metricMonth = metricDate.slice(0, 7);
  const start = `${metricMonth}-01`;
  const [year, month] = metricMonth.split("-").map(Number);
  const end = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("daily_metrics")
    .select("*")
    .eq("tenant_id", tenantId)
    .gte("metric_date", start)
    .lt("metric_date", end);
  if (error) {
    throw new Error(`Failed to read daily metrics: ${error.message}`);
  }

  const metrics = aggregateDailyMetrics((data ?? []) as JsonRecord[]);
  const { error: writeError } = await supabase.from("monthly_metrics").upsert(
    { computed_at: new Date().toISOString(), metric_month: metricMonth, metrics_json: metrics, tenant_id: tenantId },
    { onConflict: "tenant_id,metric_month" },
  );
  if (writeError) {
    throw new Error(`Failed to write monthly metrics: ${writeError.message}`);
  }
}

function aggregateDailyMetrics(rows: JsonRecord[]) {
  const numericKeys = [
    "new_conversations", "active_users", "inbound_messages", "ai_replies", "staff_messages", "handoff_created", "night_inbound",
    "fallback_replies", "faq_hits", "faq_miss", "unclassified_count", "llm_requests", "ai_tokens_in", "ai_tokens_out",
  ];
  const totals: Record<string, unknown> = { days_with_data: rows.length };
  for (const key of numericKeys) {
    totals[key] = sum(rows.map((row) => Number(row[key] ?? 0)));
  }
  for (const key of ["intent_distribution_json", "handoff_reason_json", "branch_distribution_json", "treatment_distribution_json"]) {
    totals[key] = mergeCounts(rows.map((row) => asCountRecord(row[key])));
  }
  return totals;
}

function decisionType(message: ConversationMessage) {
  const value = message.payload_json?.decision_type;
  return typeof value === "string" ? value : "";
}

function payloadBoolean(message: ConversationMessage, key: string) {
  return message.payload_json?.[key] === true;
}

function countBy<T>(values: T[], keyFor: (value: T) => string) {
  return values.reduce<Record<string, number>>((result, value) => {
    const key = keyFor(value);
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});
}

function countStringArrayValues(values: unknown[]) {
  return countBy(values.flatMap((value) => (Array.isArray(value) ? value : [])).filter((value): value is string => typeof value === "string"), (value) => value);
}

function asCountRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, number>) : {};
}

function mergeCounts(records: Array<Record<string, number>>) {
  return records.reduce<Record<string, number>>((total, record) => {
    for (const [key, value] of Object.entries(record)) {
      total[key] = (total[key] ?? 0) + Number(value ?? 0);
    }
    return total;
  }, {});
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function normalizeQuestion(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function isUsefulQuestion(value: string) {
  const redacted = redactQuestionForAnalytics(value).replace(/\[masked-[^\]]+\]/g, "").replace(/[^\p{L}\p{N}]/gu, "");
  return redacted.length >= 3;
}
