import { resetClaudeReplyInvocationCount } from "../src/lib/claude-client";
import {
  closeConversation,
  createEmptyConversationState,
  loadConversationState,
  markHumanTakeover,
  pauseConversationAi,
  recordHandoffPending,
  resumeConversationAi,
  saveConversationState,
  type ConversationStatus,
} from "../src/lib/conversation-state";
import { processWebhookRequestBody } from "../src/lib/line-webhook";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function sendUserMessage(userId: string, text: string, webhookEventId: string) {
  const rawBody = JSON.stringify({
    events: [
      {
        message: { id: `${webhookEventId}-message`, text, type: "text" },
        replyToken: `${webhookEventId}-reply`,
        source: { type: "user", userId },
        type: "message",
        webhookEventId,
      },
    ],
  });

  return processWebhookRequestBody(rawBody, { includePending: false });
}

function buildHumanActiveState(userId: string) {
  return {
    ...createEmptyConversationState(userId),
    aiPausedAt: new Date().toISOString(),
    aiResumeAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    humanTakeoverAt: new Date().toISOString(),
    lastStaffMessageAt: new Date().toISOString(),
    status: "human_active" as const,
  };
}

async function main() {
  const case1UserId = "guard-case-1";
  await saveConversationState(createEmptyConversationState(case1UserId));
  const case1 = await sendUserMessage(case1UserId, "Onda 是什麼", "guard-case-1-evt");
  assert(Boolean(case1.results[0]?.replyPayload), "G1: ai_active conversation must still reply");

  const blockedStatuses: ConversationStatus[] = ["human_active", "ai_paused", "closed"];
  const blockedResults: Array<{ hasNewCustomerMessage: boolean; status: ConversationStatus }> = [];
  for (const status of blockedStatuses) {
    const userId = `guard-blocked-${status}`;
    const initialState = status === "human_active"
      ? buildHumanActiveState(userId)
      : status === "ai_paused"
        ? pauseConversationAi(createEmptyConversationState(userId))
        : closeConversation(createEmptyConversationState(userId));
    await saveConversationState(initialState);
    resetClaudeReplyInvocationCount();
    const result = await sendUserMessage(userId, "那我明天可以嗎", `guard-blocked-${status}-evt`);
    const eventResult = result.results[0];
    const finalState = await loadConversationState(userId);

    assert(result.results.length === 1, `G2-${status}: blocked message must still be recorded as one event`);
    assert(eventResult?.conversationStatus === status, `G2-${status}: blocked status must remain ${status}`);
    assert(eventResult?.decision.decisionType === "conversation_state_blocked", `G2-${status}: routing must stop at the conversation guard`);
    assert(eventResult?.decision.matchedKey === `guard:${status}`, `G2-${status}: matched key must identify the blocking status`);
    assert(eventResult?.replyPayload === null, `G2-${status}: blocked conversation must not create a LINE reply`);
    assert(eventResult?.usedAiHumanizer === false, `G2-${status}: blocked conversation must not call the humanizer`);
    assert(eventResult?.usedAiReplyGenerator === false, `G2-${status}: blocked conversation must not call the reply generator`);
    assert(result.claudeReplyInvocationCount === 0, `G2-${status}: blocked conversation must not invoke Claude`);
    assert(finalState.hasNewCustomerMessage, `G2-${status}: staff must still see the new customer message`);
    blockedResults.push({ hasNewCustomerMessage: finalState.hasNewCustomerMessage, status });
  }

  const case3UserId = "guard-case-3";
  const case3State = markHumanTakeover(createEmptyConversationState(case3UserId), {
    assignedTo: "Amy",
  });
  await saveConversationState(case3State);
  assert(case3State.status === "human_active", "G3: staff takeover must set human_active");

  const case4UserId = "guard-case-4";
  const case4InitialState = recordHandoffPending(
    createEmptyConversationState(case4UserId),
    "post_treatment_abnormal",
  );
  await saveConversationState(case4InitialState);
  const case4Second = await sendUserMessage(case4UserId, "我想約高雄館", "guard-case-4-evt-2");
  assert(case4Second.results[0]?.conversationStatus === "handoff_pending", "G4: pending handoff must remain pending while recording a follow-up");
  assert(Boolean(case4Second.results[0]?.replyPayload), "G4: handoff_pending alone must not silence the configured acknowledgement");

  const case5UserId = "guard-case-5";
  await saveConversationState(buildHumanActiveState(case5UserId));
  const case5BeforeResume = await loadConversationState(case5UserId);
  const case5ControlState = resumeConversationAi(case5BeforeResume);
  await saveConversationState(case5ControlState);
  const case5 = await sendUserMessage(case5UserId, "Onda 是什麼", "guard-case-5-evt");
  assert(case5ControlState.status === "ai_active", "G5: resume control must restore ai_active");
  assert(Boolean(case5.results[0]?.replyPayload), "G5: resumed conversation must reply again");

  console.log(
    JSON.stringify(
      {
        case1: {
          decisionType: case1.results[0]?.decision.decisionType,
          ok: Boolean(case1.results[0]?.replyPayload),
        },
        blockedStatuses: blockedResults,
        case3: {
          ok: case3State.status === "human_active",
          status: case3State.status,
        },
        case4: {
          initialStatus: case4InitialState.status,
          secondDecision: case4Second.results[0]?.decision.decisionType,
          secondReply: case4Second.results[0]?.replyPayload,
          secondStatus: case4Second.results[0]?.conversationStatus,
        },
        case5: {
          controlStatus: case5ControlState.status,
          replyAfterResume: Boolean(case5.results[0]?.replyPayload),
        },
      },
      null,
      2,
    ),
  );
  console.log("conversation guard validation passed (human_active, ai_paused, closed, pending, and resume)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
