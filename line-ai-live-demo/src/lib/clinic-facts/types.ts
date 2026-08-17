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
