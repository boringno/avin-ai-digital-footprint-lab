import "server-only";

import { createHash } from "node:crypto";

import type { AdminStaffUser } from "@/lib/admin-auth";
import { canCreateContentDraft } from "@/lib/admin-auth";
import {
  APPROVED_STANDING_PRICE_IMPORT_BATCH_KEY,
  APPROVED_STANDING_PRICE_IMPORT_EXCLUSIONS,
  APPROVED_STANDING_PRICE_IMPORT_SOURCE_LABEL,
  APPROVED_STANDING_PRICE_IMPORT_TENANT_ID,
  approvedStandingPriceDrafts,
  standingPriceImportSummary,
} from "@/lib/approved-standing-price-import";
import { assertContentDraftInput, type ContentDraftInput } from "@/lib/content-versioning";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

export type StandingPriceImportPreview = {
  alreadyImported: boolean;
  batchKey: string;
  candidates: number;
  entries: StandingPriceImportPreviewEntry[];
  exclusions: Array<{ count: number; reason: string }>;
  fingerprint: string;
  sourceLabel: string;
  treatmentCount: number;
};

export type StandingPriceImportPreviewEntry = {
  action: "create" | "new_version";
  branchScope: string;
  contentKey: string;
  currentVersionNo: number | null;
  customerPriceText: string;
  treatmentName: string;
};

export type StandingPriceImportResult = StandingPriceImportPreview & {
  batchId: string;
  replayed: boolean;
  versionIds: string[];
};

export class StandingPriceImportConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StandingPriceImportConflictError";
  }
}

type RpcDraft = {
  change_reason: string;
  content_key: string;
  content_type: ContentDraftInput["contentType"];
  display_name: string;
  end_at: string | null;
  expected_latest_version_no: number | null;
  payload_json: Record<string, unknown>;
  start_at: string | null;
};

type BatchRpcResult = {
  batch_id: string;
  replayed: boolean;
  request_hash: string;
  row_count: number;
  version_ids: unknown;
};

type ContentItemVersionLookupRow = {
  content_key: string;
  id: string;
};

type ContentVersionLookupRow = {
  item_id: string;
  version_no: number;
};

type ExistingBatchLookupRow = {
  row_count: number;
};

type PreparedStandingPriceImport = {
  drafts: RpcDraft[];
  preview: StandingPriceImportPreview;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function getApprovedStandingPriceImportPreview(
  staff: AdminStaffUser,
): Promise<StandingPriceImportPreview> {
  return (await prepareApprovedStandingPriceImport(staff)).preview;
}

async function prepareApprovedStandingPriceImport(
  staff: AdminStaffUser,
): Promise<PreparedStandingPriceImport> {
  assertTargetTenant(staff);
  if (!hasSupabaseServerConfig()) {
    throw new Error("內容資料庫尚未設定完成。");
  }

  const contentDrafts = validatedDrafts();
  const [latestVersions, existingBatch] = await Promise.all([
    loadLatestVersionNumbers(staff, contentDrafts),
    loadExistingBatch(staff),
  ]);
  const drafts = contentDrafts.map((draft) => toRpcDraft(
    draft,
    latestVersions.get(draft.contentKey) ?? null,
  ));
  const summary = standingPriceImportSummary();
  return {
    drafts,
    preview: {
      alreadyImported: Boolean(existingBatch),
      batchKey: APPROVED_STANDING_PRICE_IMPORT_BATCH_KEY,
      candidates: summary.candidates,
      entries: contentDrafts.map((draft) => {
        const currentVersionNo = latestVersions.get(draft.contentKey) ?? null;
        return {
          action: currentVersionNo === null ? "create" : "new_version",
          branchScope: stringPayloadValue(draft.payload.branch_scope) || "全館",
          contentKey: draft.contentKey,
          currentVersionNo,
          customerPriceText: stringPayloadValue(draft.payload.customer_price_text),
          treatmentName: stringPayloadValue(draft.payload.treatment_name),
        };
      }),
      exclusions: APPROVED_STANDING_PRICE_IMPORT_EXCLUSIONS.map((entry) => ({ ...entry })),
      fingerprint: fingerprintFor(drafts),
      sourceLabel: APPROVED_STANDING_PRICE_IMPORT_SOURCE_LABEL,
      treatmentCount: summary.treatmentCount,
    },
  };
}

async function loadExistingBatch(staff: AdminStaffUser) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("content_draft_import_batches")
    .select("row_count")
    .eq("tenant_id", staff.tenantId)
    .eq("import_key", APPROVED_STANDING_PRICE_IMPORT_BATCH_KEY)
    .limit(1)
    .returns<ExistingBatchLookupRow[]>();
  if (error) {
    throw new Error(`讀取既有批次收據失敗：${error.message}`);
  }
  return data?.[0] ?? null;
}

