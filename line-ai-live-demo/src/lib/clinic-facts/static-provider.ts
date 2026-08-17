import { clinicConfig, type ClinicConfig } from "@/lib/clinic-config";
import { buildClinicOntology, type ClinicOntology } from "@/lib/clinic-ontology";
import type { PricingCampaign } from "@/lib/seed-loader";
import {
  createTreatmentKnowledgeResolver,
  treatmentKnowledgeResolver,
  type TreatmentKnowledge,
} from "@/lib/treatment-knowledge";

import type {
  CatalogCompleteness,
  ClinicFactsProvider,
  ClinicFactsSnapshot,
} from "./types";

const MUTATING_DATE_METHODS = new Set([
  "setDate",
  "setFullYear",
  "setHours",
  "setMilliseconds",
  "setMinutes",
  "setMonth",
  "setSeconds",
  "setTime",
  "setUTCDate",
  "setUTCFullYear",
  "setUTCHours",
  "setUTCMilliseconds",
  "setUTCMinutes",
  "setUTCMonth",
  "setUTCSeconds",
  "setYear",
]);

function immutableDate(value: Date) {
  const target = Object.freeze(new Date(value.getTime()));
  return new Proxy(target, {
    defineProperty() {
      throw new TypeError("Clinic facts snapshot dates are immutable");
    },
    deleteProperty() {
      throw new TypeError("Clinic facts snapshot dates are immutable");
    },
    get(date, property) {
      if (typeof property === "string" && MUTATING_DATE_METHODS.has(property)) {
        return () => {
          throw new TypeError("Clinic facts snapshot dates are immutable");
        };
      }
      const current = Reflect.get(date, property, date);
      return typeof current === "function" ? current.bind(date) : current;
    },
    set() {
      throw new TypeError("Clinic facts snapshot dates are immutable");
    },
  });
}

function immutableSet<T>(values: ReadonlySet<T>) {
  const target = Object.freeze(new Set(Array.from(values, (value) => deepImmutableClone(value))));
  return new Proxy(target, {
    defineProperty() {
      throw new TypeError("Clinic facts snapshot sets are immutable");
    },
    deleteProperty() {
      throw new TypeError("Clinic facts snapshot sets are immutable");
    },
    get(set, property) {
      if (property === "add" || property === "clear" || property === "delete") {
        return () => {
          throw new TypeError("Clinic facts snapshot sets are immutable");
        };
      }
      const current = Reflect.get(set, property, set);
      return typeof current === "function" ? current.bind(set) : current;
    },
    set() {
      throw new TypeError("Clinic facts snapshot sets are immutable");
    },
  }) as ReadonlySet<T>;
}

function deepImmutableClone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return immutableDate(value) as T;
  if (value instanceof Set) return immutableSet(value) as T;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => deepImmutableClone(item))) as T;
  }
  const clone = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, deepImmutableClone(item)]),
  );
  return Object.freeze(clone) as T;
}

export type StaticClinicFactsProviderOptions = {
  approvedFactsById?: Readonly<Record<string, string>>;
  clinic?: ClinicConfig;
  explicitAllBranchTreatmentKeys?: readonly string[];
  notOfferedTreatmentKeys?: readonly string[];
  ontology?: ClinicOntology;
  priceCatalogCompleteness?: CatalogCompleteness;
  priceSourceAvailable?: boolean;
  pricingCampaigns?: readonly PricingCampaign[];
  snapshotId?: string;
  source?: string;
  staleTreatmentKeys?: readonly string[];
  treatmentCatalogCompleteness?: CatalogCompleteness;
  treatmentSourceAvailable?: boolean;
  treatments?: readonly TreatmentKnowledge[];
};

/**
 * Injectable bridge for the existing config shapes. Callers must explicitly
 * provide any price records they loaded; this provider does not read runtime
 * content by itself. A future database provider can replace it without
 * changing NLU, policy, or reply hydration.
 */
export function createStaticClinicFactsProvider(
  options: StaticClinicFactsProviderOptions = {},
): ClinicFactsProvider {
  const configuredClinic = options.clinic ?? clinicConfig;
  const configuredTreatments =
    options.treatments ??
    (options.clinic
      ? createTreatmentKnowledgeResolver(configuredClinic).list()
      : treatmentKnowledgeResolver.list());
  const configuredPrices = options.pricingCampaigns ?? [];
  const configuredOntology = options.ontology ?? buildClinicOntology(configuredClinic);
  const source = options.source?.trim() || "clinic_config_and_runtime_content";
  const baseSnapshotId = options.snapshotId?.trim() || "clinic-facts-static-v1";

  return {
    async loadSnapshot({ now }): Promise<ClinicFactsSnapshot> {
      return deepImmutableClone({
        approvedFactsById: options.approvedFactsById ?? {},
        asOf: new Date(now),
        clinic: configuredClinic,
        explicitAllBranchTreatmentKeys: new Set(options.explicitAllBranchTreatmentKeys ?? []),
        notOfferedTreatmentKeys: new Set(options.notOfferedTreatmentKeys ?? []),
        ontology: configuredOntology,
        priceCatalogCompleteness: options.priceCatalogCompleteness ?? "partial",
        priceSourceAvailable: options.priceSourceAvailable ?? true,
        pricingCampaigns: configuredPrices,
        snapshotId: baseSnapshotId,
        source,
        staleTreatmentKeys: new Set(options.staleTreatmentKeys ?? []),
        treatmentCatalogCompleteness: options.treatmentCatalogCompleteness ?? "partial",
        treatmentSourceAvailable: options.treatmentSourceAvailable ?? true,
        treatments: configuredTreatments,
      });
    },
  };
}
