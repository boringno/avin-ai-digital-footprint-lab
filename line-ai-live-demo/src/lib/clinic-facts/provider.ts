import type {
  ClinicFactsProvider,
  ClinicFactsSnapshot,
  ClinicFactsSnapshotRequest,
} from "./types";

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
  assertRecognizedInventoryKeys(snapshot);
  return snapshot;
}
