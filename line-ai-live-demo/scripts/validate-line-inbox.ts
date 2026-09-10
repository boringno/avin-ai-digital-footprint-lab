import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createInboxStore, inboxActionIdentity, inboxTrace, prepareVerifiedInboxEvents } from "../src/lib/line-inbox";

async function main() {
  const channel = { channelRef: "test-channel", destination: "test-bot", channelSecret: "test-only-not-a-secret" };
  const event = { webhookEventId: "event-1", timestamp: 1700000000000, type: "message", source: { type: "user", userId: "test-user", profile: "omit" },
    message: { id: "message-1", type: "text", text: "  測試\n原文  ", quotedMessageId: "quote-1", quoteToken: "omit" }, replyToken: "omit", deliveryContext: { isRedelivery: false } };
  function prepare(events: unknown[], destination = channel.destination) {
    const raw = JSON.stringify({ destination, events, tenant_id: "untrusted" });
    const signature = createHmac("sha256", channel.channelSecret).update(raw).digest("base64");
    return prepareVerifiedInboxEvents(raw, signature, channel);
  }
  assert.throws(() => prepareVerifiedInboxEvents("{}", "bad", channel), /SIGNATURE/);
  assert.throws(() => prepare([event], "other-bot"), /DESTINATION/);
  assert.throws(() => prepare([{ ...event, webhookEventId: undefined }]), /STRING/);
  const original = prepare([event])[0];
  const repeated = prepare([{ ...event, replyToken: "changed", deliveryContext: { isRedelivery: true } }])[0];
  assert.deepEqual(original.input, repeated.input);
  assert.equal(repeated.isRedelivery, true);
  assert.equal(original.input.message?.text, event.message.text);
  assert.equal(original.input.message?.quotedMessageId, "quote-1");
  assert.doesNotMatch(JSON.stringify(original), /replyToken|quoteToken|profile|untrusted/);
  const postback = prepare([{ ...event, type: "postback", postback: { data: "action=consult", params: { date: "2026-09-10", secret: "omit" } } }])[0];
  assert.equal(postback.input.postback?.params?.date, "2026-09-10");
  assert.equal(postback.input.message, undefined);
  for (const invalid of [undefined, null, {}, { data: "" }]) {
    assert.throws(() => prepare([{ ...event, type: "postback", postback: invalid }]), /R1_INVALID/);
  }
  const group = prepare([{ ...event, source: { type: "group", groupId: "test-group", userId: "test-user" } }])[0];
  assert.equal(group.input.source.id, "test-group");
  const id = "00000000-0000-4000-8000-000000000001";
  const decisionId = "00000000-0000-4000-8000-000000000002";
  const admission = { disposition: "NEW_EVENT", inboxId: id, tenantId: "test-tenant", inputHash: "a".repeat(64), decisionId } as const;
  let reply: unknown = admission;
  let lastArgs: Record<string, unknown> = {};
  const store = createInboxStore({ rpc: async (_name, args) => { lastArgs = args; return { data: reply, error: null }; } });
  assert.deepEqual(await store.admit(original), admission);
  assert.equal(lastArgs.p_tenant, undefined); // DB channel mapping owns tenant.
  reply = { disposition: "CLAIM_GRANTED", inboxId: id, owner: id, generation: 1, processingAttempt: 1, leaseExpiresAt: "2030-01-01T00:00:00Z", decisionId };
  const claim = await store.claim(admission, id);
  assert.equal(claim.disposition, "CLAIM_GRANTED");
  assert.doesNotMatch(JSON.stringify(inboxTrace(original, admission, claim)), /原文|test-user|replyToken|channelSecret/);
  if (claim.disposition === "CLAIM_GRANTED") {
    reply = id;
    assert.equal(await store.persistCustomer(claim.fence), id);
    assert.deepEqual(lastArgs, { p_tenant: "test-tenant", p_inbox: id, p_generation: 1, p_owner: id });
    reply = "2030-01-01T00:00:00Z";
    assert.equal(await store.renew(claim.fence), reply);
  }
  reply = { disposition: "CLAIM_GRANTED", inboxId: id, owner: id, generation: 0, processingAttempt: 1, leaseExpiresAt: "2030-01-01T00:00:00Z", decisionId };
  await assert.rejects(store.claim(admission, id), /INVALID_INTEGER/);
  for (const disposition of ["INCIDENT", "DUPLICATE_COMPLETED", "DUPLICATE_ALREADY_OWNED", "CONVERSATION_BUSY"]) {
    reply = { disposition }; assert.equal((await store.claim(admission, id)).disposition, disposition);
  }
  reply = { disposition: "RECOVERY_REQUIRED", decisionId };
  assert.equal((await store.claim(admission, id)).disposition, "RECOVERY_REQUIRED");
  reply = { disposition: "DUPLICATE" };
  await assert.rejects(store.claim(admission, id), /UNKNOWN_CLAIM/);
  const failed = createInboxStore({ rpc: async () => ({ data: null, error: { message: "sensitive-provider-error" } }) });
  await assert.rejects(failed.admit(original), /^Error: R1_RPC_FAILED$/);
  assert.equal(inboxActionIdentity(decisionId, "persist_state", 0), inboxActionIdentity(decisionId, "persist_state", 0));
  assert.notEqual(inboxActionIdentity(decisionId, "persist_state", 0), inboxActionIdentity(decisionId, "handoff", 0));
  // Compile-time compatibility only. Creating this client issues no request.
  createInboxStore(createClient("http://127.0.0.1:1", "test-key", { auth: { persistSession: false, autoRefreshToken: false } }));
  const migration = fs.readFileSync(path.resolve("../supabase/migrations/20260910_line_inbox_r1.sql"), "utf8");
  assert.match(migration, /for update/);
  assert.match(migration, /R1_STALE_FENCE/);
  assert.match(migration, /where event_type = 'message'/);
  assert.doesNotMatch(migration, /on delete cascade|delivery_commit_json|delivery_attempts/i);
  for (const file of ["src/lib/line-webhook.ts", "app/api/line/webhook/route.ts"]) {
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /from ["'][^"']*line-inbox/);
  }
  console.log("PASS R1 unit/adapter/security-projection contracts; NOT a DB concurrency result; NOT_YET_WIRED");
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
