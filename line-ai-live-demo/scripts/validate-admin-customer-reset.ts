import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  buildFreshCustomerRuntimePatch,
  isResettableConversationV2Customer,
} from "../src/lib/admin-customer-reset";

const patch = buildFreshCustomerRuntimePatch({
  current: {
    context_json: {
      activeFocus: { goal: "book_consultation", treatmentKey: "onda_pro" },
      bookingDraft: { branch: "高雄館", phone: "0900000000" },
      contextRevision: 12,
      conversationV2State: { activeTask: { subjectKey: "treatment:onda_pro" } },
      recentTurns: [{ role: "user", text: "ONDA" }],
    },
    state_json: {
      controlRevision: 7,
      handoffReason: "pregnancy_risk",
      status: "handoff_pending",
    },
    updated_at: "2026-08-24T00:00:00.000Z",
  },
  nowIso: "2026-08-24T01:00:00.000Z",
  userId: "test-user",
});

assert.deepEqual(patch.booking_draft_json, { requestedTimeSlots: [], timeSlots: [] });
assert.equal(patch.context_json.userId, "test-user");
assert.equal(patch.context_json.contextRevision, 13);
assert.equal(patch.context_json.introSent, false);
assert.deepEqual(patch.context_json.recentTurns, []);
assert.equal(patch.context_json.activeFocus, undefined);
assert.equal(patch.context_json.conversationV2State, undefined);
assert.deepEqual(patch.context_json.bookingDraft, { requestedTimeSlots: [], timeSlots: [] });
assert.equal(patch.state_json.userId, "test-user");
assert.equal(patch.state_json.status, "ai_active");
assert.equal(patch.state_json.handoffReason, null);
assert.equal(patch.state_json.controlRevision, 8);
assert.equal(patch.state_json.updatedAt, "2026-08-24T01:00:00.000Z");

assert.equal(isResettableConversationV2Customer({
  allowlistedUserIds: ["test-user"],
  mode: "canary",
  userId: "test-user",
}), true);
assert.equal(isResettableConversationV2Customer({
  allowlistedUserIds: ["test-user"],
  mode: "canary",
  userId: "customer",
}), false);
assert.equal(isResettableConversationV2Customer({
  allowlistedUserIds: [],
  mode: "demo_all",
  userId: "demo-customer",
}), true);
assert.equal(isResettableConversationV2Customer({
  allowlistedUserIds: [""],
  mode: "demo_all",
  userId: "",
}), false);

const migration = fs.readFileSync(
  path.join(process.cwd(), "..", "supabase", "migrations", "20260824_admin_reset_canary_customer_state.sql"),
  "utf8",
);
assert.match(migration, /security definer/u);
assert.match(migration, /where tenant_id = p_tenant_id[\s\S]+line_user_id = p_line_user_id[\s\S]+for update/u);
assert.match(migration, /status in \('open', 'taken'\)/u);
assert.match(migration, /v_previous_booking_status in \('new', 'contacted'\)/u);
assert.match(migration, /delete from public\.booking_leads_db/u);
assert.match(migration, /insert into public\.audit_logs/u);
assert.match(migration, /revoke all on function[\s\S]+from public, anon, authenticated/u);
assert.doesNotMatch(migration, /delete\s+from\s+public\.conversation_messages/iu);
assert.doesNotMatch(migration, /booking_status\s*=\s*'new'/u);

const workbenchPage = fs.readFileSync(
  path.join(process.cwd(), "app", "admin", "workbench", "page.tsx"),
  "utf8",
);
const workbenchClient = fs.readFileSync(
  path.join(process.cwd(), "app", "admin", "workbench", "WorkbenchClient.tsx"),
  "utf8",
);
assert.match(workbenchPage, /canResetTestCustomer=\{canAccessSystemAdmin\(staff\.role\)\}/u);
assert.match(workbenchClient, /postControl\("reset_customer"/u);
assert.match(workbenchClient, /歷史訊息會保留，但未完成預約、接手與對話狀態會清除/u);

console.log("validate-admin-customer-reset: PASS");
