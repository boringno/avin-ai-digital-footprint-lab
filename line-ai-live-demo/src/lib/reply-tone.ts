export type CustomerReplyTone = {
  decisionType: string;
  matchedKey: string;
};

const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;

function getReplyEmoji(tone: CustomerReplyTone) {
  const key = tone.matchedKey.toLowerCase();

  if (tone.decisionType === "handoff_pending" || key.includes("pregnancy") || key.includes("post_procedure")) {
    return "🧑‍⚕️";
  }
  if (tone.decisionType === "booking_intake_reply" || key.includes("booking_")) {
    return "📅";
  }
  if (tone.decisionType === "doctor_schedule_auto_reply" || key.includes("doctor_schedule")) {
    return "🗓️";
  }
  if (tone.decisionType === "pricing_auto_reply" || key.includes("price") || key.includes("promotion")) {
    return "✨";
  }
  if (tone.decisionType === "treatment_intro_reply" || key.includes("treatment_")) {
    return "🌿";
  }
  if (
    key.includes("branch") ||
    key.includes("address") ||
    key.includes("location") ||
    key.includes("transport") ||
    key.includes("business_hour")
  ) {
    return "📍";
  }
  if (key.includes("payment")) {
    return "💳";
  }
  if (key.includes("support") || key.includes("human")) {
    return "🧑‍💬";
  }

  return "😊";
}

export function addCustomerReplyTone(text: string, tone: CustomerReplyTone) {
  const trimmed = text.trim();
  if (!trimmed || EMOJI_PATTERN.test(trimmed)) {
    return trimmed;
  }

  return `${getReplyEmoji(tone)} ${trimmed}`;
}
