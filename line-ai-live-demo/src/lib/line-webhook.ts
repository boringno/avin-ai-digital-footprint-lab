import crypto from "node:crypto";

import { buildTextReplyMessages } from "@/lib/ai-fallback-guard";
import {
  classifyControlledIntent,
  isHighConfidenceControlledIntent,
  shouldUseControlledIntentClassifier,
} from "@/lib/ai-intent-classifier";
import { getClaudeReplyInvocationCount } from "@/lib/claude-client";
import { clinicConfig } from "@/lib/clinic-config";
import { appendRecentConversationTurns, createEmptyConversationContext, loadConversationContext, removeUnsentAssistantTurn, saveConversationContext, type ConversationContext, type RecentConversationTurn } from "@/lib/conversation-context";
import { commitDialogueRouteSelection, hydrateDialogueState } from "@/lib/dialogue-state";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { getHandoffPriority } from "@/lib/handoff-priority";
import { reportOperationalError } from "@/lib/monitoring";
import { resolveNluCanaryDecision } from "@/lib/nlu-decision-adapter";
import { requestNluFrame } from "@/lib/nlu-shadow";
import {
  applyAutoResumeIfDue,
  createEmptyConversationState,
  loadAuthoritativeConversationState,
  loadConversationState,
  markCustomerMessageReceived,
  recordHandoffPending,
  resumeConversationAi,
  saveConversationStateIfCurrent,
  shouldBlockAiReply,
  shouldSuppressRepeatedHandoff,
  type ConversationState,
} from "@/lib/conversation-state";
import { formatReplyMessages, formatReplyText } from "@/lib/reply-text-format";
import { legacyDecisionToReplyPlan, type ReplyPlan } from "@/lib/reply-plan";
import {
  renderReplyPlan,
  toReplyRendererTelemetry,
  type ReplyRendererTelemetry,
} from "@/lib/reply-renderer";
import { resolveDoctorScheduleDecision } from "@/lib/doctor-schedule";
import { routeCustomerMessage, shouldAllowAiFallbackReply, type RouterDecision } from "@/lib/router";
import type { LineReplyMessage, LineTextMessage } from "@/lib/treatment-carousel";
import { appendReplyDeadLetter } from "@/lib/webhook-dead-letter";

type WebhookProcessOptions = {
  beforeFinalStateCheck?: (sourceUserId: string) => Promise<void>;
  includePending: boolean;
};

type LineMessageEvent = {
  deliveryContext?: { isRedelivery?: boolean };
  message?: { id?: string; text?: string; type?: string };
  replyToken?: string;
  source?: { groupId?: string; roomId?: string; type?: string; userId?: string };
  type?: string;
  webhookEventId?: string;
};

type LineWebhookPayload = {
  events?: LineMessageEvent[];
};

type ConversationTurnIdentity = {
  messageId?: string;
  replyToken?: string;
  webhookEventId?: string;
};

function buildConversationTurnId(role: RecentConversationTurn["role"], identity: ConversationTurnIdentity) {
  const publicEventId = identity.messageId || identity.webhookEventId;
  const stableEventId = publicEventId || (identity.replyToken
    ? crypto.createHash("sha256").update(identity.replyToken).digest("hex").slice(0, 24)
    : "");
  return stableEventId ? `${role}:${stableEventId}` : undefined;
}

function createRecentConversationTurn(
  role: RecentConversationTurn["role"],
  text: string,
  identity: ConversationTurnIdentity,
): RecentConversationTurn {
  const turnId = buildConversationTurnId(role, identity);
  return {
    role,
    text,
    ...(turnId ? { turnId } : {}),
  };
}

function getEventTurnIdentity(event: LineMessageEvent): ConversationTurnIdentity {
  return {
    messageId: event.message?.id,
    replyToken: event.replyToken,
    webhookEventId: event.webhookEventId,
  };
}

type ClassifiedDecision = {
  aiModel?: string;
  aiSourceUrl?: string;
  aiTokensIn?: number;
  aiTokensOut?: number;
  conversationState: ConversationState;
  decisionType: string;
  matchedKey: string;
  matchedType: string;
  nextContext: ConversationContext;
  rendererTelemetry?: ReplyRendererTelemetry;
  replyMessages?: LineReplyMessage[];
  replyText: string;
  suppressAiFooter?: boolean;
  shouldIntroduce: boolean;
  usedAiHumanizer: boolean;
  usedAiReplyGenerator: boolean;
};

const HIGH_RISK_HANDOFF_REASONS = new Set(["post_procedure_emergency", "post_procedure_issue", "serious_complaint"]);
export const RENDERER_FALLBACK_EXHAUSTED_REASON = "renderer_fallback_exhausted";

export function isHighRiskHandoffReason(reason: string) {
  return HIGH_RISK_HANDOFF_REASONS.has(reason);
}

