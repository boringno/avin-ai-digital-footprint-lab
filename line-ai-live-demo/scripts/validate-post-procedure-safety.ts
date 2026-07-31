import { refreshExistingHandoffTask, type HandoffTaskUpdateClient } from "../src/lib/admin-webhook-sync";
import {
  createEmptyConversationState,
  markHumanTakeover,
  recordHandoffPending,
  shouldBlockAiReply,
} from "../src/lib/conversation-state";
import {
  getRepeatedHandoffAcknowledgement,
  isHighRiskHandoffReason,
  shouldSuppressHandoffReply,
} from "../src/lib/line-webhook";
import { routeCustomerMessage } from "../src/lib/router";

const NOW = new Date("2026-07-31T04:00:00.000Z");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function route(message: string) {
  return routeCustomerMessage({
    includePending: false,
    message,
    now: NOW,
  });
}

async function assertDecision(caseId: string, message: string, expectedDecisionType: string, expectedMatchedKey: string) {
  const decision = await route(message);
  assert(
    decision.decisionType === expectedDecisionType && decision.matchedKey === expectedMatchedKey,
    `${caseId}: expected ${expectedDecisionType}/${expectedMatchedKey}, got ${decision.decisionType}/${decision.matchedKey}`,
  );
  return decision;
}

async function main() {
  // P1-P5: a treatment context plus an abnormal physical state is a safety handoff.
  await assertDecision("P1", "我打完很腫", "handoff_pending", "post_procedure_issue");
  await assertDecision("P2", "我昨天打完肉毒，今天臉歪歪的", "handoff_pending", "post_procedure_issue");
  await assertDecision("P3", "打完玻尿酸有點瘀青正常嗎", "handoff_pending", "post_procedure_issue");
  await assertDecision("P4", "我做完手術傷口有血", "handoff_pending", "post_procedure_issue");
  await assertDecision("P5", "電波做完臉刺刺的", "handoff_pending", "post_procedure_issue");

  // P6-P7: procedure context alone remains a normal information request.
  const p6 = await route("打完肉毒多久看得到效果");
  assert(p6.decisionType !== "handoff_pending", `P6: procedure effect question must not hand off, got ${p6.matchedKey}`);
  const p7 = await route("做完雷射可以化妝嗎");
  assert(p7.decisionType !== "handoff_pending", `P7: post-laser makeup question must not hand off, got ${p7.matchedKey}`);

  // P8: a second high-risk message is never silently suppressed.
  const p8First = await route("我打完很腫");
  const p8State = recordHandoffPending(createEmptyConversationState("p8"), p8First.matchedKey, NOW.toISOString());
  const p8Second = await route("越來越痛怎麼辦");
  assert(p8Second.replyText.trim().length > 0, "P8: repeated postoperative risk must have a normal non-empty reply");
  assert(
    isHighRiskHandoffReason(p8First.matchedKey) &&
      !shouldSuppressHandoffReply(p8State, p8First.matchedKey),
    "P8: a repeated postoperative handoff must bypass suppression",
  );

  // P9: a repeated non-high-risk handoff gets an acknowledgement instead of silence.
  const p9First = await assertDecision("P9-first", "我要找真人客服", "handoff_pending", "human_request");
  const p9State = recordHandoffPending(createEmptyConversationState("p9"), p9First.matchedKey, NOW.toISOString());
  const p9Second = await route("我要找真人客服");
  assert(shouldSuppressHandoffReply(p9State, p9Second.matchedKey), "P9: sequence setup must be suppressible");
  assert(!isHighRiskHandoffReason(p9Second.matchedKey), "P9: human request must remain non-high-risk");
  assert(getRepeatedHandoffAcknowledgement().trim().length > 0, "P9: repeated handoff acknowledgement must not be blank");

  // P10: an existing open/taken task is refreshed through the same client call
  // used by the webhook sync, without a schema change or a database connection.
  const updates: Array<{ id: string; patch: { updated_at: string } }> = [];
  const fakeSupabase: HandoffTaskUpdateClient = {
    from: () => ({
      update: (patch) => ({
        eq: async (_column, id) => {
          updates.push({ id, patch });
          return { error: null };
        },
      }),
    }),
  };
  await refreshExistingHandoffTask(fakeSupabase, "existing-open-task", NOW.toISOString());
  assert(updates.length === 1 && updates[0].id === "existing-open-task", "P10: existing task update was not recorded");

  // P11: pregnancy guidance keeps priority over a booking conversation.
  await assertDecision("P11", "我懷孕了想預約肉毒", "medical_guidance_reply", "pregnancy_caution");

  // P12: staff-controlled conversations still generate no AI reply.
  const p12State = markHumanTakeover(createEmptyConversationState("p12"), { sentAt: NOW.toISOString() });
  assert(p12State.status === "human_active" && shouldBlockAiReply(p12State.status), "P12: human_active must block AI replies");

  console.log("P1-P12 passed: postoperative safety, repeated handoff acknowledgement, task refresh, and human controls.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
