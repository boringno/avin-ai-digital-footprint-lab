import type {
  ApprovedPriceQuoteContract,
  ApprovedPriceReplyContract,
} from "@/lib/reply-plan";

const UNSAFE_PRICE_COPY_PATTERN = /(?:https?:\/\/|www\.|(?:20\d{2}[年/.\-])?\d{1,2}[月/.\-]\d{1,2}(?:日)?|保證|一定有效|永久|零風險|完全無副作用)/iu;
const UNSAFE_SUPPORT_COPY_PATTERN = /(?:https?:\/\/|www\.|保證|一定有效|永久|零風險|完全無副作用)/iu;

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validCustomerCopy(value: string | null | undefined, maxLength = 240) {
  const copy = normalized(value);
  return Boolean(copy && copy.length <= maxLength && !UNSAFE_PRICE_COPY_PATTERN.test(copy));
}

function validHumanSupportCopy(value: string | null | undefined) {
  const copy = normalized(value);
  return Boolean(copy && copy.length <= 240 && !UNSAFE_SUPPORT_COPY_PATTERN.test(copy));
}

function validQuote(
  quote: ApprovedPriceQuoteContract,
  contractSnapshotId: string,
) {
  if (!quote || typeof quote !== "object" || !Array.isArray(quote.treatmentKeys)) return false;
  const subjectLabel = normalized(quote.subjectLabel);
  const customerPriceText = normalized(quote.customerPriceText);
  const branchScope = normalized(quote.branchScope);
  return Boolean(
    (quote.role === "primary" || quote.role === "alternative") &&
    normalized(quote.campaignId) &&
    normalized(quote.snapshotId) === contractSnapshotId &&
    validCustomerCopy(subjectLabel, 80) &&
    validCustomerCopy(customerPriceText, 120) &&
    quote.treatmentKeys.length > 0 &&
    quote.treatmentKeys.every((key) => normalized(key)) &&
    (!branchScope || validCustomerCopy(branchScope, 120)),
  );
}

function quoteBelongsToPlan(
  quote: ApprovedPriceQuoteContract,
  planTreatmentKeys: readonly string[],
) {
  return planTreatmentKeys.length > 0 &&
    planTreatmentKeys.every((key) => quote.treatmentKeys.includes(key));
}

/**
 * Canonical customer reply for a snapshot-pinned approved price contract.
 * No arbitrary fallback text or model output participates in this path.
 */
export function renderApprovedPriceReplyContract(
  contract: ApprovedPriceReplyContract,
  planTreatmentKeys: readonly string[],
) {
  if (!contract || typeof contract !== "object" || !Array.isArray(contract.quotes)) return null;
  const snapshotId = normalized(contract.snapshotId);
  if (!snapshotId || contract.quotes.length < 1 || contract.quotes.length > 2) return null;
  if (!contract.quotes.every((quote) => validQuote(quote, snapshotId))) return null;
  if (new Set(contract.quotes.map((quote) => quote.campaignId)).size !== contract.quotes.length) {
    return null;
  }

  const primary = contract.quotes.find((quote) => quote.role === "primary");
  const alternative = contract.quotes.find((quote) => quote.role === "alternative");
  const unresolvedPrimary = contract.unresolvedPrimary;
  const concernLabel = normalized(contract.concernCta?.concernLabel);
  if (
    contract.quotes.filter((quote) => quote.role === "primary").length > 1 ||
    contract.quotes.filter((quote) => quote.role === "alternative").length > 1 ||
    (primary && !quoteBelongsToPlan(primary, planTreatmentKeys)) ||
    (!primary && alternative && !quoteBelongsToPlan(alternative, planTreatmentKeys)) ||
    (primary && unresolvedPrimary) ||
    (!primary && alternative && !unresolvedPrimary) ||
    (unresolvedPrimary && (
      !validCustomerCopy(unresolvedPrimary.requestedSubjectLabel, 100) ||
      !validHumanSupportCopy(unresolvedPrimary.humanSupportHoursSummary)
    )) ||
    (contract.concernCta && !validCustomerCopy(concernLabel, 80))
  ) return null;

  const lines: string[] = [];
  if (!primary && alternative && unresolvedPrimary) {
    lines.push(`ℹ️ 您詢問的${normalized(unresolvedPrimary.requestedSubjectLabel)}價格需要由真人客服確認。`);
  }
  if (primary) {
    lines.push(`🟢 ${normalized(primary.subjectLabel)}目前可參考：${normalized(primary.customerPriceText)}。`);
    if (normalized(primary.branchScope)) lines.push(`${normalized(primary.branchScope)}。`);
  }
  if (alternative) {
    lines.push(
      `${primary ? "💎 另有" : "💰 目前另有"}${normalized(alternative.subjectLabel)}方案可參考：${normalized(alternative.customerPriceText)}。`,
    );
    if (normalized(alternative.branchScope)) lines.push(`${normalized(alternative.branchScope)}。`);
  }
  if (!primary && unresolvedPrimary) {
    lines.push(`📅 可以先安排免費諮詢；${normalized(unresolvedPrimary.humanSupportHoursSummary)}`);
  }
  if (concernLabel) {
    lines.push(`😊 您提到在意${concernLabel}；想比較方案差異或安排免費諮詢，我都可以接著協助。`);
  } else if (primary) {
    lines.push("😊 想比較方案差異或安排免費諮詢，我都可以接著協助。");
  }
  return lines.join("\n");
}
