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
