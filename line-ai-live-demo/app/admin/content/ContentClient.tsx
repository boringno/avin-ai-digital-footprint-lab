"use client";

import { useState } from "react";
import type { CSSProperties } from "react";

import type { AdminContentItem, AdminContentVersion } from "@/lib/admin-content-data";
import {
  readCampaignApplicabilityFields,
  readCampaignBookingFields,
  readCampaignQuoteSettings,
  writeCampaignApplicabilityFields,
  writeCampaignBookingFields,
  writeCampaignQuoteSettings,
  type EditableContentType,
} from "@/lib/content-versioning";

type DraftForm = {
  aliases: string;
  answerText: string;
  bookingTreatments: string;
  branchScope: string;
  campaignName: string;
  changeReason: string;
  contentKey: string;
  displayName: string;
  contentType: EditableContentType;
  contentPurpose: ContentPurpose;
  dose: string;
  endAt: string;
  fallbackMessage: string;
  priceText: string;
  packageKey: string;
  questionPattern: string;
  quotePriority: string;
  startAt: string;
  sessionCount: string;
  startsBookingIntake: boolean;
  topic: string;
  treatmentName: string;
  variantKey: string;
};

type ContentPurpose =
  | "faq_general"
  | "clinic_information"
  | "payment"
  | "first_visit"
  | "booking"
  | "treatment_intro"
  | "campaign_pricing"
  | "aftercare"
  | "pregnancy_nursing"
  | "other";

const contentPurposeOptions: Array<{ label: string; type: EditableContentType; value: ContentPurpose }> = [
  { label: "常見問題", type: "faq", value: "faq_general" },
  { label: "館別、地址與營業資訊", type: "faq", value: "clinic_information" },
  { label: "付款方式", type: "faq", value: "payment" },
  { label: "初診準備", type: "faq", value: "first_visit" },
  { label: "預約、改期或取消", type: "faq", value: "booking" },
  { label: "療程第一層介紹", type: "faq", value: "treatment_intro" },
  { label: "活動與價格", type: "campaign", value: "campaign_pricing" },
  { label: "術後照護", type: "faq", value: "aftercare" },
  { label: "懷孕、哺乳或備孕", type: "faq", value: "pregnancy_nursing" },
  { label: "其他（需工程師判定）", type: "faq", value: "other" },
];

function contentPurposeFor(type: EditableContentType, payload: Record<string, unknown>): ContentPurpose {
  const value = payload.content_purpose;
  if (typeof value === "string" && contentPurposeOptions.some((option) => option.value === value)) {
    return value as ContentPurpose;
  }

  return type === "campaign" ? "campaign_pricing" : "faq_general";
}

const emptyDraft: DraftForm = {
  aliases: "",
  answerText: "",
  bookingTreatments: "",
  branchScope: "全館",
  campaignName: "",
  changeReason: "",
  contentKey: "",
  displayName: "",
  contentType: "faq",
  contentPurpose: "faq_general",
  dose: "",
  endAt: "",
  fallbackMessage: "請由客服協助確認最新活動內容。",
  priceText: "",
  packageKey: "",
  questionPattern: "",
  quotePriority: "0",
  startAt: "",
  sessionCount: "",
  startsBookingIntake: false,
  topic: "",
  treatmentName: "",
  variantKey: "",
};

const statusLabels: Record<AdminContentVersion["status"], string> = {
  approved: "工程審核完成",
  changes_requested: "請修正後重送",
  disabled: "已停用",
  draft: "草稿",
  expired: "已過期",
  in_review: "待審核",
  published: "目前生效",
};