export function getRepeatedHandoffAcknowledgement() {
  return "我們已收到您補充的訊息，真人客服會一併確認並接續協助。";
}

export function shouldSuppressHandoffReply(conversationState: ConversationState, reason: string) {
  return shouldSuppressRepeatedHandoff(conversationState, reason) && !isHighRiskHandoffReason(reason);
}

const PENDING_MEDICAL_CONTINUATION_REASONS = new Set(["post_procedure_emergency", "post_procedure_issue"]);

export function shouldKeepPendingHandoffContext(input: {
  handoffReason: null | string;
  message: string;
  routedDecision: Pick<RouterDecision, "decisionType" | "matchedType">;
}) {
  if (
    input.routedDecision.decisionType !== "fallback_reply" ||
    input.routedDecision.matchedType !== "generic_fallback" ||
    !input.handoffReason ||
    !PENDING_MEDICAL_CONTINUATION_REASONS.has(input.handoffReason)
  ) {
    return false;
  }

  const normalizedMessage = input.message.replace(/\s+/gu, "");
  return /(?:還是|仍然|持續|一直|越來越|又|沒有改善).{0,16}(?:痛|疼|腫|出血|流血|呼吸|不舒服|發熱|發燒)|(?:痛|疼|腫|出血|流血|呼吸|不舒服|發熱|發燒).{0,16}(?:還是|仍然|持續|一直|越來越|又|沒有改善)/u.test(
    normalizedMessage,
  );
}

function nextLifecycleVersion(previousUpdatedAt: string, candidateUpdatedAt: string) {
  const previousMs = new Date(previousUpdatedAt).getTime();
  const candidateMs = new Date(candidateUpdatedAt).getTime();
  if (!Number.isFinite(previousMs)) {
    return candidateUpdatedAt;
  }
  if (Number.isFinite(candidateMs) && candidateMs > previousMs) {
    return candidateUpdatedAt;
  }
  return new Date(previousMs + 1).toISOString();
}

function mergeCustomerReceiptIntoLatestState(latestState: ConversationState, receivedAt: string) {
  const receivedState = markCustomerMessageReceived(latestState, receivedAt);
  return {
    ...receivedState,
    // Every successful compare-and-swap must advance the version, even if a
    // test clock or staff timestamp is ahead of the webhook server clock.
    updatedAt: nextLifecycleVersion(latestState.updatedAt, receivedAt),
  };
}

async function persistWebhookLifecycleState(input: {
  expectedControlRevision: number;
  expectedUpdatedAt: string;
  handoffTransitionReason?: string;
  proposedState: ConversationState;
  receivedAt: string;
}) {
  const proposedState = {
    ...input.proposedState,
    updatedAt: nextLifecycleVersion(input.expectedUpdatedAt, input.proposedState.updatedAt),
  };
  let candidateState: ConversationState = proposedState;
  let expectedUpdatedAt = input.expectedUpdatedAt;
  let expectedControlRevision = input.expectedControlRevision;

  try {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (await saveConversationStateIfCurrent(
        candidateState,
        expectedUpdatedAt,
        expectedControlRevision,
      )) {
        return candidateState;
      }

      const latestState = applyAutoResumeIfDue(
        await loadAuthoritativeConversationState(input.proposedState.userId),
        new Date(),
      );
      const controlChanged = latestState.controlRevision !== input.expectedControlRevision;
      let reconciledState: ConversationState = mergeCustomerReceiptIntoLatestState(latestState, input.receivedAt);

      // Reapply only a handoff created by this event. Existing pending state is
      // otherwise kept from latest, so an ordinary concurrent message cannot
      // clear it. Explicit staff ownership changes win; a newly observed
      // emergency may reopen a task only after staff has resumed AI.
      const canApplyHandoff = Boolean(input.handoffTransitionReason) &&
        !shouldBlockAiReply(latestState.status) &&
        (!controlChanged || (
          latestState.status === "ai_active" &&
          getHandoffPriority(input.handoffTransitionReason ?? null) >= 100
        ));
      if (canApplyHandoff && input.handoffTransitionReason) {
        reconciledState = recordHandoffPending(
          reconciledState,
          input.handoffTransitionReason,
          input.receivedAt,
        );
      }

      candidateState = {
        ...reconciledState,
        updatedAt: nextLifecycleVersion(latestState.updatedAt, reconciledState.updatedAt),
      };
      expectedUpdatedAt = latestState.updatedAt;
      expectedControlRevision = latestState.controlRevision;
    }

    await reportOperationalError({
      alert: false,
      error: new Error("Conversation lifecycle compare-and-swap exhausted"),
      extra: {
        handoff_reason: input.handoffTransitionReason ?? null,
        line_user_id: input.proposedState.userId,
      },
      source: "line_webhook_lifecycle_conflict",
    });
    return candidateState;
  } catch (error) {
    // Preserve the webhook's availability contract. A fresh ownership check is
    // still performed immediately before LINE send; this merely prevents a
    // transient state-store error from turning the whole webhook into HTTP 500.
    await reportOperationalError({
      alert: false,
      error,
      extra: {
        handoff_reason: input.handoffTransitionReason ?? null,
        line_user_id: input.proposedState.userId,
      },
      source: "line_webhook_lifecycle_persistence",
    });
    return candidateState;
  }
}

