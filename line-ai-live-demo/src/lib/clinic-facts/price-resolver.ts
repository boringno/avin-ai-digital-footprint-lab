import { normalizeClinicText } from "@/lib/clinic-config";
import { highestQuotePriorityCampaigns } from "@/lib/pricing-campaign-priority";

import type {
  ClinicFactProvenance,
  ClinicFactsSnapshot,
  PriceApplicabilityDimensions,
  PriceCatalogEntry,
  PriceFactResolution,
  PriceQuery,
  UnavailablePriceFact,
} from "./types";
import { resolveTreatmentFact } from "./treatment-resolver";

type CampaignState = "current" | "expired" | "future" | "stale" | "unreviewed";
type ApplicabilityState = "match" | "branch_required" | "required" | "mismatch";

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
      /(?:(?:19|20)\d{2}[/.年-]\d{1,2}(?:[/.月-]\d{1,2})?日?|\d{1,2}[/.月]\d{1,2}日?)(?:\s*(?:-|–|—|~|～|至)\s*(?:(?:19|20)\d{2}[/.年-])?\d{1,2}(?:[/.月-]\d{1,2})?日?)?/gu,
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
  if (!startsAt || !endsAt || !localDate) return "stale";
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
    const isAuthorizedOffer =
      campaign.id === requestedCampaignId &&
      approvedById &&
      requested.length > 0 &&
      requested.every((key) => campaignKeys.includes(key));
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
): ApplicabilityState {
  const scope = campaignBranches(snapshot, campaign.branch_scope);
  const requestedBranch = query?.branch?.trim();
  if (!scope.all) {
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

export function resolveApprovedPrice(
  snapshot: ClinicFactsSnapshot,
  query: PriceQuery,
): PriceFactResolution {
  const treatmentKeys = unique(query.treatmentKeys);
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
  const candidates = dedupedCampaigns
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

  let applicable = current.filter((candidate) => candidate.applicability === "match");
  if (applicable.length === 0) {
    // A generic price question may quote one fully self-identifying approved
    // offer (for example brand + dose + amount in the reviewed customer copy).
    // Explicitly mismatched brand/spec queries never enter this path.
    applicable = current.filter((candidate) =>
      candidate.applicability === "required" &&
      customerTextSelfIdentifiesApplicability(candidate.campaign, query.applicability));
  }
  if (applicable.length === 0) {
    const first = current[0];
    if (current.some((candidate) => candidate.applicability === "branch_required")) {
      return unavailable(snapshot, treatmentKeys, "branch_required", first?.campaign.id);
    }
    if (current.some((candidate) => candidate.applicability === "required")) {
      return unavailable(snapshot, treatmentKeys, "applicability_required", first?.campaign.id);
    }
    return unavailable(snapshot, treatmentKeys, "applicability_mismatch", first?.campaign.id);
  }

  const priorityOwned = query.campaignId
    ? applicable.map((candidate) => candidate.campaign)
    : highestQuotePriorityCampaigns(applicable.map((candidate) => candidate.campaign));
  const priorityIds = new Set(priorityOwned.map((campaign) => campaign.id));
  const prioritized = applicable.filter((candidate) => priorityIds.has(candidate.campaign.id));
  const topScore = Math.max(...prioritized.map((candidate) => candidate.score));
  const top = prioritized.filter((candidate) => candidate.score === topScore);
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
      branchScope ?? "",
    ]),
    customerPriceText: approvedCustomerPriceText,
    provenance: provenance(snapshot, campaign.id),
    status: "approved_current",
    treatmentKeys: resolvedTreatmentKeys.length > 0 ? resolvedTreatmentKeys : treatmentKeys,
  };
}
