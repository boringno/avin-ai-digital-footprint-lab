import { DEFAULT_TENANT_ID } from "@/lib/conversation-store";

import type {
  ClinicFactsProvider,
  ClinicFactsSnapshot,
  ClinicFactsSnapshotRequest,
  ClinicStateRegistryKeys,
} from "./types";
import { buildClinicStateRegistryCatalog } from "./state-registry-catalog";

function assertRecognizedInventoryKeys(snapshot: ClinicFactsSnapshot) {
  const ontologyKeys = new Set(snapshot.ontology.treatments.map((treatment) => treatment.key));
  const inventoryGroups: Array<[label: string, keys: Iterable<string>]> = [
    ["treatment", snapshot.treatments.map((treatment) => treatment.key)],
    ["all-branch treatment", snapshot.explicitAllBranchTreatmentKeys],
    ["stale treatment", snapshot.staleTreatmentKeys],
    ["not-offered treatment", snapshot.notOfferedTreatmentKeys],
  ];

  for (const [label, keys] of inventoryGroups) {
    for (const key of keys) {
      if (!key || !ontologyKeys.has(key)) {
        throw new TypeError(`Clinic facts snapshot ${label} key is not recognized by ontology: ${key || "<empty>"}`);
      }
    }
  }
}

function sortedUnique(values: readonly string[]) {
  return [...new Set(values)].sort();
}

function assertExactCanonicalKeys(label: string, values: readonly string[]) {
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== "string" || !value || value.trim() !== value) ||
    new Set(values).size !== values.length
  ) {
    throw new TypeError(`Clinic facts snapshot state registry ${label} must contain exact unique non-empty canonical keys`);
  }
}

function assertSameKeys(label: string, actual: readonly string[], expected: readonly string[]) {
  assertExactCanonicalKeys(label, actual);
  assertExactCanonicalKeys(`snapshot ${label}`, expected);
  const normalizedActual = sortedUnique(actual);
  const normalizedExpected = sortedUnique(expected);
  if (
    normalizedActual.length !== actual.length ||
    normalizedActual.join("\u0000") !== normalizedExpected.join("\u0000")
  ) {
    throw new TypeError(`Clinic facts snapshot state registry ${label} does not match the snapshot`);
  }
}

function assertStateRegistryCatalog(snapshot: ClinicFactsSnapshot, input: ClinicFactsSnapshotRequest) {
  const catalog = snapshot.stateRegistryCatalog;
  const expectedTenantId = input.tenantId?.trim() || DEFAULT_TENANT_ID;
  if (!catalog || catalog.tenantId !== expectedTenantId) {
    throw new TypeError("Clinic facts snapshot state registry tenant scope mismatch");
  }
  if (
    !catalog.registryId || catalog.registryId.trim() !== catalog.registryId ||
    !catalog.ontologyVersion || catalog.ontologyVersion.trim() !== catalog.ontologyVersion
  ) {
    throw new TypeError("Clinic facts snapshot state registry requires exact registryId and ontologyVersion");
  }
  const fields = [
    "answerKeys",
    "approvedFactIds",
    "areaKeys",
    "concernKeys",
    "treatmentKeys",
  ] as const satisfies readonly (keyof ClinicStateRegistryKeys)[];
  for (const field of fields) {
    assertExactCanonicalKeys(`active ${field}`, catalog.active[field]);
    assertExactCanonicalKeys(`archived ${field}`, catalog.archived[field]);
    const active = catalog.active[field];
    const archived = catalog.archived[field];
    if (archived.some((key) => active.includes(key))) {
      throw new TypeError(`Clinic facts snapshot state registry ${field} overlaps active and archived keys`);
    }
  }
  assertSameKeys("areaKeys", catalog.active.areaKeys, snapshot.ontology.areas.map((item) => item.key));
  assertSameKeys("concernKeys", catalog.active.concernKeys, snapshot.ontology.concerns.map((item) => item.key));
  assertSameKeys("treatmentKeys", catalog.active.treatmentKeys, snapshot.ontology.treatments.map((item) => item.key));
  assertSameKeys("approvedFactIds", catalog.active.approvedFactIds, Object.keys(snapshot.approvedFactsById));
  const expectedCatalog = buildClinicStateRegistryCatalog({
    answerKeys: catalog.active.answerKeys,
    approvedFactIds: Object.keys(snapshot.approvedFactsById),
    archived: catalog.archived,
    ontology: snapshot.ontology,
    ontologyVersion: catalog.ontologyVersion,
    tenantId: expectedTenantId,
  });
  if (catalog.registryId !== expectedCatalog.registryId) {
    throw new TypeError("Clinic facts snapshot state registryId does not match the provider-derived catalog identity");
  }
}

export async function loadClinicFactsSnapshot(
  provider: ClinicFactsProvider,
  input: ClinicFactsSnapshotRequest,
): Promise<ClinicFactsSnapshot> {
  const snapshot = await provider.loadSnapshot(input);
  if (!snapshot.snapshotId.trim()) {
    throw new TypeError("Clinic facts snapshot requires a non-empty snapshotId");
  }
  if (snapshot.asOf.getTime() !== input.now.getTime()) {
    throw new TypeError("Clinic facts snapshot must be pinned to the current turn time");
  }
  assertStateRegistryCatalog(snapshot, input);
  assertRecognizedInventoryKeys(snapshot);
  return snapshot;
}