export function recoverLegacyRendererFallbackHandoff(
  conversationState: ConversationState,
  resumedAt = new Date().toISOString(),
) {
  return conversationState.status === "handoff_pending" &&
    conversationState.handoffReason === RENDERER_FALLBACK_EXHAUSTED_REASON
    ? resumeConversationAi(conversationState, resumedAt)
    : conversationState;
}

type ControlledScheduleDecision = Pick<
  RouterDecision,
  "decisionType" | "matchedKey" | "matchedType" | "replyMessages" | "replyText" | "suppressAiFooter"
>;

/** A classifier override invalidates every plan built for the superseded fallback. */
export function applyControlledScheduleDecision(
  routedDecision: RouterDecision,
  scheduleDecision: ControlledScheduleDecision,
): RouterDecision {
  return {
    ...routedDecision,
    ...scheduleDecision,
    nextContext: {
      ...routedDecision.nextContext,
      lastIntent: scheduleDecision.matchedKey,
    },
    replyPlan: undefined,
  };
}

export function shouldSuppressOuterAiFooter(generated: boolean, plan: Pick<ReplyPlan, "suppressAiFooter">) {
  return generated || plan.suppressAiFooter;
}

export class InvalidWebhookPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWebhookPayloadError";
  }
}

export type ProcessedWebhookResult = {
  aiModel?: string;
  aiSourceUrl?: string;
  aiTokensIn?: number;
  aiTokensOut?: number;
  bookingDraft: {
    branch?: string;
    isFirstVisit?: "no" | "unknown" | "yes";
    name?: string;
    phone?: string;
    pregnancyRiskFlag?: boolean;
    requestedTimeSlots?: string[];
    timeSlots: string[];
    treatment?: string;
  };
  bookingTreatmentAction?: "add" | "replace" | "use_current";
  conversationStatus: string;
  handoffReason: null | string;
  decision: {
    decisionType: string;
    matchedKey: string;
    matchedType: string;
    replyText: string;
  };
  eventType: string;
  messageId: string;
  messageText: string;
  replyPayload: null | {
    messages: LineReplyMessage[];
    replyToken: string;
  };
  replyToken: string;
  rendererTelemetry?: ReplyRendererTelemetry;
  sourceGroupId: string;
  sourceRoomId: string;
  sourceType: string;
  sourceUserId: string;
  usedAiHumanizer: boolean;
  usedAiReplyGenerator: boolean;
  webhookEventId: string;
};

/**
 * Group and room events are accepted only to identify an eligible notification
 * target. They must not be treated as a direct customer conversation.
 */
export function isGroupSourceResult(result: Pick<ProcessedWebhookResult, "sourceType">) {
  return result.sourceType === "group" || result.sourceType === "room";
}

export function filterDirectMessageResults<T extends Pick<ProcessedWebhookResult, "sourceType">>(results: readonly T[]) {
  return results.filter((result) => !isGroupSourceResult(result));
}

export type ReplySendResult = {
  attempts: number;
  errorMessage?: string;
  messageId: string;
  ok: boolean;
  replyToken: string;
  responseBody: string;
  status: number;
  suppressedReason?: "conversation_state_blocked" | "conversation_state_unavailable";
  webhookEventId: string;
};

const NON_TEXT_REPLY = "目前我先支援文字訊息，如果方便的話，請直接用文字告訴我想了解的內容，我先幫您整理。";
const INTRO_TEXT = `您好，我是${clinicConfig.aiName}，先幫您處理線上常見問題與預約整理。`;

const AI_INTRO_TEXT = `您好，我是 AI 客服${clinicConfig.aiName}，先協助您處理常見問題與預約整理。`;
const AI_REPLY_FOOTER = `以上為 AI 客服${clinicConfig.aiName}初步回覆。`;

export function verifyLineSignature(rawBody: string, channelSecret: string, signature: string) {
  const digest = crypto.createHmac("sha256", channelSecret).update(rawBody).digest("base64");
  const expected = Buffer.from(digest);
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, provided);
}

function appendAiFooter(text: string) {
  if (!text.trim()) {
    return text;
  }

  return text.includes("AI 客服") ? text : `${text}\n\n${AI_REPLY_FOOTER}`;
}

