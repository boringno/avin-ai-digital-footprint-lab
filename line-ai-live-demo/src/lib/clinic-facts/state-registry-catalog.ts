import crypto from "node:crypto";

import type { ClinicOntology } from "@/lib/clinic-ontology";

import type {
  ClinicStateRegistryCatalog,
  ClinicStateRegistryKeys,
} from "./types";

function canonicalKeys(values: readonly string[], label: string) {
  if (!Array.isArray(values)) {
    throw new TypeError(`State registry ${label} must be an array of exact canonical keys`);
  }
  const keys = [...values];
  for (const key of keys) {
    if (typeof key !== "string" || !key || key.trim() !== key) {
      throw new TypeError(`State registry ${label} must contain exact, non-empty canonical keys`);
    }
  }
  if (new Set(keys).size !== keys.length) {
    throw new TypeError(`State registry ${label} must not contain duplicate canonical keys`);
  }
  return keys.sort();
}

function normalizedKeys(input: Partial<ClinicStateRegistryKeys> = {}): ClinicStateRegistryKeys {
  return {
    answerKeys: canonicalKeys(input.answerKeys ?? [], "answerKeys"),
    approvedFactIds: canonicalKeys(input.approvedFactIds ?? [], "approvedFactIds"),
    areaKeys: canonicalKeys(input.areaKeys ?? [], "areaKeys"),
    concernKeys: canonicalKeys(input.concernKeys ?? [], "concernKeys"),
    treatmentKeys: canonicalKeys(input.treatmentKeys ?? [], "treatmentKeys"),
  };
}

function shortHash(value: unknown) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 20);
}

function assertNoActiveArchiveOverlap(
  active: ClinicStateRegistryKeys,
  archived: ClinicStateRegistryKeys,
) {
  for (const field of Object.keys(active) as Array<keyof ClinicStateRegistryKeys>) {
    const activeValues = new Set(active[field]);
    const overlap = archived[field].find((key) => activeValues.has(key));
    if (overlap) {
      throw new TypeError(`State registry key cannot be both active and archived (${field}:${overlap})`);
    }
  }
}

export function buildClinicStateRegistryCatalog(input: {
  answerKeys?: readonly string[];
  approvedFactIds: readonly string[];
  archived?: Partial<ClinicStateRegistryKeys>;
  ontology: ClinicOntology;
  ontologyVersion?: string;
  tenantId: string;
}): ClinicStateRegistryCatalog {
  const tenantId = input.tenantId;
  if (!tenantId || tenantId.trim() !== tenantId) {
    throw new TypeError("State registry catalog requires an exact, non-empty tenantId");
  }
  const active = normalizedKeys({
    answerKeys: input.answerKeys,
    approvedFactIds: input.approvedFactIds,
    areaKeys: input.ontology.areas.map((item) => item.key),
    concernKeys: input.ontology.concerns.map((item) => item.key),
    treatmentKeys: input.ontology.treatments.map((item) => item.key),
  });
  const archived = normalizedKeys(input.archived);
  assertNoActiveArchiveOverlap(active, archived);
  if (
    input.ontologyVersion !== undefined &&
    (!input.ontologyVersion || input.ontologyVersion.trim() !== input.ontologyVersion)
  ) {
    throw new TypeError("State registry catalog ontologyVersion must be exact and non-empty");
  }
  const ontologyVersion = input.ontologyVersion ?? `ontology-keys-v1:${shortHash({
    areaKeys: active.areaKeys,
    concernKeys: active.concernKeys,
    treatmentKeys: active.treatmentKeys,
  })}`;
  const registryId = `state-registry-v1:${shortHash({
    active,
    archived,
    ontologyVersion,
    tenantId,
  })}`;
  return {
    active,
    archived,
    ontologyVersion,
    registryId,
    tenantId,
  };
}
