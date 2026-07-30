"use client";

import { useState } from "react";

import type { AdminFaqMissCandidate } from "@/lib/admin-faq-miss-data";

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

const candidateTypeLabels = {
  no_approved_answer: "沒有核准答案",
  repeated_question: "重複追問",
} as const;

const statusLabels = {
  dismissed: "已排除",
  open: "待整理",
  promoted: "已轉內容流程",
  reviewed: "已檢視",
} as const;

export function FaqCandidatesClient({
  canUseWorkbench,
  initialItems,
  showReportsLink,
  staffName,
}: {
  canUseWorkbench: boolean;
  initialItems: AdminFaqMissCandidate[];
  showReportsLink: boolean;
  staffName: string;
}) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "reviewed">("open");
  const [items, setItems] = useState(initialItems);
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>(() => buildNotesMap(initialItems));
  const [notice, setNotice] = useState("");

  async function refresh() {
    const response = await fetch("/api/admin/faq-candidates", { cache: "no-store" });
    const body = (await response.json()) as { error?: string; items?: AdminFaqMissCandidate[]; ok?: boolean };
    if (!response.ok || !body.ok) {
      throw new Error(body.error ?? "讀取 FAQ 候選失敗");
    }
    const nextItems = body.items ?? [];
    setItems(nextItems);
    setNotesDrafts(buildNotesMap(nextItems));
  }

  async function updateItem(candidateId: string, patch: { notes?: string; status?: "dismissed" | "promoted" | "reviewed" }) {
    if (busyId) {
      return;
    }

    setBusyId(candidateId);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/faq-candidates", {
        body: JSON.stringify({ candidate_id: candidateId, ...patch }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const body = (await response.json()) as { error?: string; items?: AdminFaqMissCandidate[]; ok?: boolean };
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "更新 FAQ 候選失敗");
      }
      const nextItems = body.items ?? [];
      setItems(nextItems);
      setNotesDrafts(buildNotesMap(nextItems));
      setNotice(
        patch.status === "reviewed"
          ? "已標記為已檢視。"
          : patch.status === "dismissed"
            ? "已標記為已排除。"
            : patch.status === "promoted"
              ? "已標記為轉內容流程。後續可在 V1 內容流程接續。"
              : "備註已更新。",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "更新 FAQ 候選失敗");
    } finally {
      setBusyId("");
    }
  }

  const openCount = items.filter((item) => item.status === "open").length;
  const reviewedCount = items.filter((item) => item.status === "reviewed").length;
  const filteredItems = items.filter((item) => {
    if (filter === "all") {
      return true;
    }
    return item.status === filter;
  });

  return (
    <main style={{ background: "#f6faf8", minHeight: "100vh", padding: "20px 12px 80px" }}>
      <div style={{ margin: "0 auto", maxWidth: 1080 }}>
        <header style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <p style={{ color: "#5e7a72", fontSize: 14, margin: 0 }}>常見問題補強</p>
            <h1 style={{ margin: "4px 0 0" }}>問題補強候選</h1>
            <p style={{ color: "#66756f", fontSize: 14, lineHeight: 1.5, margin: "6px 0 0" }}>
              登入：{staffName} · 只顯示去識別化問題文字，供 owner / manager 整理候選。
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {showReportsLink ? <a href="/admin/reports" style={pillLinkStyle}>回月報</a> : null}
            {canUseWorkbench ? <a href="/admin/workbench" style={pillLinkStyle}>接手工作台</a> : null}
            <button onClick={() => void refresh()} style={pillButtonStyle} type="button">重新整理</button>
            <form action="/api/admin/auth/logout" method="post">
              <button style={pillButtonStyle} type="submit">登出</button>
            </form>
          </div>
        </header>

        {error ? <p style={errorStyle}>{error}</p> : null}
        {notice ? <p style={noticeStyle}>{notice}</p> : null}

        <section style={summaryGridStyle}>
          <SummaryCard label="待整理候選" value={openCount} />
          <SummaryCard label="已檢視候選" value={reviewedCount} />
          <SummaryCard label="總候選數" value={items.length} />
        </section>

        <section style={panelStyle}>
          <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <h2 style={{ color: "#16302b", margin: 0 }}>候選清單</h2>
              <p style={{ color: "#66756f", fontSize: 14, lineHeight: 1.5, margin: "6px 0 0" }}>可先做人工整理，內容草稿建立仍留到後續 V1 流程。</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setFilter("open")} style={{ ...filterButtonStyle, ...(filter === "open" ? activeFilterButtonStyle : null) }} type="button">
                待整理
              </button>
              <button onClick={() => setFilter("reviewed")} style={{ ...filterButtonStyle, ...(filter === "reviewed" ? activeFilterButtonStyle : null) }} type="button">
                已檢視
              </button>
              <button onClick={() => setFilter("all")} style={{ ...filterButtonStyle, ...(filter === "all" ? activeFilterButtonStyle : null) }} type="button">
                全部
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {filteredItems.length === 0 ? (
              <p style={{ color: "#66756f", lineHeight: 1.6, margin: 0 }}>目前沒有待整理的問題補強候選。</p>
            ) : (
              filteredItems.map((item) => {
                const isBusy = busyId === item.id;
                return (
                  <article key={item.id} style={candidateCardStyle}>
                    <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        <span style={statusBadgeStyle}>{statusLabels[item.status]}</span>
                        <span style={metaBadgeStyle}>{candidateTypeLabels[item.candidateType]}</span>
                        <span style={metaBadgeStyle}>{intentLabels[item.intentKey] ?? item.intentKey}</span>
                      </div>
                      <strong style={{ color: "#16302b" }}>出現 {item.occurrenceCount} 次</strong>
                    </div>
                    <h2 style={{ color: "#16302b", fontSize: 18, lineHeight: 1.5, margin: "10px 0 6px" }}>
                      {item.questionRedacted || "已遮罩的問題內容"}
                    </h2>
                    <p style={{ color: "#66756f", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                      首次出現：{formatTaipeiDate(item.firstSeenAt)} · 最近出現：{formatTaipeiDate(item.lastSeenAt)}
                    </p>
                    {item.notes ? (
                      <p style={{ color: "#66756f", fontSize: 14, lineHeight: 1.6, margin: "8px 0 0" }}>
                        備註：{item.notes}
                      </p>
                    ) : null}
                    <label style={{ color: "#516660", display: "grid", fontSize: 13, gap: 6, marginTop: 12 }}>
                      內部備註
                      <textarea
                        disabled={isBusy}
                        onChange={(event) =>
                          setNotesDrafts((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))
                        }
                        rows={3}
                        style={notesInputStyle}
                        value={notesDrafts[item.id] ?? ""}
                      />
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                      <button
                        disabled={isBusy || (notesDrafts[item.id] ?? "") === (item.notes ?? "")}
                        onClick={() => void updateItem(item.id, { notes: notesDrafts[item.id] ?? "" })}
                        style={secondaryButtonStyle}
                        type="button"
                      >
                        {isBusy ? "處理中..." : "儲存備註"}
                      </button>
                      {item.status === "open" ? (
                        <button disabled={isBusy} onClick={() => void updateItem(item.id, { status: "reviewed" })} style={secondaryButtonStyle} type="button">
                          {isBusy ? "處理中..." : "標記已檢視"}
                        </button>
                      ) : null}
                      {item.status !== "dismissed" ? (
                        <button disabled={isBusy} onClick={() => void updateItem(item.id, { status: "dismissed" })} style={secondaryButtonStyle} type="button">
                          {isBusy ? "處理中..." : "標記已排除"}
                        </button>
                      ) : null}
                      {item.status !== "promoted" ? (
                        <button disabled={isBusy} onClick={() => void updateItem(item.id, { status: "promoted" })} style={primaryButtonStyle} type="button">
                          {isBusy ? "處理中..." : "轉內容流程"}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article style={summaryCardStyle}>
      <span style={{ color: "#5e7a72", fontSize: 13 }}>{label}</span>
      <strong style={{ color: "#16302b", fontSize: 30, lineHeight: 1.1 }}>{value}</strong>
    </article>
  );
}

function formatTaipeiDate(value: string) {
  return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeZone: "Asia/Taipei" }).format(new Date(value));
}

function buildNotesMap(items: AdminFaqMissCandidate[]) {
  return Object.fromEntries(items.map((item) => [item.id, item.notes ?? ""]));
}

const panelStyle = { background: "#fff", border: "1px solid #d5e4de", borderRadius: 18, padding: 16 } satisfies React.CSSProperties;
const summaryGridStyle = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", marginBottom: 14 } satisfies React.CSSProperties;
const summaryCardStyle = { background: "#eaf5f0", border: "1px solid #d0e6dc", borderRadius: 18, display: "grid", gap: 6, minHeight: 108, padding: 16 } satisfies React.CSSProperties;
const candidateCardStyle = { background: "#f8fcfa", border: "1px solid #dbeae3", borderRadius: 14, padding: 14 } satisfies React.CSSProperties;
const pillLinkStyle = { background: "#fff", border: "1px solid #b9cbc5", borderRadius: 999, color: "#16302b", padding: "8px 12px", textDecoration: "none" } satisfies React.CSSProperties;
const pillButtonStyle = { ...pillLinkStyle, cursor: "pointer", font: "inherit" } satisfies React.CSSProperties;
const statusBadgeStyle = { background: "#edf8f1", border: "1px solid #cce6d6", borderRadius: 999, color: "#17693a", fontSize: 13, padding: "5px 9px" } satisfies React.CSSProperties;
const metaBadgeStyle = { background: "#fff", border: "1px solid #d5e4de", borderRadius: 999, color: "#4b6058", fontSize: 13, padding: "5px 9px" } satisfies React.CSSProperties;
const secondaryButtonStyle = { background: "#fff", border: "1px solid #b9cbc5", borderRadius: 10, color: "#16302b", cursor: "pointer", font: "inherit", padding: "8px 12px" } satisfies React.CSSProperties;
const primaryButtonStyle = { background: "#159947", border: "1px solid #159947", borderRadius: 10, color: "#fff", cursor: "pointer", font: "inherit", padding: "8px 12px" } satisfies React.CSSProperties;
const errorStyle = { background: "#fff2f0", border: "1px solid #f3b9b3", borderRadius: 12, color: "#8c2323", marginBottom: 16, padding: 12 } satisfies React.CSSProperties;
const noticeStyle = { background: "#e8f7ed", border: "1px solid #b9e4c7", borderRadius: 12, color: "#17693a", marginBottom: 16, padding: 12 } satisfies React.CSSProperties;
const filterButtonStyle = { background: "#fff", border: "1px solid #d5e4de", borderRadius: 999, color: "#35514a", cursor: "pointer", font: "inherit", padding: "8px 12px" } satisfies React.CSSProperties;
const activeFilterButtonStyle = { background: "#16302b", borderColor: "#16302b", color: "#fff" } satisfies React.CSSProperties;
const notesInputStyle = { background: "#fff", border: "1px solid #cfe0d8", borderRadius: 10, color: "#16302b", font: "inherit", padding: "10px 12px", resize: "vertical" } satisfies React.CSSProperties;
