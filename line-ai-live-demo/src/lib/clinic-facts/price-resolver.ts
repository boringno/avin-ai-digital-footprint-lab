import { normalizeClinicText } from "@/lib/clinic-config";
import { PRICE_ASK_TERMS } from "@/lib/pricing-subject";
import {
  highestQuotePriorityCampaigns,
} from "@/lib/pricing-campaign-priority";
import { hasAnniversaryCampaignWording, isAnniversaryPromotion, isCustomerVisiblePriceOffer, isStandingPrice, normalizeCampaignFamilyText } from "@/lib/pricing-lifecycle";

import type {
  ClinicFactProvenance,
  ClinicFactsSnapshot,
  ApprovedPromotionCatalogItem,
  ApprovedPromotionCatalogSelection,
  PromotionCatalogResolution,
  PriceApplicabilityDimensions,
  PriceCatalogEntry,
  PriceFactResolution,
  PriceQuery,
  UnavailablePriceFact,
} from "./types";

export const NOT_CUSTOMER_VISIBLE_PRICE_REPLY =
  "這個方案目前需要由真人客服協助確認，我這裡不提供該方案的線上報價。如果您願意，也可以先查看其他目前可線上查詢的周年慶方案。";
export const NOT_CUSTOMER_VISIBLE_PRICE_ACTIONS = [
  { label: "查看線上周年慶方案", text: "我想了解現在有哪些活動" },
  { label: "真人客服協助", text: "我要找真人客服" },
] as const;
import { resolveTreatmentFact } from "./treatment-resolver";

type CampaignState = "current" | "expired" | "future" | "stale" | "unreviewed";
type ApplicabilityState = "match" | "branch_required" | "required" | "mismatch";

const LEGACY_PRICING_TREATMENT_KEYS: Readonly<Record<string, string>> = {
  fisbo: "emface",
};

function unique(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function provenance(
  snapshot: ClinicFactsSnapshot,
  contentKey?: string,
): ClinicFactProvenance {
  return {
    asOf: snapshot.asOf.toISOString(),
    ...(contentKey ? { contentKey } : {}),
    snapshotId: snapshot.snapshotId,
    source: snapshot.source,
  };
}

export function sanitizeCustomerPromotionText(text: string) {
  return text
    .replace(
      /(?:(?:19|20)\d{2}[/.年-]\d{1,2}(?:[/.月-]\d{1,2})?日?|\d{1,2}\s*月\s*\d{1,2}\s*(?:日|號)?|\d{1,2}[/.]\d{1,2}\s*(?:-|–|—|~|～|至)\s*(?:(?:19|20)\d{2}[/.])?\d{1,2}[/.]\d{1,2}\s*(?:日|號)?|\d{1,2}[/.]\d{1,2}\s*(?:日|號))(?:(?:\s*(?:-|–|—|~|～|至)\s*)(?:(?:19|20)\d{2}[/.年-])?\d{1,2}(?:[/.月-]\d{1,2})?\s*(?:日|號)?)?/gu,
      "",
    )
    .replace(/即日起(?:\s*(?:至|到|[-~～—])\s*(?:(?:本|這)\s*)?月\s*底)?/gu, "")
    .replace(/(?:(?:\d{1,2}|[一二三四五六七八九十]{1,3})\s*月\s*底|(?:本|這)\s*月\s*底)/gu, "")
    .replace(/活動\s*(?:到|至)\s*/gu, "")
    .replace(/(?:^|\s)(?:19|20)\d{2}年?(?=\s|$)/gu, " ")
    .replace(/依館別、日期與現場評估調整/g, "依館別與現場評估調整")
    .replace(/依館別、檔期與現場評估調整/g, "依館別與現場評估調整")
    .replace(/依館別與日期調整/g, "依館別調整")
    .replace(/依檔期調整/g, "依現場狀況調整")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–—~～至/.,，、:：]+|[\s\-–—~～至/.,，、:：]+$/gu, "")
    .trim();
}

function containsActivityTiming(text: string) {
  const chineseNumber = "〇零一二三四五六七八九十廿卅";
  const calendarDay = new RegExp(
    `[${chineseNumber}\\d]{1,3}\\s*月\\s*[${chineseNumber}\\d]{1,4}\\s*(?:日|號|前)`,
    "u",
  );
  const promotionDeadlineWithoutSuffix = new RegExp(
    `(?:優惠|活動|方案|特惠|體驗價|限時)\\s*(?:僅|只)?\\s*(?:到|至|截止(?:至|到)?|有效(?:至|到)?)\\s*[${chineseNumber}\\d]{1,3}\\s*月\\s*[${chineseNumber}\\d]{1,4}(?=\\s|元|$)`,
    "u",
  );
  if (calendarDay.test(text) || promotionDeadlineWithoutSuffix.test(text)) return true;
  // Approved campaign names such as "周年慶活動價" are customer-facing
  // labels, not schedule disclosure. Block actual dates/deadlines while
  // allowing the clinic-approved event label to be quoted.
  return /(?:即日起|月底|年底|截止|到期|限時|(?:暑假|寒假|春季|夏季|秋季|冬季|周年慶)?限定|倒數\s*[〇零一二三四五六七八九十\d]*\s*(?:天|日|小時)?|(?:本|這|上|下)(?:週|周|月|季|年)|(?:僅|只)?到\s*(?:週|周)[一二三四五六日天末]?|(?:週|周)末前|活動(?:日期|期間|時間|到|至)|有效(?:日期|期間|期限)|檔期|(?:19|20)\d{2}\s*(?:年|[-/.])|[〇零一二三四五六七八九十\d]{1,4}\s*年\s*[〇零一二三四五六七八九十\d]{1,2}\s*月|\d{1,2}\s*[/.]\s*\d{1,2}(?=\s*(?:日|號|前|截止|優惠|活動|\d{2,3}(?:,?\d{3})?元?|$)))/u.test(text);
}

