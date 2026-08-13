export type TreatmentConversationBehavior =
  | "combination_comparison"
  | "combination_declined"
  | "single_treatment_preference";

export type BookingTreatmentAction = "add" | "replace" | "use_current";

export type TreatmentBehaviorContext = {
  awaitingCombinationDetail?: boolean;
  hasApprovedCombinationPair?: boolean;
  mentionedTreatmentCount?: number;
};

function normalizeBehaviorText(message: string) {
  return message
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s，。！？、,.!?]/gu, "");
}

export function parseTreatmentConversationBehavior(
  message: string,
  context: TreatmentBehaviorContext = {},
): TreatmentConversationBehavior | null {
  const text = normalizeBehaviorText(message);
  const mentionsCombination = /(?:搭配|一起|組合|合併|同時|同次|搭(?:肉毒|botox|療程|著做|著打)|配(?:肉毒|botox|療程)|(?:跟|和|與|及).{0,14}(?:可以|能|適合)?(?:一起|同時|同次|搭配|做|打))/u.test(text);
  const asksDifference = /(?:差在哪|差別|差異|不同|區別|為什麼|原因|必要|需要|一定要)/u.test(text);
  const asksExplicitDifference = /(?:差在哪|差別|差異|不同|區別)/u.test(text);
  const prefersSingle = /(?:只|單獨)(?:想|要|考慮)?(?:先)?(?:做|打|選|用)|(?:先)(?:做|打|選|用)|單做/u.test(text);
  const declinesCombination = /(?:不想|不要|不用|不需要|先不|不考慮).{0,12}(?:搭配|一起|組合|肉毒)|(?:不搭配|不加).{0,12}(?:肉毒|其他療程)?/u.test(text);

  if (declinesCombination) {
    return "combination_declined";
  }
  if (
    (mentionsCombination && context.hasApprovedCombinationPair !== false &&
      (asksDifference || (context.mentionedTreatmentCount ?? 0) >= 2)) ||
    (context.awaitingCombinationDetail && asksDifference) ||
    (context.hasApprovedCombinationPair && asksExplicitDifference) ||
    /(?:單做).{0,12}(?:差|不同|可以|行嗎|好嗎)/u.test(text)
  ) {
    return "combination_comparison";
  }
  if (prefersSingle) {
    return "single_treatment_preference";
  }

  return null;
}

export function parseBookingTreatmentAction(message: string): BookingTreatmentAction {
  const text = normalizeBehaviorText(message);
  if (/(?:還|也)(?:想|要).{0,6}(?:打|做|預約)|(?:加做|加打|一起做|一起預約|另外加)/u.test(text)) {
    return "add";
  }

  return /(?:預約|想約|安排.{0,12}(?:療程|諮詢)|想約諮詢)/u.test(text)
    ? "replace"
    : "use_current";
}
