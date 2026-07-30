"use client";

import { useRef, useState } from "react";
import type { CSSProperties } from "react";

import type { AdminContentSubmission, ContentSubmissionStatus } from "@/lib/admin-content-submissions-data";

const statusLabels: Record<ContentSubmissionStatus, string> = {
  approved: "工程審核完成",
  in_review: "工程師審核中",
  needs_changes: "請診所補件",
  rejected: "不採用",
  submitted: "待工程師審核",
};

export function ContentSubmissionsClient({ canReview, canSubmit, canUseWorkbench, initialSubmissions }: {
  canReview: boolean;
  canSubmit: boolean;
  canUseWorkbench: boolean;
  initialSubmissions: AdminContentSubmission[];
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busyId, setBusyId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const [submissionNote, setSubmissionNote] = useState("");
  const [submissions, setSubmissions] = useState(initialSubmissions);

  async function parse(response: Response) {
    const body = (await response.json()) as { error?: string; ok?: boolean; signed_url?: string; submissions?: AdminContentSubmission[] };
    if (!response.ok || !body.ok) throw new Error(body.error ?? "操作失敗，請稍後再試。");
    return body;
  }

  async function refresh() {
    const body = await parse(await fetch("/api/admin/content-submissions", { cache: "no-store" }));
    setSubmissions(body.submissions ?? []);
  }

  async function submitFiles() {
    if (busyId || !canSubmit) return;
    const files = Array.from(fileInputRef.current?.files ?? []);
    setBusyId("submit");
    setError("");
    setNotice("");
    try {
      const body = new FormData();
      body.set("display_name", displayName);
      body.set("submission_note", submissionNote);
      files.forEach((file) => body.append("files", file));
      const result = await parse(await fetch("/api/admin/content-submissions", { body, method: "POST" }));
      setSubmissions(result.submissions ?? []);
      setDisplayName("");
      setSubmissionNote("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setNotice("資料已提交至私密工程審核佇列，尚未影響 AI 或 LINE 回覆。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "上傳失敗，請稍後再試。");
    } finally {
      setBusyId("");
    }
  }

  async function review(submissionId: string, action: "start_review" | "approve" | "needs_changes" | "reject") {
    if (busyId || !canReview) return;
    setBusyId(submissionId);
    setError("");
    setNotice("");
    try {
      const result = await parse(await fetch("/api/admin/content-submissions", {
        body: JSON.stringify({ action, review_note: reviewNote[submissionId] ?? "", submission_id: submissionId }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }));
      setSubmissions(result.submissions ?? []);
      setNotice(action === "approve" ? "工程審核完成。請由診所管理者確認後，再建立草稿與發布。" : action === "needs_changes" ? "已退回補件，診所端可依備註重新提交。" : "審核狀態已更新。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "審核失敗，請稍後再試。");
    } finally {
      setBusyId("");
    }
  }

  async function download(attachmentId: string) {
    try {
      const body = await parse(await fetch(`/api/admin/content-submissions?attachment_id=${encodeURIComponent(attachmentId)}`, { cache: "no-store" }));
      if (body.signed_url) window.open(body.signed_url, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "無法開啟私密附件。");
    }
  }

  return <main style={pageStyle}>
    <div style={containerStyle}>
      <header style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>內容交付中心</p>
          <h1 style={titleStyle}>資料提交與工程審核</h1>
          <p style={subtleStyle}>Word、PDF 與圖片只會保存在私密審核區，不會自動公開，也不會自動改變 AI 回覆。</p>
        </div>
        <div style={actionsStyle}>
          <a href="/admin/content" style={linkStyle}>內容管理</a>
          {canUseWorkbench ? <a href="/admin/workbench" style={linkStyle}>客服工作台</a> : null}
          <button disabled={Boolean(busyId)} onClick={() => void refresh()} style={buttonStyle} type="button">重新整理</button>
        </div>
      </header>

      {error ? <p style={errorStyle}>{error}</p> : null}
      {notice ? <p style={noticeStyle}>{notice}</p> : null}

      {canSubmit ? <section style={panelStyle}>
        <h2 style={sectionTitleStyle}>提交診所原始資料</h2>
        <p style={subtleStyle}>請附上已整理的 Word、PDF 或圖片，並說明希望新增、更新或停用的內容。工程師審核前不會影響客人。</p>
        <div style={formStyle}>
          <label style={labelStyle}>中文資料名稱<input onChange={(event) => setDisplayName(event.target.value)} placeholder="例如：2026 年 8 月肉毒活動與價格" style={inputStyle} value={displayName} /></label>
          <label style={labelStyle}>交付說明<textarea onChange={(event) => setSubmissionNote(event.target.value)} placeholder="例如：請確認活動日期、適用館別與對外用語；核准後交由診所管理者發布。" rows={4} style={inputStyle} value={submissionNote} /></label>
          <label style={labelStyle}>附件<input accept=".doc,.docx,.pdf,image/jpeg,image/png,image/webp" multiple ref={fileInputRef} style={inputStyle} type="file" /></label>
        </div>
        <p style={subtleStyle}>支援 DOC、DOCX、PDF、JPG、PNG、WEBP；單檔最多 10 MB。</p>
        <button disabled={busyId === "submit"} onClick={() => void submitFiles()} style={primaryButtonStyle} type="button">{busyId === "submit" ? "上傳中..." : "送交工程師審核"}</button>
      </section> : <section style={infoStyle}>你可查看提交紀錄，但不能上傳或審核原始資料。</section>}

      <section style={{ ...panelStyle, marginTop: 16 }}>
        <h2 style={sectionTitleStyle}>工程審核佇列</h2>
        {submissions.length === 0 ? <p style={subtleStyle}>目前沒有待處理資料。</p> : <div style={listStyle}>{submissions.map((submission) => <article key={submission.id} style={cardStyle}>
          <div style={cardHeaderStyle}><div><strong style={{ color: "#16302b", fontSize: 18 }}>{submission.displayName}</strong><p style={subtleStyle}>建立於 {formatDate(submission.createdAt)}</p></div><span style={statusStyle(submission.status)}>{statusLabels[submission.status]}</span></div>
          <p style={bodyStyle}>{submission.submissionNote}</p>
          <div style={attachmentStyle}>{submission.attachments.map((attachment) => <button key={attachment.id} onClick={() => void download(attachment.id)} style={fileButtonStyle} type="button">{attachment.originalFilename} ({formatBytes(attachment.byteSize)})</button>)}</div>
          {submission.reviewNote ? <p style={reviewStyle}>工程備註：{submission.reviewNote}</p> : null}
          {canReview ? <div style={reviewActionsStyle}>
            <input onChange={(event) => setReviewNote((current) => ({ ...current, [submission.id]: event.target.value }))} placeholder="工程審核備註；退回或不採用時必填" style={inputStyle} value={reviewNote[submission.id] ?? ""} />
            {submission.status === "submitted" ? <button disabled={busyId === submission.id} onClick={() => void review(submission.id, "start_review")} style={buttonStyle} type="button">開始審核</button> : null}
            {submission.status === "in_review" ? <><button disabled={busyId === submission.id} onClick={() => void review(submission.id, "approve")} style={primaryButtonStyle} type="button">工程審核完成</button><button disabled={busyId === submission.id} onClick={() => void review(submission.id, "needs_changes")} style={buttonStyle} type="button">退回補件</button><button disabled={busyId === submission.id} onClick={() => void review(submission.id, "reject")} style={dangerButtonStyle} type="button">不採用</button></> : null}
          </div> : null}
        </article>)}</div>}
      </section>
    </div>
  </main>;
}

function formatDate(value: string) { return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeZone: "Asia/Taipei" }).format(new Date(value)); }
function formatBytes(value: number) { return value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`; }

const pageStyle = { background: "#f6faf8", minHeight: "100vh", padding: "20px 12px 80px" } satisfies CSSProperties;
const containerStyle = { margin: "0 auto", maxWidth: 1080 } satisfies CSSProperties;
const headerStyle = { alignItems: "center", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", marginBottom: 18 } satisfies CSSProperties;
const titleStyle = { color: "#16302b", margin: "4px 0 0" } satisfies CSSProperties;
const eyebrowStyle = { color: "#5e7a72", fontSize: 14, margin: 0 } satisfies CSSProperties;
const subtleStyle = { color: "#66756f", fontSize: 14, lineHeight: 1.55, margin: "6px 0 0" } satisfies CSSProperties;
const bodyStyle = { color: "#16302b", lineHeight: 1.55, whiteSpace: "pre-wrap" } satisfies CSSProperties;
const panelStyle = { background: "#fff", border: "1px solid #d5e4de", borderRadius: 18, padding: 16 } satisfies CSSProperties;
const infoStyle = { background: "#edf6f1", border: "1px solid #cee3d9", borderRadius: 14, color: "#35514a", marginBottom: 16, padding: 14 } satisfies CSSProperties;
const sectionTitleStyle = { color: "#16302b", margin: 0 } satisfies CSSProperties;
const actionsStyle = { display: "flex", flexWrap: "wrap", gap: 8 } satisfies CSSProperties;
const linkStyle = { background: "#fff", border: "1px solid #b9cbc5", borderRadius: 999, color: "#16302b", padding: "8px 12px", textDecoration: "none" } satisfies CSSProperties;
const buttonStyle = { background: "#fff", border: "1px solid #b9cbc5", borderRadius: 10, color: "#16302b", cursor: "pointer", font: "inherit", minHeight: 42, padding: "9px 12px" } satisfies CSSProperties;
const primaryButtonStyle = { background: "#159947", border: "1px solid #159947", borderRadius: 10, color: "#fff", cursor: "pointer", font: "inherit", minHeight: 42, padding: "9px 14px" } satisfies CSSProperties;
const dangerButtonStyle = { background: "#fff6f4", border: "1px solid #e6aaa3", borderRadius: 10, color: "#8c332c", cursor: "pointer", font: "inherit", minHeight: 42, padding: "9px 12px" } satisfies CSSProperties;
const formStyle = { display: "grid", gap: 12, marginTop: 16 } satisfies CSSProperties;
const labelStyle = { color: "#35514a", display: "grid", fontSize: 13, gap: 6 } satisfies CSSProperties;
const inputStyle = { background: "#fff", border: "1px solid #cfe0d8", borderRadius: 10, color: "#16302b", font: "inherit", minHeight: 42, padding: "9px 10px", width: "100%" } satisfies CSSProperties;
const listStyle = { display: "grid", gap: 12, marginTop: 14 } satisfies CSSProperties;
const cardStyle = { background: "#f8fcfa", border: "1px solid #dbeae3", borderRadius: 14, padding: 14 } satisfies CSSProperties;
const cardHeaderStyle = { alignItems: "center", display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between" } satisfies CSSProperties;
const attachmentStyle = { display: "flex", flexWrap: "wrap", gap: 8 } satisfies CSSProperties;
const fileButtonStyle = { background: "#fff", border: "1px solid #b9cbc5", borderRadius: 8, color: "#16302b", cursor: "pointer", font: "inherit", padding: "7px 9px" } satisfies CSSProperties;
const reviewStyle = { background: "#fff8e6", borderRadius: 10, color: "#725300", padding: 10 } satisfies CSSProperties;
const reviewActionsStyle = { display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", marginTop: 12 } satisfies CSSProperties;
const statusStyle = (status: ContentSubmissionStatus) => ({ background: status === "approved" ? "#e8f7ed" : status === "needs_changes" || status === "rejected" ? "#fff2f0" : "#fff8e6", borderRadius: 999, color: status === "approved" ? "#17693a" : status === "needs_changes" || status === "rejected" ? "#8c2323" : "#7a5a00", fontSize: 13, padding: "5px 9px" });
const errorStyle = { background: "#fff2f0", border: "1px solid #f3b9b3", borderRadius: 12, color: "#8c2323", marginBottom: 16, padding: 12 } satisfies CSSProperties;
const noticeStyle = { background: "#e8f7ed", border: "1px solid #b9e4c7", borderRadius: 12, color: "#17693a", marginBottom: 16, padding: 12 } satisfies CSSProperties;
