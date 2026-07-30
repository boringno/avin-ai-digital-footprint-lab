import type { AdminStaffUser } from "@/lib/admin-auth";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

type JsonCounts = Record<string, number>;

export type ReportDailyMetric = {
  activeUsers: number;
  aiReplies: number;
  faqMiss: number;
  handoffCreated: number;
  inboundMessages: number;
  intentDistribution: JsonCounts;
  metricDate: string;
  nightInbound: number;
  unclassifiedCount: number;
};

export type AdminReportsData = {
  dailyMetrics: ReportDailyMetric[];
  faqMissSummary: ReportFaqMissSummary;
  generatedAt: string;
  latestDaily: ReportDailyMetric | null;
  latestMonth: string | null;
  monthlyTotals: ReportSummary;
  previousMonthlyTotals: ReportSummary;
};

export type ReportSummary = {
  activeUsers: number;
  aiReplies: number;
  faqMiss: number;
  handoffCreated: number;
  handoffRate: number;
  inboundMessages: number;
  nightInbound: number;
  nightRate: number;
  topIntents: Array<{ count: number; key: string }>;
  unclassifiedCount: number;
  unclassifiedRate: number;
};

export type ReportFaqMissSummary = {
  candidateCount: number;
  openCandidateCount: number;
  topMissIntents: Array<{ count: number; key: string }>;
  totalOccurrences: number;
};

type DailyMetricRow = {
  active_users: number;
  ai_replies: number;
  faq_miss: number;
  handoff_created: number;
  inbound_messages: number;
  intent_distribution_json: unknown;
  metric_date: string;
  night_inbound: number;
  unclassified_count: number;
};

type FaqMissSummaryRow = {
  intent_key: string;
  occurrence_count: number;
  status: "open" | "reviewed" | "dismissed" | "promoted";
};

const DEFAULT_SUMMARY: ReportSummary = {
  activeUsers: 0,
  aiReplies: 0,
  faqMiss: 0,
  handoffCreated: 0,
  handoffRate: 0,
  inboundMessages: 0,
  nightInbound: 0,
  nightRate: 0,
  topIntents: [],
  unclassifiedCount: 0,
  unclassifiedRate: 0,
};

const DEFAULT_FAQ_MISS_SUMMARY: ReportFaqMissSummary = {
  candidateCount: 0,
  openCandidateCount: 0,
  topMissIntents: [],
  totalOccurrences: 0,
};

export async function loadAdminReportsData(
  staff: AdminStaffUser,
  options: { includeExecutiveSummary?: boolean } = {},
): Promise<AdminReportsData> {
  if (!hasSupabaseServerConfig()) {
    return emptyReportsData();
  }

  const includeExecutiveSummary = options.includeExecutiveSummary ?? true;
  const supabase = getSupabaseServerClient();
  const [{ data: metricRows, error: metricsError }, { data: faqRows, error: faqError }] = await Promise.all([
    supabase
      .from("daily_metrics")
      .select("metric_date, active_users, inbound_messages, ai_replies, handoff_created, night_inbound, faq_miss, unclassified_count, intent_distribution_json")
      .eq("tenant_id", staff.tenantId)
      .order("metric_date", { ascending: false })
      .limit(includeExecutiveSummary ? 60 : 1),
    includeExecutiveSummary
      ? supabase
          .from("faq_miss_candidates")
          .select("intent_key, occurrence_count, status")
          .eq("tenant_id", staff.tenantId)
          .in("status", ["open", "reviewed"])
          .order("occurrence_count", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] as FaqMissSummaryRow[], error: null }),
  ]);

  if (metricsError) {
    throw new Error(`Failed to load report metrics: ${metricsError.message}`);
  }
  if (faqError) {
    throw new Error(`Failed to load FAQ gaps: ${faqError.message}`);
  }

  const sortedMetrics = ((metricRows ?? []) as DailyMetricRow[])
    .map(toReportDailyMetric)
    .sort((left, right) => left.metricDate.localeCompare(right.metricDate));
  const dailyMetrics = sortedMetrics.slice(-30);
  const previousDailyMetrics = sortedMetrics.slice(0, Math.max(0, sortedMetrics.length - dailyMetrics.length));

  const reportsData = {
    dailyMetrics,
    faqMissSummary: buildFaqMissSummary((faqRows ?? []) as FaqMissSummaryRow[]),
    generatedAt: new Date().toISOString(),
    latestDaily: dailyMetrics.at(-1) ?? null,
    latestMonth: dailyMetrics.at(-1)?.metricDate.slice(0, 7) ?? null,
    monthlyTotals: buildReportSummary(dailyMetrics),
    previousMonthlyTotals: buildReportSummary(previousDailyMetrics.slice(-30)),
  };

  return includeExecutiveSummary ? reportsData : buildTodayOnlyReportsData(reportsData);
}

