"use client";

import { useState } from "react";

type Branch = "高雄館" | "台中館" | "桃園館" | "林口館";
type Scope = "clinic" | "platform";
type Recipient = { branch: Branch; email: string; id: string; scope: Scope };

const branches: Branch[] = ["高雄館", "台中館", "桃園館", "林口館"];

export function NotificationRecipientsClient({ initialRecipients, scope }: { initialRecipients: Recipient[]; scope: Scope }) {
  const [recipients, setRecipients] = useState(initialRecipients);
  const [drafts, setDrafts] = useState<Record<Branch, string[]>>(() => toDrafts(initialRecipients));
  const [busyBranch, setBusyBranch] = useState<Branch | "">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const limit = scope === "clinic" ? 3 : 10;
  const title = scope === "clinic" ? "各館真人接手通知" : "工程通知測試設定";

  async function saveBranch(branch: Branch) {
    if (busyBranch) return;
    setBusyBranch(branch);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/notifications/recipients", {
        body: JSON.stringify({ branch, emails: drafts[branch] }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      const body = (await response.json()) as { error?: string; ok?: boolean; recipients?: Recipient[] };
      if (!response.ok || !body.ok) throw new Error(body.error ?? "儲存失敗，請稍後再試。");
      const nextRecipients = body.recipients ?? [];
      setRecipients(nextRecipients);
      setDrafts(toDrafts(nextRecipients));
      setNotice(`${branch}的通知收件人已儲存。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "儲存失敗，請稍後再試。");
    } finally {
      setBusyBranch("");
    }
  }

  async function sendTest(branch: Branch) {
    if (busyBranch) return;
    setBusyBranch(branch);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/notifications/handoff-digest-test", {
        body: JSON.stringify({ branch }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json()) as { error?: string; ok?: boolean };
      if (!response.ok || !body.ok) throw new Error(body.error ?? "測試信未送出。");
      setNotice(`${branch}測試信已寄出；信件不會包含任何客人資料。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "測試信未送出。");
    } finally {
      setBusyBranch("");
    }
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={headerStyle}>
          <div>
            <p style={eyebrowStyle}>{scope === "clinic" ? "診所通知設定" : "平台維運設定"}</p>
            <h1 style={{ margin: "4px 0 0" }}>{title}</h1>
            <p style={introStyle}>
              {scope === "clinic"
                ? "客服下班後與週末的待接手摘要，會寄給各館指定人員。每館最多 3 個收件信箱。"
                : "此區僅供工程維運測試使用；不會顯示或改動診所端設定。每館最多 10 個工程測試信箱。"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a href="/admin/workbench" style={linkButtonStyle}>客服工作台</a>
            <a href="/admin/team" style={linkButtonStyle}>人員管理</a>
          </div>
        </header>

        {error ? <p style={errorStyle}>{error}</p> : null}
        {notice ? <p style={noticeStyle}>{notice}</p> : null}

        <section style={noticePanelStyle}>
          <strong>通知時段</strong>
          <span>測試期間：週一至週五 14:00、週六 16:00、週日 16:00（台灣時間）。只有該館仍有待接手／待聯繫客人時才會寄送。</span>
          <span>信件僅提供待處理數量與登入工作台連結，不包含客人姓名、電話、LINE ID 或對話內容。</span>
        </section>

        <div style={gridStyle}>
          {branches.map((branch) => {
            const emails = drafts[branch];
            const isBusy = busyBranch === branch;
            return (
              <section key={branch} style={panelStyle}>
                <h2 style={{ margin: 0 }}>{branch}</h2>
                <p style={helperStyle}>{scope === "clinic" ? "可填寫館長、客服主管或值班人員信箱。" : "可加入工程端收信帳號，用於驗證寄送流程。"}</p>
                <div style={{ display: "grid", gap: 8 }}>
                  {emails.map((email, index) => (
                    <div key={`${branch}-${index}`} style={{ display: "flex", gap: 8 }}>
                      <input aria-label={`${branch} 收件信箱 ${index + 1}`} onChange={(event) => setDrafts((current) => ({ ...current, [branch]: current[branch].map((value, itemIndex) => itemIndex === index ? event.target.value : value) }))} placeholder="name@example.com" type="email" value={email} style={inputStyle} />
                      <button aria-label={`移除第 ${index + 1} 個收件信箱`} disabled={isBusy} onClick={() => setDrafts((current) => ({ ...current, [branch]: current[branch].filter((_, itemIndex) => itemIndex !== index) }))} style={removeButtonStyle} type="button">移除</button>
                    </div>
                  ))}
                </div>
                {emails.length < limit ? <button disabled={isBusy} onClick={() => setDrafts((current) => ({ ...current, [branch]: [...current[branch], ""] }))} style={secondaryButtonStyle} type="button">新增收件信箱</button> : null}
                <div style={actionRowStyle}>
                  <button disabled={isBusy} onClick={() => void saveBranch(branch)} style={primaryButtonStyle} type="button">{isBusy ? "處理中..." : "儲存設定"}</button>
                  <button disabled={isBusy || emails.filter(Boolean).length === 0} onClick={() => void sendTest(branch)} style={secondaryButtonStyle} type="button">寄送測試信</button>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function toDrafts(recipients: Recipient[]) {
  return Object.fromEntries(branches.map((branch) => [branch, recipients.filter((recipient) => recipient.branch === branch).map((recipient) => recipient.email)])) as Record<Branch, string[]>;
}

const pageStyle = { background: "#f6faf8", minHeight: "100vh", padding: "20px 12px 80px" } satisfies React.CSSProperties;
const shellStyle = { margin: "0 auto", maxWidth: 1000 } satisfies React.CSSProperties;
const headerStyle = { alignItems: "center", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", marginBottom: 18 } satisfies React.CSSProperties;
const eyebrowStyle = { color: "#5e7a72", fontSize: 14, margin: 0 } satisfies React.CSSProperties;
const introStyle = { color: "#66756f", fontSize: 14, lineHeight: 1.55, margin: "6px 0 0", maxWidth: 640 } satisfies React.CSSProperties;
const noticePanelStyle = { background: "#eaf6ef", border: "1px solid #b9e3c5", borderRadius: 16, color: "#23563b", display: "grid", fontSize: 14, gap: 6, lineHeight: 1.5, marginBottom: 16, padding: 16 } satisfies React.CSSProperties;
const gridStyle = { display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))" } satisfies React.CSSProperties;
const panelStyle = { background: "#fff", border: "1px solid #d5e4de", borderRadius: 18, display: "grid", gap: 12, padding: 18 } satisfies React.CSSProperties;
const helperStyle = { color: "#66756f", fontSize: 13, lineHeight: 1.5, margin: 0 } satisfies React.CSSProperties;
const inputStyle = { border: "1px solid #b9cbc5", borderRadius: 10, font: "inherit", minHeight: 44, padding: "10px 12px", width: "100%" } satisfies React.CSSProperties;
const actionRowStyle = { display: "flex", flexWrap: "wrap", gap: 8 } satisfies React.CSSProperties;
const primaryButtonStyle = { background: "#159947", border: 0, borderRadius: 10, color: "#fff", cursor: "pointer", font: "inherit", fontWeight: 700, minHeight: 44, padding: "10px 14px" } satisfies React.CSSProperties;
const secondaryButtonStyle = { background: "#fff", border: "1px solid #b9cbc5", borderRadius: 10, color: "#173d31", cursor: "pointer", font: "inherit", minHeight: 44, padding: "10px 14px" } satisfies React.CSSProperties;
const removeButtonStyle = { background: "#fff", border: "1px solid #efb8b8", borderRadius: 10, color: "#9c2323", cursor: "pointer", font: "inherit", minHeight: 44, padding: "8px 10px" } satisfies React.CSSProperties;
const linkButtonStyle = { background: "#fff", border: "1px solid #b9cbc5", borderRadius: 999, color: "#173d31", padding: "9px 14px", textDecoration: "none" } satisfies React.CSSProperties;
const errorStyle = { background: "#fff1f0", border: "1px solid #f5b8b5", borderRadius: 12, color: "#a02621", margin: "0 0 14px", padding: 12 } satisfies React.CSSProperties;
const noticeStyle = { background: "#e9f8ee", border: "1px solid #b9e7c7", borderRadius: 12, color: "#246a3f", margin: "0 0 14px", padding: 12 } satisfies React.CSSProperties;
