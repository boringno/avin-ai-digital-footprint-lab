"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import type { AdminScheduleVersion } from "@/lib/admin-schedule-data";
import { SCHEDULE_BRANCHES } from "@/lib/schedule-month";

type BranchFiles = Partial<Record<(typeof SCHEDULE_BRANCHES)[number], File>>;

const statusLabel = { disabled: "已停用", draft: "草稿", published: "已發布" } as const;

async function makePreview(source: File) {
  const bitmap = await createImageBitmap(source);
  try {
    for (const maxWidth of [1280, 960, 720]) {
      const scale = Math.min(1, maxWidth / bitmap.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
      if (blob && blob.size <= 1024 * 1024) {
        return new File([blob], `${source.name.replace(/\.[^.]+$/, "")}-preview.jpg`, { type: "image/jpeg" });
      }
    }
  } finally {
    bitmap.close();
  }
  throw new Error("無法產生 1 MB 內的預覽縮圖，請改用較小的圖片。");
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function SchedulesClient({
  canEdit,
  canUseWorkbench,
  initialMonths,
}: {
  canEdit: boolean;
  canUseWorkbench: boolean;
  initialMonths: AdminScheduleVersion[];
}) {
  const [months, setMonths] = useState(initialMonths);
  const [sourceMonth, setSourceMonth] = useState(currentMonth());
  const [changeReason, setChangeReason] = useState("");
  const [originals, setOriginals] = useState<BranchFiles>({});
  const [previews, setPreviews] = useState<BranchFiles>({});
  const [previewUrls, setPreviewUrls] = useState<Partial<Record<(typeof SCHEDULE_BRANCHES)[number], string>>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const urlsRef = useRef<string[]>([]);

  useEffect(() => () => urlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  async function selectOriginal(branch: (typeof SCHEDULE_BRANCHES)[number], file: File | null) {
    if (!file) return;
    setError("");
    setOriginals((value) => ({ ...value, [branch]: file }));
    try {
      const preview = await makePreview(file);
      const url = URL.createObjectURL(preview);
      urlsRef.current.push(url);
      setPreviews((value) => ({ ...value, [branch]: preview }));
      setPreviewUrls((value) => ({ ...value, [branch]: url }));
    } catch (caught) {
      setPreviews((value) => ({ ...value, [branch]: undefined }));
      setError(caught instanceof Error ? caught.message : "預覽縮圖產生失敗。");
    }
  }

  async function submitDraft() {
    if (busy || !canEdit) return;
    setBusy("create");
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.set("source_month", sourceMonth);
      form.set("change_reason", changeReason);
      for (const branch of SCHEDULE_BRANCHES) {
        const original = originals[branch];
        const preview = previews[branch];
        if (!original || !preview) throw new Error(`請補上${branch}的班表圖。`);
        form.set(`original_${branch}`, original);
        form.set(`preview_${branch}`, preview);
      }
      const response = await fetch("/api/admin/schedules", { body: form, method: "POST" });
      const body = (await response.json()) as { error?: string; months?: AdminScheduleVersion[]; ok?: boolean };
      if (!response.ok || !body.ok) throw new Error(body.error ?? "建立草稿失敗。");
      setMonths(body.months ?? []);
      setChangeReason("");
      setOriginals({});
      setPreviews({});
      setPreviewUrls({});
      setNotice("已建立月版草稿，四館圖片均已上傳。確認後即可發布。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "建立草稿失敗。");
    } finally {
      setBusy("");
    }
  }

  async function act(versionId: string, action: "disable" | "publish") {
    if (busy || !canEdit) return;
    setBusy(versionId);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/schedules", {
        body: JSON.stringify({ action, version_id: versionId }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const body = (await response.json()) as { error?: string; months?: AdminScheduleVersion[]; ok?: boolean };
      if (!response.ok || !body.ok) throw new Error(body.error ?? "班表操作失敗。");
      setMonths(body.months ?? []);
      setNotice(
        action === "publish"
          ? "已發布本月班表，四館圖片會在當月有效期間由 LINE 依館別傳送。"
          : "已停用。停用後不再主動傳送，LINE 已送出的圖片不會撤回。",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "班表操作失敗。");
    } finally {
      setBusy("");
    }
  }

  return (
    <main style={pageStyle}>
      <section style={containerStyle}>
        <header style={headerStyle}>
          <div>
            <p style={eyebrowStyle}>診所營運</p>
            <h1 style={{ margin: "4px 0" }}>門診班表管理</h1>
            <p style={subtleStyle}>一個月份一次發布四館圖片。只有當月已發布班表會由 LINE 主動傳送。</p>
          </div>
          <nav style={navStyle}>
            <a href="/admin/content" style={linkStyle}>內容管理</a>
            <a href="/admin/reports" style={linkStyle}>月報</a>
            {canUseWorkbench ? <a href="/admin/workbench" style={linkStyle}>客服工作台</a> : null}
          </nav>
        </header>
        {error ? <p style={errorStyle}>{error}</p> : null}
        {notice ? <p style={noticeStyle}>{notice}</p> : null}
        {canEdit ? (
          <section style={panelStyle}>
            <h2 style={headingStyle}>建立月版草稿</h2>
            <p style={subtleStyle}>請上傳同一月份的四館原圖。系統會在此裝置自動產生 LINE 用預覽縮圖；原圖限 JPEG/PNG、10 MB 內，縮圖限 1 MB 內。</p>
            <div style={formGridStyle}>
              <label style={labelStyle}>月份<input onChange={(event) => setSourceMonth(event.target.value)} style={inputStyle} type="month" value={sourceMonth} /></label>
              <label style={labelStyle}>變更原因<input onChange={(event) => setChangeReason(event.target.value)} placeholder="例如：8 月最新門診班表" style={inputStyle} value={changeReason} /></label>
            </div>
            <p style={subtleStyle}>四館圖片皆為必填。圖片會提供客人查看班表；指定醫師的日期與時段仍由真人客服確認，不會由系統從圖片推測。</p>
            <div style={branchGridStyle}>
              {SCHEDULE_BRANCHES.map((branch) => (
                <label key={branch} style={uploadStyle}>
                  <strong>{branch}</strong>
                  <input accept="image/jpeg,image/png" onChange={(event) => void selectOriginal(branch, event.target.files?.[0] ?? null)} type="file" />
                  <span style={subtleStyle}>{originals[branch]?.name ?? "尚未選擇原始班表圖"}</span>
                  {previewUrls[branch] ? <img alt={`${branch}預覽縮圖`} src={previewUrls[branch]} style={previewStyle} /> : null}
                </label>
              ))}
            </div>
            <button disabled={Boolean(busy)} onClick={() => void submitDraft()} style={primaryButtonStyle} type="button">{busy === "create" ? "建立中..." : "建立草稿"}</button>
          </section>
        ) : (
          <section style={panelStyle}>您可以檢視已建立的月版班表，但沒有上傳、發布或停用權限。</section>
        )}
        <section style={panelStyle}>
          <h2 style={headingStyle}>版本紀錄</h2>
          <p style={subtleStyle}>停用後只停止未來主動傳送；LINE 已送出的圖片不會撤回。</p>
          <div style={{ display: "grid", gap: 14 }}>
            {months.length === 0 ? <p style={subtleStyle}>尚未建立任何月版班表。</p> : months.map((month) => (
              <article key={month.id} style={cardStyle}>
                <div style={cardHeaderStyle}>
                  <div>
                    <strong>{month.sourceMonth} 月版班表</strong>
                    <p style={subtleStyle}>版本 {month.versionNo} · {statusLabel[month.status]} · {month.changeReason}</p>
                  </div>
                  {canEdit && month.status === "draft" ? <button disabled={Boolean(busy)} onClick={() => void act(month.id, "publish")} style={primaryButtonStyle} type="button">{busy === month.id ? "處理中..." : "發布本月"}</button> : null}
                  {canEdit && month.status === "published" ? <button disabled={Boolean(busy)} onClick={() => void act(month.id, "disable")} style={secondaryButtonStyle} type="button">{busy === month.id ? "處理中..." : "停用"}</button> : null}
                </div>
                <div style={assetGridStyle}>
                  {month.assets.map((asset) => (
                    <a href={asset.originalContentUrl} key={asset.branch} rel="noreferrer" style={assetStyle} target="_blank">
                      <img alt={`${month.sourceMonth} ${asset.branch}班表`} src={asset.previewImageUrl} style={assetPreviewStyle} />
                      <span>{asset.branch}</span>
                    </a>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

const pageStyle: CSSProperties = { background: "linear-gradient(135deg, #f6faf5, #fffaf1)", color: "#15312a", minHeight: "100vh", padding: "24px 16px 56px" };
const containerStyle: CSSProperties = { margin: "0 auto", maxWidth: 1040 };
const headerStyle: CSSProperties = { alignItems: "flex-start", display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", marginBottom: 18 };
const eyebrowStyle: CSSProperties = { color: "#587669", fontSize: 13, margin: 0 };
const subtleStyle: CSSProperties = { color: "#587069", fontSize: 14, lineHeight: 1.65, margin: "5px 0" };
const navStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };
const linkStyle: CSSProperties = { border: "1px solid #b9d2c4", borderRadius: 999, color: "#164f38", padding: "9px 13px", textDecoration: "none" };
const panelStyle: CSSProperties = { background: "rgba(255,255,255,.92)", border: "1px solid #d7e5dc", borderRadius: 18, boxShadow: "0 8px 30px rgba(30,70,52,.06)", marginTop: 16, padding: 18 };
const headingStyle: CSSProperties = { fontSize: 19, margin: "0 0 4px" };
const formGridStyle: CSSProperties = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginTop: 14 };
const labelStyle: CSSProperties = { display: "grid", fontSize: 14, fontWeight: 700, gap: 6 };
const inputStyle: CSSProperties = { background: "#fff", border: "1px solid #b9d2c4", borderRadius: 10, font: "inherit", minHeight: 42, padding: "8px 10px" };
const branchGridStyle: CSSProperties = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", margin: "14px 0" };
const uploadStyle: CSSProperties = { background: "#f5faf7", border: "1px dashed #9bc0aa", borderRadius: 12, display: "grid", gap: 8, minHeight: 130, padding: 12 };
const previewStyle: CSSProperties = { borderRadius: 8, maxHeight: 130, maxWidth: "100%", objectFit: "contain" };
const primaryButtonStyle: CSSProperties = { background: "#147c45", border: 0, borderRadius: 10, color: "#fff", cursor: "pointer", font: "inherit", fontWeight: 700, minHeight: 44, padding: "10px 15px" };
const secondaryButtonStyle: CSSProperties = { background: "#fff", border: "1px solid #7b9a88", borderRadius: 10, color: "#28523c", cursor: "pointer", font: "inherit", fontWeight: 700, minHeight: 44, padding: "10px 15px" };
const errorStyle: CSSProperties = { background: "#fff0ee", border: "1px solid #efb4ad", borderRadius: 10, color: "#9a2f25", padding: 12 };
const noticeStyle: CSSProperties = { background: "#edfaf1", border: "1px solid #a8d7b5", borderRadius: 10, color: "#195d33", padding: 12 };
const cardStyle: CSSProperties = { border: "1px solid #d7e5dc", borderRadius: 14, padding: 14 };
const cardHeaderStyle: CSSProperties = { alignItems: "center", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between" };
const assetGridStyle: CSSProperties = { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", marginTop: 12 };
const assetStyle: CSSProperties = { color: "#164f38", display: "grid", fontSize: 13, gap: 5, textDecoration: "none" };
const assetPreviewStyle: CSSProperties = { background: "#f4f4f4", borderRadius: 8, height: 110, objectFit: "cover", width: "100%" };
