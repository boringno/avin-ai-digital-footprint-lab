import crypto from "node:crypto";

import type { AdminStaffUser } from "@/lib/admin-auth";
import { canEditContent, canViewContent } from "@/lib/admin-auth";
import { writeAdminAuditLog } from "@/lib/admin-audit";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";
import { SCHEDULE_BRANCHES } from "@/lib/schedule-month";

export { SCHEDULE_BRANCHES } from "@/lib/schedule-month";
const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 1024 * 1024;

type VersionRow = {
  change_reason: string;
  created_at: string;
  id: string;
  published_at: string | null;
  source_month: string;
  status: "disabled" | "draft" | "published";
  version_no: number;
};

type AssetRow = {
  branch: string;
  original_content_url: string;
  preview_image_url: string;
  version_id: string;
};

export type AdminScheduleVersion = {
  assets: Array<{ branch: string; originalContentUrl: string; previewImageUrl: string }>;
  changeReason: string;
  createdAt: string;
  id: string;
  publishedAt: string | null;
  sourceMonth: string;
  status: "disabled" | "draft" | "published";
  versionNo: number;
};

function assertMonth(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) throw new Error("月份請使用 YYYY-MM 格式。");
}

function assertImage(file: File, maxBytes: number, label: string) {
  if (file.type !== "image/jpeg" && file.type !== "image/png") throw new Error(`${label}只支援 JPEG 或 PNG。`);
  if (file.size <= 0 || file.size > maxBytes) throw new Error(`${label}檔案大小不符合 LINE 限制。`);
}

export async function loadAdminScheduleMonths(staff: AdminStaffUser) {
  if (!canViewContent(staff.role)) throw new Error("您沒有查看門診班表的權限。");
  if (!hasSupabaseServerConfig()) return [] satisfies AdminScheduleVersion[];

  const supabase = getSupabaseServerClient();
  const { data: versions, error: versionsError } = await supabase
    .from("schedule_month_versions")
    .select("id, source_month, version_no, status, change_reason, created_at, published_at")
    .eq("tenant_id", staff.tenantId)
    .order("source_month", { ascending: false })
    .order("version_no", { ascending: false })
    .returns<VersionRow[]>();
  if (versionsError) throw new Error("讀取門診班表失敗。");

  const ids = (versions ?? []).map((version) => version.id);
  if (ids.length === 0) return [] satisfies AdminScheduleVersion[];
  const { data: assets, error: assetsError } = await supabase
    .from("schedule_month_assets")
    .select("version_id, branch, original_content_url, preview_image_url")
    .eq("tenant_id", staff.tenantId)
    .in("version_id", ids)
    .returns<AssetRow[]>();
  if (assetsError) throw new Error("讀取門診圖片失敗。");

  return (versions ?? []).map((version) => ({
    assets: (assets ?? []).filter((asset) => asset.version_id === version.id).map((asset) => ({ branch: asset.branch, originalContentUrl: asset.original_content_url, previewImageUrl: asset.preview_image_url })),
    changeReason: version.change_reason,
    createdAt: version.created_at,
    id: version.id,
    publishedAt: version.published_at,
    sourceMonth: version.source_month,
    status: version.status,
    versionNo: version.version_no,
  }));
}

