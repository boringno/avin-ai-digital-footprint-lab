import {
  clinicConfig,
  normalizeClinicText,
  type ClinicConfig,
  type TreatmentAreaKey,
  type TreatmentConfig,
} from "@/lib/clinic-config";

export type TreatmentKnowledgeApprovalStatus = "approved" | "draft" | "needs_review";
export type TreatmentKnowledgeEducationMode = "general_education" | "human_only";

export type TreatmentClinicAvailability = {
  branchNames: string[];
  isAvailable: boolean;
  scope: "all_active_branches" | "selected_branches" | "unspecified";
};

export type TreatmentKnowledge = {
  aliases: string[];
  approvalStatus: TreatmentKnowledgeApprovalStatus;
  approvedConcernReplies: Record<string, string[]>;
  approvedIntroReplies: string[];
  approvedPriceIds: string[];
  areas: TreatmentAreaKey[];
  availableBrands: string[];
  brandReplies: string[];
  category: TreatmentConfig["category"];
  clinicAvailability: TreatmentClinicAvailability;
  combinationOptions: string[];
  combinationReasons: Record<string, string>;
  comfort: string | null;
  contentVersion: string;
  downtime: string | null;
  educationMode: TreatmentKnowledgeEducationMode;
  evaluationNote: string;
  expectedDirections: string[];
  hasConsultationPack: boolean;
  key: string;
  mechanismInPlainLanguage: string;
  name: string;
  officialSources: string[];
  suitableConcerns: string[];
};

export type TreatmentKnowledgeOverrides = Partial<
  Omit<TreatmentKnowledge, "key" | "name" | "hasConsultationPack">
>;

export type TreatmentKnowledgeResolver = {
  list: () => TreatmentKnowledge[];
  resolveByKey: (key: string) => TreatmentKnowledge | null;
  resolveByMessage: (message: string) => TreatmentKnowledge | null;
  resolveForConcern: (concernKey: string) => TreatmentKnowledge[];
};

export const CLINIC_CONFIG_CONTENT_VERSION = "clinic-config-v1";

