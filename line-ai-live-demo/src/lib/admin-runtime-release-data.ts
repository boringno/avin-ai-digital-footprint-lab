import type { AdminStaffUser } from "@/lib/admin-auth";
import { canManageRuntimeContentReleases } from "@/lib/admin-auth";
import { writeAdminAuditLog } from "@/lib/admin-audit";
import { routeCustomerMessage } from "@/lib/router";
import { loadRuntimeContentOverlayForRelease } from "@/lib/runtime-content-release";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

export type RuntimeRelease = {
  activatedAt: string | null;
  createdAt: string;
  entryCount: number;
  id: string;
  releaseName: string;
  rolloutPercentage: number;
  status: "active" | "archived" | "draft" | "ready" | "rolled_back";
};

export type RuntimeRegressionCase = {
  caseKey: string;
  customerMessage: string;
  expectedDecisionType: string;
  expectedReplyContains: string | null;
};

export type RuntimeRegressionResult = RuntimeRegressionCase & {
  actualDecisionType: string;
  actualReply: string;
  passed: boolean;
};

type ReleaseRow = {
  activated_at: string | null;
  created_at: string;
  id: string;
  release_name: string;
  rollout_percentage: number;
  status: RuntimeRelease["status"];
};
type EntryRow = { release_id: string };
type RegressionCaseRow = { case_key: string; customer_message: string; expected_decision_type: string; expected_reply_contains: string | null };

export async function loadRuntimeReleaseAdminData(staff: AdminStaffUser) {
  assertCanManage(staff);
  if (!hasSupabaseServerConfig()) return { cases: [] satisfies RuntimeRegressionCase[], releases: [] satisfies RuntimeRelease[] };

  const supabase = getSupabaseServerClient();
  const [{ data: releaseRows, error: releaseError }, { data: entryRows, error: entryError }, { data: caseRows, error: caseError }] = await Promise.all([
    supabase.from("runtime_content_releases").select("id, release_name, status, rollout_percentage, activated_at, created_at").eq("tenant_id", staff.tenantId).order("created_at", { ascending: false }).returns<ReleaseRow[]>(),
    supabase.from("runtime_content_release_entries").select("release_id").eq("tenant_id", staff.tenantId).returns<EntryRow[]>(),
    supabase.from("runtime_release_regression_cases").select("case_key, customer_message, expected_decision_type, expected_reply_contains").eq("tenant_id", staff.tenantId).eq("is_active", true).order("case_key").returns<RegressionCaseRow[]>(),
  ]);
  if (releaseError || entryError || caseError) throw new Error("無法讀取正式回覆發布資料。");

  const entryCounts = new Map<string, number>();
  for (const entry of entryRows ?? []) entryCounts.set(entry.release_id, (entryCounts.get(entry.release_id) ?? 0) + 1);
  return {
    cases: (caseRows ?? []).map(toRegressionCase),
    releases: (releaseRows ?? []).map((row) => ({
      activatedAt: row.activated_at,
      createdAt: row.created_at,
      entryCount: entryCounts.get(row.id) ?? 0,
      id: row.id,
      releaseName: row.release_name,
      rolloutPercentage: row.rollout_percentage,
      status: row.status,
    })),
  };
}

export async function createRuntimeRelease(staff: AdminStaffUser, releaseName: string) {
  assertCanManage(staff);
  if (!hasSupabaseServerConfig()) throw new Error("尚未完成資料庫設定。");
  const normalizedName = releaseName.trim();
  if (normalizedName.length < 3 || normalizedName.length > 80) throw new Error("發布名稱請填寫 3 到 80 個字。");

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_runtime_content_release", {
    p_created_by: staff.id,
    p_release_name: normalizedName,
    p_tenant_id: staff.tenantId,
  });
  if (error || !data) throw new Error("無法建立 release snapshot。請確認已有已發布的 FAQ 或活動內容。");
  const releaseId = String(data);
  await writeAdminAuditLog({ action: "runtime_release.created", after: { release_name: normalizedName }, staff, targetId: releaseId, targetTable: "runtime_content_releases" });
}

