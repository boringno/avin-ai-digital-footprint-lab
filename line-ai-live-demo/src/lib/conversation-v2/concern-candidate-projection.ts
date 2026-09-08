import {
  canonicalTreatmentKey,
  findBranchByMessage,
  normalizeClinicText,
  type ClinicConfig,
  type CustomerConcernGroupConfig,
} from "@/lib/clinic-config";
import {
  resolveTreatmentFact,
  type ClinicFactsSnapshot,
} from "@/lib/clinic-facts";

import type { ConversationV2State } from "./types";

export type LaunchConcernProjection = {
  branchName?: string;
  groupKey: string;
  treatmentKeys: string[];
};

export const LAUNCH_CONCERN_ENTRY_TEXT = "我想依困擾找適合療程";

export function isLaunchConcernEntryMessage(message: string) {
  return normalizeClinicText(message).includes(normalizeClinicText(LAUNCH_CONCERN_ENTRY_TEXT));
}

export function findCustomerConcernGroup(
  clinic: ClinicConfig,
  groupKey: string,
) {
  return clinic.customerConcernGroups.find((group) => group.key === groupKey);
}

/**
 * Only an explicit current turn, the live 30-minute concern-choice contract,
 * or an in-progress V2 booking can establish the branch used for candidates.
 * Legacy profile / historic booking data is intentionally excluded.
 */
export function resolveCurrentConcernBranch(input: {
  message: string;
  state: ConversationV2State;
}) {
  const explicit = findBranchByMessage(input.message)?.name;
  if (explicit) return explicit;

  const contractBranch = input.state.pendingQuickReply?.contextBranchName?.trim();
  if (contractBranch) return contractBranch;

  if (
    ["collecting", "suspended"].includes(input.state.bookingTask.status) &&
    input.state.bookingTask.draft.branch
  ) {
    return input.state.bookingTask.draft.branch;
  }
  return undefined;
}

function approvedMappedTreatmentKeys(
  clinic: ClinicConfig,
  group: CustomerConcernGroupConfig,
) {
  const mapped = new Set(
    group.concernKeys.flatMap((concernKey) =>
      clinic.concernList.find((concern) => concern.key === concernKey)?.recommendedTreatmentKeys ?? [],
    ).map(canonicalTreatmentKey),
  );
  return group.treatmentKeyOrder
    .map(canonicalTreatmentKey)
    .filter((key, index, keys) => mapped.has(key) && keys.indexOf(key) === index);
}

/**
 * Converts the approved customer group into a small, current-snapshot list.
 * A treatment must be offered and have explicit all-branch or compatible
 * selected-branch availability. Unknown is never projected to the customer.
 */
export function projectLaunchConcernCandidates(input: {
  branchName?: string;
  groupKey: string;
  snapshot: ClinicFactsSnapshot;
}): LaunchConcernProjection | undefined {
  const group = findCustomerConcernGroup(input.snapshot.clinic, input.groupKey);
  if (!group) return undefined;

  const branchName = input.branchName?.trim() || undefined;
  const treatmentKeys = approvedMappedTreatmentKeys(input.snapshot.clinic, group)
    .filter((key) => {
      const treatment = resolveTreatmentFact(input.snapshot, key, "introduction");
      if (treatment.status !== "offered") return false;
      if (treatment.branchAvailability.scope === "all") return true;
      if (treatment.branchAvailability.scope !== "selected" || !branchName) return false;
      return treatment.branchAvailability.branchNames.includes(branchName);
    })
    .slice(0, 6);

  return {
    ...(branchName ? { branchName } : {}),
    groupKey: group.key,
    treatmentKeys,
  };
}

/**
 * A current explicit branch plus a known treatment alias may show that the
 * requested treatment cannot be offered at that branch. The caller uses this
 * only to return the neutral concern-entry buttons; it never recommends a
 * substitute treatment on its own.
 */
export function resolveTreatmentBranchMismatch(input: {
  message: string;
  snapshot: ClinicFactsSnapshot;
}) {
  const branchName = findBranchByMessage(input.message)?.name;
  if (!branchName) return undefined;
  const normalizedMessage = normalizeClinicText(input.message);
  const matchingKeys = input.snapshot.clinic.treatmentList
    .filter((treatment) => [treatment.name, ...treatment.aliases]
      .map(normalizeClinicText)
      .some((term) => term && normalizedMessage.includes(term)))
    .map((treatment) => canonicalTreatmentKey(treatment.key))
    .filter((key, index, keys) => keys.indexOf(key) === index);
  if (matchingKeys.length !== 1) return undefined;

  const treatment = resolveTreatmentFact(input.snapshot, matchingKeys[0]!, "introduction");
  if (
    treatment.status !== "offered" ||
    treatment.branchAvailability.scope !== "selected" ||
    treatment.branchAvailability.branchNames.includes(branchName)
  ) return undefined;

  return {
    branchName,
    treatmentKey: treatment.key,
    treatmentName: treatment.name,
    availableBranchNames: [...treatment.branchAvailability.branchNames],
  };
}
