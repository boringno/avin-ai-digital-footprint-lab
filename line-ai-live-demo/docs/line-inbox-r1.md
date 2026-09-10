# R1 durable inbox foundation — NOT_YET_WIRED

Base: `cbc31c8bd81faf6aeaccb6c96ebda10a3ed7d067`. This is local groundwork,
not Deploy GO, Reliability GO or Formal LINE GO. No live webhook caller imports
`line-inbox.ts`; no existing response, state, pricing, handoff or delivery behavior changes.

## Scope and provenance

Selective recovery of the old `codex/line-delivery-outbox` prototype's event identity,
durable ledger and test ideas only. No merge, cherry-pick, old customer-service code,
outbox dispatcher, arbitrary delivery JSON, cascade retention or generic 23505 duplicate handling.
The RPC transaction boundary and generation/slot fencing are new R1 implementation.

## Admission and authority

`prepareVerifiedInboxEvents(rawBody, signature, trustedChannel)` reuses the existing
LINE signature verifier before parsing, verifies destination against server configuration,
then projects an explicit field allowlist. The caller must load `trustedChannel` from
server-owned configuration, never request fields. No tenant argument is accepted in this step.
`line_inbox_admit` obtains tenant/destination from `line_inbox_channels`, checks destination
again, hashes normalized JSONB in PostgreSQL and atomically inserts or classifies conflict.
RPC access itself is service-role only; SQL is not an alternative signature-verification endpoint.

Canonical unique key: `(tenant_id, channel_ref, provider, provider_event_id)`.
Message secondary uniqueness is only for original `message` events; quote IDs/postbacks
are not the original message's identity. No fallback identity from text, timestamp or reply token.

First-clinic constraint: one channel mapping per tenant, reflecting existing
`conversations(tenant_id,line_user_id)` and message `(tenant_id,source_event_id)` identities.
Mapping rows are insert-only to service role. Supporting multiple channels under one tenant
requires a separate review of those existing identities; R1 must not silently conflate them.
No real mapping rows are provisioned by this migration.

Minimal durable input: exact customer text, type, event/message IDs, timestamp,
source scope, optional group/room sender ID, quote reference, postback data/date parameters,
mode, schema version and verified destination. Non-text binary content/profile data is not stored.
The current customer persistence RPC supports one-to-one text only; group/room/non-text
support must not change their existing live behavior when eventually wiring R1.

Transport metadata (`isRedelivery`, receipt time, tokens) is excluded from input hash.
Receipt and redelivery counters are independently updated. Reply tokens are **not stored**
in R1, even in trace. R2 will need a separately protected token/delivery contract; R1
alone cannot recover/send a LINE reply. No raw webhook is retained.

## Transaction and recovery contract

All claim/effect RPCs lock conversation slot then inbox row. Admission also holds that
slot before assigning sequence, so a later admission cannot skip an uncommitted earlier one.
Ordering is DB admission order, not a claim that LINE timestamp order is guaranteed.

| Claim result | Caller obligation |
| --- | --- |
| CLAIM_GRANTED | Computation may start under returned fence; effects still require fenced transactions. |
| DUPLICATE_ALREADY_OWNED | Do not start another processor. |
| CONVERSATION_BUSY | Do not process B using stale context or skip unresolved A. |
| RECOVERY_REQUIRED | Durable decision/effect exists; do not reroute/reapply business effects. Await R2/R3 recovery. |
| DUPLICATE_COMPLETED | Stop; retained identity remains authoritative. |
| INCIDENT | Fail closed; no processing or legacy fallback. |

An expired lease on **the same event**, without a committed decision/effect, allows a new
generation and increments attempt count. An expired slot owned by a **different unresolved
event** does not allow bypass. Independent conversations have independent slots.

`line_inbox_assert_fence(tenant,inbox,generation,owner)` is an internal function, not a
service-client precheck endpoint. It verifies inbox+slot generation, owner, phase, lease
and committed markers while holding locks. Future R2/R3 effect RPCs must call it **inside
the same DB transaction as their effects**. Checking it then writing in another RPC is unsafe.
R1's `line_inbox_persist_customer` demonstrates this boundary; old generations cannot write.
`line_inbox_renew` cannot revive an expired/stale claim.

Customer persistence reuses existing message event uniqueness, compares an existing row's
identity/content before reuse, and records its UUID on inbox in the same transaction.
No booking, lead, handoff or V2 state mutations are introduced. Existing message retention
may remove the visible row later; the durable receipt still prevents recreating it.

The preallocated `decision_id` is an identity, **not evidence of a committed decision**.
Only phase/commit markers authorize recovery disposition. `inboxActionIdentity` derives
stable action identifiers independent of generation. Future effect tables need unique
constraints and fenced transactions; this helper alone does not make Lead/Handoff idempotent.
`(tenant_id,id)` is available for a future tenant-scoped outbox FK. No outbox table is added.