export async function runRuntimeReleaseRegression(staff: AdminStaffUser, releaseId: string) {
  assertCanManage(staff);
  if (!hasSupabaseServerConfig()) throw new Error("尚未完成資料庫設定。");
  const data = await loadRuntimeReleaseAdminData(staff);
  if (data.cases.length === 0) throw new Error("尚未設定回歸題庫，不能發布。\n");

  const overlay = await loadRuntimeContentOverlayForRelease({
    now: new Date("2026-08-01T04:00:00.000Z"),
    releaseId,
    tenantId: staff.tenantId,
  });
  if (!overlay.releaseId) throw new Error("找不到可測試的 release snapshot。\n");

  const results: RuntimeRegressionResult[] = [];
  for (const testCase of data.cases) {
    const decision = await routeCustomerMessage({
      includePending: true,
      message: testCase.customerMessage,
      now: new Date("2026-08-01T04:00:00.000Z"),
      runtimeContentOverlay: overlay,
      tenantId: staff.tenantId,
    });
    const replyIncludesExpected = !testCase.expectedReplyContains || decision.replyText.includes(testCase.expectedReplyContains);
    results.push({
      ...testCase,
      actualDecisionType: decision.decisionType,
      actualReply: decision.replyText,
      passed: decision.decisionType === testCase.expectedDecisionType && replyIncludesExpected,
    });
  }
  await writeAdminAuditLog({
    action: "runtime_release.regression_run",
    after: { failed: results.filter((result) => !result.passed).length, passed: results.filter((result) => result.passed).length },
    staff,
    targetId: releaseId,
    targetTable: "runtime_content_releases",
  });
  return results;
}

export async function activateRuntimeRelease(staff: AdminStaffUser, releaseId: string, rolloutPercentage: number) {
  assertCanManage(staff);
  if (!Number.isInteger(rolloutPercentage) || rolloutPercentage < 1 || rolloutPercentage > 100) throw new Error("灰度比例需為 1 到 100。\n");
  const results = await runRuntimeReleaseRegression(staff, releaseId);
  if (results.some((result) => !result.passed)) throw new Error("固定回歸題庫尚未全數通過，不能啟用正式回覆。\n");

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.rpc("activate_runtime_content_release", {
    p_activated_by: staff.id,
    p_release_id: releaseId,
    p_rollout_percentage: rolloutPercentage,
    p_tenant_id: staff.tenantId,
  });
  if (error) throw new Error("無法啟用正式回覆 release。\n");
  await writeAdminAuditLog({ action: "runtime_release.activated", after: { rollout_percentage: rolloutPercentage }, staff, targetId: releaseId, targetTable: "runtime_content_releases" });
}

export async function rollbackRuntimeRelease(staff: AdminStaffUser, reason: string) {
  assertCanManage(staff);
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.rpc("rollback_runtime_content_release", {
    p_activated_by: staff.id,
    p_reason: reason.trim() || null,
    p_tenant_id: staff.tenantId,
  });
  if (error) throw new Error("無法切回安全版本。\n");
  await writeAdminAuditLog({ action: "runtime_release.rolled_back", after: { reason: reason.trim() || null }, staff, targetId: staff.tenantId, targetTable: "runtime_content_release_settings" });
}

function assertCanManage(staff: AdminStaffUser) {
  if (!canManageRuntimeContentReleases(staff.role)) throw new Error("您沒有管理正式回覆發布的權限。");
}

function toRegressionCase(row: RegressionCaseRow): RuntimeRegressionCase {
  return { caseKey: row.case_key, customerMessage: row.customer_message, expectedDecisionType: row.expected_decision_type, expectedReplyContains: row.expected_reply_contains };
}