function enabled(value: string) {
  return ["true", "active", "enabled"].includes(value.trim().toLowerCase());
}

function approved(value: string) {
  return ["approved", "stable"].includes(value.trim().toLowerCase());
}

function normalizeCalendarDate(value: string) {
  const match = value.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/u);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const verified = new Date(Date.UTC(year, month - 1, day));
  if (
    verified.getUTCFullYear() !== year ||
    verified.getUTCMonth() !== month - 1 ||
    verified.getUTCDate() !== day
  ) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateInTimeZone(now: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return null;
  }
}

function campaignState(
  campaign: PriceCatalogEntry,
  now: Date,
  timeZone: string,
): CampaignState {
  if (!approved(campaign.approval_status)) return "unreviewed";
  if (!enabled(campaign.is_active)) return "stale";
  const startsAt = normalizeCalendarDate(campaign.start_date);
  const endsAt = normalizeCalendarDate(campaign.end_date);
  const localDate = dateInTimeZone(now, timeZone);
  if (!localDate) return "stale";
  if (isStandingPrice(campaign)) {
    if (campaign.start_date.trim() && !startsAt) return "stale";
    if (campaign.end_date.trim() && !endsAt) return "stale";
    if (startsAt && startsAt > localDate) return "future";
    if (endsAt && endsAt < localDate) return "expired";
    return "current";
  }
  if (!startsAt || !endsAt) return "stale";
  if (startsAt > localDate) return "future";
  if (endsAt < localDate) return "expired";
  return "current";
}

function splitTerms(value: string | undefined) {
  return unique((value ?? "").split(/[|,，、\n]/u));
}

function treatmentKeyForTerm(snapshot: ClinicFactsSnapshot, term: string) {
  const normalized = normalizeClinicText(term);
  if (!normalized) return null;
  const direct = snapshot.treatments.find((treatment) =>
    [treatment.name, ...treatment.aliases]
      .some((candidate) => normalizeClinicText(candidate) === normalized));
  if (direct) return direct.key;
  return snapshot.treatments.find((treatment) =>
    treatment.availableBrands
      .some((candidate) => normalizeClinicText(candidate) === normalized))?.key ?? null;
}

function campaignTreatmentKeys(snapshot: ClinicFactsSnapshot, campaign: PriceCatalogEntry) {
  return unique([
    campaign.treatment_name,
    ...splitTerms(campaign.booking_treatments),
  ].flatMap((term) => {
    const key = treatmentKeyForTerm(snapshot, term);
    return key ? [key] : [];
  }));
}

function campaignScore(
  snapshot: ClinicFactsSnapshot,
  campaign: PriceCatalogEntry,
  treatmentKeys: readonly string[],
  requestedCampaignId?: string,
) {
  const campaignKeys = campaignTreatmentKeys(snapshot, campaign);
  const requested = unique(treatmentKeys);
  const knowledge = requested.flatMap((key) =>
    snapshot.treatments.filter((treatment) => treatment.key === key));
  const approvedById = knowledge.some((treatment) => treatment.approvedPriceIds.includes(campaign.id));
  if (requestedCampaignId) {
    const exactCatalogOwnership =
      requested.length > 0 &&
      requested.length === campaignKeys.length &&
      requested.every((key) => campaignKeys.includes(key));
    const approvedLegacyOwnership =
      approvedById &&
      requested.length > 0 &&
      requested.every((key) => campaignKeys.includes(key));
    const isAuthorizedOffer =
      campaign.id === requestedCampaignId &&
      (exactCatalogOwnership || approvedLegacyOwnership);
    return isAuthorizedOffer ? 1_000 : 0;
  }
  const ownsAllTreatments =
    requested.length > 0 &&
    requested.length === campaignKeys.length &&
    requested.every((key) => campaignKeys.includes(key));
  const normalizedCampaignTerms = new Set([
    campaign.treatment_name,
    ...splitTerms(campaign.campaign_aliases),
    ...splitTerms(campaign.booking_treatments),
  ].map(normalizeClinicText).filter(Boolean));
  const termMatch = knowledge.some((treatment) =>
    [treatment.name, ...treatment.aliases, ...treatment.availableBrands]
      .some((term) => normalizedCampaignTerms.has(normalizeClinicText(term))));

  const approvedWithoutMappedOwnership =
    requested.length === 1 && campaignKeys.length === 0 && approvedById;
  if (!ownsAllTreatments && !approvedWithoutMappedOwnership) return 0;
  return (ownsAllTreatments ? 100 : 0) + (approvedById ? 50 : 0) + (termMatch ? 10 : 0);
}

