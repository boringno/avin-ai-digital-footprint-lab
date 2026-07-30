"use client";

import { useState } from "react";
import type { CSSProperties } from "react";

import type { RuntimeRegressionCase, RuntimeRegressionResult, RuntimeRelease } from "@/lib/admin-runtime-release-data";

type ApiData = { cases?: RuntimeRegressionCase[]; error?: string; ok?: boolean; releases?: RuntimeRelease[] };

export function RuntimeReleasesClient({ initialCases, initialReleases, staffName }: { initialCases: RuntimeRegressionCase[]; initialReleases: RuntimeRelease[]; staffName: string }) {
  const [busy, setBusy] = useState("");
  const [cases, setCases] = useState(initialCases);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [releaseName, setReleaseName] = useState("");
  const [releases, setReleases] = useState(initialReleases);
  const [results, setResults] = useState<RuntimeRegressionResult[]>([]);

  async function request(method: "PATCH" | "POST", body: Record<string, unknown>) {
    const response = await fetch("/api/admin/runtime-releases", { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method });
    const payload = (await response.json()) as ApiData & { results?: RuntimeRegressionResult[] };
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? "操作失敗。\n");
    if (payload.releases) setReleases(payload.releases);
    if (payload.cases) setCases(payload.cases);
    return payload;
  }

  async function createRelease() {
    if (!releaseName.trim() || busy) return;
    await perform("create", async () => {
      await request("POST", { action: "create", release_name: releaseName.trim() });
      setReleaseName("");
      setNotice("已建立快照。請先執行固定回歸題庫，再決定是否灰度啟用。");
    });
  }

  async function runTest(releaseId: string) {
    await perform(`test:${releaseId}`, async () => {
      const payload = await request("POST", { action: "test", release_id: releaseId });
      const nextResults = payload.results ?? [];
      setResults(nextResults);
      setNotice(nextResults.every((result) => result.passed) ? "固定回歸題庫全數通過。" : "有題目未通過，不能啟用正式回覆。\n");
    });
  }

  async function activate(releaseId: string, rollout: number) {
    const label = rollout === 100 ? "全量啟用" : `啟用 ${rollout}% 灰度`;
    if (!window.confirm(`確定要${label}嗎？未通過題庫時系統會拒絕啟用。`)) return;
    await perform(`activate:${releaseId}:${rollout}`, async () => {
      await request("PATCH", { action: "activate", release_id: releaseId, rollout_percentage: rollout });
      setNotice(rollout === 100 ? "已全量啟用。可隨時按「切回安全版本」。" : `已啟用 ${rollout}% 灰度，同一位客人會固定落在同一組。`);
    });
  }

  async function rollback() {
    if (!window.confirm("確定要立即切回 seed 安全版本嗎？這不會刪除任何 release。")) return;
    await perform("rollback", async () => {
      const reason = window.prompt("請簡短記錄回退原因（可留白）：") ?? "";
      await request("PATCH", { action: "rollback", reason });
      setNotice("已切回 seed 安全版本。所有客人立即停止使用 runtime release。\n");
    });
  }

  async function perform(key: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(key); setError(""); setNotice("");
    try { await action(); } catch (caught) { setError(caught instanceof Error ? caught.message : "操作失敗。\n"); } finally { setBusy(""); }
  }

  const activeRelease = releases.find((release) => release.status === "active");
  return <main style={pageStyle}>
    <div style={containerStyle}>
      <header style={headerStyle}>
        <div><p style={eyebrowStyle}>正式回覆發布</p><h1 style={{ margin: "4px 0" }}>LINE 回覆版本控制</h1><p style={subtleStyle}>登入：{staffName}。內容先建立快照、跑題庫，再灰度啟用；任何異常可立即切回安全版本。</p></div>
        <div style={actionsStyle}><a href="/admin/content" style={pillStyle}>內容管理</a><a href="/admin/workbench" style={pillStyle}>客服工作台</a></div>
      </header>
      <section style={activeStyle}>
        <strong>目前客人使用：{activeRelease ? `${activeRelease.releaseName}（${activeRelease.rolloutPercentage}%）` : "seed 安全版本"}</strong>
        <p style={{ ...subtleStyle, color: "#dfeee8" }}>seed 是既有、已驗證的 CSV 基線。release 僅覆蓋已核准的 FAQ 與活動內容，不能改寫安全分流、真人接手或預約規則。</p>
        {activeRelease ? <button disabled={Boolean(busy)} onClick={rollback} style={dangerStyle} type="button">{busy === "rollback" ? "切換中..." : "切回安全版本"}</button> : null}
      </section>
      {error ? <p style={errorStyle}>{error}</p> : null}{notice ? <p style={noticeStyle}>{notice}</p> : null}
      <section style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>1. 建立 release snapshot</h2><p style={subtleStyle}>系統會複製目前已發布的 FAQ／活動內容。之後原始草稿變動不會影響這個 snapshot。</p>
        <div style={formStyle}><input onChange={(event) => setReleaseName(event.target.value)} placeholder="例如：2026-08 活動與 FAQ v1" style={inputStyle} value={releaseName} /><button disabled={Boolean(busy) || !releaseName.trim()} onClick={createRelease} style={primaryStyle} type="button">{busy === "create" ? "建立中..." : "建立 snapshot"}</button></div>
      </section>
      <section style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>2. 固定回歸題庫</h2><p style={subtleStyle}>每次啟用前都會自動重跑。安全分流、真人接手、預約與館別資訊必須維持原本行為。</p>
        <ul style={caseListStyle}>{cases.map((testCase) => <li key={testCase.caseKey}><code>{testCase.caseKey}</code>：{testCase.customerMessage}</li>)}</ul>
      </section>
      <section style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>3. 測試與發布</h2>
        {releases.length === 0 ? <p style={subtleStyle}>尚未建立 release snapshot。</p> : <div style={releaseListStyle}>{releases.map((release) => <article key={release.id} style={releaseStyle}>
          <div><strong>{release.releaseName}</strong><span style={statusStyle(release.status)}>{statusLabel(release.status)}</span><p style={subtleStyle}>內容 {release.entryCount} 筆，建立於 {formatDate(release.createdAt)}{release.activatedAt ? `，最近啟用 ${formatDate(release.activatedAt)}` : ""}</p></div>
          <div style={actionsStyle}><button disabled={Boolean(busy)} onClick={() => runTest(release.id)} style={secondaryStyle} type="button">{busy === `test:${release.id}` ? "測試中..." : "跑回歸題庫"}</button>{release.status !== "archived" ? <><button disabled={Boolean(busy)} onClick={() => activate(release.id, 10)} style={secondaryStyle} type="button">10% 灰度</button><button disabled={Boolean(busy)} onClick={() => activate(release.id, 100)} style={primaryStyle} type="button">全量啟用</button></> : null}</div>
        </article>)}</div>}
      </section>
      {results.length ? <section style={panelStyle}><h2 style={{ marginTop: 0 }}>最近一次測試結果</h2>{results.map((result) => <p key={result.caseKey} style={result.passed ? passStyle : failStyle}><strong>{result.passed ? "通過" : "未通過"}</strong> {result.caseKey}：實際 {result.actualDecisionType}</p>)}</section> : null}
    </div>
  </main>;
}

