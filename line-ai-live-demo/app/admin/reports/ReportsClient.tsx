"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

import type { AdminStaffUser } from "@/lib/admin-auth";
import type { AdminReportsData, ReportDailyMetric } from "@/lib/admin-reports-data";

const intentLabels: Record<string, string> = {
  booking_cancel: "取消／改期",
  booking_modify: "修改預約",
  booking_new: "預約諮詢",
  branch_info: "館別資訊",
  campaign: "活動方案",
  complaint: "客訴／效果保證",
  human_request: "真人協助",
  off_topic: "非診所問題",
  post_treatment: "術後問題",
  pregnancy_nursing: "孕期／哺乳",
  pricing: "價格詢問",
  schedule: "醫師門診",
  treatment: "療程介紹",
  unclassified: "尚未分類",
};

type ReportTab = "summary" | "today";

export function ReportsClient({
  canViewExecutiveSummary,
  canReviewFaqMiss,
  canUseWorkbench,
  initialData,
  staff,
}: {
  canViewExecutiveSummary: boolean;
  canReviewFaqMiss: boolean;
  canUseWorkbench: boolean;
  initialData: AdminReportsData;
  staff: AdminStaffUser;
}) {
  const [activeTab, setActiveTab] = useState<ReportTab>(canViewExecutiveSummary ? "summary" : "today");
  const [data, setData] = useState(initialData);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const apply = () => setIsCompact(mediaQuery.matches);
    apply();
    mediaQuery.addEventListener("change", apply);
    return () => mediaQuery.removeEventListener("change", apply);
  }, []);

  async function refresh() {
    if (isRefreshing) {
      return;
    }

    setError("");
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/admin/reports", { cache: "no-store" });
      const result = (await response.json()) as AdminReportsData & { error?: string; ok?: boolean };
      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "讀取月報失敗");
      }
      setData(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "讀取月報失敗，請稍後再試。");
    } finally {
      setIsRefreshing(false);
    }
  }

  const summary = data.monthlyTotals;
  const previousSummary = data.previousMonthlyTotals;
  const faqMissSummary = data.faqMissSummary;
  const latestDaily = data.latestDaily;
  const latestIntents = latestDaily ? topIntentsFromDistribution(latestDaily.intentDistribution) : [];
  const currentTab: ReportTab = canViewExecutiveSummary ? activeTab : "today";
  const maxInbound = Math.max(1, ...data.dailyMetrics.map((metric) => metric.inboundMessages));
  const metrics =
    currentTab === "summary"
      ? [
          {
            delta: deltaText(summary.activeUsers, previousSummary.activeUsers, "較前 30 日"),
            label: "活躍對話",
            tone: "neutral" as const,
            value: summary.activeUsers,
          },
          {
            delta: deltaText(summary.inboundMessages, previousSummary.inboundMessages, "較前 30 日"),
            label: "客人訊息",
            tone: "neutral" as const,
            value: summary.inboundMessages,
          },
          {
            delta: `接手率 ${summary.handoffRate}%`,
            label: "轉真人",
            tone: "warm" as const,
            value: summary.handoffCreated,
          },
          {
            delta: `夜間占比 ${summary.nightRate}%`,
            label: "夜間訊息",
            tone: "accent" as const,
            value: summary.nightInbound,
          },
        ]
      : [
          {
            delta: latestDaily ? latestDaily.metricDate : "尚無彙總",
            label: "今日活躍對話",
            tone: "neutral" as const,
            value: latestDaily?.activeUsers ?? 0,
          },
          {
            delta: "客人主動傳入",
            label: "今日訊息量",
            tone: "neutral" as const,
            value: latestDaily?.inboundMessages ?? 0,
          },
          {
            delta: "AI 自動回覆數",
            label: "今日 AI 回覆",
            tone: "accent" as const,
            value: latestDaily?.aiReplies ?? 0,
          },
          {
            delta: "今天仍待補強",
            label: "今日未分類",
            tone: "warm" as const,
            value: latestDaily?.unclassifiedCount ?? 0,
          },
        ];

  const trendCards =
    currentTab === "summary"
      ? [
          {
            label: "FAQ 缺口累積次數",
            note: "近 30 日未被既有規則接住的總次數。",
            value: faqMissSummary.totalOccurrences,
          },
          {
            label: "待整理候選",
            note: "目前仍待人工整理的題目數。",
            value: faqMissSummary.openCandidateCount,
          },
          {
            label: "未分類比例",
            note: "比率偏高時，代表話術或分類規則還要補。",
            suffix: "%",
            value: summary.unclassifiedRate,
          },
        ]
      : [
          {
            label: "今日轉真人",
            note: "今天已進入真人處理的對話數。",
            value: latestDaily?.handoffCreated ?? 0,
          },
          {
            label: "今日 FAQ 缺口",
            note: "今天仍未被既有規則接住的問題數。",
            value: latestDaily?.faqMiss ?? 0,
          },
          {
            label: "今日夜間訊息",
            note: "夜間量偏高時，隔天容易堆積待回覆壓力。",
            value: latestDaily?.nightInbound ?? 0,
          },
        ];

  const focusIntents = currentTab === "summary" ? summary.topIntents : latestIntents;
  const generatedAtLabel = formatDateTime(data.generatedAt);
  const heroText =
    currentTab === "summary"
      ? `近 30 日共 ${summary.inboundMessages} 則客人訊息，真人接手 ${summary.handoffCreated} 次。`
      : `今日累積 ${latestDaily?.inboundMessages ?? 0} 則客人訊息，AI 回覆 ${latestDaily?.aiReplies ?? 0} 次。`;

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <header style={headerStyle}>
          <div style={{ display: "grid", gap: 6 }}>
            <p style={eyebrowStyle}>近 30 日營運摘要</p>
            <h1 style={pageTitleStyle}>AI 客服月報</h1>
            <p style={subtitleStyle}>
              登入：{staff.displayName} · {roleLabel(staff.role)} · 僅顯示去識別化統計
            </p>
          </div>
          <div style={actionGroupStyle}>
            {canUseWorkbench ? <a href="/admin/workbench" style={headerButtonStyle}>接手工作台</a> : null}
            <a href="/admin/leads" style={headerButtonStyle}>預約線索</a>
            {canReviewFaqMiss ? <a href="/admin/faq-candidates" style={headerButtonStyle}>問題補強</a> : null}
            <button disabled={isRefreshing} onClick={() => void refresh()} style={headerButtonStyle} type="button">
              {isRefreshing ? "更新中..." : "重新整理"}
            </button>
            <form action="/api/admin/auth/logout" method="post">
              <button style={headerButtonStyle} type="submit">登出</button>
            </form>
          </div>
        </header>

        {error ? <p style={errorStyle}>{error}</p> : null}

        <section style={heroPanelStyle}>
          <div style={{ display: "grid", gap: 8 }}>
            <p style={heroEyebrowStyle}>{currentTab === "summary" ? "主管摘要" : "今日概況"}</p>
            <h2 style={heroTitleStyle}>{currentTab === "summary" ? "三秒看懂最近一個月的客服健康度" : "先看今天有沒有需要立刻補位"}</h2>
            <p style={heroBodyStyle}>{heroText}</p>
          </div>
          <div style={heroMetaWrapStyle}>
            <div style={heroMetaCardStyle}>
              <span style={heroMetaLabelStyle}>彙總月份</span>
              <strong style={heroMetaValueStyle}>{data.latestMonth ?? "尚無資料"}</strong>
            </div>
            <div style={heroMetaCardStyle}>
              <span style={heroMetaLabelStyle}>資料更新</span>
              <strong style={heroMetaValueStyle}>{generatedAtLabel}</strong>
            </div>
          </div>
        </section>

        <div style={tabRailWrapStyle}>
          <div style={tabListStyle}>
            {canViewExecutiveSummary ? (
              <button
                onClick={() => setActiveTab("summary")}
                style={{ ...tabButtonStyle, ...(currentTab === "summary" ? activeTabButtonStyle : null) }}
                type="button"
              >
                主管摘要
              </button>
            ) : null}
            <button
              onClick={() => setActiveTab("today")}
              style={{ ...tabButtonStyle, ...(currentTab === "today" ? activeTabButtonStyle : null) }}
              type="button"
            >
              今日概況
            </button>
          </div>
        </div>

        <section
          style={{
            ...metricGridStyle,
            gridTemplateColumns: isCompact ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
          }}
        >
          {metrics.map((metric) => (
            <MetricCard
              delta={metric.delta}
              isCompact={isCompact}
              key={metric.label}
              label={metric.label}
              tone={metric.tone}
              value={metric.value}
            />
          ))}
        </section>

        <section style={isCompact ? stackedSectionStyle : twoColumnSectionStyle}>
          <article style={panelStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <h2 style={panelTitleStyle}>每日進線趨勢</h2>
                <p style={panelSubtitleStyle}>每根柱狀代表當日客人傳入訊息數。</p>
              </div>
              <span style={statusBadgeStyle}>{data.dailyMetrics.length} 天</span>
            </div>
            {data.dailyMetrics.length === 0 ? (
              <EmptyState text="尚未有每日彙總資料。設定排程後，這裡會自動累積近 30 日的趨勢。" />
            ) : (
              <div style={chartScrollerStyle}>
                <div style={chartStyle}>
                  {data.dailyMetrics.map((metric) => (
                    <div key={metric.metricDate} style={barColumnStyle} title={`${metric.metricDate}：${metric.inboundMessages} 則`}>
                      <div style={{ ...barStyle, height: `${Math.max(10, (metric.inboundMessages / maxInbound) * 148)}px` }} />
                      <strong style={barValueStyle}>{metric.inboundMessages}</strong>
                      <span style={barLabelStyle}>{metric.metricDate.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>

          <article style={panelStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <h2 style={panelTitleStyle}>{currentTab === "summary" ? "客人最常詢問" : "今天主要詢問"}</h2>
                <p style={panelSubtitleStyle}>前六個意圖，協助快速看懂客人重點。</p>
              </div>
              <span style={statusBadgeStyle}>{focusIntents.length} 類</span>
            </div>
            {focusIntents.length === 0 ? (
              <EmptyState text="目前尚未有足夠的分類資料。" />
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {focusIntents.map((intent, index) => (
                  <IntentRow
                    count={intent.count}
                    index={index + 1}
                    key={intent.key}
                    label={intentLabels[intent.key] ?? intent.key}
                  />
                ))}
              </div>
            )}
          </article>
        </section>

        <section style={isCompact ? stackedSectionStyle : twoColumnSectionStyle}>
          <article style={panelStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <h2 style={panelTitleStyle}>{currentTab === "summary" ? "需要優先補強" : "今天提醒"}</h2>
                <p style={panelSubtitleStyle}>用商務語言整理，不需要解讀技術名詞。</p>
              </div>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {trendCards.map((card) => (
                <Insight key={card.label} label={card.label} note={card.note} suffix={card.suffix} value={card.value} />
              ))}
            </div>
          </article>

          <article style={panelStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <h2 style={panelTitleStyle}>常見問題缺口統計</h2>
                <p style={panelSubtitleStyle}>只看次數與分類，不顯示原始對話、電話或 LINE ID。</p>
              </div>
              <span style={statusBadgeStyle}>候選 {faqMissSummary.candidateCount}</span>
            </div>
            {faqMissSummary.topMissIntents.length === 0 ? (
              <EmptyState text="目前沒有可統計的 FAQ 缺口。" />
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {faqMissSummary.topMissIntents.map((intent) => (
                  <div key={intent.key} style={faqSummaryRowStyle}>
                    <div style={{ display: "grid", gap: 4 }}>
                      <strong>{intentLabels[intent.key] ?? intent.key}</strong>
                      <span style={smallMutedTextStyle}>累積缺口次數</span>
                    </div>
                    <span style={statusBadgeStyle}>{intent.count} 次</span>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>

        <section style={privacyPanelStyle}>
          <div style={{ display: "grid", gap: 6 }}>
            <p style={eyebrowStyle}>隱私提醒</p>
            <h2 style={{ margin: 0 }}>這頁只保留營運判讀需要的統計</h2>
            <p style={{ ...panelSubtitleStyle, marginTop: 0 }}>
              不顯示電話、原始訊息、完整 LINE user ID。若要追工作進度，請回接手工作台或預約線索頁。
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  delta,
  isCompact,
  label,
  tone,
  value,
}: {
  delta: string;
  isCompact: boolean;
  label: string;
  tone: "accent" | "neutral" | "warm";
  value: number;
}) {
  return (
    <article
      style={{
        ...metricCardStyle,
        background: tone === "accent" ? "#e8f7f0" : tone === "warm" ? "#fff5e8" : "#ffffff",
        borderColor: tone === "accent" ? "#cce6d6" : tone === "warm" ? "#f0d1a8" : "#d7e5df",
      }}
    >
      <span style={metricLabelStyle}>{label}</span>
      <strong style={{ fontSize: isCompact ? 28 : 34, lineHeight: 1.05 }}>{value}</strong>
      <span style={metricDeltaStyle}>{delta}</span>
    </article>
  );
}

function IntentRow({ count, index, label }: { count: number; index: number; label: string }) {
  return (
    <div style={intentRowStyle}>
      <div style={{ alignItems: "center", display: "flex", gap: 12 }}>
        <span style={intentIndexStyle}>{index}</span>
        <span>{label}</span>
      </div>
      <strong>{count} 則</strong>
    </div>
  );
}

function Insight({ label, note, suffix = "", value }: { label: string; note: string; suffix?: string; value: number }) {
  return (
    <div style={insightCardStyle}>
      <strong style={{ fontSize: 18 }}>{value}{suffix}</strong>
      <span style={{ fontWeight: 700 }}>{label}</span>
      <span style={smallMutedTextStyle}>{note}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p style={emptyStateStyle}>{text}</p>;
}

function deltaText(current: number, previous: number, label: string) {
  const diff = current - previous;
  if (diff === 0) {
    return `${label} 持平`;
  }
  return `${label} ${diff > 0 ? "+" : ""}${diff}`;
}

function roleLabel(role: AdminStaffUser["role"]) {
  return { agent: "客服", analyst: "行銷／報表", maintainer: "維護", manager: "主管", owner: "擁有者" }[role];
}

function topIntentsFromDistribution(intentDistribution: ReportDailyMetric["intentDistribution"]) {
  return Object.entries(intentDistribution)
    .map(([key, count]) => ({ count, key }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, 6);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

const pageStyle = {
  background: "linear-gradient(180deg, #f4faf7 0%, #eef6f2 100%)",
  minHeight: "100vh",
  padding: "16px 12px 88px",
} satisfies CSSProperties;

const containerStyle = {
  margin: "0 auto",
  maxWidth: 1180,
} satisfies CSSProperties;

const headerStyle = {
  alignItems: "flex-start",
  display: "flex",
  flexWrap: "wrap",
  gap: 14,
  justifyContent: "space-between",
  marginBottom: 16,
} satisfies CSSProperties;

const actionGroupStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
} satisfies CSSProperties;

const headerButtonStyle = {
  background: "#ffffff",
  border: "1px solid #bfd2ca",
  borderRadius: 14,
  color: "#16302b",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 700,
  minHeight: 44,
  padding: "10px 14px",
  textDecoration: "none",
} satisfies CSSProperties;

const pageTitleStyle = {
  fontSize: 30,
  lineHeight: 1.1,
  margin: 0,
} satisfies CSSProperties;

const eyebrowStyle = {
  color: "#55756c",
  fontSize: 13,
  fontWeight: 700,
  margin: 0,
} satisfies CSSProperties;

const subtitleStyle = {
  color: "#60736c",
  fontSize: 14,
  lineHeight: 1.6,
  margin: 0,
} satisfies CSSProperties;

const heroPanelStyle = {
  background: "linear-gradient(135deg, #16302b 0%, #1e5d49 100%)",
  borderRadius: 22,
  color: "#ffffff",
  display: "grid",
  gap: 16,
  marginBottom: 16,
  padding: 18,
} satisfies CSSProperties;

const heroEyebrowStyle = {
  color: "rgba(255,255,255,0.8)",
  fontSize: 13,
  fontWeight: 700,
  margin: 0,
} satisfies CSSProperties;

const heroTitleStyle = {
  fontSize: 24,
  lineHeight: 1.2,
  margin: 0,
} satisfies CSSProperties;

const heroBodyStyle = {
  color: "rgba(255,255,255,0.92)",
  fontSize: 15,
  lineHeight: 1.7,
  margin: 0,
} satisfies CSSProperties;

const heroMetaWrapStyle = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
} satisfies CSSProperties;

const heroMetaCardStyle = {
  background: "rgba(255,255,255,0.12)",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 16,
  display: "grid",
  gap: 4,
  padding: 12,
} satisfies CSSProperties;

const heroMetaLabelStyle = {
  color: "rgba(255,255,255,0.76)",
  fontSize: 12,
} satisfies CSSProperties;

const heroMetaValueStyle = {
  fontSize: 16,
  lineHeight: 1.4,
} satisfies CSSProperties;

const tabRailWrapStyle = {
  marginBottom: 14,
  position: "sticky",
  top: 0,
  zIndex: 10,
} satisfies CSSProperties;

const tabListStyle = {
  backdropFilter: "blur(10px)",
  background: "rgba(244, 250, 247, 0.9)",
  border: "1px solid #d7e5df",
  borderRadius: 999,
  display: "flex",
  gap: 8,
  overflowX: "auto",
  padding: 6,
} satisfies CSSProperties;

const tabButtonStyle = {
  background: "transparent",
  border: "none",
  borderRadius: 999,
  color: "#365149",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 700,
  minHeight: 44,
  padding: "10px 16px",
  whiteSpace: "nowrap",
} satisfies CSSProperties;

const activeTabButtonStyle = {
  background: "#16302b",
  color: "#ffffff",
} satisfies CSSProperties;

const metricGridStyle = {
  display: "grid",
  gap: 10,
  marginBottom: 14,
} satisfies CSSProperties;

const metricCardStyle = {
  border: "1px solid #d7e5df",
  borderRadius: 18,
  boxShadow: "0 6px 18px rgba(20, 48, 43, 0.04)",
  display: "grid",
  gap: 6,
  minHeight: 132,
  padding: 16,
} satisfies CSSProperties;

const metricLabelStyle = {
  color: "#506a63",
  fontSize: 13,
  fontWeight: 700,
} satisfies CSSProperties;

const metricDeltaStyle = {
  color: "#617670",
  fontSize: 13,
  lineHeight: 1.5,
} satisfies CSSProperties;

const stackedSectionStyle = {
  display: "grid",
  gap: 14,
  marginBottom: 14,
} satisfies CSSProperties;

const twoColumnSectionStyle = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  marginBottom: 14,
} satisfies CSSProperties;

const panelStyle = {
  background: "#ffffff",
  border: "1px solid #d7e5df",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(20, 48, 43, 0.04)",
  padding: 16,
} satisfies CSSProperties;

const panelTitleStyle = {
  fontSize: 20,
  lineHeight: 1.2,
  margin: 0,
} satisfies CSSProperties;

const panelSubtitleStyle = {
  color: "#60736c",
  fontSize: 14,
  lineHeight: 1.6,
  margin: "6px 0 0",
} satisfies CSSProperties;

const sectionHeaderStyle = {
  alignItems: "flex-start",
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  justifyContent: "space-between",
  marginBottom: 14,
} satisfies CSSProperties;

const statusBadgeStyle = {
  background: "#edf8f1",
  border: "1px solid #cde6d7",
  borderRadius: 999,
  color: "#17693a",
  fontSize: 12,
  fontWeight: 700,
  padding: "6px 10px",
  whiteSpace: "nowrap",
} satisfies CSSProperties;

const chartScrollerStyle = {
  overflowX: "auto",
  paddingBottom: 6,
} satisfies CSSProperties;

const chartStyle = {
  alignItems: "end",
  display: "flex",
  gap: 10,
  minHeight: 210,
  padding: "10px 4px 0",
  width: "max-content",
} satisfies CSSProperties;

const barColumnStyle = {
  alignItems: "center",
  display: "grid",
  flex: "0 0 34px",
  gap: 6,
  justifyItems: "center",
} satisfies CSSProperties;

const barStyle = {
  background: "linear-gradient(180deg, #16a34a 0%, #9ed9b1 100%)",
  borderRadius: "10px 10px 3px 3px",
  minHeight: 10,
  width: 26,
} satisfies CSSProperties;

const barValueStyle = {
  color: "#1b3d35",
  fontSize: 11,
  fontWeight: 700,
} satisfies CSSProperties;

const barLabelStyle = {
  color: "#60736c",
  fontSize: 11,
  whiteSpace: "nowrap",
  writingMode: "vertical-rl",
} satisfies CSSProperties;

const intentRowStyle = {
  alignItems: "center",
  background: "#f8fcfa",
  border: "1px solid #dbe8e1",
  borderRadius: 16,
  display: "flex",
  justifyContent: "space-between",
  minHeight: 56,
  padding: "10px 12px",
} satisfies CSSProperties;

const intentIndexStyle = {
  alignItems: "center",
  background: "#16302b",
  borderRadius: 999,
  color: "#ffffff",
  display: "inline-flex",
  fontSize: 12,
  fontWeight: 700,
  height: 26,
  justifyContent: "center",
  width: 26,
} satisfies CSSProperties;

const insightCardStyle = {
  background: "#f8fcfa",
  border: "1px solid #dbe8e1",
  borderRadius: 16,
  display: "grid",
  gap: 4,
  minHeight: 102,
  padding: 14,
} satisfies CSSProperties;

const faqSummaryRowStyle = {
  alignItems: "center",
  background: "#f8fcfa",
  border: "1px solid #dbe8e1",
  borderRadius: 16,
  display: "flex",
  gap: 10,
  justifyContent: "space-between",
  padding: "12px 14px",
} satisfies CSSProperties;

const privacyPanelStyle = {
  background: "#fffef7",
  border: "1px solid #eadfb6",
  borderRadius: 20,
  padding: 16,
} satisfies CSSProperties;

const errorStyle = {
  background: "#fff1f0",
  border: "1px solid #ffccc7",
  borderRadius: 16,
  color: "#8c1d18",
  marginBottom: 12,
  padding: 12,
} satisfies CSSProperties;

const emptyStateStyle = {
  color: "#66756f",
  lineHeight: 1.7,
  margin: 0,
} satisfies CSSProperties;

const smallMutedTextStyle = {
  color: "#66756f",
  fontSize: 13,
  lineHeight: 1.5,
} satisfies CSSProperties;