function normalizedDimension(value: string | undefined) {
  return normalizeClinicText(value ?? "");
}

function branchIdentity(snapshot: ClinicFactsSnapshot, value: string) {
  const normalized = normalizeClinicText(value);
  if (!normalized) return "";
  const branch = snapshot.clinic.branches.find((candidate) =>
    [candidate.name, candidate.city, ...candidate.aliases]
      .some((term) => normalizeClinicText(term) === normalized));
  return normalizeClinicText(branch?.name ?? value);
}

function campaignBranches(snapshot: ClinicFactsSnapshot, branchScope: string) {
  const terms = splitTerms(branchScope);
  if (terms.some((term) => ["all", "all branches", "全館"].includes(term.trim().toLowerCase()))) {
    return { all: true, branchIds: [] as string[] };
  }
  return {
    all: false,
    branchIds: unique(terms.map((term) => branchIdentity(snapshot, term))),
  };
}

function parsedSessionCount(value: number | string | undefined) {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (!value?.trim() || !/^\d+$/u.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function recordApplicability(campaign: PriceCatalogEntry): PriceApplicabilityDimensions {
  const sessionCount = parsedSessionCount(campaign.session_count);
  return {
    ...(campaign.dose?.trim() ? { dose: campaign.dose.trim() } : {}),
    ...(campaign.package_key?.trim() ? { package: campaign.package_key.trim() } : {}),
    ...(sessionCount ? { sessionCount } : {}),
    ...(campaign.variant_key?.trim() ? { variant: campaign.variant_key.trim() } : {}),
  };
}

function applicabilityState(
  snapshot: ClinicFactsSnapshot,
  campaign: PriceCatalogEntry,
  query: PriceApplicabilityDimensions | undefined,
  checkBranch = true,
): ApplicabilityState {
  const scope = campaignBranches(snapshot, campaign.branch_scope);
  const requestedBranch = query?.branch?.trim();
  if (checkBranch && !scope.all) {
    if (!requestedBranch) return "branch_required";
    if (!scope.branchIds.includes(branchIdentity(snapshot, requestedBranch))) return "mismatch";
  }

  const record = recordApplicability(campaign);
  const dimensions = ["dose", "package", "variant"] as const;
  // A supplied qualifier must be checked for mismatch before missing fields.
  // Otherwise `BOTOX 價格` could stop at a missing dose and accidentally reuse
  // a Neuronox-only offer before the conflicting brand is examined.
  for (const dimension of dimensions) {
    const expected = normalizedDimension(record[dimension]);
    const requested = normalizedDimension(query?.[dimension]);
    if (requested && (!expected || requested !== expected)) return "mismatch";
  }
  if (
    query?.sessionCount !== undefined &&
    (!record.sessionCount || record.sessionCount !== query.sessionCount)
  ) return "mismatch";
  for (const dimension of dimensions) {
    if (normalizedDimension(record[dimension]) && !normalizedDimension(query?.[dimension])) {
      return "required";
    }
  }
  if (record.sessionCount && query?.sessionCount === undefined) return "required";
  return "match";
}

function customerTextSelfIdentifiesApplicability(
  campaign: PriceCatalogEntry,
  query: PriceApplicabilityDimensions | undefined,
) {
  const resolvedText = customerPriceText(campaign);
  if (resolvedText.status !== "ok") return false;
  const normalizedText = normalizeClinicText(resolvedText.text);
  const record = recordApplicability(campaign);
  for (const dimension of ["dose", "package", "variant"] as const) {
    const expected = normalizedDimension(record[dimension]);
    if (!expected || normalizedDimension(query?.[dimension])) continue;
    if (!normalizedText.includes(expected)) return false;
  }
  if (record.sessionCount && query?.sessionCount === undefined) {
    const count = String(record.sessionCount);
    if (!new RegExp(`${count}(?:堂|次|組|入)`, "u").test(normalizedText)) return false;
  }
  return true;
}

type CustomerPriceTextResolution =
  | { status: "ok"; text: string }
  | { reason: "not_provided" | "unsafe_customer_text" | "unreviewed"; status: "blocked" };

function customerPriceText(campaign: PriceCatalogEntry): CustomerPriceTextResolution {
  // V2 never quotes from the legacy free-text campaign field. Customer price
  // copy is separately reviewed; start/end dates and internal campaign labels
  // remain inaccessible to the renderer.
  if (!approved(campaign.customer_price_approval_status ?? "")) {
    return { reason: "unreviewed", status: "blocked" };
  }
  const source = campaign.customer_price_text?.trim() ?? "";
  if (!source) return { reason: "not_provided", status: "blocked" };
  if (containsActivityTiming(source)) {
    return { reason: "unsafe_customer_text", status: "blocked" };
  }
  // This field has its own approval lifecycle. Once it passes the timing
  // guard, preserve the clinic-approved copy exactly; generic date scrubbing
  // would corrupt legitimate units such as 2.5ml, 200發, or 3堂.
  return { status: "ok", text: source };
}

function unavailable(
  snapshot: ClinicFactsSnapshot,
  treatmentKeys: readonly string[],
  reason: UnavailablePriceFact["reason"],
  contentKey?: string,
): UnavailablePriceFact {
  return {
    provenance: provenance(snapshot, contentKey),
    reason,
    status: "unavailable_to_quote",
    treatmentKeys: unique(treatmentKeys),
  };
}

function customerBranchScope(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["all", "all branches", "全館"].includes(normalized)) return "全館適用";
  return sanitizeCustomerPromotionText(value) || null;
}

/**
 * Asset URLs are optional campaign metadata, never price copy. Keep only
 * transport-safe HTTPS URLs so an approved price receipt can safely hand them
 * to LINE without every renderer reparsing the catalog's free-form field.
 */
function customerAssetUrls(campaign: PriceCatalogEntry) {
  const urls: string[] = [];
  for (const value of (campaign.asset_urls ?? "").split(/[|,，、\n]/u)) {
    const source = value.trim();
    if (!source) continue;
    try {
      const url = new URL(source);
      if (
        url.protocol !== "https:" ||
        !url.hostname ||
        url.username ||
        url.password ||
        url.hash
      ) continue;
      const normalized = url.toString();
      if (!urls.includes(normalized)) urls.push(normalized);
    } catch {
      // Campaign artwork is optional. A malformed URL must not make an
      // otherwise approved text price unavailable.
    }
  }
  // LINE reply payloads can contain at most five messages; reserve one for
  // the canonical price text even when a future campaign has many assets.
  return urls.slice(0, 4);
}

/** Resolve a catalog-authored campaign identity, not a generic item alias.
 * Lifecycle/approval/amount remain owned by resolveApprovedPrice: even an
 * expired exact selection must not silently become a different campaign.
 */
export function resolveExplicitCampaignContext(snapshot: ClinicFactsSnapshot, message: string): readonly string[] | undefined {
  const normalized = (text: string) => normalizeClinicText(normalizeCampaignFamilyText(text));
  const text = normalized(message);
  if (isAnniversaryPromotion({ campaign_name: message })) {
    // An empty explicit context remains a restriction, never permission to fall back.
    return snapshot.pricingCampaigns.filter((row) => !isStandingPrice(row) && isAnniversaryPromotion(row)).map((row) => row.id);
  }
  const treatmentTerms = snapshot.treatments.flatMap((treatment) =>
    [treatment.name, ...treatment.aliases, ...treatment.availableBrands]);
  // Discovery vocabulary has its own typed owner. A campaign alias may reuse
  // it, but a bare concern token is not evidence of selecting that campaign.
  const concernTerms = new Set(snapshot.ontology.concerns.flatMap((concern) =>
    concern.keywords.map(normalized)));
  const matches = snapshot.pricingCampaigns.filter((row) => !isStandingPrice(row)).flatMap((row) => {
    const itemTerms = unique([
      ...PRICE_ASK_TERMS, ...treatmentTerms,
      row.treatment_name, row.dose ?? "", row.variant_key ?? "", row.package_key ?? "",
      ...splitTerms(row.booking_treatments),
    ].map(normalized)).sort((a, b) => b.length - a.length);
    const tokens = [row.campaign_name, ...splitTerms(row.campaign_aliases)].flatMap((term) => {
      const residual = itemTerms.reduce((rest, item) => rest.split(item).join("|"), normalized(term))
        .replace(/(?:方案|組合|療程|單位|號|發|條|cc|u)/gu, "|");
      // Preserve explicit anniversary years/editions; their classification has one owner.
      return (hasAnniversaryCampaignWording(residual) ? residual : residual.replace(/\d+/gu, "|"))
        .split(/[|\s+＋/()（）,，.\-]/u).filter((token) => token.length >= 2 && /\p{L}/u.test(token) &&
          !PRICE_ASK_TERMS.some((priceTerm) => normalized(priceTerm).includes(token)));
    });
    const evidence = tokens.filter((token) => !concernTerms.has(token) && text.includes(token) &&
      // A bare anniversary token must not reclassify a different explicit year/edition.
      (!hasAnniversaryCampaignWording(token) || !isAnniversaryPromotion(row)));
    return evidence.length > 0 ? [row.id] : [];
  });
  return matches.length > 0 ? unique(matches) : undefined;
}

/** Identity evidence may deny a quote, but must never authorize one. */
export function findNonPublicPromotionMention(snapshot: ClinicFactsSnapshot, message: string) {
  // A treatment/spec alias is not consent to select its offline campaign.
  // Keep explicit offline/campaign wording authoritative even in mixed asks.
  const campaignText = normalizeCampaignFamilyText(message).replace(/非(?:活動|優惠)(?:價格|價)?/gu, "");
  const explicitCampaign = isAnniversaryPromotion({ campaign_name: campaignText }) || /線下|延伸方案/u.test(campaignText);
  if (!explicitCampaign) return undefined;
  const text = normalizeClinicText(normalizeCampaignFamilyText(message));
  const nameMatchLength = (campaign: PriceCatalogEntry) => Math.max(0,
    ...[campaign.campaign_name, ...splitTerms(campaign.campaign_aliases)]
      .map((term) => normalizeClinicText(normalizeCampaignFamilyText(term)))
      .filter((term) => term.length >= 2 && !/^[\d,.]+$/u.test(term) && text.includes(term))
      .map((term) => term.length));
  const matches = snapshot.pricingCampaigns.filter((campaign) => {
    if (isCustomerVisiblePriceOffer(campaign)) return false;
    if (nameMatchLength(campaign) > 0) return true;
    // Compound offers can be typed with a treatment name between quantities.
    // Require every quantity AND every named treatment; never match an amount.
    const quantities = normalizeClinicText(campaign.dose ?? "").match(/\d+(?:\.\d+)?(?:條|u|發)/gu) ?? [];
    const owners = campaignTreatmentKeys(snapshot, campaign);
    return quantities.length >= 2 && quantities.every((quantity) => text.includes(quantity)) &&
      owners.length >= 2 && owners.every((key) => {
        const treatment = snapshot.treatments.find((item) => item.key === key);
        return treatment && [treatment.name, ...treatment.aliases].some((name) => text.includes(normalizeClinicText(name)));
      });
  });
  // A full combination alias outranks its contained single-product alias.
  matches.sort((left, right) => nameMatchLength(right) - nameMatchLength(left));
  const campaign = matches.length === 1 || (matches.length > 1 &&
    nameMatchLength(matches[0]!) > nameMatchLength(matches[1]!)) ? matches[0] : undefined;
  return campaign ? { ...campaign, treatmentKeys: campaignTreatmentKeys(snapshot, campaign) } : undefined;
}

function exactPriceItemKey(
  snapshot: ClinicFactsSnapshot,
  campaign: PriceCatalogEntry,
) {
  const treatmentIdentity = campaignTreatmentKeys(snapshot, campaign).sort().join("+") ||
    normalizeClinicText(campaign.treatment_name);
  const applicability = recordApplicability(campaign);
  return JSON.stringify([
    treatmentIdentity,
    normalizeClinicText(applicability.dose ?? ""),
    normalizeClinicText(applicability.package ?? ""),
    applicability.sessionCount ?? "",
    normalizeClinicText(applicability.variant ?? ""),
  ]);
}

function promotionCatalogGroupKey(snapshot: ClinicFactsSnapshot, campaign: PriceCatalogEntry) {
  // Catalog cards may still distinguish branch-specific offers. Quote item
  // identity must not: branch eligibility is evaluated independently below.
  const scope = campaignBranches(snapshot, campaign.branch_scope);
  return JSON.stringify([exactPriceItemKey(snapshot, campaign), scope.all ? "all" : scope.branchIds.sort()]);
}

function customerPromotionDisplayName(campaign: PriceCatalogEntry) {
  const treatmentNames = unique([
    campaign.treatment_name,
    ...splitTerms(campaign.booking_treatments),
  ].map(sanitizeCustomerPromotionText)).filter((value, index, all) =>
    all.findIndex((candidate) => normalizeClinicText(candidate) === normalizeClinicText(value)) === index,
  );
  const base = treatmentNames.join("＋");
  if (!base) return "";
  const applicability = recordApplicability(campaign);
  const qualifiers = unique([
    applicability.dose ?? "",
    applicability.package ?? "",
    applicability.sessionCount ? `${applicability.sessionCount} 堂` : "",
    applicability.variant ?? "",
  ]).filter((value) => !normalizeClinicText(base).includes(normalizeClinicText(value)));
  return qualifiers.length > 0 ? `${base}（${qualifiers.join("／")}）` : base;
}

/**
 * Returns the complete customer-visible catalog of effective, clinic-approved
 * offers. Internal campaign labels, validity dates, notes and fallback copy
 * deliberately never leave this resolver.
 *
 * If a newer offer declares a quote priority for the same treatment and exact
 * applicability, it replaces an older generic row. Distinct packages/doses/
 * variants remain visible so the overview does not silently drop real offers.
 */
export function resolveApprovedPromotionCatalog(
  snapshot: ClinicFactsSnapshot,
): PromotionCatalogResolution {
  const catalogProvenance = provenance(snapshot);
  if (!snapshot.priceSourceAvailable) {
    return {
      items: [],
      provenance: catalogProvenance,
      reason: "source_unavailable",
      status: "unavailable",
    };
  }

  const campaignsById = new Map<string, PriceCatalogEntry>();
  for (const campaign of snapshot.pricingCampaigns) {
    // Runtime records precede the seed baseline. Preserve that ownership just
    // like resolveApprovedPrice does.
    if (!campaignsById.has(campaign.id)) campaignsById.set(campaign.id, campaign);
  }

  const candidates = [...campaignsById.values()].flatMap((campaign, index) => {
    // The promotion carousel is intentionally narrower than the price
    // resolver. Standing approved prices remain quoteable when asked, but do
    // not appear as if they were part of the current anniversary campaign.
    if (isStandingPrice(campaign)) return [];
    if (!isCustomerVisiblePriceOffer(campaign)) return [];
    if (
      campaignState(
        campaign,
        snapshot.asOf,
        snapshot.clinic.humanSupportHours.timezone,
      ) !== "current"
    ) return [];
    const price = customerPriceText(campaign);
    const displayName = customerPromotionDisplayName(campaign);
    if (price.status !== "ok" || !displayName) return [];
    return [{
      campaign,
      displayName,
      index,
      priceText: price.text,
    }];
  });

  const groups = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const key = promotionCatalogGroupKey(snapshot, candidate.campaign);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }

  const selected = [...groups.values()]
    .flatMap((group) => {
      const selectedIds = new Set(highestQuotePriorityCampaigns(group.map(({ campaign }) => campaign)).map((row) => row.id));
      // A config conflict is not a menu asking customers to choose our campaign.
      return selectedIds.size === 1 ? group.filter(({ campaign }) => selectedIds.has(campaign.id)) : [];
    })
    .sort((left, right) => left.index - right.index);

  const items = selected.map(({ campaign, displayName, priceText }) => ({
    applicability: recordApplicability(campaign),
    branchScope: customerBranchScope(campaign.branch_scope),
    campaignId: campaign.id,
    customerAssetUrls: customerAssetUrls(campaign),
    customerPriceText: priceText,
    displayName,
    provenance: provenance(snapshot, campaign.id),
    status: "approved_current" as const,
    treatmentKeys: campaignTreatmentKeys(snapshot, campaign),
  }));

  return items.length > 0
    ? { items, provenance: catalogProvenance, status: "approved_current" }
    : {
        items: [],
        provenance: catalogProvenance,
        reason: "not_provided",
        status: "unavailable",
      };
}

