import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createEmptyConversationContext,
  loadConversationContext,
  mergeConcurrentConversationContexts,
  saveConversationContext,
} from "../src/lib/conversation-context";
import {
  createConversationStatePersistenceEnvelope,
  loadScopedConversationStateEnvelope,
  parseConversationStatePersistenceEnvelope,
  preserveConversationStateEnvelope,
  type ConversationStatePersistenceEnvelope,
  type PreservedConversationStateEnvelope,
} from "../src/lib/conversation-v2/state-envelope";
import { createConversationV2State } from "../src/lib/conversation-v2/state";
import type { ConversationStateV3Registry } from "../src/lib/conversation-v2/state-v3";

const NOW = "2026-08-20T10:00:00.000Z";
const LATER = "2026-08-20T10:01:00.000Z";
const REGISTRY: ConversationStateV3Registry = {
  answerKeys: new Set(["yes", "no"]),
  approvedFactIds: new Set(),
  areaKeys: new Set(["lower_face"]),
  concernKeys: new Set(["jawline_looseness"]),
  treatmentKeys: new Set(["onda_pro"]),
};

function knownEnvelope(input: {
  registryId?: string;
  revision: number;
  tenantId?: string;
  updatedAt: string;
}) {
  const state = createConversationV2State({ episodeId: "episode-envelope", now: input.updatedAt });
  state.revision = input.revision;
  state.updatedAt = input.updatedAt;
  state.knowledge = {
    approvedFactIds: [],
    areaKeys: ["lower_face"],
    concernKeys: ["jawline_looseness"],
    treatmentKeys: ["onda_pro"],
  };
  state.activeTask = {
    id: "task-onda",
    kind: "learn_treatment",
    startedAt: input.updatedAt,
    subjectKey: "treatment:onda_pro",
  };
  return createConversationStatePersistenceEnvelope({
    registryId: input.registryId ?? "registry-a-v1",
    state,
    tenantId: input.tenantId ?? "tenant-a",
  });
}

function futureEnvelope(): ConversationStatePersistenceEnvelope {
  return {
    envelopeSchemaVersion: 1,
    registryId: "registry-a-v2",
    state: {
      dialogueProgress: { futureField: ["keep", { nested: true }] },
      revision: 99,
      schemaVersion: 4,
      updatedAt: "2026-08-20T10:02:00.000Z",
    },
    stateRevision: 99,
    stateUpdatedAt: "2026-08-20T10:02:00.000Z",
    tenantId: "tenant-a",
  };
}

function futureOuterEnvelope(): PreservedConversationStateEnvelope {
  return {
    envelopeSchemaVersion: 2,
    registryId: "registry-a-v1",
    state: {
      revision: 500,
      schemaVersion: 8,
      updatedAt: "2026-08-20T10:05:00.000Z",
    },
    stateRevision: 500,
    stateUpdatedAt: "2026-08-20T10:05:00.000Z",
    tenantId: "tenant-a",
    futureEnvelopeMetadata: { preserve: true },
  };
}