export function buildReplyPayload(
  replyToken: string,
  replyText: string,
  shouldIntroduce: boolean,
  replyMessages?: LineReplyMessage[],
  suppressAiFooter = false,
) {
  const introducedText = shouldIntroduce && !replyText.includes("AI 客服") ? `${AI_INTRO_TEXT}\n\n${replyText}` : replyText;
  const finalText = suppressAiFooter ? introducedText : appendAiFooter(introducedText);
  const baseMessages: LineReplyMessage[] = replyMessages?.length
    ? [
        ...(shouldIntroduce && !suppressAiFooter ? [{ type: "text", text: formatReplyText(AI_INTRO_TEXT) } satisfies LineTextMessage] : []),
        ...formatReplyMessages(replyMessages),
        ...(!suppressAiFooter ? [{ type: "text", text: formatReplyText(AI_REPLY_FOOTER) } satisfies LineTextMessage] : []),
      ]
    : buildTextReplyMessages(finalText);
  const messages: LineReplyMessage[] = replyMessages?.length
    ? baseMessages.flatMap((message): LineReplyMessage[] =>
        message.type === "text" ? buildTextReplyMessages(message.text) : [message],
      )
    : baseMessages;

  return {
    replyToken,
    messages,
  };
}

function parseWebhookPayload(rawBody: string): LineWebhookPayload {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new InvalidWebhookPayloadError("Invalid JSON body");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new InvalidWebhookPayloadError("Webhook payload must be a JSON object");
  }

  const payload = parsed as { events?: unknown };
  if (payload.events !== undefined && !Array.isArray(payload.events)) {
    throw new InvalidWebhookPayloadError("Webhook payload.events must be an array");
  }

  return payload as LineWebhookPayload;
}

function createAnonymousContext(userId: string) {
  return userId ? createEmptyConversationContext(userId) : createEmptyConversationContext("");
}

function createAnonymousState(userId: string) {
  return userId ? createEmptyConversationState(userId) : createEmptyConversationState("");
}

