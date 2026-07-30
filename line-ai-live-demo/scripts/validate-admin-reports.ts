import { buildFaqMissSummary, buildReportSummary, buildTodayOnlyReportsData, type ReportDailyMetric } from "../src/lib/admin-reports-data";
import { canViewExecutiveSummary } from "../src/lib/admin-auth";

const rows: ReportDailyMetric[] = [
  { activeUsers: 4, aiReplies: 5, faqMiss: 1, handoffCreated: 1, inboundMessages: 8, intentDistribution: { treatment: 3, pricing: 2 }, metricDate: "2026-07-10", nightInbound: 2, unclassifiedCount: 1 },
  { activeUsers: 6, aiReplies: 7, faqMiss: 2, handoffCreated: 2, inboundMessages: 12, intentDistribution: { treatment: 4, booking_new: 3 }, metricDate: "2026-07-11", nightInbound: 3, unclassifiedCount: 2 },
];

const summary = buildReportSummary(rows);
const faqSummary = buildFaqMissSummary([
  { intent_key: "pricing", occurrence_count: 3, status: "open" },
  { intent_key: "treatment", occurrence_count: 5, status: "reviewed" },
  { intent_key: "pricing", occurrence_count: 2, status: "open" },
]);
const expected = { activeUsers: 10, handoffRate: 30, inboundMessages: 20, nightRate: 25, topIntent: "treatment" };
const todayOnly = buildTodayOnlyReportsData({
  dailyMetrics: rows,
  faqMissSummary: faqSummary,
  generatedAt: "2026-07-12T00:00:00.000Z",
  latestDaily: rows[1],
  latestMonth: "2026-07",
  monthlyTotals: summary,
  previousMonthlyTotals: summary,
});
const passed = summary.activeUsers === expected.activeUsers
  && summary.inboundMessages === expected.inboundMessages
  && summary.handoffRate === expected.handoffRate
  && summary.nightRate === expected.nightRate
  && summary.topIntents[0]?.key === expected.topIntent
  && faqSummary.candidateCount === 3
  && faqSummary.openCandidateCount === 2
  && faqSummary.totalOccurrences === 10
  && faqSummary.topMissIntents[0]?.key === "pricing"
  && todayOnly.dailyMetrics.length === 1
  && todayOnly.latestDaily?.metricDate === "2026-07-11"
  && todayOnly.faqMissSummary.totalOccurrences === 0
  && todayOnly.monthlyTotals.inboundMessages === 0
  && todayOnly.previousMonthlyTotals.inboundMessages === 0
  && !canViewExecutiveSummary("agent")
  && canViewExecutiveSummary("manager");

if (!passed) {
  console.error("FAIL admin reports summary", { expected, summary });
  process.exitCode = 1;
} else {
  console.log("PASS admin reports summary");
}
