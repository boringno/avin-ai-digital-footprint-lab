import type { AdminStaffUser } from "@/lib/admin-auth";
import { canEditContent, canReviewContent, canViewContent } from "@/lib/admin-auth";
import { writeAdminAuditLog } from "@/lib/admin-audit";
import {
  assertContentDraftInput,
  canTransitionContentStatus,
  type ContentDraftInput,
  type ContentVersionStatus,
  type EditableContentType,
} from "@/lib/content-versioning";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

export type AdminContentVersion = {
  changeReason: string;
  createdAt: string;
  editedBy: string;
  endAt: string | null;
  id: string;
  payload: Record<string, unknown>;
  publishedAt: string | null;
  reviewedBy: string | null;
  startAt: string | null;
  status: ContentVersionStatus;
  versionNo: number;
};

export type AdminContentItem = {
  contentKey: string;
  contentType: EditableContentType;
  currentVersionId: string | null;
  id: string;
  isArchived: boolean;
  versions: AdminContentVersion[];
};

type ContentItemRow = {
  content_key: string;
  content_type: EditableContentType;
  current_version_id: string | null;
  id: string;
  is_archived: boolean;
  tenant_id: string;
};

type ContentVersionRow = {
  change_reason: string;
  created_at: string;
  edited_by: string;
  end_at: string | null;
  id: string;
  item_id: string;
  payload_json: Record<string, unknown>;
  published_at: string | null;
  reviewed_by: string | null;
  start_at: string | null;
  status: ContentVersionStatus;
  tenant_id: string;
  version_no: number;
};

export async function loadAdminContent(staff: AdminStaffUser) {
  if (!canViewContent(staff.role)) {
    throw new Error("您沒有查看內容管理的權限。");
  }
  if (!hasSupabaseServerConfig()) {
    return [] satisfies AdminContentItem[];
  }

  const supabase = getSupabaseServerClient();
  const { data: items, error: itemError } = await supabase
    .from("content_items")
    .select("id, tenant_id, content_type, content_key, current_version_id, is_archived")
    .eq("tenant_id", staff.tenantId)
    .in("content_type", ["faq", "campaign"])
    .order("updated_at", { ascending: false })
    .returns<ContentItemRow[]>();
  if (itemError) {
    throw new Error(`讀取內容清單失敗：${itemError.message}`);
  }

  const itemIds = (items ?? []).map((item) => item.id);
  if (itemIds.length === 0) {
    return [] satisfies AdminContentItem[];
  }
  const { data: versions, error: versionError } = await supabase
    .from("content_versions")
    .select("id, tenant_id, item_id, version_no, payload_json, status, start_at, end_at, change_reason, edited_by, reviewed_by, published_at, created_at")
    .eq("tenant_id", staff.tenantId)
    .in("item_id", itemIds)
    .order("version_no", { ascending: false })
    .returns<ContentVersionRow[]>();
  if (versionError) {
    throw new Error(`讀取內容版本失敗：${versionError.message}`);
  }

  return (items ?? []).map((item) => ({
    contentKey: item.content_key,
    contentType: item.content_type,
    currentVersionId: item.current_version_id,
    id: item.id,
    isArchived: item.is_archived,
    versions: (versions ?? []).filter((version) => version.item_id === item.id).map(toContentVersion),
  }));
}

export async function createAdminContentDraft(input: ContentDraftInput & { staff: AdminStaffUser }) {
  if (!canEditContent(input.staff.role)) {
    throw new Error("您沒有建立內容草稿的權限。");
  }
  if (!hasSupabaseServerConfig()) {
    throw new Error("內容資料庫尚未設定完成。");
  }
  assertContentDraftInput(input);

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_content_draft", {
    p_change_reason: input.changeReason.trim(),
    p_content_key: input.contentKey,
    p_content_type: input.contentType,
    p_editor_id: input.staff.id,
    p_end_at: input.endAt,
    p_payload_json: input.payload,
    p_start_at: input.startAt,
    p_tenant_id: input.staff.tenantId,
  });
  if (error || !data) {
    throw new Error(`建立內容草稿失敗：${error?.message ?? "未取得版本"}`);
  }

  await writeAdminAuditLog({
    action: "content_version.draft_created",
    after: { content_key: input.contentKey, content_type: input.contentType },
    staff: input.staff,
    targetId: String(data),
    targetTable: "content_versions",
  });
  return String(data);
}

export async function updateAdminContentVersion(input: {
  action: "submit" | "publish" | "disable";
  staff: AdminStaffUser;
  versionId: string;
}) {
  const needsReviewPermission = input.action === "publish" || input.action === "disable";
  if (needsReviewPermission ? !canReviewContent(input.staff.role) : !canEditContent(input.staff.role)) {
    throw new Error("您沒有執行此內容操作的權限。");
  }
  if (!hasSupabaseServerConfig()) {
    throw new Error("內容資料庫尚未設定完成。");
  }

  const supabase = getSupabaseServerClient();
  const { data: before, error: loadError } = await supabase
    .from("content_versions")
    .select("id, item_id, status, version_no, payload_json, change_reason")
    .eq("id", input.versionId)
    .eq("tenant_id", input.staff.tenantId)
    .maybeSingle<{ change_reason: string; id: string; item_id: string; payload_json: Record<string, unknown>; status: ContentVersionStatus; version_no: number }>();
  if (loadError || !before) {
    throw new Error("找不到這個內容版本。");
  }
  if (!canTransitionContentStatus(before.status, input.action)) {
    throw new Error("這個內容版本目前無法執行此操作。");
  }

  if (input.action === "submit") {
    const { error } = await supabase
      .from("content_versions")
      .update({ status: "in_review" })
      .eq("id", before.id)
      .eq("tenant_id", input.staff.tenantId)
      .eq("status", "draft");
    if (error) {
      throw new Error(`送審失敗：${error.message}`);
    }
  } else if (input.action === "publish") {
    const { error } = await supabase.rpc("publish_content_version", {
      p_reviewer_id: input.staff.id,
      p_tenant_id: input.staff.tenantId,
      p_version_id: input.versionId,
    });
    if (error) {
      throw new Error(`發布失敗：${error.message}`);
    }
  } else {
    const { error } = await supabase.rpc("disable_content_version", {
      p_reviewer_id: input.staff.id,
      p_tenant_id: input.staff.tenantId,
      p_version_id: input.versionId,
    });
    if (error) {
      throw new Error(`停用失敗：${error.message}`);
    }
  }

  await writeAdminAuditLog({
    action: `content_version.${input.action}`,
    after: { status: input.action === "submit" ? "in_review" : input.action === "publish" ? "published" : "disabled" },
    before: { status: before.status },
    staff: input.staff,
    targetId: before.id,
    targetTable: "content_versions",
  });
}

function toContentVersion(row: ContentVersionRow): AdminContentVersion {
  return {
    changeReason: row.change_reason,
    createdAt: row.created_at,
    editedBy: row.edited_by,
    endAt: row.end_at,
    id: row.id,
    payload: row.payload_json,
    publishedAt: row.published_at,
    reviewedBy: row.reviewed_by,
    startAt: row.start_at,
    status: row.status,
    versionNo: row.version_no,
  };
}