async function classifyEvent(event: LineMessageEvent, options: WebhookProcessOptions): Promise<ClassifiedDecision> {
  const { includePending } = options;
  if (event.source?.type === "group" || event.source?.type === "room") {
    return {
      conversationState: createAnonymousState(""),
      decisionType: "group_source_ignored",
      matchedKey: event.source?.type ?? "group_source",
      matchedType: "system_event",
      nextContext: createAnonymousContext(""),
      replyText: "",
      shouldIntroduce: false,
      usedAiHumanizer: false,
      usedAiReplyGenerator: false,
    };
  }

  const sourceUserId = event.source?.userId ?? "";
  const existingContext = sourceUserId ? await loadConversationContext(sourceUserId) : createAnonymousContext(sourceUserId);
  const loadedState = sourceUserId ? await loadConversationState(sourceUserId) : createAnonymousState(sourceUserId);
  const currentTime = new Date();
  const currentIso = currentTime.toISOString();
  let conversationState = recoverLegacyRendererFallbackHandoff(
    applyAutoResumeIfDue(loadedState, currentTime),
    currentIso,
  );

  if (event.type !== "message") {
    return {
      conversationState,
      decisionType: "fallback_reply",
      matchedKey: event.type ?? "unknown_event",
      matchedType: "generic_fallback",
      nextContext: {
        ...existingContext,
        lastSeenAt: currentIso,
      },
      replyText: "",
      shouldIntroduce: false,
      usedAiHumanizer: false,
      usedAiReplyGenerator: false,
    };
  }

  conversationState = markCustomerMessageReceived(conversationState, currentIso);

  if (event.message?.type !== "text") {
    const nextContext = {
      ...existingContext,
      lastIntent: "non_text_message",
      lastSeenAt: currentIso,
    };

    if (sourceUserId) {
      await saveConversationContext(nextContext, existingContext);
      conversationState = await persistWebhookLifecycleState({
        expectedControlRevision: loadedState.controlRevision,
        expectedUpdatedAt: loadedState.updatedAt,
        proposedState: conversationState,
        receivedAt: currentIso,
      });
    }

    return {
      conversationState,
      decisionType: "clinic_info_reply",
      matchedKey: event.message?.type ?? "non_text_message",
      matchedType: "guided_reply",
      nextContext,
      replyText: NON_TEXT_REPLY,
      shouldIntroduce: !existingContext.introSent,
      usedAiHumanizer: false,
      usedAiReplyGenerator: false,
    };
  }

  if (shouldBlockAiReply(conversationState.status)) {
    if (sourceUserId) {
      conversationState = await persistWebhookLifecycleState({
        expectedControlRevision: loadedState.controlRevision,
        expectedUpdatedAt: loadedState.updatedAt,
        proposedState: conversationState,
        receivedAt: currentIso,
      });
    }

    return {
      conversationState,
      decisionType: "conversation_state_blocked",
      matchedKey: `guard:${conversationState.status}`,
      matchedType: "handoff_rule",
      nextContext: {
        ...existingContext,
        lastSeenAt: currentIso,
      },
      replyText: "",
      shouldIntroduce: false,
      usedAiHumanizer: false,
      usedAiReplyGenerator: false,
    };
  }

  let routedDecision = await routeCustomerMessage({
    conversationContext: existingContext,
    includePending,
    message: event.message.text ?? "",
    now: currentTime,
    runtimeAudienceKey: sourceUserId,
  });

  let replyText = routedDecision.replyText;
  let aiModel: string | undefined;
  let aiTokensIn: number | undefined;
  let aiTokensOut: number | undefined;
  let aiReplySourceUrl: string | undefined;
  let usedAiHumanizer = false;
  let usedAiReplyGenerator = false;

  // A pending handoff is a queued staff task, not a global AI pause. Still,
  // an unresolved continuation may belong to that task (for example, "it is
  // getting more painful"). Keep those vague follow-ups with the existing
  // handoff instead of sending them through the general LLM fallback.
  if (
    conversationState.status === "handoff_pending" &&
    shouldKeepPendingHandoffContext({
      handoffReason: conversationState.handoffReason,
      message: event.message.text ?? "",
      routedDecision,
    })
  ) {
    const handoffReason = conversationState.handoffReason ?? "handoff_pending";
    const handoffAcknowledgement = getRepeatedHandoffAcknowledgement();
    const nextContext = appendRecentConversationTurns(
      {
        ...existingContext,
        lastIntent: handoffReason,
        lastSeenAt: currentIso,
      },
      [
        createRecentConversationTurn("user", event.message.text ?? "", getEventTurnIdentity(event)),
        createRecentConversationTurn("assistant", handoffAcknowledgement, getEventTurnIdentity(event)),
      ],
    );
    if (sourceUserId) {
      await saveConversationContext(nextContext, existingContext);
      conversationState = await persistWebhookLifecycleState({
        expectedControlRevision: loadedState.controlRevision,
        expectedUpdatedAt: loadedState.updatedAt,
        proposedState: conversationState,
        receivedAt: currentIso,
      });
    }
    return {
      conversationState,
      decisionType: "conversation_state_blocked",
      matchedKey: `handoff_continuation:${handoffReason}`,
      matchedType: "handoff_rule",
      nextContext,
      replyText: handoffAcknowledgement,
      shouldIntroduce: false,
      usedAiHumanizer: false,
      usedAiReplyGenerator: false,
    };
  }

  // Canary is deliberately narrow: deterministic safety/booking/price/clinic
  // routes run first, and only an otherwise-unresolved fallback may be replaced.
  // With the default off + sampleRate 0 this makes no customer-visible change.
  if (routedDecision.decisionType === "fallback_reply") {
    const config = getRuntimeConfig();
    const sampleKey = `${sourceUserId}:${event.message.id ?? event.webhookEventId ?? event.message.text ?? ""}`;
    const gatePreview = resolveNluCanaryDecision(null, sampleKey, {
      mode: config.openAiNluDecisionMode,
      sampleRate: config.openAiNluSampleRate,
    });
    if (gatePreview.gate.allowDecision) {
      const nluResult = await requestNluFrame(event.message.text ?? "");
      const canary = resolveNluCanaryDecision(nluResult?.frame, sampleKey, {
        mode: config.openAiNluDecisionMode,
        sampleRate: config.openAiNluSampleRate,
      });
      if (canary.decision.kind === "semantic_consultation") {
        routedDecision = await routeCustomerMessage({
          conversationContext: existingContext,
          includePending,
          message: event.message.text ?? "",
          now: currentTime,
          runtimeAudienceKey: sourceUserId,
          semanticTreatmentConsultation: canary.decision.semanticTreatmentConsultation,
        });
        replyText = routedDecision.replyText;
      }
    }
  }

  if (routedDecision.decisionType === "handoff_pending") {
    const nextState = recordHandoffPending(conversationState, routedDecision.matchedKey, currentIso);

    if (shouldSuppressHandoffReply(conversationState, routedDecision.matchedKey)) {
      conversationState = nextState;
      if (sourceUserId) {
        await saveConversationContext(routedDecision.nextContext, existingContext);
        conversationState = await persistWebhookLifecycleState({
          expectedControlRevision: loadedState.controlRevision,
          expectedUpdatedAt: loadedState.updatedAt,
          handoffTransitionReason: routedDecision.matchedKey,
          proposedState: conversationState,
          receivedAt: currentIso,
        });
      }

      return {
        conversationState,
        decisionType: "conversation_state_blocked",
        matchedKey: `handoff_suppressed:${routedDecision.matchedKey}`,
        matchedType: "handoff_rule",
        nextContext: routedDecision.nextContext,
        replyText: getRepeatedHandoffAcknowledgement(),
        shouldIntroduce: false,
        usedAiHumanizer: false,
        usedAiReplyGenerator: false,
      };
    }

    conversationState = nextState;
  }

  if (
    routedDecision.decisionType === "fallback_reply" &&
    shouldAllowAiFallbackReply(event.message.text ?? "") &&
    shouldUseControlledIntentClassifier(event.message.text ?? "")
  ) {
    const controlledIntent = await classifyControlledIntent(event.message.text ?? "");
    const config = getRuntimeConfig();
    if (controlledIntent) {
      aiModel = controlledIntent.model;
      aiTokensIn = controlledIntent.tokensIn;
      aiTokensOut = controlledIntent.tokensOut;
    }
    if (
      controlledIntent &&
      isHighConfidenceControlledIntent(controlledIntent, config.openAiIntentClassifierMinConfidence) &&
      controlledIntent.intent === "doctor_schedule"
    ) {
      const scheduleDecision = await resolveDoctorScheduleDecision({
        fallbackReply: routedDecision.replyText,
        message: event.message.text ?? "",
        today: currentTime,
      });
      routedDecision = applyControlledScheduleDecision(routedDecision, scheduleDecision);
      replyText = scheduleDecision.replyText;
    } else if (
      controlledIntent &&
      isHighConfidenceControlledIntent(controlledIntent, config.openAiIntentClassifierMinConfidence) &&
      controlledIntent.intent === "treatment_consultation" &&
      controlledIntent.treatmentKey &&
      controlledIntent.concern
    ) {
      routedDecision = await routeCustomerMessage({
        conversationContext: existingContext,
        includePending,
        message: event.message.text ?? "",
        now: currentTime,
        runtimeAudienceKey: sourceUserId,
        semanticTreatmentConsultation: {
          concern: controlledIntent.concern,
          treatmentKey: controlledIntent.treatmentKey,
        },
      });
      replyText = routedDecision.replyText;
    }
  }

  const replyPlan = routedDecision.replyPlan ?? legacyDecisionToReplyPlan({
    decisionType: routedDecision.decisionType,
    matchedKey: routedDecision.matchedKey,
    matchedType: routedDecision.matchedType,
    replyMessages: routedDecision.replyMessages,
    replyText: routedDecision.replyText,
    suppressAiFooter: routedDecision.suppressAiFooter,
  });
  const synchronizedContext = commitDialogueRouteSelection(routedDecision.nextContext, conversationState, {
    dialogueAct: replyPlan.dialogueAct,
    matchedKey: replyPlan.matchedKey,
    now: currentTime,
  });
  const dialogueState = hydrateDialogueState(synchronizedContext, conversationState, { now: currentTime });
  const rendered = await renderReplyPlan({
    customerMessage: event.message.text ?? "",
    dialogueState,
    footer: AI_REPLY_FOOTER,
    // Generated messages own their disclosure because the outer payload builder
    // suppresses its footer to avoid duplication.
    includeFooter: true,
    plan: replyPlan,
    recentTurns: synchronizedContext.recentTurns ?? [],
  });
  replyText = rendered.replyText;
  usedAiReplyGenerator = rendered.generatorInvoked;
  aiModel = rendered.model ?? aiModel;
  aiTokensIn = (aiTokensIn ?? 0) + (rendered.tokensIn ?? 0) || undefined;
  aiTokensOut = (aiTokensOut ?? 0) + (rendered.tokensOut ?? 0) || undefined;
  aiReplySourceUrl = rendered.sourceUrl;
  const rendererTelemetry = toReplyRendererTelemetry(rendered);
  const replyMessages = rendered.handoffRequired
    ? undefined
    : rendered.generated
    ? formatReplyMessages(rendered.messages)
    : routedDecision.replyMessages
      ? formatReplyMessages(routedDecision.replyMessages)
      : undefined;

  const introducedInReply = replyText.includes(clinicConfig.aiName);
  const nextContext = appendRecentConversationTurns(
    {
      ...synchronizedContext,
      introSent: existingContext.introSent || introducedInReply || Boolean(replyText),
      lastIntent: synchronizedContext.lastIntent,
    },
    [
      createRecentConversationTurn("user", event.message.text ?? "", getEventTurnIdentity(event)),
      createRecentConversationTurn("assistant", replyText, getEventTurnIdentity(event)),
    ],
  );

  let persistedConversationState = {
    ...conversationState,
    updatedAt: currentIso,
  };
  if (sourceUserId) {
    // Rendering may take several seconds. Persist only while this webhook still
    // owns the lifecycle snapshot it loaded; otherwise preserve the staff's
    // newer takeover/resume/close transition.
    await options.beforeFinalStateCheck?.(sourceUserId);
    persistedConversationState = await persistWebhookLifecycleState({
      expectedControlRevision: loadedState.controlRevision,
      expectedUpdatedAt: loadedState.updatedAt,
      handoffTransitionReason:
        routedDecision.decisionType === "handoff_pending" ? routedDecision.matchedKey : undefined,
      proposedState: persistedConversationState,
      receivedAt: currentIso,
    });
    if (shouldBlockAiReply(persistedConversationState.status)) {
      const blockedContext = appendRecentConversationTurns(
        {
          ...existingContext,
          lastSeenAt: currentIso,
        },
        [createRecentConversationTurn("user", event.message.text ?? "", getEventTurnIdentity(event))],
      );
      await saveConversationContext(blockedContext, existingContext);
      return {
        conversationState: persistedConversationState,
        decisionType: "conversation_state_blocked",
        matchedKey: `guard:fresh_${persistedConversationState.status}`,
        matchedType: "handoff_rule",
        nextContext: blockedContext,
        replyText: "",
        shouldIntroduce: false,
        usedAiHumanizer: false,
        usedAiReplyGenerator,
      };
    }
    await saveConversationContext(nextContext, existingContext);
  }

  return {
    aiModel,
    aiSourceUrl: aiReplySourceUrl,
    aiTokensIn,
    aiTokensOut,
    conversationState: persistedConversationState,
    decisionType: rendered.generated && routedDecision.decisionType === "fallback_reply" ? "ai_auto_reply" : routedDecision.decisionType,
    matchedKey: rendered.generated && routedDecision.decisionType === "fallback_reply" ? "ai_controlled_fallback" : routedDecision.matchedKey,
    matchedType: rendered.generated && routedDecision.decisionType === "fallback_reply" ? "guided_reply" : routedDecision.matchedType,
    nextContext,
    rendererTelemetry,
    replyMessages,
    replyText,
    // Customer-visible generated messages already include the disclosure. A
    // guarded fallback still relies on the outer payload footer.
    suppressAiFooter: shouldSuppressOuterAiFooter(rendered.generated, replyPlan),
    shouldIntroduce: rendered.generated ? false : !existingContext.introSent && !introducedInReply,
    usedAiHumanizer,
    usedAiReplyGenerator,
  };
}

