import {
  clinicConfig,
  type ClinicConfig,
  type TreatmentConfig,
} from "@/lib/clinic-config";
import type { TreatmentConversationBehavior } from "@/lib/conversation-behavior";

/**
 * A normalized, customer-visible fragment from the reviewed treatment packs.
 *
 * This module is deliberately a read-only adapter.  It does not choose a
 * reply, match a customer message, or mutate a conversation.  In particular,
 * `terms` are recognition hints for a future NLU/retrieval layer only; they
 * must never be copied into Router `if`/regex rules.
 */
export type TreatmentReplyAssetKind =
  | "intro"
  | "concern"
  | "detail"
  | "quick"
  | "related"
  | "discovery"
  | "discovery_fallback"
  | "feature";

export type TreatmentReplyAsset = {
  aspectKey?: string;
  behaviors: TreatmentConversationBehavior[];
  concernKey?: string;
  customerCopy: string;
  discoveryLabel?: string;
  followup?: string;
  id: string;
  kind: TreatmentReplyAssetKind;
  priceRef?: string;
  relatedTreatmentKey?: string;
  /** Recognition hints only. They are not Router rules. */
  terms: string[];
  treatmentKey: string;
};

function clean(value: string | undefined) {
  return value?.trim() ?? "";
}

function unique(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function assetId(treatmentKey: string, kind: TreatmentReplyAssetKind, key: string | number) {
  return `treatment:${treatmentKey}:${kind}:${String(key).trim()}`;
}

function base(treatment: TreatmentConfig, kind: TreatmentReplyAssetKind, key: string | number) {
  return {
    behaviors: [] as TreatmentConversationBehavior[],
    id: assetId(treatment.key, kind, key),
    kind,
    terms: [] as string[],
    treatmentKey: treatment.key,
  };
}

function treatmentRecognitionHints(treatment: TreatmentConfig) {
  return unique([treatment.name, ...treatment.aliases, ...(treatment.availableBrands ?? [])]);
}

/**
 * Converts the legacy `consultationGuide` content into typed assets while
 * preserving every reviewed reply verbatim.  Consumer routing is intentionally
 * out of scope; V2 may later select these assets through a policy/retrieval
 * layer without importing legacy Router branches.
 */
export function buildTreatmentReplyAssets(config: ClinicConfig = clinicConfig): TreatmentReplyAsset[] {
  const assets: TreatmentReplyAsset[] = [];

  for (const treatment of config.treatmentList) {
    for (const [index, customerCopy] of treatment.approvedContent.introReplies.entries()) {
      assets.push({
        ...base(treatment, "intro", index + 1),
        customerCopy: clean(customerCopy),
        terms: treatmentRecognitionHints(treatment),
      });
    }

    const guide = treatment.consultationGuide;
    if (!guide) continue;

    assets.push({
      ...base(treatment, "discovery", "primary"),
      customerCopy: clean(guide.discoveryQuestion),
      followup: clean(guide.followupPrompt) || undefined,
    });
    if (guide.discoveryFallbackOption) {
      // The fallback option has no independent reply body in the legacy shape.
      // Its reviewed label is therefore the visible customer copy, while its
      // follow-up remains available to a future dialogue-policy selector.
      assets.push({
        ...base(treatment, "discovery_fallback", "other"),
        customerCopy: clean(guide.discoveryFallbackOption.label),
        discoveryLabel: clean(guide.discoveryFallbackOption.label) || undefined,
        followup: clean(guide.discoveryFallbackOption.followupPrompt) || undefined,
        terms: unique(guide.discoveryFallbackOption.selectionTerms ?? []),
      });
    }
    assets.push({
      ...base(treatment, "feature", "summary"),
      customerCopy: clean(guide.featureSummary),
      followup: clean(guide.followupPrompt) || undefined,
    });

    for (const concern of guide.concernReplies ?? []) {
      assets.push({
        ...base(treatment, "concern", concern.concernKey),
        concernKey: clean(concern.concernKey) || undefined,
        customerCopy: clean(concern.reply),
        discoveryLabel: clean(concern.discoveryLabel) || undefined,
        followup: clean(concern.followupPrompt) || undefined,
        ...(clean(concern.pricingCampaignId) ? { priceRef: clean(concern.pricingCampaignId) } : {}),
        terms: unique(concern.selectionTerms ?? []),
      });
    }

    for (const detail of guide.detailReplies ?? []) {
      assets.push({
        ...base(treatment, "detail", detail.aspectKey),
        aspectKey: clean(detail.aspectKey) || undefined,
        behaviors: [...(detail.behaviors ?? [])],
        concernKey: clean(detail.concernKey) || undefined,
        customerCopy: clean(detail.reply),
        followup: clean(detail.followupPrompt) || undefined,
        ...(clean(detail.pricingCampaignId) ? { priceRef: clean(detail.pricingCampaignId) } : {}),
        terms: unique(detail.terms),
      });
    }

    for (const quick of guide.quickReplies ?? []) {
      assets.push({
        ...base(treatment, "quick", quick.key),
        aspectKey: clean(quick.key) || undefined,
        customerCopy: clean(quick.reply),
        followup: clean(quick.followupPrompt) || undefined,
        terms: unique(quick.terms),
      });
    }

    for (const related of guide.relatedReplies ?? []) {
      assets.push({
        ...base(treatment, "related", related.key),
        aspectKey: clean(related.key) || undefined,
        customerCopy: clean(related.reply),
        followup: clean(related.followupPrompt) || undefined,
        ...(clean(related.pricingCampaignId) ? { priceRef: clean(related.pricingCampaignId) } : {}),
        ...(clean(related.treatmentKey) ? { relatedTreatmentKey: clean(related.treatmentKey) } : {}),
        terms: unique(related.terms),
      });
    }
  }

  return assets;
}

/** Current compiled catalog.  Consumers may instead call the builder with a pinned config snapshot. */
export const treatmentReplyAssets = buildTreatmentReplyAssets();
