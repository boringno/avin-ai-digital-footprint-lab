import { buildInsertRow, buildTenantScopeFilters } from "../src/lib/conversation-store";

type FakeRow = {
  line_user_id: string;
  state_json: Record<string, unknown>;
  tenant_id: string;
};

const FAKE_ROWS: FakeRow[] = [
  { line_user_id: "Uaaa1111", state_json: { owner: "tenant_001" }, tenant_id: "tenant_001" },
  { line_user_id: "Uaaa1111", state_json: { owner: "tenant_002" }, tenant_id: "tenant_002" },
  { line_user_id: "Ubbb2222", state_json: { owner: "tenant_001" }, tenant_id: "tenant_001" },
];

function findByScope(rows: FakeRow[], filters: { line_user_id: string; tenant_id: string }) {
  return rows.filter((row) => row.line_user_id === filters.line_user_id && row.tenant_id === filters.tenant_id);
}

type CheckResult = {
  name: string;
  passed: boolean;
};

const results: CheckResult[] = [];

function check(name: string, passed: boolean) {
  results.push({ name, passed });
}

const defaultFilters = buildTenantScopeFilters("Uaaa1111");
check("default tenant scope resolves to tenant_001", defaultFilters.tenant_id === "tenant_001");
check("default tenant scope preserves line_user_id", defaultFilters.line_user_id === "Uaaa1111");

const tenant002Filters = buildTenantScopeFilters("Uaaa1111", "tenant_002");
check("explicit tenant override is respected", tenant002Filters.tenant_id === "tenant_002");

const tenant001Matches = findByScope(FAKE_ROWS, buildTenantScopeFilters("Uaaa1111", "tenant_001"));
check("tenant_001 scope hits exactly its own row", tenant001Matches.length === 1 && tenant001Matches[0]?.state_json.owner === "tenant_001");

const tenant002Matches = findByScope(FAKE_ROWS, buildTenantScopeFilters("Uaaa1111", "tenant_002"));
check("tenant_002 scope hits exactly its own row", tenant002Matches.length === 1 && tenant002Matches[0]?.state_json.owner === "tenant_002");

check(
  "scope filters select only the matching fake tenant row",
  !tenant001Matches.some((row) => row.tenant_id === "tenant_002") &&
    !tenant002Matches.some((row) => row.tenant_id === "tenant_001"),
);

const missingTenantMatches = findByScope(FAKE_ROWS, buildTenantScopeFilters("Uaaa1111", "tenant_999"));
check("unknown tenant scope hits nothing", missingTenantMatches.length === 0);

const insertRowDefaultTenant = buildInsertRow("Ubbb2222", {});
check("insert row defaults to tenant_001", insertRowDefaultTenant.tenant_id === "tenant_001");

const insertRowExplicitTenant = buildInsertRow("Ubbb2222", {}, "tenant_002");
check("insert row honors explicit tenant override", insertRowExplicitTenant.tenant_id === "tenant_002");

console.log(JSON.stringify(results, null, 2));

if (results.some((result) => !result.passed)) {
  process.exitCode = 1;
} else {
  console.log("validate-tenant-scope: all checks passed");
}
