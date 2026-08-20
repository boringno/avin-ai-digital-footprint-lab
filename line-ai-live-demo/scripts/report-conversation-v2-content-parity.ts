import { clinicConfig } from "../src/lib/clinic-config";
import { EMBEDDED_FAQ_ENTRIES } from "../src/lib/embedded-seed-data";
import { adaptTreatmentConfigToKnowledge } from "../src/lib/treatment-knowledge";

type TreatmentParityRow = {
  key: string;
  name: string;
  legacy: {
    approvedCombinationTreatmentKeys: number;
    concernReplies: number;
    detailReplies: number;
    discoveryFallbackOptions: number;
    hasDiscoveryQuestion: boolean;
    hasFeatureSummary: boolean;
    quickReplies: number;
    relatedReplies: number;
  };
  v2: {
    approved: boolean;
    approvedConcernGroups: number;
    approvedIntroReplies: number;
    brands: number;
    combinationReasons: number;
    comfort: boolean;
    downtime: boolean;
    officialSources: number;
    priceReferences: number;
  };
  migrationGaps: string[];
};

function treatmentParityRows(): TreatmentParityRow[] {
  return clinicConfig.treatmentList.map((treatment) => {
    const guide = treatment.consultationGuide;
    const knowledge = adaptTreatmentConfigToKnowledge(treatment, clinicConfig);
    const migrationGaps = [
      ...(guide?.detailReplies?.length ? ["detail_reply_assets"] : []),
      ...(guide?.quickReplies?.length ? ["quick_reply_assets"] : []),
      ...(guide?.relatedReplies?.length ? ["related_reply_assets"] : []),
      ...(guide?.discoveryQuestion?.trim() ? ["discovery_question"] : []),
      ...(guide?.discoveryFallbackOption ? ["discovery_fallback_option"] : []),
      ...(guide?.featureSummary?.trim() ? ["feature_summary"] : []),
      ...(guide?.approvedCombinationTreatmentKeys?.length ? ["approved_combination_relationships"] : []),
    ];

    return {
      key: treatment.key,
      name: treatment.name,
      legacy: {
        approvedCombinationTreatmentKeys: guide?.approvedCombinationTreatmentKeys?.length ?? 0,
        concernReplies: guide?.concernReplies?.length ?? 0,
        detailReplies: guide?.detailReplies?.length ?? 0,
        discoveryFallbackOptions: guide?.discoveryFallbackOption ? 1 : 0,
        hasDiscoveryQuestion: Boolean(guide?.discoveryQuestion?.trim()),
        hasFeatureSummary: Boolean(guide?.featureSummary?.trim()),
        quickReplies: guide?.quickReplies?.length ?? 0,
        relatedReplies: guide?.relatedReplies?.length ?? 0,
      },
      v2: {
        approved: knowledge.approvalStatus === "approved",
        approvedConcernGroups: Object.keys(knowledge.approvedConcernReplies).length,
        approvedIntroReplies: knowledge.approvedIntroReplies.length,
        brands: Math.max(knowledge.availableBrands.length, knowledge.brandReplies.length),
        combinationReasons: Object.keys(knowledge.combinationReasons).length,
        comfort: Boolean(knowledge.comfort),
        downtime: Boolean(knowledge.downtime),
        officialSources: knowledge.officialSources.length,
        priceReferences: knowledge.approvedPriceIds.length,
      },
      migrationGaps,
    };
  });
}

const treatments = treatmentParityRows();
const total = treatments.length;
const count = (predicate: (row: TreatmentParityRow) => boolean) =>
  treatments.filter(predicate).length;

const report = {
  generatedAt: new Date().toISOString(),
  interpretation: {
    approvedTreatmentDoesNotMeanAspectComplete: true,
    migrationGapMeaning:
      "Legacy content exists but has not yet been represented as a first-class V2 reply asset.",
  },
  summary: {
    embeddedFaqEntries: EMBEDDED_FAQ_ENTRIES.length,
    legacyPackAssets: {
      approvedCombinationTreatmentKeys: treatments.reduce(
        (sum, row) => sum + row.legacy.approvedCombinationTreatmentKeys,
        0,
      ),
      concernReplies: treatments.reduce((sum, row) => sum + row.legacy.concernReplies, 0),
      detailReplies: treatments.reduce((sum, row) => sum + row.legacy.detailReplies, 0),
      discoveryFallbackOptions: treatments.reduce(
        (sum, row) => sum + row.legacy.discoveryFallbackOptions,
        0,
      ),
      quickReplies: treatments.reduce((sum, row) => sum + row.legacy.quickReplies, 0),
      relatedReplies: treatments.reduce((sum, row) => sum + row.legacy.relatedReplies, 0),
    },
    treatments: {
      total,
      approvedAtTreatmentLevel: count((row) => row.v2.approved),
      withConcernReplies: count((row) => row.v2.approvedConcernGroups > 0),
      withComfort: count((row) => row.v2.comfort),
      withDowntime: count((row) => row.v2.downtime),
      withBrands: count((row) => row.v2.brands > 0),
      withCombinationReasons: count((row) => row.v2.combinationReasons > 0),
      withOfficialSources: count((row) => row.v2.officialSources > 0),
      withPriceReferences: count((row) => row.v2.priceReferences > 0),
      withLegacyAssetsNotFirstClassInV2: count((row) => row.migrationGaps.length > 0),
    },
  },
  treatments,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
