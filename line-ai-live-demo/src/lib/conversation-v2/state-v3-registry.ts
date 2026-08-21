import type { ClinicFactsSnapshot, ClinicStateRegistryKeys } from "@/lib/clinic-facts/types";

import type { ConversationStateV3Registry } from "./state-v3";

function activeKeys(
  active: ClinicStateRegistryKeys,
  field: keyof ClinicStateRegistryKeys,
) {
  return new Set(active[field]);
}

/**
 * One-way adapter from the provider-owned active catalog to State V3. Archived
 * keys intentionally do not enter the normal allowlist: a registry identity
 * change must fail closed until an explicit compatibility or migration path is
 * introduced. No clinic-facts module imports state.
 */
export function buildConversationStateV3Registry(
  snapshot: Pick<ClinicFactsSnapshot, "stateRegistryCatalog">,
): ConversationStateV3Registry {
  const { active } = snapshot.stateRegistryCatalog;
  return {
    answerKeys: activeKeys(active, "answerKeys"),
    approvedFactIds: activeKeys(active, "approvedFactIds"),
    areaKeys: activeKeys(active, "areaKeys"),
    concernKeys: activeKeys(active, "concernKeys"),
    treatmentKeys: activeKeys(active, "treatmentKeys"),
  };
}

export function buildConversationStateV3Scope(
  snapshot: Pick<ClinicFactsSnapshot, "stateRegistryCatalog">,
) {
  return {
    registry: buildConversationStateV3Registry(snapshot),
    registryId: snapshot.stateRegistryCatalog.registryId,
    tenantId: snapshot.stateRegistryCatalog.tenantId,
  };
}
