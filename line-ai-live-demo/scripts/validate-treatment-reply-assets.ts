import { clinicConfig } from "../src/lib/clinic-config";
import {
  buildTreatmentReplyAssets,
  type TreatmentReplyAsset,
} from "../src/lib/clinic-facts/treatment-reply-assets";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

const EXPECTED_COUNTS = {
  concern: 9,
  detail: 22,
  discovery: 3,
  discovery_fallback: 1,
  feature: 3,
  intro: 42,
  quick: 11,
  related: 1,
} as const;

function countByKind(assets: readonly TreatmentReplyAsset[], kind: TreatmentReplyAsset["kind"]) {
  return assets.filter((asset) => asset.kind === kind).length;
}

function expectedSourceCounts() {
  return clinicConfig.treatmentList.reduce(
    (counts, treatment) => {
      counts.intro += treatment.approvedContent.introReplies.length;
      if (!treatment.consultationGuide) return counts;
      counts.concern += treatment.consultationGuide.concernReplies?.length ?? 0;
      counts.detail += treatment.consultationGuide.detailReplies?.length ?? 0;
      counts.discovery += 1;
      counts.discovery_fallback += treatment.consultationGuide.discoveryFallbackOption ? 1 : 0;
      counts.feature += 1;
      counts.quick += treatment.consultationGuide.quickReplies?.length ?? 0;
      counts.related += treatment.consultationGuide.relatedReplies?.length ?? 0;
      return counts;
    },
    { concern: 0, detail: 0, discovery: 0, discovery_fallback: 0, feature: 0, intro: 0, quick: 0, related: 0 },
  );
}

function validateSourceCoverage(assets: readonly TreatmentReplyAsset[]) {
  for (const treatment of clinicConfig.treatmentList) {
    const treatmentAssets = assets.filter((asset) => asset.treatmentKey === treatment.key);
    treatment.approvedContent.introReplies.forEach((reply, index) => {
      assert(
        treatmentAssets.some((asset) =>
          asset.id === `treatment:${treatment.key}:intro:${index + 1}` && asset.customerCopy === reply.trim(),
        ),
        `intro asset missing for ${treatment.key} #${index + 1}`,
      );
    });

    const guide = treatment.consultationGuide;
    if (!guide) continue;
    assert(
      treatmentAssets.some((asset) => asset.id === `treatment:${treatment.key}:discovery:primary` && asset.customerCopy === guide.discoveryQuestion.trim()),
      `discovery asset missing for ${treatment.key}`,
    );
    if (guide.discoveryFallbackOption) {
      const fallback = treatmentAssets.find((asset) => asset.id === `treatment:${treatment.key}:discovery_fallback:other`);
      assert(fallback?.customerCopy === guide.discoveryFallbackOption.label.trim(), `discovery fallback asset missing for ${treatment.key}`);
      assert(fallback?.discoveryLabel === guide.discoveryFallbackOption.label.trim(), `discovery fallback label lost for ${treatment.key}`);
      assert(fallback?.followup === guide.discoveryFallbackOption.followupPrompt.trim(), `discovery fallback followup lost for ${treatment.key}`);
      assert(JSON.stringify(fallback?.terms ?? []) === JSON.stringify(guide.discoveryFallbackOption.selectionTerms ?? []), `discovery fallback selection terms lost for ${treatment.key}`);
    }
    assert(
      treatmentAssets.some((asset) => asset.id === `treatment:${treatment.key}:feature:summary` && asset.customerCopy === guide.featureSummary.trim()),
      `feature asset missing for ${treatment.key}`,
    );
    for (const concern of guide.concernReplies ?? []) {
      const asset = treatmentAssets.find((candidate) => candidate.id === `treatment:${treatment.key}:concern:${concern.concernKey}`);
      assert(asset?.customerCopy === concern.reply.trim(), `concern asset missing for ${treatment.key}:${concern.concernKey}`);
      assert(asset?.followup === concern.followupPrompt.trim(), `concern followup lost for ${treatment.key}:${concern.concernKey}`);
      assert(asset?.priceRef === concern.pricingCampaignId, `concern price ref lost for ${treatment.key}:${concern.concernKey}`);
    }
    for (const detail of guide.detailReplies ?? []) {
      const asset = treatmentAssets.find((candidate) => candidate.id === `treatment:${treatment.key}:detail:${detail.aspectKey}`);
      assert(asset?.customerCopy === detail.reply.trim(), `detail asset missing for ${treatment.key}:${detail.aspectKey}`);
      assert(asset?.followup === detail.followupPrompt.trim(), `detail followup lost for ${treatment.key}:${detail.aspectKey}`);
      assert(asset?.priceRef === detail.pricingCampaignId, `detail price ref lost for ${treatment.key}:${detail.aspectKey}`);
      assert(JSON.stringify(asset?.behaviors ?? []) === JSON.stringify(detail.behaviors ?? []), `detail behaviors lost for ${treatment.key}:${detail.aspectKey}`);
      assert(JSON.stringify(asset?.terms ?? []) === JSON.stringify(detail.terms), `detail terms lost for ${treatment.key}:${detail.aspectKey}`);
    }
    for (const quick of guide.quickReplies ?? []) {
      const asset = treatmentAssets.find((candidate) => candidate.id === `treatment:${treatment.key}:quick:${quick.key}`);
      assert(asset?.customerCopy === quick.reply.trim(), `quick asset missing for ${treatment.key}:${quick.key}`);
      assert(JSON.stringify(asset?.terms ?? []) === JSON.stringify(quick.terms), `quick terms lost for ${treatment.key}:${quick.key}`);
    }
    for (const related of guide.relatedReplies ?? []) {
      const asset = treatmentAssets.find((candidate) => candidate.id === `treatment:${treatment.key}:related:${related.key}`);
      assert(asset?.customerCopy === related.reply.trim(), `related asset missing for ${treatment.key}:${related.key}`);
      assert(asset?.relatedTreatmentKey === related.treatmentKey, `related treatment key lost for ${treatment.key}:${related.key}`);
      assert(asset?.priceRef === related.pricingCampaignId, `related price ref lost for ${treatment.key}:${related.key}`);
    }
  }
}

function main() {
  const assets = buildTreatmentReplyAssets();
  const ids = assets.map((asset) => asset.id);
  assert(new Set(ids).size === ids.length, "reply asset IDs must be globally unique");
  assert(assets.every((asset) => asset.customerCopy.trim().length > 0), "customer-visible copy must be non-empty");

  const sourceCounts = expectedSourceCounts();
  for (const [kind, expected] of Object.entries(EXPECTED_COUNTS) as Array<[keyof typeof EXPECTED_COUNTS, number]>) {
    const actual = countByKind(assets, kind);
    assert(actual === expected, `${kind} expected ${expected}, got ${actual}`);
    assert(actual === sourceCounts[kind], `${kind} source coverage mismatch: expected ${sourceCounts[kind]}, got ${actual}`);
  }

  validateSourceCoverage(assets);
  console.log(`PASS: reply assets complete (${assets.length} total; ${Object.entries(EXPECTED_COUNTS).map(([kind, count]) => `${kind}=${count}`).join(", ")})`);
}

main();