function validateScopeAndVersionLoading() {
  const envelope = knownEnvelope({ revision: 3, updatedAt: NOW });
  const creationState = createConversationV2State({ episodeId: "exact-scope", now: NOW });
  assert.throws(
    () => createConversationStatePersistenceEnvelope({
      registryId: " registry-a-v1 ",
      state: creationState,
      tenantId: "tenant-a",
    }),
    /exact tenantId and registryId/,
    "ENV-1: envelope creation must not normalize malformed scope identifiers",
  );
  const parsed = parseConversationStatePersistenceEnvelope(envelope);
  assert.equal(parsed.kind, "valid", "ENV-1: a known envelope must parse");

  const loaded = loadScopedConversationStateEnvelope(envelope, {
    registry: REGISTRY,
    registryId: "registry-a-v1",
    tenantId: "tenant-a",
  });
  assert.equal(loaded.kind, "state", "ENV-1: matching tenant and registry must load state");
  if (loaded.kind === "state") {
    assert.equal(loaded.stateLoad.kind, "migrated", "ENV-1: schema-2 state must migrate only after registry injection");
  }
  assert.equal(
    loadScopedConversationStateEnvelope(envelope, {
      registry: REGISTRY,
      registryId: "registry-a-v1",
      tenantId: "tenant-b",
    }).kind,
    "tenant_mismatch",
    "ENV-1: another tenant must fail closed",
  );
  assert.equal(
    loadScopedConversationStateEnvelope(envelope, {
      registry: REGISTRY,
      registryId: "registry-a-v2",
      tenantId: "tenant-a",
    }).kind,
    "registry_mismatch",
    "ENV-1: a different canonical registry must fail closed",
  );
  assert.equal(
    loadScopedConversationStateEnvelope(envelope, {
      registry: REGISTRY,
      registryId: " registry-a-v1 ",
      tenantId: "tenant-a",
    }).kind,
    "registry_mismatch",
    "ENV-1: expected scope identifiers must also be exact",
  );
  const noRegistry = loadScopedConversationStateEnvelope(envelope, {
    registryId: "registry-a-v1",
    tenantId: "tenant-a",
  });
  assert.equal(noRegistry.kind, "state");
  if (noRegistry.kind === "state") {
    assert.equal(noRegistry.stateLoad.kind, "needs_ontology", "ENV-1: missing registry must not create a fresh state");
  }

  const future = futureEnvelope();
  const futureLoad = loadScopedConversationStateEnvelope(future, {
    registry: REGISTRY,
    registryId: "registry-a-v2",
    tenantId: "tenant-a",
  });
  assert.equal(futureLoad.kind, "state");
  if (futureLoad.kind === "state") {
    assert.equal(futureLoad.stateLoad.kind, "future", "ENV-1: a future state must remain opaque");
    if (futureLoad.stateLoad.kind === "future") {
      assert.deepEqual(futureLoad.stateLoad.raw, future.state, "ENV-1: future raw JSON must remain lossless");
    }
  }

  const metadataMismatch = structuredClone(envelope) as unknown as Record<string, unknown>;
  metadataMismatch.stateRevision = 999;
  assert.equal(
    parseConversationStatePersistenceEnvelope(metadataMismatch).kind,
    "invalid",
    "ENV-1: known state metadata mismatch must be rejected",
  );
  for (const field of ["tenantId", "registryId"] as const) {
    const whitespaceScope = structuredClone(envelope) as unknown as Record<string, unknown>;
    whitespaceScope[field] = ` ${String(whitespaceScope[field])} `;
    assert.equal(
      parseConversationStatePersistenceEnvelope(whitespaceScope).kind,
      "invalid",
      `ENV-1: ${field} must be an exact scope identifier`,
    );
  }

  const futureOuter = parseConversationStatePersistenceEnvelope(futureOuterEnvelope());
  assert.equal(futureOuter.kind, "future_envelope", "ENV-1: a future outer envelope must remain opaque");
  if (futureOuter.kind === "future_envelope") {
    assert.equal(futureOuter.version, 2);
    assert.deepEqual(futureOuter.raw, futureOuterEnvelope());
  }

  for (const invalidRaw of [null, 42, "diagnostic", ["keep", { nested: true }]]) {
    const invalid = parseConversationStatePersistenceEnvelope(invalidRaw);
    assert.equal(invalid.kind, "invalid", "ENV-1: non-object JSON is invalid rather than missing");
    if (invalid.kind === "invalid") assert.deepEqual(invalid.raw, invalidRaw);
  }

  const inheritedMetadata = Object.create({
    envelopeSchemaVersion: 1,
    registryId: "registry-a-v1",
    state: envelope.state,
    stateRevision: envelope.stateRevision,
    stateUpdatedAt: envelope.stateUpdatedAt,
    tenantId: "tenant-a",
  });
  assert.equal(
    parseConversationStatePersistenceEnvelope(inheritedMetadata).kind,
    "invalid",
    "ENV-1: inherited metadata must never validate as an own JSON envelope",
  );
  const ownProto = JSON.parse('{"__proto__":{"preserve":true},"diagnostic":"opaque"}') as unknown;
  const clonedProto = preserveConversationStateEnvelope(ownProto);
  assert.equal(Object.prototype.hasOwnProperty.call(clonedProto, "__proto__"), true);
  assert.deepEqual(clonedProto, ownProto, "ENV-1: legal __proto__ JSON keys must survive cloning");
}

function contextWithEnvelope(
  userId: string,
  envelope: PreservedConversationStateEnvelope,
  lastSeenAt: string,
) {
  return {
    ...createEmptyConversationContext(userId),
    conversationStateEnvelope: structuredClone(envelope),
    lastSeenAt,
  };
}

