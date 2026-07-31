import { buildBookingLeadNotes, buildHandoffReason } from "../src/lib/admin-webhook-sync";
import { createEmptyConversationContext } from "../src/lib/conversation-context";
import { routeCustomerMessage } from "../src/lib/router";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

async function route(message: string, context = createEmptyConversationContext("pregnancy-risk-test")) {
  return routeCustomerMessage({ conversationContext: context, includePending: false, message, now: new Date("2026-07-31T04:00:00.000Z") });
}

async function main() {
  const first = await route("我懷孕了想預約肉毒");
  assert(first.matchedKey === "pregnancy_caution" && first.nextContext.pregnancyRiskFlag, "G1: pregnancy must set a persistent risk flag");
  const second = await route("那我想約高雄館下週三", first.nextContext);
  assert(second.nextContext.pregnancyRiskFlag, "G2: flag must survive booking follow-up");
  const third = await route("我叫王小美 0912345678 初診", second.nextContext);
  assert(third.nextContext.pregnancyRiskFlag, "G3: flag must survive intake details");
  const riskResult = { bookingDraft: { pregnancyRiskFlag: true }, decision: { matchedKey: "booking_intake" } } as never;
  assert(buildHandoffReason(riskResult).endsWith(":pregnancy_risk"), "G6: handoff reason must expose pregnancy risk");
  assert(buildBookingLeadNotes("", true).includes("孕期／哺乳／備孕風險"), "G3: lead notes must expose pregnancy risk");
  const ordinary = await route("我想預約肉毒");
  assert(!ordinary.nextContext.pregnancyRiskFlag && !buildBookingLeadNotes("", false).includes("孕期"), "G5: ordinary booking must not be risk-tagged");
  for (const message of ["我在哺乳想預約", "我在備孕想預約"]) {
    const decision = await route(message);
    assert(decision.nextContext.pregnancyRiskFlag, `G4: ${message} must set risk flag`);
  }
  console.log("Pregnancy risk handoff validation passed: G1-G6");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
