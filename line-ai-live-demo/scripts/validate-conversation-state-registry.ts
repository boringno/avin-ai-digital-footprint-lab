import assert from "node:assert/strict";

import { loadClinicFactsSnapshot } from "../src/lib/clinic-facts/provider";
import { createStaticClinicFactsProvider } from "../src/lib/clinic-facts/static-provider";
import {
  createConversationStatePersistenceEnvelope,
  loadScopedConversationStateEnvelope,
} from "../src/lib/conversation-v2/state-envelope";
import { createConversationV2State } from "../src/lib/conversation-v2/state";
import {
  buildConversationStateV3Registry,
  buildConversationStateV3Scope,
} from "../src/lib/conversation-v2/state-v3-registry";

const NOW = new Date("2026-08-20T13:00:00.000Z");

async function load(input: Parameters<typeof createStaticClinicFactsProvider>[0] = {}, tenantId = "tenant-a") {
  return loadClinicFactsSnapshot(createStaticClinicFactsProvider(input), { now: NOW, tenantId });
}

async function validateRegistryIdentityIsIndependentFromPriceSnapshot() {
  const first = await load({ snapshotId: "facts:campaign-price-a" });
  const second = await load({ snapshotId: "facts:campaign-price-b", priceSourceAvailable: false });
  assert.notEqual(first.snapshotId, second.snapshotId, "REG-1: fixture must model a facts snapshot change");
  assert.equal(
    first.stateRegistryCatalog.registryId,
    second.stateRegistryCatalog.registryId,
    "REG-1: price/availability-only changes must not invalidate durable state keys",
  );
  assert.equal(first.stateRegistryCatalog.tenantId, "tenant-a");
  assert.equal(buildConversationStateV3Scope(first).registryId, first.stateRegistryCatalog.registryId);
}

async function validateTenantOntologyAndArchiveBoundaries() {
  const tenantA = await load();
  const tenantB = await load({}, "tenant-b");
  assert.notEqual(
    tenantA.stateRegistryCatalog.registryId,
    tenantB.stateRegistryCatalog.registryId,
    "REG-2: identical keys in another tenant require another registry identity",
  );

  const ontologyWithNewTreatment = {
    ...tenantA.ontology,
    treatments: [
      ...tenantA.ontology.treatments,
      {
        ...tenantA.ontology.treatments[0]!,
        aliases: ["新療程"],
        key: "new_treatment",
        name: "新療程",
      },
    ],
  };
  const expanded = await load({ ontology: ontologyWithNewTreatment });
  assert.notEqual(
    expanded.stateRegistryCatalog.registryId,
    tenantA.stateRegistryCatalog.registryId,
    "REG-2: canonical ontology changes must change registry identity",
  );
  assert(buildConversationStateV3Registry(expanded).treatmentKeys.has("new_treatment"));

  const beforeArchive = await load({
    stateRegistryAnswerKeys: ["legacy_answer"],
  });
  const archived = await load({
    stateRegistryAnswerKeys: ["yes"],
    stateRegistryArchivedKeys: {
      answerKeys: ["legacy_answer"],
      treatmentKeys: ["legacy_treatment"],
    },
  });
  const registry = buildConversationStateV3Registry(archived);
  assert(!registry.treatmentKeys.has("legacy_treatment"), "REG-2: archived treatment must not enter the active allowlist");
  assert(!registry.answerKeys.has("legacy_answer"), "REG-2: archived answer must not enter the active allowlist");
  assert(!registry.treatmentKeys.has("legacy_answer"), "REG-2: registry key categories must remain isolated");
  assert.notEqual(archived.stateRegistryCatalog.registryId, tenantA.stateRegistryCatalog.registryId);
  assert.notEqual(
    archived.stateRegistryCatalog.registryId,
    beforeArchive.stateRegistryCatalog.registryId,
    "REG-2: moving an active key to archived must change the registry identity",
  );
  const oldEnvelope = createConversationStatePersistenceEnvelope({
    registryId: beforeArchive.stateRegistryCatalog.registryId,
    state: createConversationV2State({ episodeId: "archive-mismatch", now: NOW.toISOString() }),
    tenantId: "tenant-a",
  });
  assert.equal(
    loadScopedConversationStateEnvelope(oldEnvelope, buildConversationStateV3Scope(archived)).kind,
    "registry_mismatch",
    "REG-2: archived keys do not implicitly accept state from the prior registry; compatibility or migration must be explicit",
  );
}