/** Canonical text emitted by a promotion card's LINE message action. */
export function approvedPromotionCatalogSelectionText(
  item: Pick<ApprovedPromotionCatalogItem, "customerPriceText" | "displayName">,
) {
  return `我想了解 ${item.displayName}，${item.customerPriceText}`;
}

/**
 * Re-identifies a card tap against the current pinned approved catalog.  This
 * avoids asking NLU to guess a campaign from display copy while keeping the
 * existing LINE message-action transport.  Ambiguous or stale text simply
 * does not select a campaign and therefore cannot force an unapproved quote.
 */
export function resolveApprovedPromotionCatalogSelection(
  snapshot: ClinicFactsSnapshot,
  message: string,
): ApprovedPromotionCatalogSelection | null {
  const catalog = resolveApprovedPromotionCatalog(snapshot);
  if (catalog.status !== "approved_current") return null;
  const normalizedMessage = normalizeClinicText(normalizeCampaignFamilyText(message));
  const matches = catalog.items.filter((item) =>
    normalizeClinicText(normalizeCampaignFamilyText(approvedPromotionCatalogSelectionText(item))) === normalizedMessage,
  );
  if (matches.length !== 1) return null;
  const selected = matches[0]!;
  return {
    applicability: { ...selected.applicability },
    campaignId: selected.campaignId,
    treatmentKeys: [...selected.treatmentKeys],
  };
}