export async function createApprovedStandingPriceDraftBatch(input: {
  expectedCount: number;
  expectedFingerprint: string;
  staff: AdminStaffUser;
}): Promise<StandingPriceImportResult> {
  if (!canCreateContentDraft(input.staff.role)) {
    throw new Error("您沒有建立內容草稿的權限。");
  }
  assertTargetTenant(input.staff);
  const prepared = await prepareApprovedStandingPriceImport(input.staff);
  const { preview } = prepared;
  if (input.expectedCount !== preview.candidates || input.expectedFingerprint !== preview.fingerprint) {
    throw new StandingPriceImportConflictError("匯入資料已變更，請重新載入預覽後再確認。");
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_content_draft_batch", {
    p_drafts: prepared.drafts,
    p_editor_id: input.staff.id,
    p_import_key: preview.batchKey,
    p_source_label: preview.sourceLabel,
    p_tenant_id: input.staff.tenantId,
  });
  if (error || !data) {
    if (
      error?.code === "23505" ||
      error?.code === "40001" ||
      /batch_(?:import_key|content_key|content_version)_conflict/u.test(error?.message ?? "")
    ) {
      throw new StandingPriceImportConflictError("這批匯入鍵已用於不同資料，或內容鍵已有其他版本；資料庫沒有建立半批草稿。");
    }
    throw new Error(`批次建立內容草稿失敗：${error?.message ?? "未取得批次收據"}`);
  }

  const result = parseBatchRpcResult(data);
  if (!Number.isInteger(result.row_count) || result.row_count !== preview.candidates) {
    throw new Error("資料庫回傳的匯入筆數不符，請停止後續送審並交由工程師檢查。");
  }
  if (!/^[0-9a-f]{64}$/u.test(result.request_hash)) {
    throw new Error("資料庫回傳的匯入資料指紋格式不正確，請停止後續送審並交由工程師檢查。");
  }
  const versionIds = stringArray(result.version_ids);
  if (
    !UUID_PATTERN.test(result.batch_id) ||
    versionIds.length !== preview.candidates ||
    new Set(versionIds).size !== versionIds.length ||
    versionIds.some((versionId) => !UUID_PATTERN.test(versionId))
  ) {
    throw new Error("資料庫回傳的草稿版本清單不完整，請停止後續送審並交由工程師檢查。");
  }

  return {
    ...preview,
    batchId: result.batch_id,
    replayed: result.replayed,
    versionIds,
  };
}

function validatedDrafts() {
  const drafts = approvedStandingPriceDrafts();
  for (const draft of drafts) assertContentDraftInput(draft);
  return drafts;
}

function toRpcDraft(draft: ContentDraftInput, expectedLatestVersionNo: number | null): RpcDraft {
  return {
    change_reason: draft.changeReason,
    content_key: draft.contentKey,
    content_type: draft.contentType,
    display_name: draft.displayName,
    end_at: draft.endAt,
    expected_latest_version_no: expectedLatestVersionNo,
    payload_json: draft.payload,
    start_at: draft.startAt,
  };
}

function assertTargetTenant(staff: AdminStaffUser) {
  if (staff.tenantId !== APPROVED_STANDING_PRICE_IMPORT_TENANT_ID) {
    throw new Error("這批核准報價不屬於目前登入的診所，已停止匯入。");
  }
}

async function loadLatestVersionNumbers(
  staff: AdminStaffUser,
  drafts: ContentDraftInput[],
) {
  const supabase = getSupabaseServerClient();
  const contentKeys = drafts.map((draft) => draft.contentKey);
  const { data: items, error: itemError } = await supabase
    .from("content_items")
    .select("id, content_key")
    .eq("tenant_id", staff.tenantId)
    .eq("content_type", "campaign")
    .in("content_key", contentKeys)
    .returns<ContentItemVersionLookupRow[]>();
  if (itemError) {
    throw new Error(`讀取既有內容鍵失敗：${itemError.message}`);
  }

  const itemRows = items ?? [];
  if (itemRows.length === 0) return new Map<string, number>();
  const { data: versions, error: versionError } = await supabase
    .from("content_versions")
    .select("item_id, version_no")
    .eq("tenant_id", staff.tenantId)
    .in("item_id", itemRows.map((item) => item.id))
    .returns<ContentVersionLookupRow[]>();
  if (versionError) {
    throw new Error(`讀取既有內容版本失敗：${versionError.message}`);
  }

  const latestByItemId = new Map<string, number>();
  for (const version of versions ?? []) {
    latestByItemId.set(
      version.item_id,
      Math.max(latestByItemId.get(version.item_id) ?? 0, version.version_no),
    );
  }
  return new Map(itemRows.map((item) => [item.content_key, latestByItemId.get(item.id) ?? 0]));
}

function stringPayloadValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function fingerprintFor(value: unknown) {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function parseBatchRpcResult(value: unknown): BatchRpcResult {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== "object") {
    throw new Error("資料庫沒有回傳有效的批次收據。");
  }
  const record = candidate as Record<string, unknown>;
  if (
    typeof record.batch_id !== "string" ||
    typeof record.replayed !== "boolean" ||
    typeof record.request_hash !== "string" ||
    typeof record.row_count !== "number"
  ) {
    throw new Error("資料庫批次收據格式不正確。");
  }
  return record as BatchRpcResult;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error("資料庫批次收據缺少版本清單。");
  }
  return value;
}