## Security / trace / retention

RLS is enabled; anon/authenticated have neither table access nor RPC execution.
Service-role has read access and narrow SECURITY DEFINER RPCs, not ledger UPDATE/DELETE.
Function search paths are fixed; the internal fence is not service-executable.
`inboxTrace` returns only event/message/inbox IDs, hash, disposition, generation,
lease owner and attempt; it is not yet connected to live Admin trace.

Identity/input hash are immutable. Input may only be purged after completed + retention
expiry, preserving the row as a tombstone. No cleanup RPC/job or DELETE permission is provided.
Processing, unresolved and incident rows are not silently swept. A conflict after a completed
input purge records an incident diagnostic without resurrecting input or processing.

## Local validation

`npm run validate:line-inbox` checks projection, authentication, typed adapter dispositions,
fail-closed RPC behavior, stable action IDs and NOT_YET_WIRED scope. It is included in CI.
It is **not** DB proof.

`npm run test:line-inbox-postgres` is a real multi-connection PostgreSQL test runner:

- Requires installed `psql` and a disposable, local PostgreSQL 15+ cluster with existing
  `anon`, `authenticated`, `service_role` roles and a test superuser able to create databases.
- Explicitly set `R1_LOCAL_DB_TEST=1` only when `127.0.0.1` is that local cluster,
  **not a port-forward/tunnel to any online database**.
- Optional test-only settings: `R1_PSQL_BINARY`, `R1_TEST_PORT`, `R1_TEST_USER`,
  `R1_TEST_PASSWORD`. No application env files, Supabase URL or service key are read.
- Creates a uniquely named `r1_test_<timestamp>_<pid>` database, loads complete repository
  migration files in order from `20260622_line_ai_live_demo_mvp.sql` through
  `20260710_admin_backend_a1.sql` (the five-file dependency prefix), then R1, tests via separate psql processes,
  then drops only that newly created database. Never points at DEMO/Production.
- Missing PostgreSQL/roles/attestation yields `REAL_DB_TEST_BLOCKED` (exit 2), not PASS.
- A migration failure reports `MIGRATION_CHAIN_BLOCKED_AT`; no extracted/mock DDL fallback.
  Reapplying R1 is expected to fail with SQLSTATE 42P07 and roll back its transaction.
- Contention tests hold connection A's transaction open, start B independently, and use
  an observer connection to require a PostgreSQL lock wait blocked by A before releasing A.
  The independent-conversation test instead requires B to finish before A commits.
- This dependency prefix does not replace a future full migration-chain test on a disposable
  Supabase-equivalent database before migration approval.

Coverage: concurrent admission; concurrent claim; valid lease denial; F1 expiry/reclaim;
old-generation fenced customer writes; F2 persisted-message recovery; immutable input conflict;
redelivery receipt count; same-conversation serialization; independent conversations;
rollback without half claim; secondary identity; decision recovery; tombstones;
immutable input; service-role boundary. Customer fixtures contain no real PII.

## Remaining gates and rollback

### GitHub isolated PostgreSQL gate (2026-09-10)

Temporary validation branch: `codex/r1-real-postgres-validation`; not a product checkpoint.
Its exact `vercel.json` git.deploymentEnabled exclusion is false only for this branch.
No global Preview/environment/credential setting is changed. Retain the exclusion until
the temporary branch is no longer pushed; do not remove it then push test code.

Existing `line-ai-live-demo-ci.yml` accepts manual `r1_db_gate=true` on this exact branch
and calls `r1-postgres-validation.yml`. Push cannot run the DB job. No secrets are inherited.
The caller already exists on default branch, avoiding a main merge just to register dispatch.
PostgreSQL is pinned to 15.18, exercising the documented PG15+ R1 baseline and core SQL
features, not asserting the remote Supabase patch version or full extension parity.
Only ephemeral runner-local service credentials are used; roles are provisioned solely in
the new container. Real Supabase deployment/permission parity remains a separate gate.

First run: https://github.com/boringno/avin-ai-digital-footprint-lab/actions/runs/34438885913
at `68429fd26c38a5d18e2c0768c1fb9a62189c5ddd`: actual PostgreSQL job PASS, including the
five complete dependency migrations + R1, observed contention, F1/F2 and stale fencing.
No Vercel deployment existed for that branch/SHA before dispatch.
Additional test-only assertions cover injected claim+customer-receipt rollback, natural
DB-clock lease expiry and the service-role claim/renew/persist path; these require a new
run before claiming the expanded gate passed. Historical blocked results below describe
the previous local-only stage, not the successful first CI run.

