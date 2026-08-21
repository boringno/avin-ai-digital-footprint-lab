import type { ClinicOntology } from "@/lib/clinic-ontology";
import type { ClinicConfig } from "@/lib/clinic-config";
import type { PricingCampaign } from "@/lib/seed-loader";
import type { TreatmentKnowledge } from "@/lib/treatment-knowledge";

export type CatalogCompleteness = "partial" | "complete";

export type ClinicFactProvenance = {
  asOf: string;
  contentKey?: string;
  snapshotId: string;
  source: string;
  version?: string;
};

export type TreatmentBranchAvailability =
  | { branchNames: string[]; scope: "all" | "selected" }
  | { branchNames: []; scope: "unknown" };

export type OfferedTreatmentFact = {
  branchAvailability: TreatmentBranchAvailability;
  // Customer-visible approved copy. `facts` carries internal field labels such as
  // "療程名稱：X" and is only ever a knowledge base for the model; this list is the
  // only treatment copy that may reach the customer directly.
  customerIntroReplies: string[];
  facts: string[];
  factIds: string[];
  key: string;
  missingFields: string[];
  name: string;
  profileCompleteness: "complete" | "partial";
  provenance: ClinicFactProvenance;
  status: "offered";
};

export type TreatmentFactResolution =
  | OfferedTreatmentFact
  | {
      key: string;
      provenance: ClinicFactProvenance;
      reason: "explicit_not_offered";
      status: "not_offered";
    }
  | {
      key: string;
      provenance: ClinicFactProvenance;
      reason:
        | "not_in_catalog"
        | "not_in_partial_catalog"
        | "unreviewed"
        | "stale"
        | "source_unavailable";
      status: "unknown";
    };

/**
 * Applicability is part of the price identity. These fields are deliberately
 * optional so the current campaign CSV remains readable while a future
 * database/content tool can publish more precise prices without changing the
 * resolver contract again.
 */
export type PriceApplicabilityDimensions = {
  branch?: string;
  dose?: string;
  package?: string;
  sessionCount?: number;
  variant?: string;
};

export type PriceQuery = {
  applicability?: PriceApplicabilityDimensions;
  /** Internally selected clinic-approved offer. Never populated from free-form model output. */
  campaignId?: string;
  kind: "campaign" | "regular" | "unspecified";
  treatmentKeys: readonly string[];
};

/**
 * Optional V2 fields layered on the legacy campaign row. The legacy
 * `price_text` remains a compatibility source for today's approved seed data.
 * Once `customer_price_text` is present it is authoritative and requires its
 * own approval status; the resolver must never fall back to `price_text`.
 */
export type PriceCatalogEntry = PricingCampaign & {
  dose?: string;
  package_key?: string;
  session_count?: number | string;
  variant_key?: string;
};

export type ApprovedCurrentPriceFact = {
  applicability: PriceApplicabilityDimensions;
  branchScope: string | null;
  campaignId: string;
  campaignLabel: string | null;
  customerFacts: string[];
  customerPriceText: string;
  provenance: ClinicFactProvenance;
  status: "approved_current";
  treatmentKeys: string[];
};

/**
 * Deliberately has no price or campaign text. Unapproved price data must be
 * impossible to pass to a reply renderer by accident.
 */
export type UnavailablePriceFact = {
  provenance: ClinicFactProvenance;
  reason:
    | "ambiguous"
    | "applicability_mismatch"
    | "applicability_required"
    | "branch_required"
    | "expired"
    | "not_provided"
    | "not_yet_effective"
    | "source_unavailable"
    | "stale"
    | "treatment_not_offered"
    | "treatment_unconfirmed"
    | "unsafe_customer_text"
    | "unreviewed";
  status: "unavailable_to_quote";
  treatmentKeys: string[];
};

export type PriceFactResolution = ApprovedCurrentPriceFact | UnavailablePriceFact;

export type TreatmentKnowledgeResolution = {
  // Customer-visible approved replies selected for the concerns in this turn.
  // These are distinct from the generic treatment introduction so a follow-up can
  // advance the consultation instead of replaying the first paragraph.
  customerConcernReplies: string[];
  // Customer-visible approved copy for the resolved treatments. Never contains the
  // internal field labels that `facts` carries, so a deterministic fallback can be
  // built from this list without leaking "療程名稱：" style text to the customer.
  customerIntroReplies: string[];
  factIds: string[];
  facts: string[];
  gaps: Array<Exclude<TreatmentFactResolution, OfferedTreatmentFact>>;
  profileCompleteness: "complete" | "partial" | "unresolved";
  requestedDataGaps: Array<{ fields: string[]; treatmentKey: string }>;
  resolvedTreatmentKeys: string[];
  snapshotId: string;
};

export type ClinicInfoFactResolution =
  | {
      customerFacts: string[];
      provenance: ClinicFactProvenance;
      status: "resolved";
      topic: string;
    }
  | {
      provenance: ClinicFactProvenance;
      reason: "branch_required" | "incomplete" | "source_unavailable" | "tool_required";
      status: "unknown";
      topic: string;
    };

export type ClinicStateRegistryKeys = {
  answerKeys: readonly string[];
  approvedFactIds: readonly string[];
  areaKeys: readonly string[];
  concernKeys: readonly string[];
  treatmentKeys: readonly string[];
};

/**
 * Provider-owned canonical key catalog for durable conversation state.
 * This intentionally excludes prices, campaigns, availability, and prose.
 */
export type ClinicStateRegistryCatalog = {
  active: ClinicStateRegistryKeys;
  archived: ClinicStateRegistryKeys;
  ontologyVersion: string;
  registryId: string;
  tenantId: string;
};

export type ClinicFactsSnapshot = {
  approvedFactsById: Readonly<Record<string, string>>;
  asOf: Date;
  clinic: ClinicConfig;
  explicitAllBranchTreatmentKeys: ReadonlySet<string>;
  notOfferedTreatmentKeys: ReadonlySet<string>;
  ontology: ClinicOntology;
  priceCatalogCompleteness: CatalogCompleteness;
  priceSourceAvailable: boolean;
  pricingCampaigns: readonly PriceCatalogEntry[];
  snapshotId: string;
  source: string;
  stateRegistryCatalog: ClinicStateRegistryCatalog;
  staleTreatmentKeys: ReadonlySet<string>;
  treatmentCatalogCompleteness: CatalogCompleteness;
  treatmentSourceAvailable: boolean;
  treatments: readonly TreatmentKnowledge[];
};

export type ClinicFactsSnapshotRequest = {
  audienceKey?: string;
  now: Date;
  tenantId?: string;
};

export interface ClinicFactsProvider {
  loadSnapshot(input: ClinicFactsSnapshotRequest): Promise<ClinicFactsSnapshot>;
}
