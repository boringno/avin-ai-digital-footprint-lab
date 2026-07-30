import { buildConversationRuntimeStateUpsertRow } from "../src/lib/conversation-store";

let passed = 0;

function expect(condition: unknown, label: string) {
  if (!condition) throw new Error(`Failed: ${label}`);
  passed += 1;
}

const retention = "2026-07-24T10:30:00.000Z";

const minimal = buildConversationRuntimeStateUpsertRow(
  "user-1",
  { state_json: { status: "ai_active" } },
  "tenant_001",
);

expect(minimal.line_user_id === "user-1", "upsert row keeps the line user id");
expect(minimal.tenant_id === "tenant_001", "upsert row keeps the tenant id");
expect(typeof minimal.retention_expiry === "string" && minimal.retention_expiry.length > 0, "upsert row always sets retention expiry");
expect("state_json" in minimal && minimal.state_json?.status === "ai_active", "patched state is included in the upsert row");
expect(("context_json" in minimal) === false, "unpatched context_json is omitted so existing data is preserved");

const scoped = buildConversationRuntimeStateUpsertRow(
  "user-2",
  {
    booking_draft_json: { branch: "高雄館" },
    context_json: { introSent: true },
    is_soft_deleted: true,
    retention_expiry: retention,
    soft_deleted_at: retention,
  },
  "tenant_demo",
);

expect(scoped.retention_expiry === retention, "explicit retention expiry is preserved");
expect(scoped.booking_draft_json?.branch === "高雄館", "patched booking draft is included");
expect(scoped.context_json?.introSent === true, "patched context is included");
expect(scoped.is_soft_deleted === true, "soft delete flag is included when patched");
expect(scoped.soft_deleted_at === retention, "soft delete timestamp is included when patched");

console.log(`conversation store validation passed (${passed} checks)`);
