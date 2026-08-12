import {
  parseBookingTreatmentAction,
  parseTreatmentConversationBehavior,
} from "../src/lib/conversation-behavior";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const treatmentBehaviorCases = [
  ["我只想做 ONDA", "single_treatment_preference"],
  ["我單獨做 ONDA 就好", "single_treatment_preference"],
  ["可以先做 ONDA 嗎", "single_treatment_preference"],
  ["我不要搭肉毒", "combination_declined"],
  ["暫時不考慮一起做", "combination_declined"],
  ["ONDA 為什麼要搭配肉毒", "combination_comparison"],
  ["為什麼要搭肉毒", "combination_comparison"],
  ["單做跟搭配差在哪", "combination_comparison"],
  ["一起做有什麼不同", "combination_comparison"],
] as const;

for (const [message, expected] of treatmentBehaviorCases) {
  assert(
    parseTreatmentConversationBehavior(message) === expected,
    `CB1: ${message} must classify as ${expected}`,
  );
}

for (const message of ["ONDA 是什麼", "我想預約肉毒", "怎麼搭捷運", "高雄館在哪"] as const) {
  assert(parseTreatmentConversationBehavior(message) === null, `CB2: ${message} must not become a treatment behavior`);
}

const bookingCases = [
  ["我想預約肉毒", "replace"],
  ["幫我安排 ONDA 諮詢", "replace"],
  ["我也想加做肉毒", "add"],
  ["原本 ONDA 再一起預約肉毒", "add"],
  ["高雄館", "use_current"],
] as const;

for (const [message, expected] of bookingCases) {
  assert(parseBookingTreatmentAction(message) === expected, `CB3: ${message} must classify as ${expected}`);
}

console.log(`conversation behavior validation passed (${treatmentBehaviorCases.length + 4 + bookingCases.length} cases)`);
