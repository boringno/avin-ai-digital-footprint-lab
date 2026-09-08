import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  APPROVED_STANDING_PRICE_IMPORT_BATCH_KEY,
  APPROVED_STANDING_PRICE_IMPORT_TENANT_ID,
  approvedStandingPriceDrafts,
} from "../src/lib/approved-standing-price-import";

const appRoot = resolve(__dirname, "..");
const repoRoot = resolve(appRoot, "..");
const singleDraftMigration = read("../supabase/migrations/20260721_content_submission_workflow.sql");
const migration = read("../supabase/migrations/20260906_content_draft_batch_import.sql");
const service = read("src/lib/admin-standing-price-import.ts");
const route = read("app/api/admin/content/imports/standing-prices/route.ts");
const ui = read("app/admin/content/ContentClient.tsx");

const drafts = approvedStandingPriceDrafts();
assert.equal(drafts.length, 62);
assert.deepEqual(
  drafts.map((draft) => draft.contentKey),
  [...drafts].map((draft) => draft.contentKey).sort(),
  "batch payload must have a deterministic canonical order",
);
assert.equal(APPROVED_STANDING_PRICE_IMPORT_TENANT_ID, "tenant_001");
assert.match(APPROVED_STANDING_PRICE_IMPORT_BATCH_KEY, /^standing-price-/u);

for (const expected of [
  "begin;",
  "content_draft_import_batches_tenant_key_unique",
  "pg_advisory_xact_lock",
  "batch_editor_not_authorized",
  "batch_content_version_conflict",
  "entry - 'expected_latest_version_no'",
  "btrim(v_existing.source_label) <> btrim(p_source_label)",
  "(entry->'payload_json') ?| array['status'",
  "public.create_content_draft(",
  "content_version.batch_draft_created",
  "grant execute on function public.create_content_draft_batch",
  "to service_role",
  "commit;",
]) {
  assert.ok(migration.includes(expected), `migration missing required boundary: ${expected}`);
}
assert.ok(!migration.includes("for update;"), "batch receipt replay must rely on its advisory lock, not undeclared UPDATE permission");
assert.doesNotMatch(migration, /publish_content_version|activate_runtime|insert\s+into\s+public\.runtime_content_release/iu);

const sharedItemLock = "p_tenant_id || ':' || p_content_type || ':' || p_content_key";
assert.ok(
  singleDraftMigration.includes(`pg_advisory_xact_lock(hashtext(${sharedItemLock}))`),
  "single-draft creation must keep the shared tenant/type/key advisory lock",
);
assert.match(
  migration,
  /pg_advisory_xact_lock\(hashtext\(\s*p_tenant_id \|\| ':' \|\| \(v_draft->>'content_type'\) \|\| ':' \|\| \(v_draft->>'content_key'\)\s*\)\)/u,
  "batch preflight must acquire the same tenant/type/key advisory lock as single-draft creation",
);

assert.match(service, /staff\.tenantId\s*!==\s*APPROVED_STANDING_PRICE_IMPORT_TENANT_ID/u);
assert.match(service, /\.from\("content_items"\)/u);
assert.match(service, /\.from\("content_versions"\)/u);
assert.match(service, /expected_latest_version_no:\s*expectedLatestVersionNo/u);
assert.match(service, /\.from\("content_draft_import_batches"\)/u);
assert.equal((service.match(/\.rpc\("create_content_draft_batch"/gu) ?? []).length, 1);
assert.doesNotMatch(service, /createAdminContentDraft/u);

assert.match(route, /requireAdminStaff/u);
assert.match(route, /canCreateContentDraft/u);
assert.match(route, /confirm_count/u);
assert.match(route, /expected_fingerprint/u);
assert.match(route, /let body: \{ confirm_count\?: number; expected_fingerprint\?: string \}/u);
for (const forbiddenClientField of ["p_drafts", "p_tenant_id", "payload_json", "publish", "content_status"]) {
  assert.doesNotMatch(route, new RegExp(`body\\.${forbiddenClientField}`, "u"), `route cannot accept client-controlled ${forbiddenClientField}`);
}

assert.match(ui, /展開檢查 62 筆方案與排除原因/u);
assert.match(ui, /任何一筆失敗會全部回滾/u);
assert.match(ui, /不會送審、發布或改變 LINE 回覆/u);
assert.match(ui, /已有完整批次收據，相同資料重按只會安全重播/u);

console.log(JSON.stringify({ atomicBatchDrafts: 62, passed: true }, null, 2));

function read(relativePath: string) {
  const absolute = relativePath.startsWith("../")
    ? resolve(repoRoot, relativePath.slice(3))
    : resolve(appRoot, relativePath);
  return readFileSync(absolute, "utf8");
}
