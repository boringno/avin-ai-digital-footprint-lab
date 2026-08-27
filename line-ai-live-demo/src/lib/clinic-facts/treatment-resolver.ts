import crypto from "node:crypto";

import type { ReplyKnowledgeQuery } from "@/lib/conversation-v2/types";
import type { TreatmentAreaKey } from "@/lib/clinic-config";
import type { QuestionAspect } from "@/lib/dialogue-semantics";
import type { ResponseAspect } from "@/lib/response-contract";
import {
  buildTreatmentApprovedFactsForMode,
  type TreatmentKnowledge,
  type TreatmentKnowledgeFactMode,
} from "@/lib/treatment-knowledge";

import type {
  ClinicFactProvenance,
  ClinicFactsSnapshot,
  OfferedTreatmentFact,
  TreatmentFactResolution,
  TreatmentKnowledgeResolution,
} from "./types";

function unique(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

const PRICE_RESPONSE_ASPECTS = new Set<ResponseAspect>([
  "price_campaign",
  "price_regular",
  "price_unspecified",
]);

export type ApprovedTreatmentSupplementSection = {
  aspect: ResponseAspect;
  customerText: string;
  snapshotId: string;
  sourceContentHash: string;
  sourceContentVersion: string;
  sourceFactId: string;
  subjectKey: string;
};

export type ApprovedTreatmentSupplementResolution = {
  sections: ApprovedTreatmentSupplementSection[];
  unresolvedAspects: ResponseAspect[];
};

export function approvedTreatmentSupplementHash(input: {
  customerText: string;
  snapshotId: string;
  sourceFactId: string;
}) {
  return crypto
    .createHash("sha256")
    .update(`${input.snapshotId}\0${input.sourceFactId}\0${input.customerText.trim()}`)
    .digest("hex");
}

function firstApprovedConcernReply(
  treatment: TreatmentKnowledge,
  concernKeys: readonly string[],
) {
  for (const concernKey of unique(concernKeys)) {
    const reply = treatment.approvedConcernReplies[concernKey]?.find((item) => item.trim());
    if (reply) return reply.trim();
  }
  return "";
}

function allApprovedConcernReplies(
  treatment: TreatmentKnowledge,
  concernKeys: readonly string[],
) {
  const keys = unique(concernKeys);
  if (keys.length === 0) return [];
  const replies = keys.map((key) =>
    treatment.approvedConcernReplies[key]?.find((item) => item.trim())?.trim() ?? "");
  return replies.every(Boolean) ? unique(replies) : [];
}

function approvedCustomerTextForAspect(
  treatment: TreatmentKnowledge,
  aspect: ResponseAspect,
  concernKeys: readonly string[],
) {
  const concernReply = firstApprovedConcernReply(treatment, concernKeys);
  switch (aspect) {
    case "overview":
      return treatment.approvedIntroReplies.find((item) => item.trim())?.trim() ?? "";
    case "benefits":
      return concernReply || treatment.approvedIntroReplies.find((item) => item.trim())?.trim() || "";
    case "suitability":
      const suitabilityReplies = allApprovedConcernReplies(treatment, concernKeys);
      if (suitabilityReplies.length === 0) return "";
      return unique([
        ...suitabilityReplies,
        treatment.evaluationNote,
      ]).join("\n");
    case "mechanism":
      return treatment.mechanismInPlainLanguage.trim();
    case "comfort_recovery":
      return unique([treatment.comfort ?? "", treatment.downtime ?? ""]).join("\n");
    case "brands":
      return treatment.brandReplies.find((item) => item.trim())?.trim() ?? "";
    case "single_vs_combination":
    case "combination_reason":
    case "general_difference":
      return Object.values(treatment.combinationReasons).find((item) => item.trim())?.trim() ?? "";
    default:
      // Brand differences, timing, sessions, side effects and alternatives do
      // not have dedicated approved fields today. A brand list or generic intro
      // must never be relabelled as if it answered those questions.
      return "";
  }
}

/**
 * Resolves secondary answer obligations from the same reviewed runtime
 * snapshot as the price. This function first applies the canonical offered /
 * stale / reviewed gates and never consults append-only conversation state.
 */
export function resolveApprovedTreatmentSupplements(
  snapshot: ClinicFactsSnapshot,
  input: {
    concernKeys: readonly string[];
    requestedAspects: readonly ResponseAspect[];
    subjectKey: string;
  },
): ApprovedTreatmentSupplementResolution {
  const fact = resolveTreatmentFact(snapshot, input.subjectKey, "followup");
  const requestedAspects = Array.from(new Set(input.requestedAspects)).filter(
    (aspect) => !PRICE_RESPONSE_ASPECTS.has(aspect),
  );
  if (fact.status !== "offered") {
    return { sections: [], unresolvedAspects: requestedAspects };
  }

  const treatment = snapshot.treatments.find((item) => item.key === fact.key);
  if (!treatment) {
    return { sections: [], unresolvedAspects: requestedAspects };
  }

  const sections: ApprovedTreatmentSupplementSection[] = [];
  const unresolvedAspects: ResponseAspect[] = [];
  for (const aspect of requestedAspects) {
    const customerText = approvedCustomerTextForAspect(
      treatment,
      aspect,
      input.concernKeys,
    ).trim();
    if (!customerText) {
      unresolvedAspects.push(aspect);
      continue;
    }
    const sourceFactId = `treatment:${treatment.key}:${treatment.contentVersion}:response:${aspect}`;
    sections.push({
      aspect,
      customerText,
      snapshotId: snapshot.snapshotId,
      sourceContentHash: approvedTreatmentSupplementHash({
        customerText,
        snapshotId: snapshot.snapshotId,
        sourceFactId,
      }),
      sourceContentVersion: treatment.contentVersion,
      sourceFactId,
      subjectKey: treatment.key,
    });
  }
  return { sections, unresolvedAspects };
}

function provenance(
  snapshot: ClinicFactsSnapshot,
  contentKey?: string,
  version?: string,
): ClinicFactProvenance {
  return {
    asOf: snapshot.asOf.toISOString(),
    ...(contentKey ? { contentKey } : {}),
    snapshotId: snapshot.snapshotId,
    source: snapshot.source,
    ...(version ? { version } : {}),
  };
}

function resolveBranchAvailability(
  snapshot: ClinicFactsSnapshot,
  treatment: TreatmentKnowledge,
): OfferedTreatmentFact["branchAvailability"] {
  if (treatment.clinicAvailability.scope === "selected_branches") {
    return {
      branchNames: unique(treatment.clinicAvailability.branchNames),
      scope: "selected",
    };
  }
  if (snapshot.explicitAllBranchTreatmentKeys.has(treatment.key)) {
    return {
      branchNames: unique(snapshot.clinic.branches.filter((branch) => branch.isActive).map((branch) => branch.name)),
      scope: "all",
    };
  }
  // The legacy adapter derived all_active_branches from a missing field. V2
  // must not turn that absence into a customer-visible all-branch claim.
  return { branchNames: [], scope: "unknown" };
}

function treatmentMissingFields(
  treatment: TreatmentKnowledge,
  mode: TreatmentKnowledgeFactMode,
  questionAspect: QuestionAspect | undefined,
) {
  if (treatment.educationMode === "human_only") return ["human_review_required"];
  if (mode === "introduction") {
    return treatment.approvedIntroReplies.length > 0 ? [] : ["approved_intro"];
  }
  if (questionAspect === "mechanism") {
    return treatment.mechanismInPlainLanguage ? [] : ["mechanism"];
  }
  if (questionAspect === "comfort_recovery") {
    return treatment.comfort || treatment.downtime ? [] : ["comfort_recovery"];
  }
  // These aspects do not have dedicated fields in the current static
  // TreatmentKnowledge schema.  Mechanism or expected-direction copy must not
  // be treated as an answer to a side-effect, duration, or session-count
  // question.  A snapshot-pinned approved reply asset may still satisfy the
  // exact gap later in hydration.
  if (questionAspect === "side_effects") return ["side_effects"];
  if (questionAspect === "duration") return ["duration"];
  if (questionAspect === "sessions") return ["sessions"];
  if (questionAspect === "brands" || questionAspect === "brand_difference") {
    return treatment.availableBrands.length > 0 || treatment.brandReplies.length > 0
      ? []
      : ["brand_information"];
  }
  if (questionAspect === "single_vs_combination" || questionAspect === "combination_reason") {
    return Object.keys(treatment.combinationReasons).length > 0
      ? []
      : ["combination_guidance"];
  }
  if (["benefits", "suitability", "general_difference", "alternatives"].includes(questionAspect ?? "")) {
    return treatment.expectedDirections.length > 0 ? [] : ["expected_directions"];
  }
  return treatment.mechanismInPlainLanguage || treatment.expectedDirections.length > 0
    ? []
    : ["requested_content"];
}

function approvedCustomerAspectReplies(
  treatment: TreatmentKnowledge,
  questionAspect: QuestionAspect | undefined,
) {
  if (questionAspect === "brands" || questionAspect === "brand_difference") {
    return unique(treatment.brandReplies);
  }
  return [];
}

export function resolveTreatmentFact(
  snapshot: ClinicFactsSnapshot,
  key: string,
  mode: TreatmentKnowledgeFactMode,
  questionAspect?: QuestionAspect,
): TreatmentFactResolution {
  const normalizedKey = key.trim();
  const baseProvenance = provenance(snapshot, normalizedKey);
  if (!snapshot.treatmentSourceAvailable) {
    return { key: normalizedKey, provenance: baseProvenance, reason: "source_unavailable", status: "unknown" };
  }
  if (snapshot.notOfferedTreatmentKeys.has(normalizedKey)) {
    return { key: normalizedKey, provenance: baseProvenance, reason: "explicit_not_offered", status: "not_offered" };
  }
  if (snapshot.staleTreatmentKeys.has(normalizedKey)) {
    return { key: normalizedKey, provenance: baseProvenance, reason: "stale", status: "unknown" };
  }

  const treatment = snapshot.treatments.find((item) => item.key === normalizedKey);
  if (!treatment) {
    return {
      key: normalizedKey,
      provenance: baseProvenance,
      reason: snapshot.treatmentCatalogCompleteness === "partial"
        ? "not_in_partial_catalog"
        : "not_in_catalog",
      status: "unknown",
    };
  }
  if (treatment.approvalStatus !== "approved") {
    return {
      key: normalizedKey,
      provenance: provenance(snapshot, normalizedKey, treatment.contentVersion),
      reason: "unreviewed",
      status: "unknown",
    };
  }
  if (!treatment.clinicAvailability.isAvailable) {
    return {
      key: normalizedKey,
      provenance: provenance(snapshot, normalizedKey, treatment.contentVersion),
      reason: "explicit_not_offered",
      status: "not_offered",
    };
  }

  const branchAvailability = resolveBranchAvailability(snapshot, treatment);
  const customerAspectReplies = treatment.educationMode === "human_only"
    ? []
    : approvedCustomerAspectReplies(treatment, questionAspect);
  const rawFacts = treatment.educationMode === "human_only"
    ? []
    : [
        ...buildTreatmentApprovedFactsForMode(treatment, mode),
        ...(questionAspect === "brands" || questionAspect === "brand_difference"
          ? [
              ...(treatment.availableBrands.length > 0
                ? [`院內可評估品牌：${treatment.availableBrands.join("、")}`]
                : []),
              ...treatment.brandReplies,
            ]
          : []),
      ];
  const facts = unique(rawFacts);
  const factIds = facts.map((_, index) =>
    `treatment:${treatment.key}:${treatment.contentVersion}:fact:${index + 1}`);
  const missingFields = treatmentMissingFields(treatment, mode, questionAspect);
  const customerIntroReplies = treatment.educationMode === "human_only"
    ? []
    : unique(treatment.approvedIntroReplies);
  return {
    branchAvailability,
    customerAspectReplies,
    customerIntroReplies,
    facts,
    factIds,
    key: treatment.key,
    missingFields,
    name: treatment.name,
    profileCompleteness: missingFields.length === 0 ? "complete" : "partial",
    provenance: provenance(snapshot, treatment.key, treatment.contentVersion),
    status: "offered",
  };
}

function candidateTreatmentKeys(
  snapshot: ClinicFactsSnapshot,
  query: Pick<ReplyKnowledgeQuery, "areaKeys" | "concernKeys" | "treatmentKeys">,
  excludedTreatmentKeys: readonly string[],
) {
  if (query.treatmentKeys.length > 0) return unique(query.treatmentKeys);
  const excluded = new Set(excludedTreatmentKeys);
  const candidates = snapshot.treatments.filter((treatment) => {
    if (excluded.has(treatment.key)) return false;
    if (query.concernKeys.length > 0) {
      return query.concernKeys.some((key) => treatment.suitableConcerns.includes(key));
    }
    if (query.areaKeys.length > 0) {
      return query.areaKeys.some((key) => treatment.areas.includes(key as TreatmentAreaKey));
    }
    return false;
  });
  return unique(candidates.slice(0, 4).map((treatment) => treatment.key));
}

export function resolveTreatmentKnowledge(
  snapshot: ClinicFactsSnapshot,
  input: {
    excludedTreatmentKeys?: readonly string[];
    mode: TreatmentKnowledgeFactMode;
    questionAspect?: QuestionAspect;
    query: ReplyKnowledgeQuery;
  },
): TreatmentKnowledgeResolution {
  const keys = candidateTreatmentKeys(
    snapshot,
    input.query,
    input.excludedTreatmentKeys ?? [],
  );
  const results = keys.map((key) =>
    resolveTreatmentFact(snapshot, key, input.mode, input.questionAspect));
  const offered = results.filter(
    (result): result is OfferedTreatmentFact => result.status === "offered",
  );
  const approvedFactValues = input.query.approvedFactIds.flatMap((id) => {
    const value = snapshot.approvedFactsById[id]?.trim();
    return value ? [value] : [];
  });
  const missingApprovedFactIds = input.query.approvedFactIds.filter(
    (id) => !snapshot.approvedFactsById[id]?.trim(),
  );
  const missingFactGaps = missingApprovedFactIds.map(
    (id): Exclude<TreatmentFactResolution, OfferedTreatmentFact> => ({
    key: `approved_fact:${id}`,
    provenance: provenance(snapshot, id),
    reason: "not_in_partial_catalog",
    status: "unknown",
    }),
  );
  const gaps = [
    ...results.filter(
      (result): result is Exclude<TreatmentFactResolution, OfferedTreatmentFact> =>
        result.status !== "offered",
    ),
    ...missingFactGaps,
  ];
  const facts = unique([...approvedFactValues, ...offered.flatMap((item) => item.facts)]);
  const factIds = unique([
    ...input.query.approvedFactIds.filter((id) => Boolean(snapshot.approvedFactsById[id]?.trim())),
    ...offered.flatMap((item) => item.factIds),
  ]);
  const recommendationFromPartialCatalog =
    input.query.treatmentKeys.length === 0 &&
    (input.query.concernKeys.length > 0 || input.query.areaKeys.length > 0) &&
    snapshot.treatmentCatalogCompleteness === "partial";
  const isPartial = recommendationFromPartialCatalog ||
    gaps.length > 0 ||
    offered.some((item) => item.profileCompleteness === "partial");
  const combinationQuestion =
    input.questionAspect === "single_vs_combination" ||
    input.questionAspect === "combination_reason";
  const hasApprovedCombinationGuidance = combinationQuestion && offered.some(
    (item) => !item.missingFields.includes("combination_guidance"),
  );
  const requestedDataGaps = offered.flatMap((item) => {
    // A combination is one relationship. Once either approved treatment pack
    // explains that relationship, the other treatment does not need to repeat
    // the same copy. Requiring duplicate guidance made a fully approved ONDA +
    // Botox answer look incomplete merely because Botox did not mirror ONDA's
    // combination paragraph.
    const fields = hasApprovedCombinationGuidance
      ? item.missingFields.filter((field) => field !== "combination_guidance")
      : item.missingFields;
    return fields.length > 0
      ? [{ fields: [...fields], treatmentKey: item.key }]
      : [];
  });
  const requestedConcernKeys = new Set(input.query.concernKeys);
  const customerConcernReplies = offered.flatMap((item) => {
    const treatment = snapshot.treatments.find((candidate) => candidate.key === item.key);
    if (!treatment) return [];
    return Object.entries(treatment.approvedConcernReplies)
      .filter(([concernKey]) => requestedConcernKeys.has(concernKey))
      .flatMap(([, replies]) => replies);
  });

  return {
    customerAspectReplies: unique(offered.flatMap((item) => item.customerAspectReplies)),
    customerConcernReplies: unique(customerConcernReplies),
    customerIntroReplies: unique(offered.flatMap((item) => item.customerIntroReplies)),
    factIds,
    facts,
    gaps,
    profileCompleteness: facts.length === 0
      ? "unresolved"
      : isPartial
        ? "partial"
        : "complete",
    requestedDataGaps,
    resolvedTreatmentKeys: offered.map((item) => item.key),
    snapshotId: snapshot.snapshotId,
  };
}