function validateAtomicConflictOrdering() {
  const userId = "state-envelope-cas";
  const baseEnvelope = knownEnvelope({ revision: 1, updatedAt: NOW });
  const base = contextWithEnvelope(userId, baseEnvelope, NOW);
  const latest = contextWithEnvelope(
    userId,
    knownEnvelope({ revision: 2, updatedAt: "2026-08-20T10:00:30.000Z" }),
    "2026-08-20T10:03:00.000Z",
  );
  latest.lastIntent = "latest-unrelated";
  const incoming = contextWithEnvelope(
    userId,
    knownEnvelope({ revision: 3, updatedAt: LATER }),
    "2026-08-20T09:59:00.000Z",
  );
  incoming.preferredBranch = "高雄館";

  const merged = mergeConcurrentConversationContexts(latest, incoming, base);
  assert.deepEqual(
    merged.conversationStateEnvelope,
    incoming.conversationStateEnvelope,
    "ENV-2: inner stateUpdatedAt must win over an unrelated outer lastSeenAt",
  );
  assert.equal(merged.lastIntent, "latest-unrelated", "ENV-2: unrelated latest fields must survive rebase");
  assert.equal(merged.preferredBranch, "高雄館", "ENV-2: unrelated incoming fields must survive rebase");

  const future = contextWithEnvelope(userId, futureEnvelope(), "2026-08-20T09:00:00.000Z");
  const oldWriter = contextWithEnvelope(
    userId,
    knownEnvelope({ revision: 100, updatedAt: "2026-08-20T11:00:00.000Z" }),
    "2026-08-20T11:00:00.000Z",
  );
  const futureWins = mergeConcurrentConversationContexts(oldWriter, future, base);
  assert.deepEqual(
    futureWins.conversationStateEnvelope,
    future.conversationStateEnvelope,
    "ENV-2: an older runtime must never downgrade a future schema",
  );

  const futureOuter = contextWithEnvelope(userId, futureOuterEnvelope(), "2026-08-20T09:00:00.000Z");
  for (const [latestSide, incomingSide] of [
    [oldWriter, futureOuter],
    [futureOuter, oldWriter],
  ] as const) {
    const mergedOuter = mergeConcurrentConversationContexts(latestSide, incomingSide, base);
    assert.deepEqual(
      mergedOuter.conversationStateEnvelope,
      futureOuter.conversationStateEnvelope,
      "ENV-2: a current writer must not downgrade a future outer envelope in either merge direction",
    );
  }
  for (const [latestSide, incomingSide] of [
    [oldWriter, futureOuter],
    [futureOuter, oldWriter],
  ] as const) {
    const mergedWithoutBase = mergeConcurrentConversationContexts(latestSide, incomingSide);
    assert.deepEqual(
      mergedWithoutBase.conversationStateEnvelope,
      futureOuter.conversationStateEnvelope,
      "ENV-2: optional-base callers must still preserve a future outer envelope",
    );
  }

  const invalidRaw = {
    diagnostic: { keep: true },
    envelopeSchemaVersion: 1,
    registryId: "registry-a-v1",
    tenantId: "tenant-a",
  };
  const invalidBase = contextWithEnvelope(userId, invalidRaw, NOW);
  const invalidPreserved = mergeConcurrentConversationContexts(invalidBase, oldWriter, invalidBase);
  assert.deepEqual(
    invalidPreserved.conversationStateEnvelope,
    invalidRaw,
    "ENV-2: a current writer must not erase an opaque envelope inherited from its base",
  );

  const tenantB = contextWithEnvelope(
    userId,
    knownEnvelope({ revision: 200, tenantId: "tenant-b", updatedAt: "2026-08-20T12:00:00.000Z" }),
    "2026-08-20T12:00:00.000Z",
  );
  const tenantScoped = mergeConcurrentConversationContexts(base, tenantB, base);
  assert.deepEqual(
    tenantScoped.conversationStateEnvelope,
    base.conversationStateEnvelope,
    "ENV-2: a foreign tenant envelope must not replace the base tenant scope",
  );
  const tenantScopedWithoutBase = mergeConcurrentConversationContexts(base, tenantB);
  assert.deepEqual(
    tenantScopedWithoutBase.conversationStateEnvelope,
    base.conversationStateEnvelope,
    "ENV-2: no-base merge must retain the authoritative latest tenant",
  );
  const tenantC = contextWithEnvelope(
    userId,
    knownEnvelope({ revision: 202, tenantId: "tenant-c", updatedAt: "2026-08-20T12:02:00.000Z" }),
    "2026-08-20T12:02:00.000Z",
  );
  const bothForeignTenants = mergeConcurrentConversationContexts(tenantB, tenantC, base);
  assert.deepEqual(
    bothForeignTenants.conversationStateEnvelope,
    base.conversationStateEnvelope,
    "ENV-2: two foreign tenant writers must not evict the base tenant envelope",
  );
  const registryB = contextWithEnvelope(
    userId,
    knownEnvelope({ registryId: "registry-b-v1", revision: 201, updatedAt: "2026-08-20T12:01:00.000Z" }),
    "2026-08-20T12:01:00.000Z",
  );
  const registryScopedWithoutBase = mergeConcurrentConversationContexts(base, registryB);
  assert.deepEqual(
    registryScopedWithoutBase.conversationStateEnvelope,
    base.conversationStateEnvelope,
    "ENV-2: no-base merge must retain the authoritative latest registry at the same state schema",
  );
  const registryC = contextWithEnvelope(
    userId,
    knownEnvelope({ registryId: "registry-c-v1", revision: 203, updatedAt: "2026-08-20T12:03:00.000Z" }),
    "2026-08-20T12:03:00.000Z",
  );
  const bothForeignRegistries = mergeConcurrentConversationContexts(registryB, registryC, base);
  assert.deepEqual(
    bothForeignRegistries.conversationStateEnvelope,
    base.conversationStateEnvelope,
    "ENV-2: two foreign registries must not evict the base registry at the same state schema",
  );
}