export async function processWebhookRequestBody(rawBody: string, options: WebhookProcessOptions) {
  const payload = parseWebhookPayload(rawBody);
  const results: ProcessedWebhookResult[] = [];

  for (const event of payload.events ?? []) {
    const decision = await classifyEvent(event, options);
    const replyToken = event.replyToken ?? "";
    const replyPayload = replyToken && (decision.replyText || decision.replyMessages?.length)
      ? buildReplyPayload(replyToken, decision.replyText, decision.shouldIntroduce, decision.replyMessages, decision.suppressAiFooter)
      : null;

    results.push({
      aiModel: decision.aiModel,
      aiSourceUrl: decision.aiSourceUrl,
      aiTokensIn: decision.aiTokensIn,
      aiTokensOut: decision.aiTokensOut,
      bookingDraft: {
        branch: decision.nextContext.bookingDraft.branch,
        isFirstVisit: decision.nextContext.bookingDraft.isFirstVisit,
        name: decision.nextContext.bookingDraft.name,
        phone: decision.nextContext.bookingDraft.phone,
        pregnancyRiskFlag: decision.nextContext.pregnancyRiskFlag === true,
        requestedTimeSlots: [...(decision.nextContext.bookingDraft.requestedTimeSlots ?? [])],
        timeSlots: [...decision.nextContext.bookingDraft.timeSlots],
        treatment: decision.nextContext.bookingDraft.treatment,
      },
      bookingTreatmentAction: decision.nextContext.bookingSession?.action,
      conversationStatus: decision.conversationState.status,
      handoffReason: decision.conversationState.handoffReason,
      decision: {
        decisionType: decision.decisionType,
        matchedKey: decision.matchedKey,
        matchedType: decision.matchedType,
        replyText: decision.replyText,
      },
      eventType: event.type ?? "",
      messageId: event.message?.id ?? "",
      messageText: event.message?.text ?? "",
      replyPayload,
      replyToken,
      rendererTelemetry: decision.rendererTelemetry,
      sourceGroupId: event.source?.groupId ?? "",
      sourceRoomId: event.source?.roomId ?? "",
      sourceType: event.source?.type ?? "",
      sourceUserId: event.source?.userId ?? "",
      usedAiHumanizer: decision.usedAiHumanizer,
      usedAiReplyGenerator: decision.usedAiReplyGenerator,
      webhookEventId: event.webhookEventId ?? "",
    });
  }

  return {
    claudeReplyInvocationCount: getClaudeReplyInvocationCount(),
    eventCount: results.length,
    results,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendReplyRequest(replyPayload: NonNullable<ProcessedWebhookResult["replyPayload"]>, accessToken: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(replyPayload),
      signal: controller.signal,
    });

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

type SendReplyPayloadOptions = {
  authorizeBeforeSend?: (result: ProcessedWebhookResult) => Promise<boolean>;
  retryCount: number;
  timeoutMs: number;
};

export async function isReplyStillAuthorized(
  result: ProcessedWebhookResult,
  loadState: typeof loadAuthoritativeConversationState = loadAuthoritativeConversationState,
) {
  if (!result.sourceUserId) {
    return true;
  }
  try {
    const latestState = applyAutoResumeIfDue(
      await loadState(result.sourceUserId),
      new Date(),
    );
    return !shouldBlockAiReply(latestState.status);
  } catch (error) {
    await reportOperationalError({
      alert: false,
      error,
      extra: { line_user_id: result.sourceUserId },
      source: "line_reply_authorization_degraded",
    });
    // Sending without an authoritative ownership check can talk over a staff
    // member whose takeover committed immediately before the store outage.
    // Suppress this one reply; the webhook itself still completes normally.
    return false;
  }
}

async function removeSuppressedReplyFromContext(result: ProcessedWebhookResult) {
  if (!result.sourceUserId || !result.decision.replyText) return;
  try {
    const currentContext = await loadConversationContext(result.sourceUserId);
    const assistantTurnId = buildConversationTurnId("assistant", {
      messageId: result.messageId,
      replyToken: result.replyToken,
      webhookEventId: result.webhookEventId,
    });
    const nextContext = removeUnsentAssistantTurn(currentContext, result.decision.replyText, assistantTurnId);
    if (nextContext !== currentContext) {
      await saveConversationContext(nextContext, currentContext);
    }
  } catch (error) {
    await reportOperationalError({
      alert: false,
      error,
      extra: { line_user_id: result.sourceUserId },
      source: "line_reply_suppressed_context_cleanup",
    });
  }
}

export async function sendReplyPayloads(
  results: ProcessedWebhookResult[],
  accessToken: string,
  options: SendReplyPayloadOptions,
) {
  const sendResults: ReplySendResult[] = [];

  for (const result of results) {
    if (!result.replyPayload) {
      sendResults.push({
        attempts: 0,
        ok: false,
        messageId: result.messageId,
        replyToken: result.replyToken,
        responseBody: "No reply payload generated",
        status: 0,
        webhookEventId: result.webhookEventId,
      });
      continue;
    }

    const maxAttempts = Math.max(1, options.retryCount + 1);
    let finalResult: ReplySendResult | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let authorized = false;
      try {
        authorized = await (options.authorizeBeforeSend ?? isReplyStillAuthorized)(result);
      } catch (error) {
        await removeSuppressedReplyFromContext(result);
        finalResult = {
          attempts: attempt - 1,
          errorMessage: error instanceof Error ? error.message : "Reply authorization unavailable",
          ok: true,
          messageId: result.messageId,
          replyToken: result.replyToken,
          responseBody: "Reply suppressed because authorization was unavailable",
          status: 0,
          suppressedReason: "conversation_state_unavailable",
          webhookEventId: result.webhookEventId,
        };
        break;
      }
      if (!authorized) {
        await removeSuppressedReplyFromContext(result);
        finalResult = {
          attempts: attempt - 1,
          ok: true,
          messageId: result.messageId,
          replyToken: result.replyToken,
          responseBody: "Reply suppressed after conversation ownership changed",
          status: 0,
          suppressedReason: "conversation_state_blocked",
          webhookEventId: result.webhookEventId,
        };
        break;
      }
      try {
        const response = await sendReplyRequest(result.replyPayload, accessToken, options.timeoutMs);
        const body = await response.text();
        finalResult = {
          attempts: attempt,
          ok: response.ok,
          messageId: result.messageId,
          replyToken: result.replyToken,
          responseBody: body,
          status: response.status,
          webhookEventId: result.webhookEventId,
        };

        if (response.ok || attempt === maxAttempts) {
          break;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.name === "AbortError"
              ? `LINE reply timed out after ${options.timeoutMs}ms`
              : error.message
            : "Unknown LINE reply error";

        finalResult = {
          attempts: attempt,
          errorMessage,
          ok: false,
          messageId: result.messageId,
          replyToken: result.replyToken,
          responseBody: errorMessage,
          status: 0,
          webhookEventId: result.webhookEventId,
        };

        if (attempt === maxAttempts) {
          break;
        }
      }

      await sleep(250);
    }

    if (!finalResult) {
      finalResult = {
        attempts: maxAttempts,
        errorMessage: "Unknown LINE reply failure",
        ok: false,
        messageId: result.messageId,
        replyToken: result.replyToken,
        responseBody: "Unknown LINE reply failure",
        status: 0,
        webhookEventId: result.webhookEventId,
      };
    }

    if (!finalResult.ok) {
      await appendReplyDeadLetter({
        attemptedAt: new Date().toISOString(),
        attempts: finalResult.attempts,
        decisionType: result.decision.decisionType,
        errorMessage: finalResult.errorMessage,
        matchedKey: result.decision.matchedKey,
        messageId: result.messageId,
        responseBody: finalResult.responseBody,
        status: finalResult.status,
        webhookEventId: result.webhookEventId,
      });
    }

    sendResults.push(finalResult);
  }

  return sendResults;
}
