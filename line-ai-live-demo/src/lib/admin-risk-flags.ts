export const PREGNANCY_RISK_NOTE = "[孕期／哺乳／備孕風險：真人確認]";
export const PREGNANCY_RISK_REASON_SUFFIX = ":pregnancy_risk";

export function hasPregnancyRiskMarker(input: {
  handoffReason?: null | string;
  notes?: null | string;
}) {
  return Boolean(
    input.handoffReason?.includes(PREGNANCY_RISK_REASON_SUFFIX) ||
      input.notes?.includes(PREGNANCY_RISK_NOTE),
  );
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Current episode risk must not be inferred from a terminal historical booking note. */
export function hasCurrentPregnancyRiskMarker(input: {
  bookingStatus?: null | string;
  contextJson?: unknown;
  handoffReason?: null | string;
  notes?: null | string;
}) {
  if (input.handoffReason?.includes(PREGNANCY_RISK_REASON_SUFFIX)) return true;
  const context = asRecord(input.contextJson);
  const bookingDraft = asRecord(context?.bookingDraft);
  if (context?.pregnancyRiskFlag === true || bookingDraft?.pregnancyRiskFlag === true) return true;
  return ["new", "contacted"].includes(input.bookingStatus ?? "") &&
    Boolean(input.notes?.includes(PREGNANCY_RISK_NOTE));
}