async function validateLocalRoundTripPreservesFutureRaw() {
  const priorLogDir = process.env.LIVE_DEMO_LOG_DIR;
  const priorSupabaseUrl = process.env.SUPABASE_URL;
  const priorSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const logDir = await mkdtemp(path.join(os.tmpdir(), "line-ai-state-envelope-"));
  process.env.LIVE_DEMO_LOG_DIR = logDir;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const userId = "state-envelope-future-roundtrip";
    const originalRaw = futureEnvelope();
    const first = contextWithEnvelope(userId, originalRaw, NOW);
    await saveConversationContext(first);
    const loaded = await loadConversationContext(userId);
    assert.deepEqual(loaded.conversationStateEnvelope, originalRaw, "ENV-3: hydrate must retain future raw JSON");

    const base = structuredClone(loaded);
    const unrelatedUpdate = { ...loaded, lastIntent: "unrelated_clinic_info" };
    await saveConversationContext(unrelatedUpdate, base);
    const reloaded = await loadConversationContext(userId);
    assert.deepEqual(
      reloaded.conversationStateEnvelope,
      originalRaw,
      "ENV-3: an unrelated save must not normalize or remove future raw JSON",
    );

    const rawCases: Array<[string, PreservedConversationStateEnvelope]> = [
      ["null", null],
      ["scalar", "opaque-diagnostic"],
      ["array", ["opaque", { keep: true }]],
      ["future-outer", futureOuterEnvelope()],
    ];
    for (const [suffix, raw] of rawCases) {
      const rawUserId = `${userId}-${suffix}`;
      const rawContext = contextWithEnvelope(rawUserId, raw, NOW);
      await saveConversationContext(rawContext);
      const rawReloaded = await loadConversationContext(rawUserId);
      assert.deepEqual(
        rawReloaded.conversationStateEnvelope,
        raw,
        `ENV-3: ${suffix} JSON must survive hydrate and local persistence`,
      );
    }
  } finally {
    if (priorLogDir === undefined) delete process.env.LIVE_DEMO_LOG_DIR;
    else process.env.LIVE_DEMO_LOG_DIR = priorLogDir;
    if (priorSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = priorSupabaseUrl;
    if (priorSupabaseKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = priorSupabaseKey;
    await rm(logDir, { force: true, recursive: true });
  }
}

async function main() {
  validateScopeAndVersionLoading();
  validateAtomicConflictOrdering();
  await validateLocalRoundTripPreservesFutureRaw();
  console.log("conversation state envelope validation passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
