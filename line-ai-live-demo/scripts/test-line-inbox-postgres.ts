/** TRUE PostgreSQL tests. Never accepts a URL; requires an explicitly attested disposable LOCAL cluster.
 * Uses separate psql processes/connections, not a fake client. No online credentials or .env loading.
 */
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const binary = process.env.R1_PSQL_BINARY || "psql";
const port = process.env.R1_TEST_PORT || "5432";
const user = process.env.R1_TEST_USER || "postgres";
const database = `r1_test_${Date.now()}_${process.pid}`;
const env = { ...process.env };
for (const key of Object.keys(env)) if (key.startsWith("PG")) delete env[key];
// Optional test-only password; never log or accept a Supabase URL.
if (process.env.R1_TEST_PASSWORD) env.PGPASSWORD = process.env.R1_TEST_PASSWORD;
function exec(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { env, windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`R1_LOCAL_PSQL_FAILED: ${stderr || error.message}`));
      else resolve(stdout.trim());
    });
  });
}
function connectionArgs(db: string) { return ["-X", "-w", "-h", "127.0.0.1", "-p", port, "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-qAt"]; }
function psql(db: string, args: string[]) { return exec([...connectionArgs(db), ...args]); }
function sql(command: string) { return psql(database, ["-c", command]); }
function literal(value: string) { return `'${value.replaceAll("'", "''")}'`; }
function row(value: string): Record<string, unknown> {
  const jsonLine = value.split(/\r?\n/).find((line) => line.startsWith("{"));
  assert.ok(jsonLine, "DB must return a JSON result");
  const parsed: unknown = JSON.parse(jsonLine);
  assert.ok(parsed && typeof parsed === "object" && !Array.isArray(parsed));
  return Object.fromEntries(Object.entries(parsed));
}
function field(result: Record<string, unknown>, key: string): string { const value = result[key]; assert.equal(typeof value, "string"); return String(value); }
async function waitUntil(predicate: () => Promise<boolean>) {
  const deadline = Date.now() + 10000;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error("R1_TEST_BARRIER_TIMEOUT");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
/** Do not equate Promise.all with contention: observe B actually blocked by A before COMMIT. */
async function contend(firstSql: string, secondSql: string, expectBlocked = true): Promise<[string, string]> {
  const child = spawn(binary, connectionArgs(database), { env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let output = ""; let stderr = ""; let exited = false;
  child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { output += chunk; });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  const finished = new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => { exited = true; code === 0 ? resolve() : reject(new Error(`R1_BARRIER_SESSION_FAILED: ${stderr}`)); });
  });
  void finished.catch(() => undefined);
  let second: Promise<string> | undefined;
  try {
    child.stdin.write(`begin; ${firstSql} select 'R1_PID:'||pg_backend_pid(); select 'R1_HOLDING';\n`);
    await waitUntil(async () => { if (exited) throw new Error(`R1_BARRIER_EARLY_EXIT: ${stderr}`); return output.includes("R1_HOLDING"); });
    const pid = output.match(/R1_PID:(\d+)/)?.[1]; assert.ok(pid);
    const name = `r1_waiter_${randomUUID()}`;
    second = sql(`set application_name=${literal(name)}; ${secondSql}`);
    void second.catch(() => undefined);
    if (expectBlocked) {
      await waitUntil(async () => (await sql(`select count(*) from pg_stat_activity where application_name=${literal(name)}
        and wait_event_type='Lock' and ${Number(pid)}=any(pg_blocking_pids(pid));`)) === "1");
    } else {
      await second; // Must finish while A's transaction is still held open.
    }
    child.stdin.end("commit;\n");
    await finished;
    return [output, await second];
  } finally {
    if (!exited) { child.stdin.end(); child.kill(); }
    await finished.catch(() => undefined);
    if (second) await second.catch(() => undefined);
  }
}
function input(eventId: string, sourceId = eventId, text = "測試訊息") {
  return { schemaVersion: 1, destination: "r1-test-bot", eventId, eventType: "message", timestamp: 1700000000000,
    source: { type: "user", id: sourceId }, message: { type: "text", id: `msg-${eventId}`, text } };
}
function admitQuery(value: unknown, redelivery = false) { return `select public.line_inbox_admit('r1-test-channel',${literal(JSON.stringify(value))}::jsonb,${redelivery});`; }
async function admit(value: unknown, redelivery = false) { return row(await sql(admitQuery(value, redelivery))); }
function claimQuery(admitted: Record<string, unknown>, owner: string) {
  return `select public.line_inbox_claim('r1-test-tenant',${literal(field(admitted, "inboxId"))},${literal(field(admitted, "inputHash"))},${literal(owner)},120);`;
}
async function claim(admitted: Record<string, unknown>, owner = randomUUID()) { return row(await sql(claimQuery(admitted, owner))); }
function persistQuery(admitted: Record<string, unknown>, granted: Record<string, unknown>) {
  assert.equal(typeof granted.generation, "number");
  return `select public.line_inbox_persist_customer('r1-test-tenant',${literal(field(admitted, "inboxId"))},${Number(granted.generation)},${literal(field(granted, "owner"))});`;
}
async function expire(admitted: Record<string, unknown>) {
  const id = literal(field(admitted, "inboxId"));
  // Admin-only fault injection, never an application interface.
  await sql(`begin; update public.line_conversation_processing_slots set lease_expires_at=clock_timestamp()-interval '1 second' where inbox_id=${id};
    update public.line_webhook_inbox set lease_expires_at=clock_timestamp()-interval '1 second' where id=${id}; commit;`);
}
async function main() {
  try { await exec(["--version"]); } catch {
    console.log("REAL_DB_TEST_BLOCKED: psql unavailable. See docs/line-inbox-r1.md for disposable local cluster setup."); process.exitCode = 2; return;
  }
  if (process.env.R1_LOCAL_DB_TEST !== "1") {
    console.log("REAL_DB_TEST_BLOCKED: require R1_LOCAL_DB_TEST=1 attesting localhost is a disposable test cluster, NOT a tunnel to DEMO/Production."); process.exitCode = 2; return;
  }
  assert.match(port, /^\d{1,5}$/); assert.ok(Number(port) > 0 && Number(port) < 65536);
  assert.match(database, /^r1_test_\d+_\d+$/);
  // Check roles before creating anything. Do not create cluster-global roles automatically.
  try {
    const roles = await psql("postgres", ["-c", "select count(*) from pg_roles where rolname in ('anon','authenticated','service_role');"]);
    if (roles !== "3") throw new Error("test cluster requires Supabase-equivalent roles");
  } catch {
    console.log("REAL_DB_TEST_BLOCKED: local PostgreSQL unavailable or Supabase-equivalent roles missing."); process.exitCode = 2; return;
  }
  await psql("postgres", ["-c", `create database ${database};`]);
  try {
    // Complete dependency prefix in real repository order; never extract/mock table fragments.
    const migrationDir = path.resolve("../supabase/migrations");
    const dependencies = fs.readdirSync(migrationDir).filter((name) => name.endsWith(".sql") && name <= "20260710_admin_backend_a1.sql").sort();
    assert.equal(dependencies.at(-1), "20260710_admin_backend_a1.sql");
    for (const name of dependencies) {
      try { await psql(database, ["-f", path.join(migrationDir, name)]); }
      catch (error) { console.error(`MIGRATION_CHAIN_BLOCKED_AT: ${name}`); throw error; }
    }
    await psql(database, ["-f", path.resolve("../supabase/migrations/20260910_line_inbox_r1.sql")]);
    console.log(`PASS dependency migration prefix: ${dependencies.join(", ")} + R1`);
    // Repo migrations are once-applied, not idempotent SQL replay. A second R1 apply must fail atomically.
    await assert.rejects(psql(database, ["-f", path.resolve("../supabase/migrations/20260910_line_inbox_r1.sql")]), /42P07/);
    await sql("insert into public.line_inbox_channels values('r1-test-channel','r1-test-tenant','r1-test-bot');");
    const concurrent = input("concurrent");
    const admissions = (await contend(admitQuery(concurrent), admitQuery(concurrent, true))).map(row);
    assert.deepEqual(admissions.map((r) => r.disposition).sort(), ["EXISTING_EVENT", "NEW_EVENT"]);
    assert.equal(admissions[0].inboxId, admissions[1].inboxId);
    assert.equal(await sql("select count(*) from line_webhook_inbox where provider_event_id='concurrent';"), "1");
    console.log("PASS concurrent admission: one canonical aggregate");
    const admitted = admissions[0];
    const claims = (await contend(claimQuery(admitted, randomUUID()), claimQuery(admitted, randomUUID()))).map(row);
    assert.deepEqual(claims.map((r) => r.disposition).sort(), ["CLAIM_GRANTED", "DUPLICATE_ALREADY_OWNED"]);
    const first = claims.find((r) => r.disposition === "CLAIM_GRANTED"); assert.ok(first);
    assert.equal((await claim(admitted)).disposition, "DUPLICATE_ALREADY_OWNED");
    await admit(concurrent, true);
    assert.equal((await claim(admitted)).disposition, "DUPLICATE_ALREADY_OWNED");
    assert.equal(await sql("select receipt_count::text||':'||redelivery_count::text from line_webhook_inbox where provider_event_id='concurrent';"), "3:2");
    console.log("PASS concurrent claim, valid lease, redelivery: one owner");

    await expire(admitted); // F1: worker died after claim.
    await assert.rejects(sql(`select public.line_inbox_renew('r1-test-tenant',${literal(field(admitted, "inboxId"))},${Number(first.generation)},${literal(field(first, "owner"))},30);`), /R1_STALE_FENCE/);
    const recovered = await claim(admitted);
    assert.equal(recovered.disposition, "CLAIM_GRANTED"); assert.equal(recovered.generation, Number(first.generation) + 1);
    await assert.rejects(sql(persistQuery(admitted, first)), /R1_STALE_FENCE/);
    const customerId = await sql(persistQuery(admitted, recovered));
    await expire(admitted); // F2: worker died after the message transaction committed.
    const recoveredAgain = await claim(admitted);
    assert.equal(await sql(persistQuery(admitted, recoveredAgain)), customerId);
    assert.equal(await sql("select count(*) from conversation_messages where source_event_id='concurrent';"), "1");
    await assert.rejects(sql(persistQuery(admitted, recovered)), /R1_STALE_FENCE/);
    console.log("PASS F1/F2 real DB: reclaim, stale fenced writes, idempotent customer message");

    const a = await admit(input("order-a", "same-conversation"));
    const b = await admit(input("order-b", "same-conversation"));
    assert.equal((await claim(b)).disposition, "CONVERSATION_BUSY");
    const sameConversation = (await contend(claimQuery(a, randomUUID()), claimQuery(b, randomUUID()))).map(row);
    assert.equal(sameConversation[0].disposition, "CLAIM_GRANTED");
    assert.equal(sameConversation[1].disposition, "CONVERSATION_BUSY");
    await expire(a);
    assert.equal((await claim(b)).disposition, "CONVERSATION_BUSY");
    const different = await admit(input("different-conversation"));
    const independent = (await contend(claimQuery(a, randomUUID()), claimQuery(different, randomUUID()), false)).map(row);
    assert.equal(independent[0].disposition, "CLAIM_GRANTED");
    assert.equal(independent[1].disposition, "CLAIM_GRANTED");
    console.log("PASS same conversation serialized; expired A cannot be skipped; different conversation independent");

    const earlier = await admit(input("before-uncommitted", "admission-lock"));
    const admissionVsClaim = (await contend(admitQuery(input("uncommitted", "admission-lock")), claimQuery(earlier, randomUUID()))).map(row);
    assert.equal(admissionVsClaim[1].disposition, "CLAIM_GRANTED");
    const persisted = await admit(input("persist-race"));
    const persistingOwner = await claim(persisted);
    const persistId = literal(field(persisted, "inboxId"));
    const persistedVsClaim = await contend(`${persistQuery(persisted, persistingOwner)}
      update line_webhook_inbox set lease_expires_at=clock_timestamp()-interval '1 second' where id=${persistId};
      update line_conversation_processing_slots set lease_expires_at=clock_timestamp()-interval '1 second' where inbox_id=${persistId};`, claimQuery(persisted, randomUUID()));
    const resumed = row(persistedVsClaim[1]);
    assert.equal(resumed.disposition, "CLAIM_GRANTED");
    await sql(persistQuery(persisted, resumed));
    assert.equal(await sql("select count(*) from conversation_messages where source_event_id='persist-race';"), "1");
    await assert.rejects(sql(persistQuery(persisted, persistingOwner)), /R1_STALE_FENCE/);
    console.log("PASS actual lock contention: uncommitted admission/claim and customer persist/reclaim");

    const rollback = await admit(input("rollback"));
    await sql(`begin; ${claimQuery(rollback, randomUUID())} rollback;`);
    assert.equal(await sql("select claim_generation from line_webhook_inbox where provider_event_id='rollback';"), "0");
    assert.equal(await sql("select count(*) from line_conversation_processing_slots where source_id='rollback' and inbox_id is not null;"), "0");
    assert.equal((await claim(rollback)).disposition, "CLAIM_GRANTED");
    console.log("PASS transaction rollback leaves no half claim");

    const conflict = await admit(input("conflict"));
    assert.equal((await admit(input("conflict", "conflict", "different text"))).disposition, "IDENTITY_CONFLICT");
    assert.equal((await claim(conflict)).disposition, "INCIDENT");
    const secondary = await admit(input("secondary"));
    const collision = input("other-event"); collision.message.id = "msg-secondary";
    assert.equal((await admit(collision)).disposition, "IDENTITY_CONFLICT");
    assert.equal((await claim(secondary)).disposition, "INCIDENT");
    // A postback/quote reference is not the identity of the original message event.
    assert.equal((await admit({ ...input("postback"), eventType: "postback", message: { type: "reference", id: "msg-secondary" }, postback: { data: "test" } })).disposition, "NEW_EVENT");
    console.log("PASS immutable hash conflict and event-family-scoped message identity");

    const decided = await admit(input("decided"));
    await sql("update line_webhook_inbox set phase='decision_committed',decision_committed_at=now() where provider_event_id='decided';");
    assert.equal((await claim(decided)).disposition, "RECOVERY_REQUIRED");
    await sql("update line_webhook_inbox set phase='completed',input_retention_at=now()-interval '1 day' where provider_event_id='decided';");
    await sql("update line_webhook_inbox set input_json=null,input_purged_at=now() where provider_event_id='decided';");
    assert.equal((await admit(input("decided"))).disposition, "EXISTING_EVENT");
    assert.equal((await claim(decided)).disposition, "DUPLICATE_COMPLETED");
    assert.equal((await admit(input("decided", "decided", "different"))).disposition, "IDENTITY_CONFLICT");
    assert.equal((await claim(decided)).disposition, "INCIDENT");
    console.log("PASS committed recovery and retained tombstone, including post-purge conflict");

    await assert.rejects(sql("update line_webhook_inbox set input_hash=repeat('b',64) where provider_event_id='rollback';"), /R1_IDENTITY_IMMUTABLE/);
    await assert.rejects(sql("update line_webhook_inbox set input_json=null,input_purged_at=now() where provider_event_id='rollback';"), /R1_INPUT_IMMUTABLE/);
    for (const role of ["anon", "authenticated"]) {
      assert.equal(await sql(`select has_function_privilege('${role}','public.line_inbox_claim(text,uuid,text,uuid,integer)','EXECUTE');`), "f");
      assert.equal(await sql(`select has_table_privilege('${role}','public.line_webhook_inbox','SELECT');`), "f");
    }
    assert.equal(await sql("select has_function_privilege('service_role','public.line_inbox_assert_fence(text,uuid,bigint,uuid)','EXECUTE');"), "f");
    assert.equal(await sql("select has_table_privilege('service_role','public.line_webhook_inbox','UPDATE');"), "f");
    assert.equal(await sql("select has_function_privilege('service_role','public.line_inbox_claim(text,uuid,text,uuid,integer)','EXECUTE');"), "t");
    const serviceInput = input("service-call");
    assert.equal(row(await sql(`set role service_role; ${admitQuery(serviceInput)}`)).disposition, "NEW_EVENT");
    await assert.rejects(sql(admitQuery({ ...input("bad-input"), replyToken: "must-not-persist" })), /R1_INVALID_INPUT/);
    await assert.rejects(sql(admitQuery({ ...input("bad-nested"), source: { type: "user", id: "test", profile: "must-not-persist" } })), /R1_INVALID_INPUT/);
    await assert.rejects(sql(admitQuery({ ...input("bad-destination"), destination: "unverified" })), /R1_INVALID_INPUT/);
    for (const postback of [undefined, null, {}, { data: "" }]) {
      await assert.rejects(sql(admitQuery({ ...input("bad-postback"), eventType: "postback", postback })), /R1_INVALID_INPUT/);
    }
    assert.equal(await sql("select count(*) from line_webhook_inbox where provider_event_id='bad-postback';"), "0");
    assert.equal(await sql("select count(*) from line_conversation_processing_slots where source_id='bad-postback';"), "0");
    await assert.rejects(sql(`select public.line_inbox_claim('other-tenant',${literal(field(admitted, "inboxId"))},${literal(field(admitted, "inputHash"))},${literal(randomUUID())},30);`));
    console.log("PASS immutable input, retention and service-role RPC boundary");
    console.log("REAL_DB_TEST_PASS: R1 only; not R2/R3/live certification");
  } finally {
    // Only this invocation's newly-created, validated disposable DB. No filesystem or remote cleanup.
    await psql("postgres", ["-c", `drop database ${database};`]);
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