### Local execution record (2026-09-10)

- PASS: `validate:line-inbox`, `validate:webhook-reliability` (also invokes required-response
  obligation webhook tests), `validate:line-delivery-commit`, `validate:conversation-v2-quick-replies`,
  `validate:reply-renderer`, `validate:reply-plan`, `validate:pricing-subject`,
  `validate:runtime-releases`, `validate:conversation-v2-journey`, `validate:router`,
  `validate:safety-preflight`, `validate:post-procedure-safety`,
  `validate:anniversary-promotion-assets`, `validate:pregnancy-risk-handoff`.
- PASS: TypeScript check and Next production build. Build is local, not deployment.
- `REAL_DB_TEST_BLOCKED`: runner executed, exit 2 because `psql` was unavailable. Neither
  SQL execution nor concurrency/failure-injection assertions have been verified on a real DB.
- Existing failure classified REGRESSION: `validate:response-contract`, RC1f2 at line 491
  expects `shadow`, gets `enforce`. Fresh-process isolation with supported `shadow` rules out
  previous-command contamination. The test intentionally evaluates policy in `enforce` mode.
  `resolveExplicitCampaignContext` treats the concern `雙下巴` as an explicit campaign alias,
  excludes the ONDA offer, and produces `unavailable_to_quote:not_provided`. Without an approved
  price, hydration skips the supplement path whose low-confidence result should downgrade mode.
  In-memory-only isolation of campaign context to `ONDA 活動價多少？` makes the original assertion
  pass. This is a pre-existing customer-facing false-unavailable pricing path, not an R1 change.
  Customer-service source and validator remain unchanged. Separate pricing review/fix is required.
- PRE_EXISTING_CI_GAP: HEAD omitted `validate:concern-candidate-projection` from the workflow.
  Added that one existing validator invocation; `validate:ci-parity` now passes (94 validators),
  as does `validate:concern-candidate-projection`. This is not R1 DB correctness evidence.
- One retry used unsupported test-process contract mode `off`; those configuration errors
  were discarded and the affected tests rerun with supported `shadow`. No stored env changed.

Therefore this is an implementation review candidate with explicit outstanding gates, not
an all-green R1 acceptance or live reliability claim. No customer-service fixes were made
to force existing validators to pass.

### Independent review and environment resolution (2026-09-10)

- A non-author reviewer identified two MEDIUM issues: SQL admitted malformed postbacks that
  the adapter rejected, and concurrency tests could pass without demonstrated contention.
  SQL now rejects absent/null/empty postback data, with adapter/DB regression cases; the DB
  runner now uses observed lock barriers. Re-review found no remaining proven BLOCKER/HIGH.
- Added persist/reclaim transaction interleaving and uncommitted-admission ordering coverage.
  These DB assertions are authored, not executed successfully.
- Read-only discovery covered PATH, Windows services, installed-app registry, common install
  directories, WSL, Node packages, repository/local infrastructure and CI configuration.
  No usable PostgreSQL server/client, Docker, Supabase CLI/local stack, pg/testcontainers or CI
  PostgreSQL service was found. WSL executable exists but the subsystem is not installed.
- No system software/dependency was installed and no remote database was used. The runner
  still exits 2 for missing psql. Migration, two-connection, fencing, rollback and F1/F2 results
  remain NOT_RUN; static review is not a deadlock-free proof.
- Verdict: R1_IMPLEMENTED_BUT_UNVERIFIED. Neither checkpoint readiness nor R2/launch GO is
  established. A disposable real PostgreSQL environment and the separate existing pricing
  regression must be resolved before the requested acceptance gate can pass.

Existing `/tmp` dedupe remains **PENDING_REMOVAL**, still serving the unchanged live path.
The new inbox is not an additional partial live authority. Remove legacy correctness-critical
dedupe only after R2/R3 completion, independent review, true DB tests and an approved complete cutover.

R2 still owns durable decision/effect finalization, completion/slot release, outbox,
delivery begin/attempts, UNKNOWN handling, protected token storage and recovery scheduling.
R3 still owns handoff task uniqueness and notification idempotency. Existing state CAS/control
revisions remain mandatory at integration. R1 does not claim to fence old, unwired writers.

Before any live wiring: real DB concurrency + full migration compatibility, independent
review, channel mapping provisioning review, and R2/R3 integration coverage are required.
Migration has not been executed on DEMO/Production. Temporary validation commits/pushes
are authorized for this CI gate only; no merge or deployment is authorized.
Local rollback is removal/reversion of only these R1 changes, preserving AGENTS.md.
After any future DB adoption, do not drop retained identities to roll back code; disable the
new path and preserve evidence, then obtain a separate migration rollback decision.
