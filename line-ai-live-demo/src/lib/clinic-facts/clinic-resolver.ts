import { normalizeClinicText, type BranchConfig } from "@/lib/clinic-config";

import type {
  ClinicFactProvenance,
  ClinicFactsSnapshot,
  ClinicInfoFactResolution,
} from "./types";

function provenance(snapshot: ClinicFactsSnapshot): ClinicFactProvenance {
  return {
    asOf: snapshot.asOf.toISOString(),
    snapshotId: snapshot.snapshotId,
    source: snapshot.source,
  };
}

function requestedBranch(snapshot: ClinicFactsSnapshot, message: string) {
  const normalized = normalizeClinicText(message);
  return snapshot.clinic.branches.find((branch) =>
    [branch.name, branch.city, ...branch.aliases]
      .some((term) => normalized.includes(normalizeClinicText(term)))) ?? null;
}

function resolved(
  snapshot: ClinicFactsSnapshot,
  topic: string,
  customerFacts: string[],
): ClinicInfoFactResolution {
  return { customerFacts, provenance: provenance(snapshot), status: "resolved", topic };
}

function unknown(
  snapshot: ClinicFactsSnapshot,
  topic: string,
  reason: Extract<ClinicInfoFactResolution, { status: "unknown" }>["reason"],
): ClinicInfoFactResolution {
  return { provenance: provenance(snapshot), reason, status: "unknown", topic };
}

function branchFact(
  snapshot: ClinicFactsSnapshot,
  topic: string,
  branch: BranchConfig | null,
) {
  if (!branch) return unknown(snapshot, topic, "branch_required");
  if (topic === "address") {
    return branch.hasCompleteAddress && branch.address.trim()
      ? resolved(snapshot, topic, [`${branch.name}地址：${branch.address.trim()}`])
      : unknown(snapshot, topic, "incomplete");
  }
  if (topic === "hours") {
    return branch.hasCompleteBusinessHours && branch.businessHours.trim()
      ? resolved(snapshot, topic, [`${branch.name}營業時間：${branch.businessHours.trim()}`])
      : unknown(snapshot, topic, "incomplete");
  }
  return branch.hasCompletePhone && branch.phone.trim()
    ? resolved(snapshot, topic, [`${branch.name}聯絡電話：${branch.phone.trim()}`])
    : unknown(snapshot, topic, "incomplete");
}

export function resolveClinicInfo(
  snapshot: ClinicFactsSnapshot,
  input: { message: string; topic: string },
): ClinicInfoFactResolution {
  const activeBranches = snapshot.clinic.branches.filter((branch) => branch.isActive);
  if (input.topic === "doctor_schedule") {
    return unknown(snapshot, input.topic, "tool_required");
  }
  if (input.topic === "booking_policy") {
    return snapshot.clinic.appointmentPolicy.summary.trim()
      ? resolved(snapshot, input.topic, [snapshot.clinic.appointmentPolicy.summary.trim()])
      : unknown(snapshot, input.topic, "incomplete");
  }
  if (input.topic === "branches") {
    return activeBranches.length > 0
      ? resolved(snapshot, input.topic, [`目前可提供的館別資訊有：${activeBranches.map((branch) => branch.name).join("、")}`])
      : unknown(snapshot, input.topic, "source_unavailable");
  }
  if (["address", "hours", "contact"].includes(input.topic)) {
    return branchFact(snapshot, input.topic, requestedBranch(snapshot, input.message));
  }
  const facts = [
    snapshot.clinic.clinicName.trim(),
    activeBranches.length > 0 ? `目前可提供的館別資訊有：${activeBranches.map((branch) => branch.name).join("、")}` : "",
  ].filter(Boolean);
  return facts.length > 0
    ? resolved(snapshot, input.topic, facts)
    : unknown(snapshot, input.topic, "source_unavailable");
}