export function ContentClient({
  canEdit,
  canPublish,
  canReview,
  canUseWorkbench,
  initialItems,
  staffName,
}: {
  canEdit: boolean;
  canPublish: boolean;
  canReview: boolean;
  canUseWorkbench: boolean;
  initialItems: AdminContentItem[];
  staffName: string;
}) {
  const [busyId, setBusyId] = useState("");
  const [draft, setDraft] = useState<DraftForm>(emptyDraft);
  const [editingVersionLabel, setEditingVersionLabel] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [items, setItems] = useState(initialItems);
  const [notice, setNotice] = useState("");

  async function refresh() {
    const response = await fetch("/api/admin/content", { cache: "no-store" });
    const body = (await response.json()) as { error?: string; items?: AdminContentItem[]; ok?: boolean };
    if (!response.ok || !body.ok) throw new Error(body.error ?? "內容清單暫時無法讀取，請重新整理。");
    setItems(body.items ?? []);
  }

  async function createDraft() {
    if (busyId || !canEdit) return;
    setBusyId("new-draft");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/content", {
        body: JSON.stringify({
          change_reason: draft.changeReason,
          content_key: draft.contentKey.trim(),
          content_type: contentPurposeOptions.find((option) => option.value === draft.contentPurpose)?.type ?? draft.contentType,
          display_name: draft.displayName.trim(),
          end_at: draft.endAt ? new Date(draft.endAt).toISOString() : null,
          payload: buildPayload(draft),
          start_at: draft.startAt ? new Date(draft.startAt).toISOString() : null,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json()) as { error?: string; items?: AdminContentItem[]; ok?: boolean };
      if (!response.ok || !body.ok) throw new Error(body.error ?? "建立草稿失敗，請重新確認內容。");
      setItems(body.items ?? []);
      setDraft(emptyDraft);
      setEditingVersionLabel(null);
      setNotice("已建立新版本草稿，尚未對客人生效。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "建立草稿失敗，請重新確認內容。");
    } finally {
      setBusyId("");
    }
  }

  async function act(versionId: string, action: "submit" | "approve" | "request_changes" | "publish" | "disable") {
    if (busyId) return;
    setBusyId(versionId);
    setError("");
    setNotice("");
    try {
      const reviewNote = action === "approve" || action === "request_changes" ? window.prompt("工程審核備註（退回修正時請填寫原因）") ?? "" : "";
      const response = await fetch("/api/admin/content", {
        body: JSON.stringify({ action, review_note: reviewNote, version_id: versionId }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const body = (await response.json()) as { error?: string; items?: AdminContentItem[]; ok?: boolean };
      if (!response.ok || !body.ok) throw new Error(body.error ?? "內容操作失敗，請重新整理後再試。");
      setItems(body.items ?? []);
      setNotice(
        action === "submit" ? "草稿已送交工程師審核，尚未對客人生效。"
          : action === "approve" ? "工程審核完成，診所管理者或工程師可確認發布。"
          : action === "request_changes" ? "已退回修正；請依工程備註建立新草稿後重送。"
          : action === "publish" ? "內容已發布。runtime 尚未切換前，不會改變 LINE 回覆。"
          : "版本已停用。",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "內容操作失敗，請重新整理後再試。");
    } finally {
      setBusyId("");
    }
  }

  function editFromVersion(item: AdminContentItem, version: AdminContentVersion) {
    const payload = version.payload;
    const campaignApplicability = readCampaignApplicabilityFields(payload);
    const campaignBooking = readCampaignBookingFields(payload);
    const campaignQuote = readCampaignQuoteSettings(payload);
    setDraft({
      aliases: Array.isArray(payload.aliases) ? payload.aliases.filter((value): value is string => typeof value === "string").join("、") : "",
      answerText: stringValue(payload.answer_text),
      bookingTreatments: campaignBooking.bookingTreatments.join("、"),
      branchScope: stringValue(payload.branch_scope) || "全館",
      campaignName: stringValue(payload.campaign_name),
      changeReason: `依版本 ${version.versionNo} 更新`,
      contentKey: item.contentKey,
      displayName: item.displayName,
      contentType: item.contentType,
      contentPurpose: contentPurposeFor(item.contentType, payload),
      dose: campaignApplicability.dose,
      endAt: toDateTimeLocal(version.endAt),
      fallbackMessage: stringValue(payload.fallback_message) || "請由客服協助確認最新活動內容。",
      priceText: stringValue(payload.customer_price_text) || stringValue(payload.price_text),
      packageKey: campaignApplicability.packageKey,
      questionPattern: stringValue(payload.question_pattern),
      quotePriority: campaignQuote.quotePriority || "0",
      startAt: toDateTimeLocal(version.startAt),
      sessionCount: campaignApplicability.sessionCount,
      startsBookingIntake: campaignBooking.startsBookingIntake,
      topic: stringValue(payload.topic),
      treatmentName: stringValue(payload.treatment_name),
      variantKey: campaignApplicability.variantKey,
    });
    setEditingVersionLabel(`${item.displayName}／版本 ${version.versionNo}`);
    setNotice(`已帶入版本 ${version.versionNo}。儲存後會建立新草稿，不會覆寫舊版本。`);
    window.requestAnimationFrame(() => {
      document.getElementById("content-draft-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <header style={headerStyle}>
          <div>
            <p style={eyebrowStyle}>正式內容管理</p>
            <h1 style={{ color: "#16302b", margin: "4px 0 0" }}>FAQ 與活動版本</h1>
            <p style={subtleStyle}>登入：{staffName} · 草稿與審核紀錄都會保留。此頁目前不會直接改變 LINE 回覆。</p>
          </div>
          <div style={headerActionsStyle}>
            <a href="/admin/reports" style={pillLinkStyle}>月報</a>
            <a href="/admin/schedules" style={pillLinkStyle}>門診班表</a>
            {canPublish ? <a href="/admin/runtime-releases" style={pillLinkStyle}>正式回覆發布</a> : null}
            <a href="/admin/content-submissions" style={pillLinkStyle}>資料提交</a>
            {canUseWorkbench ? <a href="/admin/workbench" style={pillLinkStyle}>客服工作台</a> : null}
            <button disabled={Boolean(busyId)} onClick={() => void refresh()} style={pillButtonStyle} type="button">重新整理</button>
            <form action="/api/admin/auth/logout" method="post"><button style={pillButtonStyle} type="submit">登出</button></form>
          </div>
        </header>

        {error ? <p style={errorStyle}>{error}</p> : null}
        {notice ? <p style={noticeStyle}>{notice}</p> : null}

        {canEdit ? <DraftEditor busy={busyId === "new-draft"} draft={draft} editingVersionLabel={editingVersionLabel} onCancelEdit={() => { setDraft(emptyDraft); setEditingVersionLabel(null); setNotice("已取消帶入版本，您可以建立新的空白草稿。"); }} onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} onSave={() => void createDraft()} /> : <section style={infoStyle}>您目前可查看內容與版本歷史，但不能建立、送審或發布內容。</section>}

        <section style={panelStyle}>
          <div style={{ alignItems: "baseline", display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", marginBottom: 14 }}>
            <div><h2 style={{ color: "#16302b", margin: 0 }}>內容與版本歷史</h2><p style={subtleStyle}>發布新版本時，舊的正式版本會保留並自動停用，可供工程師追查或人工恢復。</p></div>
            <span style={countStyle}>{items.length} 個內容項目</span>
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            {items.length === 0 ? <p style={subtleStyle}>目前還沒有內容版本。可從上方建立第一份 FAQ 或活動草稿。</p> : items.map((item) => (
              <article key={item.id} style={itemStyle}>
                <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>
                  <div><strong style={{ color: "#16302b", fontSize: 18 }}>{item.displayName}</strong><span style={keyStyle}>系統編號：{item.contentKey}</span></div>
                  <span style={item.currentVersionId ? activeBadgeStyle : mutedBadgeStyle}>{item.currentVersionId ? "有正式版本" : "尚未發布"}</span>
                </div>
                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                  {item.versions.map((version) => <VersionCard actionBusy={busyId === version.id} canEdit={canEdit} canPublish={canPublish} canReview={canReview} item={item} key={version.id} onAction={(action) => void act(version.id, action)} onEdit={() => editFromVersion(item, version)} version={version} />)}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function DraftEditor({ busy, draft, editingVersionLabel, onCancelEdit, onChange, onSave }: { busy: boolean; draft: DraftForm; editingVersionLabel: string | null; onCancelEdit: () => void; onChange: (patch: Partial<DraftForm>) => void; onSave: () => void }) {
  const isFaq = draft.contentType === "faq";
  return <section id="content-draft-editor" style={{ ...panelStyle, marginBottom: 16 }}>
    <div><h2 style={{ color: "#16302b", margin: 0 }}>{editingVersionLabel ? "修改既有版本" : "建立新版本草稿"}</h2><p style={subtleStyle}>每次儲存都新增一個版本，舊版本不會被覆寫。</p></div>
    {editingVersionLabel ? <div style={editingNoticeStyle}><span>正在以「{editingVersionLabel}」建立新草稿。</span><button disabled={busy} onClick={onCancelEdit} style={compactButtonStyle} type="button">取消帶入</button></div> : null}
    <div style={formGridStyle}>
      <label style={labelStyle}>內容用途<select disabled={busy} onChange={(event) => { const contentPurpose = event.target.value as ContentPurpose; const option = contentPurposeOptions.find((item) => item.value === contentPurpose); onChange({ contentPurpose, contentType: option?.type ?? "faq" }); }} style={inputStyle} value={draft.contentPurpose}>{contentPurposeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label style={labelStyle}>中文內容名稱<input disabled={busy} onChange={(event) => onChange({ displayName: event.target.value })} placeholder="例如：高雄館停車資訊" style={inputStyle} value={draft.displayName} /></label>
      {isFaq ? <><label style={labelStyle}>問題分類<input disabled={busy} onChange={(event) => onChange({ topic: event.target.value })} placeholder="例如: 價格說明" style={inputStyle} value={draft.topic} /></label><label style={labelStyle}>客人常見問法<input disabled={busy} onChange={(event) => onChange({ questionPattern: event.target.value })} placeholder="例如: 肉毒價格怎麼算" style={inputStyle} value={draft.questionPattern} /></label><label style={{ ...labelStyle, gridColumn: "1 / -1" }}>核准回覆內容<textarea disabled={busy} onChange={(event) => onChange({ answerText: event.target.value })} rows={5} style={inputStyle} value={draft.answerText} /></label></> : <><label style={labelStyle}>活動名稱<input disabled={busy} onChange={(event) => onChange({ campaignName: event.target.value })} style={inputStyle} value={draft.campaignName} /></label><label style={labelStyle}>適用療程<input disabled={busy} onChange={(event) => onChange({ treatmentName: event.target.value })} style={inputStyle} value={draft.treatmentName} /></label><label style={labelStyle}>活動價格說明<input disabled={busy} onChange={(event) => onChange({ priceText: event.target.value })} style={inputStyle} value={draft.priceText} /></label><label style={labelStyle}>適用館別<input disabled={busy} onChange={(event) => onChange({ branchScope: event.target.value })} style={inputStyle} value={draft.branchScope} /></label><label style={labelStyle}>一般詢價主方案順位（選填）<input disabled={busy} max="10000" min="0" onChange={(event) => onChange({ quotePriority: event.target.value })} placeholder="數字越大越優先" style={inputStyle} type="number" value={draft.quotePriority} /></label><label style={labelStyle}>方案代碼（選填）<input disabled={busy} onChange={(event) => onChange({ packageKey: event.target.value })} placeholder="例如：six_minute" style={inputStyle} value={draft.packageKey} /></label><label style={labelStyle}>規格版本（選填）<input disabled={busy} onChange={(event) => onChange({ variantKey: event.target.value })} placeholder="例如：premium" style={inputStyle} value={draft.variantKey} /></label><label style={labelStyle}>劑量／發數（選填）<input disabled={busy} onChange={(event) => onChange({ dose: event.target.value })} placeholder="例如：200發" style={inputStyle} value={draft.dose} /></label><label style={labelStyle}>堂數（選填）<input disabled={busy} min="1" onChange={(event) => onChange({ sessionCount: event.target.value })} style={inputStyle} type="number" value={draft.sessionCount} /></label><label style={labelStyle}>辨識別名（用頓號分隔）<input disabled={busy} onChange={(event) => onChange({ aliases: event.target.value })} style={inputStyle} value={draft.aliases} /></label><label style={labelStyle}>預約療程組合（用頓號分隔）<input disabled={busy} onChange={(event) => onChange({ bookingTreatments: event.target.value })} placeholder="例如：ONDA PRO、肉毒" style={inputStyle} value={draft.bookingTreatments} /></label><label style={{ ...labelStyle, alignContent: "center", gridTemplateColumns: "auto 1fr" }}><input checked={draft.startsBookingIntake} disabled={busy} onChange={(event) => onChange({ startsBookingIntake: event.target.checked })} type="checkbox" />價格回覆後接續收集預約資料</label><label style={labelStyle}>開始時間<input disabled={busy} onChange={(event) => onChange({ startAt: event.target.value })} style={inputStyle} type="datetime-local" value={draft.startAt} /></label><label style={labelStyle}>結束時間<input disabled={busy} onChange={(event) => onChange({ endAt: event.target.value })} style={inputStyle} type="datetime-local" value={draft.endAt} /></label><label style={{ ...labelStyle, gridColumn: "1 / -1" }}>無法直接套用時的保守說明<textarea disabled={busy} onChange={(event) => onChange({ fallbackMessage: event.target.value })} rows={3} style={inputStyle} value={draft.fallbackMessage} /></label></>}
      <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>修改原因<input disabled={busy} onChange={(event) => onChange({ changeReason: event.target.value })} placeholder="例如: 更新 8 月活動內容" style={inputStyle} value={draft.changeReason} /></label>
    </div>
    <button disabled={busy} onClick={onSave} style={primaryButtonStyle} type="button">{busy ? "建立中..." : "建立草稿"}</button>
  </section>;
}

function VersionCard({ actionBusy, canEdit, canPublish, canReview, item, onAction, onEdit, version }: { actionBusy: boolean; canEdit: boolean; canPublish: boolean; canReview: boolean; item: AdminContentItem; onAction: (action: "submit" | "approve" | "request_changes" | "publish" | "disable") => void; onEdit: () => void; version: AdminContentVersion }) {
  return <div style={versionStyle}>
    <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}><div><strong>版本 {version.versionNo}</strong><span style={statusStyle(version.status)}>{statusLabels[version.status]}</span></div><span style={subtleStyle}>建立於 {formatDate(version.createdAt)}</span></div>
    <p style={versionTextStyle}>{summarizePayload(item.contentType, version.payload)}</p>
    <p style={subtleStyle}>修改原因：{version.changeReason}{version.startAt || version.endAt ? ` · 有效期間：${formatRange(version.startAt, version.endAt)}` : ""}</p>
    <div style={versionActionsStyle}>
      {canEdit ? <button disabled={actionBusy} onClick={onEdit} style={secondaryButtonStyle} type="button">以此版本修改</button> : null}
      {canEdit && version.status === "draft" ? <button disabled={actionBusy} onClick={() => onAction("submit")} style={secondaryButtonStyle} type="button">{actionBusy ? "處理中..." : "送審"}</button> : null}
      {canReview && version.status === "in_review" ? <><button disabled={actionBusy} onClick={() => onAction("approve")} style={primaryButtonStyle} type="button">{actionBusy ? "處理中..." : "工程審核完成"}</button><button disabled={actionBusy} onClick={() => onAction("request_changes")} style={secondaryButtonStyle} type="button">退回修正</button></> : null}
      {canPublish && version.status === "approved" ? <button disabled={actionBusy} onClick={() => onAction("publish")} style={primaryButtonStyle} type="button">{actionBusy ? "發布中..." : "確認發布"}</button> : null}
      {canPublish && (version.status === "draft" || version.status === "in_review" || version.status === "changes_requested" || version.status === "approved" || version.status === "published") ? <button disabled={actionBusy} onClick={() => onAction("disable")} style={dangerButtonStyle} type="button">{actionBusy ? "處理中..." : "停用"}</button> : null}
    </div>
  </div>;
}

function buildPayload(draft: DraftForm) {
  const contentType = contentPurposeOptions.find((option) => option.value === draft.contentPurpose)?.type ?? draft.contentType;
  if (contentType === "faq") return { answer_text: draft.answerText.trim(), content_purpose: draft.contentPurpose, question_pattern: draft.questionPattern.trim(), topic: draft.topic.trim() };
  return { aliases: draft.aliases.split(/[、,，]/).map((value) => value.trim()).filter(Boolean), branch_scope: draft.branchScope.trim(), campaign_name: draft.campaignName.trim(), content_purpose: draft.contentPurpose, customer_price_text: draft.priceText.trim(), fallback_message: draft.fallbackMessage.trim(), price_text: draft.priceText.trim(), treatment_name: draft.treatmentName.trim(), ...writeCampaignApplicabilityFields({ dose: draft.dose, packageKey: draft.packageKey, sessionCount: draft.sessionCount, variantKey: draft.variantKey }), ...writeCampaignBookingFields({ bookingTreatments: draft.bookingTreatments, startsBookingIntake: draft.startsBookingIntake }), ...writeCampaignQuoteSettings({ quotePriority: draft.quotePriority }) };
}
function stringValue(value: unknown) { return typeof value === "string" ? value : ""; }
function toDateTimeLocal(value: string | null) { return value ? new Date(value).toISOString().slice(0, 16) : ""; }
function summarizePayload(type: EditableContentType, payload: Record<string, unknown>) { return type === "faq" ? `${stringValue(payload.topic)}：${stringValue(payload.question_pattern)}` : `${stringValue(payload.campaign_name)} · ${stringValue(payload.treatment_name)} · ${stringValue(payload.price_text)}`; }
function formatDate(value: string) { return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeZone: "Asia/Taipei" }).format(new Date(value)); }
function formatRange(startAt: string | null, endAt: string | null) { return `${startAt ? formatDate(startAt) : "即日起"} 至 ${endAt ? formatDate(endAt) : "未設定結束"}`; }

const pageStyle = { background: "#f6faf8", minHeight: "100vh", padding: "20px 12px 80px" } satisfies CSSProperties;
const containerStyle = { margin: "0 auto", maxWidth: 1080 } satisfies CSSProperties;
const headerStyle = { alignItems: "center", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", marginBottom: 18 } satisfies CSSProperties;
const headerActionsStyle = { display: "flex", flexWrap: "wrap", gap: 8 } satisfies CSSProperties;
const eyebrowStyle = { color: "#5e7a72", fontSize: 14, margin: 0 } satisfies CSSProperties;
const subtleStyle = { color: "#66756f", fontSize: 14, lineHeight: 1.55, margin: "6px 0 0" } satisfies CSSProperties;
const panelStyle = { background: "#fff", border: "1px solid #d5e4de", borderRadius: 18, padding: 16 } satisfies CSSProperties;
const infoStyle = { background: "#edf6f1", border: "1px solid #cee3d9", borderRadius: 14, color: "#35514a", marginBottom: 16, padding: 14 } satisfies CSSProperties;
const formGridStyle = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", margin: "16px 0" } satisfies CSSProperties;
const labelStyle = { color: "#35514a", display: "grid", fontSize: 13, gap: 6 } satisfies CSSProperties;
const inputStyle = { background: "#fff", border: "1px solid #cfe0d8", borderRadius: 10, color: "#16302b", font: "inherit", minHeight: 42, padding: "9px 10px", width: "100%" } satisfies CSSProperties;
const itemStyle = { background: "#f8fcfa", border: "1px solid #dbeae3", borderRadius: 14, padding: 14 } satisfies CSSProperties;
const versionStyle = { background: "#fff", border: "1px solid #dbeae3", borderRadius: 12, padding: 12 } satisfies CSSProperties;
const versionTextStyle = { color: "#16302b", lineHeight: 1.5, margin: "9px 0 0" } satisfies CSSProperties;
const versionActionsStyle = { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 } satisfies CSSProperties;
const pillLinkStyle = { background: "#fff", border: "1px solid #b9cbc5", borderRadius: 999, color: "#16302b", padding: "8px 12px", textDecoration: "none" } satisfies CSSProperties;
const pillButtonStyle = { ...pillLinkStyle, cursor: "pointer", font: "inherit" } satisfies CSSProperties;
const primaryButtonStyle = { background: "#159947", border: "1px solid #159947", borderRadius: 10, color: "#fff", cursor: "pointer", font: "inherit", minHeight: 42, padding: "9px 14px" } satisfies CSSProperties;
const secondaryButtonStyle = { background: "#fff", border: "1px solid #b9cbc5", borderRadius: 10, color: "#16302b", cursor: "pointer", font: "inherit", minHeight: 42, padding: "9px 12px" } satisfies CSSProperties;
const dangerButtonStyle = { background: "#fff6f4", border: "1px solid #e6aaa3", borderRadius: 10, color: "#8c332c", cursor: "pointer", font: "inherit", minHeight: 42, padding: "9px 12px" } satisfies CSSProperties;
const errorStyle = { background: "#fff2f0", border: "1px solid #f3b9b3", borderRadius: 12, color: "#8c2323", marginBottom: 16, padding: 12 } satisfies CSSProperties;
const noticeStyle = { background: "#e8f7ed", border: "1px solid #b9e4c7", borderRadius: 12, color: "#17693a", marginBottom: 16, padding: 12 } satisfies CSSProperties;
const editingNoticeStyle = { alignItems: "center", background: "#fff8e6", border: "1px solid #ead38d", borderRadius: 12, color: "#6c5000", display: "flex", flexWrap: "wrap", fontSize: 14, gap: 10, justifyContent: "space-between", marginTop: 14, padding: 12 } satisfies CSSProperties;
const compactButtonStyle = { background: "#fff", border: "1px solid #b9a462", borderRadius: 8, color: "#644900", cursor: "pointer", font: "inherit", minHeight: 36, padding: "6px 10px" } satisfies CSSProperties;
const countStyle = { color: "#5e7a72", fontSize: 14 } satisfies CSSProperties;
const keyStyle = { color: "#66756f", fontFamily: "monospace", fontSize: 13, marginLeft: 8 } satisfies CSSProperties;
const activeBadgeStyle = { background: "#e8f7ed", border: "1px solid #b9e4c7", borderRadius: 999, color: "#17693a", fontSize: 13, padding: "5px 9px" } satisfies CSSProperties;
const mutedBadgeStyle = { background: "#f2f5f3", border: "1px solid #d5e4de", borderRadius: 999, color: "#5d6c66", fontSize: 13, padding: "5px 9px" } satisfies CSSProperties;
const statusStyle = (status: AdminContentVersion["status"]) => ({ ...mutedBadgeStyle, ...(status === "published" ? activeBadgeStyle : status === "in_review" ? { background: "#fff8e6", border: "1px solid #ead38d", color: "#7a5a00" } : null), marginLeft: 8 });
