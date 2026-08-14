import { resetClaudeReplyInvocationCount } from "../src/lib/claude-client";
import {
  applyAuthoritativeConversationTransition,
  closeConversation,
  createEmptyConversationState,
  loadConversationState,
  markCustomerMessageReceived,
  markHumanTakeover,
  pauseConversationAi,
  recordHandoffPending,
  resumeConversationAi,
  saveConversationState,
  type ConversationStatus,
} from "../src/lib/conversation-state";
import {
  RENDERER_FALLBACK_EXHAUSTED_REASON,
  getRepeatedHandoffAcknowledgement,
  processWebhookRequestBody,
  recoverLegacyRendererFallbackHandoff,
} from "../src/lib/line-webhook";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function sendUserMessage(
  userId: string,
  text: string,
  webhookEventId: string,
  beforeFinalStateCheck?: (sourceUserId: string) => Promise<void>,
) {
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

  return processWebhookRequestBody(rawBody, { beforeFinalStateCheck, includePending: false });
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
  const historicalTakeover = markHumanTakeover(createEmptyConversationState("guard-case-3-history"), {
    sentAt: "2020-01-01T00:00:00.000Z",
  });
  assert(
    new Date(historicalTakeover.aiResumeAt ?? 0).getTime() > Date.now(),
    "G3: an old client sent_at must not make a fresh staff takeover auto-resume immediately",
  );

  const case4UserId = "guard-case-4";
  const case4InitialState = recordHandoffPending(
    createEmptyConversationState(case4UserId),
    "human_request",
  );
  await saveConversationState(case4InitialState);
  resetClaudeReplyInvocationCount();
  const case4Second = await sendUserMessage(case4UserId, "我想約高雄館", "guard-case-4-evt-2");
  assert(case4Second.results[0]?.conversationStatus === "handoff_pending", "G4: pending task must remain visible to staff until takeover");
  assert(Boolean(case4Second.results[0]?.replyPayload), "G4: pending task must not prevent the AI from answering a new question");
  assert(case4Second.results[0]?.decision.decisionType === "booking_intake_reply", "G4: a new booking question must route normally while handoff is pending");
  assert(case4Second.results[0]?.decision.replyText !== getRepeatedHandoffAcknowledgement(), "G4: a new question must not be replaced by the repeated-handoff acknowledgement");
  assert((await loadConversationState(case4UserId)).hasNewCustomerMessage, "G4: staff must see that a pending customer added a new message");

  const case5UserId = "guard-case-5";
  await saveConversationState(buildHumanActiveState(case5UserId));
  const case5BeforeResume = await loadConversationState(case5UserId);
  const case5ControlState = resumeConversationAi(case5BeforeResume);
  await saveConversationState(case5ControlState);
  const case5 = await sendUserMessage(case5UserId, "Onda 是什麼", "guard-case-5-evt");
  assert(case5ControlState.status === "ai_active", "G5: resume control must restore ai_active");
  assert(Boolean(case5.results[0]?.replyPayload), "G5: resumed conversation must reply again");

  const case6 = recoverLegacyRendererFallbackHandoff(
    recordHandoffPending(
      createEmptyConversationState("guard-case-6"),
      RENDERER_FALLBACK_EXHAUSTED_REASON,
    ),
    "2026-08-13T12:00:00.000Z",
  );
  assert(case6.status === "ai_active", "G6: legacy renderer exhaustion must recover to ai_active");
  assert(case6.handoffReason === null && case6.lastHandoffPromptAt === null, "G6: recovery must clear stale handoff metadata");

  const explicitHandoff = recordHandoffPending(createEmptyConversationState("guard-case-6-control"), "human_request");
  assert(recoverLegacyRendererFallbackHandoff(explicitHandoff) === explicitHandoff, "G6: explicit human handoff must never auto-resume");

  const case7UserId = "guard-case-7";
  await saveConversationState(recordHandoffPending(
    createEmptyConversationState(case7UserId),
    "human_request",
  ));
  resetClaudeReplyInvocationCount();
  const case7 = await sendUserMessage(case7UserId, "我做完後呼吸困難", "guard-case-7-evt");
  assert(case7.results[0]?.conversationStatus === "handoff_pending", "G7: emergency during pending handoff must stay pending");
  assert(case7.results[0]?.decision.matchedKey === "post_procedure_emergency", "G7: deterministic emergency routing must take priority over repeated-handoff acknowledgement");
  assert(case7.results[0]?.decision.replyText !== getRepeatedHandoffAcknowledgement(), "G7: emergency reply must not be replaced by the ordinary pending acknowledgement");
  assert(Boolean(case7.results[0]?.replyPayload), "G7: emergency during pending handoff must remain customer-visible");
  assert(case7.results[0]?.usedAiReplyGenerator === false && case7.claudeReplyInvocationCount === 0, "G7: emergency during pending handoff must remain deterministic");

  const case8UserId = "guard-case-8";
  await saveConversationState(recordHandoffPending(
    createEmptyConversationState(case8UserId),
    "human_request",
  ));
  const case8 = await sendUserMessage(case8UserId, "我要找真人客服", "guard-case-8-evt");
  assert(case8.results[0]?.conversationStatus === "handoff_pending", "G8: repeated human request must keep the pending task");
  assert(case8.results[0]?.decision.decisionType === "conversation_state_blocked", "G8: the same pending handoff must not create duplicate work");
  assert(case8.results[0]?.decision.replyText === getRepeatedHandoffAcknowledgement(), "G8: repeated human request must receive the existing-task acknowledgement");

  const case9UserId = "guard-case-9";
  await saveConversationState(recordHandoffPending(
    createEmptyConversationState(case9UserId),
    "post_procedure_issue",
  ));
  resetClaudeReplyInvocationCount();
  const case9 = await sendUserMessage(case9UserId, "還是越來越痛怎麼辦", "guard-case-9-evt");
  assert(case9.results[0]?.conversationStatus === "handoff_pending", "G9: vague post-procedure continuation must remain pending");
  assert(case9.results[0]?.decision.matchedKey === "handoff_continuation:post_procedure_issue", "G9: unresolved pending continuation must not enter the general fallback");
  assert(case9.results[0]?.usedAiReplyGenerator === false && case9.claudeReplyInvocationCount === 0, "G9: unresolved pending continuation must not invoke an LLM");

  for (const [caseId, message, expectedKeyPattern] of [
    ["G10", "你們有幾家店", /^branch_list$/u],
    ["G11", "想了解 ONDA", /^(?:treatment_intro|treatment_consult):onda_pro(?::|$)/u],
  ] as const) {
    const userId = `guard-${caseId.toLowerCase()}`;
    await saveConversationState(recordHandoffPending(
      createEmptyConversationState(userId),
      "human_request",
    ));
    const result = await sendUserMessage(userId, message, `${userId}-evt`);
    assert(result.results[0]?.conversationStatus === "handoff_pending", `${caseId}: staff task must stay pending`);
    assert(expectedKeyPattern.test(result.results[0]?.decision.matchedKey ?? ""), `${caseId}: explicit new topic must route normally while pending; got ${result.results[0]?.decision.matchedKey}`);
    assert(result.results[0]?.decision.replyText !== getRepeatedHandoffAcknowledgement(), `${caseId}: explicit new topic must not receive the pending acknowledgement`);
  }

  const case12UserId = "guard-case-12";
  await saveConversationState(recordHandoffPending(
    createEmptyConversationState(case12UserId),
    "human_request",
  ));
  const case12 = await sendUserMessage(
    case12UserId,
    "想了解 ONDA",
    "guard-case-12-evt",
    async () => {
      const pendingState = await loadConversationState(case12UserId);
      await saveConversationState(markHumanTakeover(pendingState, {
        assignedTo: "Amy",
        // An equal event timestamp used to preserve the old CAS version and
        // let the stale webhook overwrite the staff takeover (ABA).
        sentAt: pendingState.updatedAt,
      }));
    },
  );
  assert(case12.results[0]?.conversationStatus === "human_active", "G12: staff takeover during rendering must win the lifecycle race");
  assert(case12.results[0]?.decision.decisionType === "conversation_state_blocked", "G12: generated AI reply must be cancelled after staff takeover");
  assert(case12.results[0]?.replyPayload === null, "G12: no LINE payload may be sent after staff takeover");
  assert((await loadConversationState(case12UserId)).status === "human_active", "G12: stale pending state must not overwrite human_active");

  const case13UserId = "guard-case-13";
  await saveConversationState(recordHandoffPending(
    createEmptyConversationState(case13UserId),
    "human_request",
  ));
  const case13 = await sendUserMessage(
    case13UserId,
    "想了解 ONDA",
    "guard-case-13-evt",
    async () => {
      const pendingState = await loadConversationState(case13UserId);
      await saveConversationState(resumeConversationAi(pendingState, "2099-08-13T12:34:56.000Z"));
    },
  );
  assert(case13.results[0]?.conversationStatus === "ai_active", "G13: staff resume during rendering must remain ai_active");
  assert(Boolean(case13.results[0]?.replyPayload), "G13: staff resume may keep the already generated customer reply");
  assert((await loadConversationState(case13UserId)).status === "ai_active", "G13: stale pending state must not overwrite staff resume");

  const case14UserId = "guard-case-14";
  await saveConversationState(recordHandoffPending(
    createEmptyConversationState(case14UserId),
    "human_request",
  ));
  resetClaudeReplyInvocationCount();
  const case14 = await sendUserMessage(case14UserId, "童顏針多久看得出來", "guard-case-14-evt");
  assert(case14.results[0]?.decision.matchedKey !== "handoff_continuation:human_request", "G14: a clear new question must not be mistaken for the pending handoff");
  assert(case14.results[0]?.decision.replyText !== getRepeatedHandoffAcknowledgement(), "G14: a clear new question must not receive the pending acknowledgement");
  assert(case14.claudeReplyInvocationCount > 0, "G14: an eligible new knowledge question may use the LLM while staff is pending");
  assert(case14.results[0]?.handoffReason === "human_request", "G14: the canonical handoff reason must survive an unrelated new route");

  const case15UserId = "guard-case-15";
  await saveConversationState(createEmptyConversationState(case15UserId));
  const case15 = await sendUserMessage(
    case15UserId,
    "我要找真人客服",
    "guard-case-15-evt",
    async () => {
      const concurrentState = await loadConversationState(case15UserId);
      await saveConversationState(markCustomerMessageReceived(
        concurrentState,
        new Date(Date.now() + 1_000).toISOString(),
      ));
    },
  );
  const case15Stored = await loadConversationState(case15UserId);
  assert(case15.results[0]?.conversationStatus === "handoff_pending", "G15: a concurrent ordinary webhook must not erase a new handoff transition");
  assert(case15Stored.status === "handoff_pending" && case15Stored.handoffReason === "human_request", "G15: the handoff transition must be persisted after CAS reconciliation");

  const case16UserId = "guard-case-16";
  await saveConversationState(recordHandoffPending(
    createEmptyConversationState(case16UserId),
    "post_procedure_emergency",
  ));
  const case16 = await sendUserMessage(case16UserId, "我要找真人客服", "guard-case-16-evt");
  assert(case16.results[0]?.handoffReason === "post_procedure_emergency", "G16: a lower-priority handoff must not downgrade an emergency reason");

  const case17UserId = "guard-case-17";
  await saveConversationState(createEmptyConversationState(case17UserId));
  await Promise.all([
    applyAuthoritativeConversationTransition(case17UserId, (state) => markHumanTakeover(state, { assignedTo: "Amy" })),
    applyAuthoritativeConversationTransition(case17UserId, (state) => pauseConversationAi(state)),
  ]);
  const case17Stored = await loadConversationState(case17UserId);
  assert(case17Stored.controlRevision === 2, "G17: concurrent staff controls must serialize into distinct control revisions");

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