/** Read-only preflight at the pinned snapshot's effective time. Reuses the
 * quote resolver (including priority and branch checks), not a parallel rule.
 * Release tooling can evaluate its intended effective dates with this helper.
 */
export function detectPriceConfigurationConflicts(snapshot: ClinicFactsSnapshot) {
  const queries = new Map<string, PriceQuery>();
  for (const row of snapshot.pricingCampaigns) {
    if (isStandingPrice(row) || !isCustomerVisiblePriceOffer(row)) continue;
    const directKeys = campaignTreatmentKeys(snapshot, row);
    const treatmentKeys = directKeys.length > 0 ? directKeys : snapshot.treatments
      .filter((treatment) => treatment.approvedPriceIds.includes(row.id)).map((treatment) => treatment.key);
    if (treatmentKeys.length === 0) continue;
    for (const branch of snapshot.clinic.branches) {
      const query: PriceQuery = { kind: "unspecified", treatmentKeys,
        applicability: { ...recordApplicability(row), branch: branch.name } };
      queries.set(JSON.stringify(query), query);
    }
  }
  return [...queries.values()].flatMap((query) => {
    const resolution = resolveApprovedPrice(snapshot, query);
    return resolution.status === "unavailable_to_quote" && resolution.configurationIssue
      ? [{ code: resolution.configurationIssue, query, provenance: resolution.provenance }] : [];
  });
}