async function validateProviderRejectsWrongTenantAndMalformedCatalog() {
  const tenantA = await load();
  const wrongTenantProvider = createStaticClinicFactsProvider({
    stateRegistryCatalog: tenantA.stateRegistryCatalog,
  });
  await assert.rejects(
    () => loadClinicFactsSnapshot(wrongTenantProvider, { now: NOW, tenantId: "tenant-b" }),
    /tenant scope mismatch/,
    "REG-3: provider wrapper must reject a cross-tenant catalog",
  );

  const overlapCatalog = structuredClone(tenantA.stateRegistryCatalog);
  overlapCatalog.archived.treatmentKeys = [overlapCatalog.active.treatmentKeys[0]!];
  const overlapProvider = createStaticClinicFactsProvider({ stateRegistryCatalog: overlapCatalog });
  await assert.rejects(
    () => loadClinicFactsSnapshot(overlapProvider, { now: NOW, tenantId: "tenant-a" }),
    /overlaps active and archived/,
    "REG-3: active and archived keys must not overlap",
  );

  const wrongFactCatalog = structuredClone(tenantA.stateRegistryCatalog);
  wrongFactCatalog.active.approvedFactIds = ["invented-fact"];
  const wrongFactProvider = createStaticClinicFactsProvider({
    approvedFactsById: { "approved-fact": "核准內容" },
    stateRegistryCatalog: wrongFactCatalog,
  });
  await assert.rejects(
    () => loadClinicFactsSnapshot(wrongFactProvider, { now: NOW, tenantId: "tenant-a" }),
    /approvedFactIds does not match/,
    "REG-3: durable fact IDs must come from explicit snapshot facts",
  );

  for (const invalidKey of ["", " ", " legacy_answer", "legacy_answer "]) {
    await assert.rejects(
      () => load({ stateRegistryAnswerKeys: [invalidKey] }),
      /exact, non-empty canonical keys/,
      `REG-3: ${JSON.stringify(invalidKey)} must not be normalized into a registry key`,
    );
  }

  const whitespaceCatalog = structuredClone(tenantA.stateRegistryCatalog);
  whitespaceCatalog.active.treatmentKeys = [` ${whitespaceCatalog.active.treatmentKeys[0]!}`];
  const whitespaceProvider = createStaticClinicFactsProvider({ stateRegistryCatalog: whitespaceCatalog });
  await assert.rejects(
    () => loadClinicFactsSnapshot(whitespaceProvider, { now: NOW, tenantId: "tenant-a" }),
    /exact unique non-empty canonical keys/,
    "REG-3: provider catalogs must preserve exact canonical keys rather than trim them",
  );

  const arbitraryRegistryId = structuredClone(tenantA.stateRegistryCatalog);
  arbitraryRegistryId.registryId = "state-registry-v1:arbitrary";
  const arbitraryRegistryProvider = createStaticClinicFactsProvider({ stateRegistryCatalog: arbitraryRegistryId });
  await assert.rejects(
    () => loadClinicFactsSnapshot(arbitraryRegistryProvider, { now: NOW, tenantId: "tenant-a" }),
    /registryId does not match the provider-derived catalog identity/,
    "REG-3: provider catalogs must not supply an arbitrary registryId",
  );
}

async function main() {
  await validateRegistryIdentityIsIndependentFromPriceSnapshot();
  await validateTenantOntologyAndArchiveBoundaries();
  await validateProviderRejectsWrongTenantAndMalformedCatalog();
  console.log("conversation state registry validation passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