function statusLabel(status: RuntimeRelease["status"]) { return ({ active: "使用中", archived: "已封存", draft: "草稿", ready: "待測試／可發布", rolled_back: "已回退" })[status]; }
function formatDate(value: string) { return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Taipei" }).format(new Date(value)); }

const pageStyle = { background: "#f6faf8", minHeight: "100vh", padding: "20px 12px 80px" } satisfies CSSProperties;
const containerStyle = { margin: "0 auto", maxWidth: 1080 } satisfies CSSProperties;
const headerStyle = { alignItems: "center", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", marginBottom: 18 } satisfies CSSProperties;
const eyebrowStyle = { color: "#5e7a72", fontSize: 14, margin: 0 } satisfies CSSProperties;
const subtleStyle = { color: "#66756f", fontSize: 14, lineHeight: 1.55, margin: "6px 0" } satisfies CSSProperties;
const activeStyle = { background: "#185c49", borderRadius: 18, color: "#fff", marginBottom: 16, padding: 18 } satisfies CSSProperties;
const panelStyle = { background: "#fff", border: "1px solid #d5e4de", borderRadius: 18, marginTop: 16, padding: 16 } satisfies CSSProperties;
const formStyle = { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 } satisfies CSSProperties;
const inputStyle = { border: "1px solid #cfe0d8", borderRadius: 10, flex: "1 1 280px", font: "inherit", minHeight: 42, padding: "9px 10px" } satisfies CSSProperties;
const actionsStyle = { display: "flex", flexWrap: "wrap", gap: 8 } satisfies CSSProperties;
const pillStyle = { background: "#fff", border: "1px solid #b9cbc5", borderRadius: 999, color: "#16302b", padding: "8px 12px", textDecoration: "none" } satisfies CSSProperties;
const primaryStyle = { background: "#159947", border: "1px solid #159947", borderRadius: 10, color: "#fff", cursor: "pointer", font: "inherit", minHeight: 42, padding: "9px 14px" } satisfies CSSProperties;
const secondaryStyle = { background: "#fff", border: "1px solid #b9cbc5", borderRadius: 10, color: "#16302b", cursor: "pointer", font: "inherit", minHeight: 42, padding: "9px 12px" } satisfies CSSProperties;
const dangerStyle = { background: "#fff6f4", border: "1px solid #e6aaa3", borderRadius: 10, color: "#8c332c", cursor: "pointer", font: "inherit", marginTop: 8, minHeight: 42, padding: "9px 14px" } satisfies CSSProperties;
const errorStyle = { background: "#fff2f0", border: "1px solid #f3b9b3", borderRadius: 12, color: "#8c2323", padding: 12 } satisfies CSSProperties;
const noticeStyle = { background: "#e8f7ed", border: "1px solid #b9e4c7", borderRadius: 12, color: "#17693a", padding: 12 } satisfies CSSProperties;
const caseListStyle = { color: "#35514a", lineHeight: 1.8, margin: "8px 0", paddingLeft: 24 } satisfies CSSProperties;
const releaseListStyle = { display: "grid", gap: 10 } satisfies CSSProperties;
const releaseStyle = { alignItems: "center", background: "#f8fcfa", border: "1px solid #dbeae3", borderRadius: 14, display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", padding: 14 } satisfies CSSProperties;
const statusStyle = (status: RuntimeRelease["status"]) => ({ background: status === "active" ? "#e8f7ed" : "#f2f5f3", border: "1px solid #d5e4de", borderRadius: 999, color: status === "active" ? "#17693a" : "#5d6c66", fontSize: 13, marginLeft: 8, padding: "5px 9px" });
const passStyle = { background: "#e8f7ed", borderRadius: 10, color: "#17693a", padding: 10 } satisfies CSSProperties;
const failStyle = { background: "#fff2f0", borderRadius: 10, color: "#8c2323", padding: 10 } satisfies CSSProperties;