// Agents receive only the operational snapshot required for today's work.
export function buildTodayOnlyReportsData(data: AdminReportsData): AdminReportsData {
  const latestDaily = data.latestDaily ?? data.dailyMetrics.at(-1) ?? null;
  return {
    ...data,
    dailyMetrics: latestDaily ? [latestDaily] : [],
    faqMissSummary: DEFAULT_FAQ_MISS_SUMMARY,
    latestDaily,
    latestMonth: latestDaily?.metricDate.slice(0, 7) ?? null,
    monthlyTotals: DEFAULT_SUMMARY,
    previousMonthlyTotals: DEFAULT_SUMMARY,
  };
}

export function buildReportSummary(rows: ReportDailyMetric[]): ReportSummary {
  if (rows.length === 0) {
    return DEFAULT_SUMMARY;
  }

  const intentCounts: JsonCounts = {};
  const totals = rows.reduce(
    (total, row) => {
      total.activeUsers += row.activeUsers;
      total.aiReplies += row.aiReplies;
      total.faqMiss += row.faqMiss;
      total.handoffCreated += row.handoffCreated;
      total.inboundMessages += row.inboundMessages;
      total.nightInbound += row.nightInbound;
      total.unclassifiedCount += row.unclassifiedCount;
      for (const [key, count] of Object.entries(row.intentDistribution)) {
        intentCounts[key] = (intentCounts[key] ?? 0) + count;
      }
      return total;
    },
    { activeUsers: 0, aiReplies: 0, faqMiss: 0, handoffCreated: 0, inboundMessages: 0, nightInbound: 0, unclassifiedCount: 0 },
  );

  return {
    ...totals,
    handoffRate: percentage(totals.handoffCreated, totals.activeUsers),
    nightRate: percentage(totals.nightInbound, totals.inboundMessages),
    unclassifiedRate: percentage(totals.unclassifiedCount, totals.inboundMessages),
    topIntents: Object.entries(intentCounts)
      .map(([key, count]) => ({ count, key }))
      .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
      .slice(0, 6),
  };
}

export function buildFaqMissSummary(rows: FaqMissSummaryRow[]): ReportFaqMissSummary {
  if (rows.length === 0) {
    return DEFAULT_FAQ_MISS_SUMMARY;
  }

  const totals = {
    candidateCount: rows.length,
    openCandidateCount: rows.filter((row) => row.status === "open").length,
    totalOccurrences: 0,
  };
  const intentCounts: JsonCounts = {};

  for (const row of rows) {
    totals.totalOccurrences += numberValue(row.occurrence_count);
    intentCounts[row.intent_key] = (intentCounts[row.intent_key] ?? 0) + numberValue(row.occurrence_count);
  }

  return {
    ...totals,
    topMissIntents: Object.entries(intentCounts)
      .map(([key, count]) => ({ count, key }))
      .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
      .slice(0, 6),
  };
}

function emptyReportsData(): AdminReportsData {
  return {
    dailyMetrics: [],
    faqMissSummary: DEFAULT_FAQ_MISS_SUMMARY,
    generatedAt: new Date().toISOString(),
    latestDaily: null,
    latestMonth: null,
    monthlyTotals: DEFAULT_SUMMARY,
    previousMonthlyTotals: DEFAULT_SUMMARY,
  };
}

function toReportDailyMetric(row: DailyMetricRow): ReportDailyMetric {
  return {
    activeUsers: numberValue(row.active_users),
    aiReplies: numberValue(row.ai_replies),
    faqMiss: numberValue(row.faq_miss),
    handoffCreated: numberValue(row.handoff_created),
    inboundMessages: numberValue(row.inbound_messages),
    intentDistribution: countRecord(row.intent_distribution_json),
    metricDate: row.metric_date,
    nightInbound: numberValue(row.night_inbound),
    unclassifiedCount: numberValue(row.unclassified_count),
  };
}

function countRecord(value: unknown): JsonCounts {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, count]) => (typeof count === "number" && Number.isFinite(count) ? [[key, count]] : [])),
  );
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}