function normalizeStrings(values: readonly string[] | undefined) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeOfficialSource(value: string) {
  const candidate = value.trim().toLowerCase();
  if (!candidate) {
    return "";
  }

  try {
    return new URL(candidate.includes("://") ? candidate : `https://${candidate}`).hostname.replace(/^www\./u, "");
  } catch {
    return candidate.replace(/^www\./u, "").split(/[/?#]/u, 1)[0] ?? "";
  }
}

function normalizeOfficialSources(values: readonly string[] | undefined) {
  return normalizeStrings((values ?? []).map(normalizeOfficialSource));
}

function getSuitableConcernKeys(treatment: TreatmentConfig, config: ClinicConfig) {
  const configuredConcerns = config.concernList
    .filter((concern) => concern.recommendedTreatmentKeys.includes(treatment.key))
    .map((concern) => concern.key);
  const consultationConcerns = treatment.consultationGuide?.concernReplies?.map((reply) => reply.concernKey) ?? [];
  return normalizeStrings([...configuredConcerns, ...consultationConcerns]);
}

function getTreatmentAreas(concernKeys: readonly string[], config: ClinicConfig) {
  const areaKeys = concernKeys.flatMap(
    (concernKey) => config.concernList.find((concern) => concern.key === concernKey)?.areaKeys ?? [],
  );
  return Array.from(new Set(areaKeys));
}

function getExpectedDirections(concernKeys: readonly string[], config: ClinicConfig) {
  return normalizeStrings(
    concernKeys.map(
      (concernKey) =>
        config.concernList.find((concern) => concern.key === concernKey)?.summary ?? "",
    ),
  );
}

function getComfortAndDowntime(treatment: TreatmentConfig) {
  const comfortReply = treatment.consultationGuide?.quickReplies?.find(
    (reply) => reply.key === "comfort_and_recovery",
  )?.reply;
  const normalized = comfortReply?.trim() || null;
  return { comfort: normalized, downtime: normalized };
}

function getCombinationKnowledge(treatment: TreatmentConfig) {
  const relatedReplies = treatment.consultationGuide?.relatedReplies ?? [];
  return {
    combinationOptions: normalizeStrings(relatedReplies.map((reply) => reply.key)),
    combinationReasons: Object.fromEntries(
      relatedReplies
        .map((reply) => [reply.key.trim(), reply.reply.trim()] as const)
        .filter(([key, reason]) => Boolean(key && reason)),
    ),
  };
}

function getApprovedPriceIds(treatment: TreatmentConfig) {
  const guide = treatment.consultationGuide;
  return normalizeStrings([
    ...(guide?.concernReplies?.map((reply) => reply.pricingCampaignId ?? "") ?? []),
    ...(guide?.detailReplies?.map((reply) => reply.pricingCampaignId ?? "") ?? []),
    ...(guide?.relatedReplies?.map((reply) => reply.pricingCampaignId ?? "") ?? []),
  ]);
}

function getApprovedConcernReplies(treatment: TreatmentConfig) {
  return Object.fromEntries(
    (treatment.consultationGuide?.concernReplies ?? [])
      .map((item) => [
        item.concernKey.trim(),
        normalizeStrings([item.reply, item.followupPrompt]),
      ] as const)
      .filter(([key, replies]) => Boolean(key && replies.length > 0)),
  );
}

function getClinicAvailability(treatment: TreatmentConfig, config: ClinicConfig): TreatmentClinicAvailability {
  const activeBranchNames = config.branches.filter((branch) => branch.isActive).map((branch) => branch.name);
  const selectedBranchNames = normalizeStrings(treatment.availableBranchNames);

  if (selectedBranchNames.length > 0) {
    return {
      branchNames: selectedBranchNames,
      isAvailable: true,
      scope: "selected_branches",
    };
  }
  if (activeBranchNames.length > 0) {
    return {
      branchNames: normalizeStrings(activeBranchNames),
      isAvailable: true,
      scope: "all_active_branches",
    };
  }
  return {
    branchNames: [],
    isAvailable: true,
    scope: "unspecified",
  };
}

function normalizeCombinationReasons(values: Readonly<Record<string, string>> | undefined) {
  return Object.fromEntries(
    Object.entries(values ?? {})
      .map(([key, reason]) => [key.trim(), reason.trim()] as const)
      .filter(([key, reason]) => Boolean(key && reason)),
  );
}

export function adaptTreatmentConfigToKnowledge(
  treatment: TreatmentConfig,
  config: ClinicConfig = clinicConfig,
  overrides: TreatmentKnowledgeOverrides = {},
): TreatmentKnowledge {
  const suitableConcerns = normalizeStrings(overrides.suitableConcerns ?? getSuitableConcernKeys(treatment, config));
  const derivedCombination = getCombinationKnowledge(treatment);
  const derivedComfort = getComfortAndDowntime(treatment);
  const approvedIntroReplies = normalizeStrings(
    overrides.approvedIntroReplies ?? treatment.approvedContent.introReplies,
  );
  const mechanismInPlainLanguage = (
    overrides.mechanismInPlainLanguage ??
    approvedIntroReplies[0] ??
    treatment.intro
  ).trim();

  return {
    aliases: normalizeStrings(overrides.aliases ?? treatment.aliases),
    approvalStatus:
      overrides.approvalStatus ??
      (approvedIntroReplies.length > 0 && mechanismInPlainLanguage ? "approved" : "needs_review"),
    approvedConcernReplies: Object.fromEntries(
      Object.entries(overrides.approvedConcernReplies ?? getApprovedConcernReplies(treatment))
        .map(([key, replies]) => [key.trim(), normalizeStrings(replies)] as const)
        .filter(([key, replies]) => Boolean(key && replies.length > 0)),
    ),
    approvedIntroReplies,
    approvedPriceIds: normalizeStrings(overrides.approvedPriceIds ?? getApprovedPriceIds(treatment)),
    areas: Array.from(new Set(overrides.areas ?? getTreatmentAreas(suitableConcerns, config))),
    availableBrands: normalizeStrings(overrides.availableBrands ?? treatment.availableBrands),
    brandReplies: normalizeStrings(overrides.brandReplies ?? treatment.approvedContent.brandReplies),
    category: overrides.category ?? treatment.category,
    clinicAvailability: overrides.clinicAvailability ?? getClinicAvailability(treatment, config),
    combinationOptions: normalizeStrings(overrides.combinationOptions ?? derivedCombination.combinationOptions),
    combinationReasons: normalizeCombinationReasons(overrides.combinationReasons ?? derivedCombination.combinationReasons),
    comfort: overrides.comfort === undefined ? derivedComfort.comfort : overrides.comfort?.trim() || null,
    contentVersion: overrides.contentVersion?.trim() || CLINIC_CONFIG_CONTENT_VERSION,
    downtime: overrides.downtime === undefined ? derivedComfort.downtime : overrides.downtime?.trim() || null,
    educationMode:
      overrides.educationMode ??
      treatment.educationMode ??
      (treatment.category === "surgery" ? "human_only" : "general_education"),
    evaluationNote: (overrides.evaluationNote ?? treatment.evaluationNote).trim(),
    expectedDirections: normalizeStrings(overrides.expectedDirections ?? getExpectedDirections(suitableConcerns, config)),
    hasConsultationPack: Boolean(treatment.consultationGuide),
    key: treatment.key,
    mechanismInPlainLanguage,
    name: treatment.name,
    officialSources: normalizeOfficialSources(overrides.officialSources ?? treatment.officialSourceDomains),
    suitableConcerns,
  };
}

export function createTreatmentKnowledgeResolver(
  config: ClinicConfig = clinicConfig,
  overridesByKey: Readonly<Record<string, TreatmentKnowledgeOverrides>> = {},
): TreatmentKnowledgeResolver {
  const knowledgeItems = config.treatmentList.map((treatment) =>
    adaptTreatmentConfigToKnowledge(treatment, config, overridesByKey[treatment.key]),
  );
  const byKey = new Map(knowledgeItems.map((knowledge) => [knowledge.key, knowledge] as const));

  return {
    list: () => [...knowledgeItems],
    resolveByKey: (key) => byKey.get(key) ?? null,
    resolveByMessage: (message) => {
      const normalizedMessage = normalizeClinicText(message);
      if (!normalizedMessage) {
        return null;
      }

      return knowledgeItems
        .flatMap((knowledge) =>
          [knowledge.name, ...knowledge.aliases, ...knowledge.availableBrands].map((term) => ({
            knowledge,
            termLength: normalizeClinicText(term).length,
            termMatches: normalizedMessage.includes(normalizeClinicText(term)),
          })),
        )
        .filter((candidate) => candidate.termMatches && candidate.termLength > 0)
        .sort((left, right) => right.termLength - left.termLength || right.knowledge.name.length - left.knowledge.name.length)[0]
        ?.knowledge ?? null;
    },
    resolveForConcern: (concernKey) =>
      knowledgeItems.filter((knowledge) => knowledge.suitableConcerns.includes(concernKey)),
  };
}

export function buildTreatmentApprovedFacts(knowledge: TreatmentKnowledge) {
  return normalizeStrings([
    ...knowledge.approvedIntroReplies,
    ...knowledge.expectedDirections,
    knowledge.comfort ?? "",
    knowledge.downtime ?? "",
    ...Object.values(knowledge.combinationReasons),
    knowledge.evaluationNote,
  ]);
}

export type TreatmentKnowledgeFactMode =
  | "introduction"
  | "followup"
  | "comparison"
  | "approved_combination";

/**
 * Return only the knowledge needed for the current conversational job.  In
 * particular, a full approved introduction must not be sent back to the model
 * during a follow-up or comparison, because that makes replaying the opening
 * script the easiest valid completion.
 */
export function buildTreatmentApprovedFactsForMode(
  knowledge: TreatmentKnowledge,
  mode: TreatmentKnowledgeFactMode,
) {
  const conciseMechanism = knowledge.approvedIntroReplies.includes(knowledge.mechanismInPlainLanguage)
    ? ""
    : knowledge.mechanismInPlainLanguage;
  const labelledDirections = knowledge.expectedDirections.map(
    (direction) => `${knowledge.name}可評估方向：${direction}`,
  );
  const labelledCombinationReasons = Object.values(knowledge.combinationReasons).map(
    (reason) => `${knowledge.name}搭配評估理由：${reason}`,
  );

  if (mode === "introduction") {
    return normalizeStrings([
      `療程名稱：${knowledge.name}`,
      ...knowledge.approvedIntroReplies,
      conciseMechanism,
      ...labelledDirections,
      knowledge.comfort ?? "",
      knowledge.downtime ?? "",
      knowledge.evaluationNote,
    ]);
  }

  if (mode === "comparison") {
    return normalizeStrings([
      `療程名稱：${knowledge.name}`,
      ...(knowledge.availableBrands.length > 0
        ? [`院內可評估品牌：${knowledge.availableBrands.join("、")}`]
        : []),
      ...knowledge.brandReplies,
      conciseMechanism,
      ...labelledDirections,
      knowledge.evaluationNote,
    ]);
  }

  if (mode === "approved_combination") {
    return normalizeStrings([
      `療程名稱：${knowledge.name}`,
      conciseMechanism,
      ...labelledDirections,
      ...labelledCombinationReasons,
      knowledge.evaluationNote,
    ]);
  }

  return normalizeStrings([
    `療程名稱：${knowledge.name}`,
    conciseMechanism,
    ...labelledDirections,
    knowledge.comfort ?? "",
    knowledge.downtime ?? "",
    knowledge.evaluationNote,
  ]);
}

export const treatmentKnowledgeResolver = createTreatmentKnowledgeResolver();

export function resolveTreatmentKnowledgeByKey(key: string) {
  return treatmentKnowledgeResolver.resolveByKey(key);
}

export function resolveTreatmentKnowledgeByMessage(message: string) {
  return treatmentKnowledgeResolver.resolveByMessage(message);
}