export function resolveApprovedPrice(
  snapshot: ClinicFactsSnapshot,
  query: PriceQuery,
): PriceFactResolution {
  // Pricing-only compatibility for persisted pre-convergence subjects. This
  // local copy must never rewrite conversation or booking state.
  const treatmentKeys = unique(
    query.treatmentKeys.map((key) => LEGACY_PRICING_TREATMENT_KEYS[key] ?? key),
  );
  if (!snapshot.priceSourceAvailable) {
    return unavailable(snapshot, treatmentKeys, "source_unavailable");
  }
  const inventoryChecks = treatmentKeys.map((key) =>
    resolveTreatmentFact(snapshot, key, "followup"));
  if (inventoryChecks.some((result) => result.status === "not_offered")) {
    return unavailable(snapshot, treatmentKeys, "treatment_not_offered");
  }
  if (inventoryChecks.some((result) => result.status === "unknown")) {
    return unavailable(snapshot, treatmentKeys, "treatment_unconfirmed");
  }
  // Product policy: the current effective, clinic-approved offer is the quote
  // customers receive for every price wording, including original/regular price.
  // `kind` remains in the contract for observability and future catalog support,
  // but it must not hide an otherwise valid current offer.

  const campaignsById = new Map<string, PriceCatalogEntry>();
  for (const campaign of snapshot.pricingCampaigns) {
    // Runtime overlays are supplied before the seed baseline. Preserve the
    // first record so an older seed row cannot revive or overwrite it.
    if (!campaignsById.has(campaign.id)) campaignsById.set(campaign.id, campaign);
  }
  const dedupedCampaigns = [...campaignsById.values()];
  const campaignContextIds = query.campaignContextText
    ? resolveExplicitCampaignContext(snapshot, query.campaignContextText)
    : undefined;
  const candidates = dedupedCampaigns
    .filter((campaign) => campaignContextIds === undefined || campaignContextIds.includes(campaign.id))
    .map((campaign, index) => ({
      applicability: applicabilityState(snapshot, campaign, query.applicability),
      campaign,
      index,
      score: campaignScore(snapshot, campaign, treatmentKeys, query.campaignId),
      state: campaignState(
        campaign,
        snapshot.asOf,
        snapshot.clinic.humanSupportHours.timezone,
      ),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const current = candidates.filter((candidate) => candidate.state === "current");
  if (current.length === 0) {
    const reasonByState: Record<Exclude<CampaignState, "current">, UnavailablePriceFact["reason"]> = {
      expired: "expired",
      future: "not_yet_effective",
      stale: "stale",
      unreviewed: "unreviewed",
    };
    const first = candidates[0];
    return unavailable(
      snapshot,
      treatmentKeys,
      first ? reasonByState[first.state as Exclude<CampaignState, "current">] : "not_provided",
      first?.campaign.id,
    );
  }

  // A persisted card/action can carry the exact offer ID but omit a legacy
  // applicability field. The explicit identity still wins over generic
  // matching, so an old staff-only card cannot degrade into another reply.
  const explicitlyRequestedNonPublicCampaign = query.campaignId
    ? current.find((candidate) =>
      candidate.campaign.id === query.campaignId && !isCustomerVisiblePriceOffer(candidate.campaign))
    : undefined;
  if (explicitlyRequestedNonPublicCampaign) {
    return unavailable(
      snapshot,
      treatmentKeys,
      "not_customer_visible",
      explicitlyRequestedNonPublicCampaign.campaign.id,
    );
  }

  const publiclyQuotableCurrent = current.filter((candidate) =>
    isCustomerVisiblePriceOffer(candidate.campaign));
  const matchingCandidates = (candidates: typeof current) => {
    let matches = candidates.filter((candidate) => candidate.applicability === "match");
    if (matches.length === 0) {
      // A generic price question may quote one fully self-identifying approved
      // offer (for example brand + dose + amount in the reviewed customer copy).
      // Explicitly mismatched brand/spec queries never enter this path.
      matches = candidates.filter((candidate) =>
        candidate.applicability === "required" &&
        customerTextSelfIdentifiesApplicability(candidate.campaign, query.applicability));
    }
    return matches;
  };
  // Unapproved/unsafe customer copy is not an eligible public promotion and
  // cannot suppress a valid standing offer. Keep the old failure reason when
  // no usable copy exists at all, rather than exposing the unreviewed text.
  const approvedCopyCandidates = publiclyQuotableCurrent.filter((candidate) =>
    customerPriceText(candidate.campaign).status === "ok");
  if (!query.campaignId && !query.applicability?.branch?.trim()) {
    // Missing branch cannot silently select all-branch standing when an
    // otherwise eligible exact-item promotion may change the answer there.
    const branchDependentPromotion = approvedCopyCandidates.find((candidate) => {
      if (isStandingPrice(candidate.campaign) || candidate.applicability !== "branch_required") return false;
      const itemMatch = applicabilityState(snapshot, candidate.campaign, query.applicability, false);
      return itemMatch === "match" || (itemMatch === "required" &&
        customerTextSelfIdentifiesApplicability(candidate.campaign, query.applicability));
    });
    if (branchDependentPromotion) return unavailable(snapshot, treatmentKeys, "branch_required", branchDependentPromotion.campaign.id);
  }
  let applicable = matchingCandidates(approvedCopyCandidates);
  if (applicable.length === 0) applicable = matchingCandidates(publiclyQuotableCurrent);
  if (applicable.length === 0) {
    const unpublishedMatch = matchingCandidates(current).find((candidate) =>
      !isCustomerVisiblePriceOffer(candidate.campaign));
    if (unpublishedMatch) {
      return unavailable(snapshot, treatmentKeys, "not_customer_visible", unpublishedMatch.campaign.id);
    }
    const first = publiclyQuotableCurrent[0];
    if (publiclyQuotableCurrent.some((candidate) => candidate.applicability === "branch_required")) {
      return unavailable(snapshot, treatmentKeys, "branch_required", first?.campaign.id);
    }
    if (publiclyQuotableCurrent.some((candidate) => candidate.applicability === "required")) {
      return unavailable(snapshot, treatmentKeys, "applicability_required", first?.campaign.id);
    }
    return unavailable(snapshot, treatmentKeys, "applicability_mismatch", first?.campaign.id);
  }

  if (!query.campaignId) {
    // Group by exact treatment + dose/package/session/variant, not family or
    // amount. A promotion may replace standing only inside its own subject.
    const subjectGroups = new Set(applicable.map(({ campaign }) => exactPriceItemKey(snapshot, campaign)));
    if (subjectGroups.size > 1) return unavailable(snapshot, treatmentKeys, "ambiguous");
    const promotions = applicable.filter(({ campaign }) => !isStandingPrice(campaign));
    if (promotions.length > 0) applicable = promotions;
  }
  const priorityOwned = query.campaignId
    ? applicable.map((candidate) => candidate.campaign)
    : highestQuotePriorityCampaigns(applicable.map((candidate) => candidate.campaign));
  const priorityIds = new Set(priorityOwned.map((campaign) => campaign.id));
  const prioritized = applicable.filter((candidate) => priorityIds.has(candidate.campaign.id));
  const topScore = Math.max(...prioritized.map((candidate) => candidate.score));
  const top = prioritized.filter((candidate) => candidate.score === topScore);
  if (new Set(top.map(({ campaign }) => campaign.id)).size > 1) {
    // Amount/copy equivalence is not offer identity. Priority has already had
    // its chance to choose one; the customer must not resolve a config conflict.
    return { ...unavailable(snapshot, treatmentKeys, "ambiguous"), configurationIssue: "PRICE_CONFIG_CONFLICT" };
  }
  const customerTexts = top.map(({ campaign }) => customerPriceText(campaign));
  const blockedCustomerText = customerTexts.find((result) => result.status === "blocked");
  if (blockedCustomerText?.status === "blocked") {
    return unavailable(
      snapshot,
      treatmentKeys,
      blockedCustomerText.reason,
      top[0]?.campaign.id,
    );
  }
  const distinctAnswers = new Set(top.map(({ campaign }, index) =>
    `${customerTexts[index].status === "ok" ? customerTexts[index].text : ""}|${customerBranchScope(campaign.branch_scope) ?? ""}`));
  if (distinctAnswers.size > 1) {
    return unavailable(snapshot, treatmentKeys, "ambiguous");
  }

  const campaign = top[0].campaign;
  const resolvedCustomerText = customerPriceText(campaign);
  if (resolvedCustomerText.status === "blocked") {
    return unavailable(snapshot, treatmentKeys, resolvedCustomerText.reason, campaign.id);
  }
  const approvedCustomerPriceText = resolvedCustomerText.text;
  const branchScope = customerBranchScope(campaign.branch_scope);
  const resolvedTreatmentKeys = campaignTreatmentKeys(snapshot, campaign);
  const treatmentAvailabilityFact = inventoryChecks.length === 1 &&
      inventoryChecks[0]?.status === "offered" &&
      inventoryChecks[0].branchAvailability.scope === "selected"
    ? `${inventoryChecks[0].name}目前僅${inventoryChecks[0].branchAvailability.branchNames.join("、")}提供。`
    : "";
  return {
    applicability: {
      ...recordApplicability(campaign),
      ...(query.applicability?.branch?.trim()
        ? { branch: query.applicability.branch.trim() }
        : {}),
    },
    branchScope,
    campaignId: campaign.id,
    customerAssetUrls: customerAssetUrls(campaign),
    // Legacy campaign_name is an internal lifecycle label and may contain
    // dates. A future content model may add a separately reviewed customer
    // label; until then it is intentionally never exposed.
    campaignLabel: null,
    customerFacts: unique([
      `核准價格：${approvedCustomerPriceText}`,
      treatmentAvailabilityFact || branchScope || "",
    ]),
    customerPriceText: approvedCustomerPriceText,
    provenance: provenance(snapshot, campaign.id),
    status: "approved_current",
    treatmentKeys: resolvedTreatmentKeys.length > 0 ? resolvedTreatmentKeys : treatmentKeys,
  };
}
