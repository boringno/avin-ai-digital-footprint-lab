import { resetClaudeReplyInvocationCount } from "../src/lib/claude-client";
import {
  createEmptyConversationState,
  loadConversationState,
  markHumanTakeover,
  recordHandoffPending,
  resumeConversationAi,
  saveConversationState,
} from "../src/lib/conversation-state";
import { processWebhookRequestBody } from "../src/lib/line-webhook";

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

  const case2UserId = "guard-case-2";
  await saveConversationState(buildHumanActiveState(case2UserId));
  resetClaudeReplyInvocationCount();
  const case2 = await sendUserMessage(case2UserId, "那我明天可以嗎", "guard-case-2-evt");

  const case3UserId = "guard-case-3";
  const case3State = markHumanTakeover(createEmptyConversationState(case3UserId), {
    assignedTo: "Amy",
  });
  await saveConversationState(case3State);

  const case4UserId = "guard-case-4";
  const case4InitialState = recordHandoffPending(
    createEmptyConversationState(case4UserId),
    "post_treatment_abnormal",
  );
  await saveConversationState(case4InitialState);
  const case4Second = await sendUserMessage(case4UserId, "我想約高雄館", "guard-case-4-evt-2");

  const case5UserId = "guard-case-5";
  await saveConversationState(buildHumanActiveState(case5UserId));
  const case5BeforeResume = await loadConversationState(case5UserId);
  const case5ControlState = resumeConversationAi(case5BeforeResume);
  await saveConversationState(case5ControlState);
  const case5 = await sendUserMessage(case5UserId, "Onda 是什麼", "guard-case-5-evt");

  const case6UserId = "guard-case-6";
  await saveConversationState(buildHumanActiveState(case6UserId));
  resetClaudeReplyInvocationCount();
  const case6 = await sendUserMessage(case6UserId, "請幫我寫一段測試訊息", "guard-case-6-evt");

  const finalCase2State = await loadConversationState(case2UserId);
  const finalCase6State = await loadConversationState(case6UserId);

  console.log(
    JSON.stringify(
      {
        case1: {
          decisionType: case1.results[0]?.decision.decisionType,
          ok: Boolean(case1.results[0]?.replyPayload),
        },
        case2: {
          conversationStatus: case2.results[0]?.conversationStatus,
          hasNewCustomerMessage: finalCase2State.hasNewCustomerMessage,
          ok: case2.results[0]?.replyPayload === null,
        },
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
        case6: {
          claudeReplyInvocationCount: case6.claudeReplyInvocationCount,
          conversationStatus: case6.results[0]?.conversationStatus,
          hasNewCustomerMessage: finalCase6State.hasNewCustomerMessage,
          replyPayload: case6.results[0]?.replyPayload,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