export async function createAdminScheduleDraft(input: { changeReason: string; originals: Record<string, File>; previews: Record<string, File>; sourceMonth: string; staff: AdminStaffUser }) {
  if (!canEditContent(input.staff.role)) throw new Error("您沒有建立門診班表草稿的權限。");
  if (!hasSupabaseServerConfig()) throw new Error("門診班表資料庫尚未設定完成。");
  assertMonth(input.sourceMonth);
  if (!input.changeReason.trim()) throw new Error("請填寫本次更新原因。");
  for (const branch of SCHEDULE_BRANCHES) {
    const original = input.originals[branch];
    const preview = input.previews[branch];
    if (!original || !preview) throw new Error("發布前必須上傳四館圖片並產生預覽圖。");
    assertImage(original, MAX_ORIGINAL_BYTES, `${branch}原圖`);
    assertImage(preview, MAX_PREVIEW_BYTES, `${branch}預覽圖`);
  }

  const supabase = getSupabaseServerClient();
  const { data: latest } = await supabase
    .from("schedule_month_versions")
    .select("version_no")
    .eq("tenant_id", input.staff.tenantId)
    .eq("source_month", input.sourceMonth)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle<{ version_no: number }>();
  const versionNo = (latest?.version_no ?? 0) + 1;
  const { data: version, error: versionError } = await supabase
    .from("schedule_month_versions")
    .insert({ change_reason: input.changeReason.trim(), created_by: input.staff.id, source_month: input.sourceMonth, tenant_id: input.staff.tenantId, version_no: versionNo })
    .select("id")
    .single<{ id: string }>();
  if (versionError || !version) throw new Error("建立門診班表草稿失敗。");

  const uploadedPaths: string[] = [];
  try {
    const assetRows = [];
    for (const branch of SCHEDULE_BRANCHES) {
      const original = input.originals[branch];
      const preview = input.previews[branch];
      const extension = original.type === "image/png" ? "png" : "jpg";
      const key = `${input.staff.tenantId}/${input.sourceMonth}/${version.id}/${crypto.randomUUID()}`;
      const originalPath = `${key}/original.${extension}`;
      const previewPath = `${key}/preview.jpg`;
      const [{ error: originalError }, { error: previewError }] = await Promise.all([
        supabase.storage.from("schedule-assets").upload(originalPath, original, { contentType: original.type, upsert: false }),
        supabase.storage.from("schedule-assets").upload(previewPath, preview, { contentType: "image/jpeg", upsert: false }),
      ]);
      if (originalError || previewError) throw new Error("上傳門診圖片失敗。");
      uploadedPaths.push(originalPath, previewPath);
      assetRows.push({
        branch,
        mime_type: original.type,
        original_bytes: original.size,
        original_content_url: supabase.storage.from("schedule-assets").getPublicUrl(originalPath).data.publicUrl,
        original_path: originalPath,
        preview_bytes: preview.size,
        preview_image_url: supabase.storage.from("schedule-assets").getPublicUrl(previewPath).data.publicUrl,
        preview_path: previewPath,
        tenant_id: input.staff.tenantId,
        version_id: version.id,
      });
    }
    const { error: assetsError } = await supabase.from("schedule_month_assets").insert(assetRows);
    if (assetsError) throw new Error("儲存門診圖片資料失敗。");
  } catch (error) {
    if (uploadedPaths.length) await supabase.storage.from("schedule-assets").remove(uploadedPaths);
    throw error;
  }

  await writeAdminAuditLog({ action: "schedule_month.draft_created", after: { source_month: input.sourceMonth, structured_schedule_rows: 0, version_no: versionNo }, staff: input.staff, targetId: version.id, targetTable: "schedule_month_versions" });
}

export async function updateAdminScheduleMonth(input: { action: "disable" | "publish"; staff: AdminStaffUser; versionId: string }) {
  if (!canEditContent(input.staff.role)) throw new Error("您沒有發布或停用門診班表的權限。");
  const supabase = getSupabaseServerClient();
  const rpc = input.action === "publish" ? "publish_schedule_month" : "disable_schedule_month";
  const { error } = await supabase.rpc(rpc, { p_publisher_id: input.staff.id, p_tenant_id: input.staff.tenantId, p_version_id: input.versionId });
  if (error) throw new Error(input.action === "publish" ? "發布失敗，請確認四館圖片皆完整上傳。" : "停用門診班表失敗。");
  await writeAdminAuditLog({ action: `schedule_month.${input.action}`, after: { version_id: input.versionId }, staff: input.staff, targetId: input.versionId, targetTable: "schedule_month_versions" });
}
