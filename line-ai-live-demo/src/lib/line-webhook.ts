import crypto from "node:crypto";

import { generateAiReply } from "@/lib/ai-reply-client";
import {
  classifyControlledIntent,
  isHighConfidenceControlledIntent,
  shouldUseControlledIntentClassifier,
} from "@/lib/ai-intent-classifier";
import { getClaudeReplyInvocationCount } from "@/lib/claude-client";
import { clinicConfig } from "@/lib/clinic-config";
import { createEmptyConversationContext, loadConversationContext, saveConversationContext, type ConversationContext } from "@/lib/conversation-context";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import {
  applyAutoResumeIfDue,
  createEmptyConversationState,
  loadConversationState,
  markCustomerMessageReceived,
  recordHandoffPending,
  saveConversationState,
  shouldBlockAiReply,
  shouldSuppressRepeatedHandoff,
  type ConversationState,
} from "@/lib/conversation-state";
import { maybeHumanizeReply } from "@/lib/reply-humanizer";
import { formatReplyMessages, formatReplyText } from "@/lib/reply-text-format";
import { resolveDoctorScheduleDecision } from "@/lib/doctor-schedule";
import { routeCustomerMessage, shouldAllowAiFallbackReply } from "@/lib/router";
import type { LineReplyMessage, LineTextMessage } from "@/lib/treatment-carousel";
import { appendReplyDeadLetter } from "@/lib/webhook-dead-letter";

type WebhookProcessOptions = {
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

type ClassifiedDecision = {
  aiModel?: string;
  aiTokensIn?: number;
  aiTokensOut?: number;
  conversationState: ConversationState;
  decisionType: string;
  matchedKey: string;
  matchedType: string;
  nextContext: ConversationContext;
  replyMessages?: LineReplyMessage[];
  replyText: string;
  suppressAiFooter?: boolean;
  shouldIntroduce: boolean;
  usedAiHumanizer: boolean;
  usedAiReplyGenerator: boolean;
};

const HIGH_RISK_HANDOFF_REASONS = new Set(["post_procedure_issue", "serious_complaint"]);

export function isHighRiskHandoffReason(reason: string) {
  return HIGH_RISK_HANDOFF_REASONS.has(reason);
}

export function getRepeatedHandoffAcknowledgement() {
  return "我們已收到您補充的訊息，真人客服會一併確認並接續協助。";
}

export function shouldSuppressHandoffReply(conversationState: ConversationState, reason: string) {
  return shouldSuppressRepeatedHandoff(conversationState, reason) && !isHighRiskHandoffReason(reason);
}

export class InvalidWebhookPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWebhookPayloadError";
  }
}

export type ProcessedWebhookResult = {
  aiModel?: string;
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
  conversationStatus: string;
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

function buildReplyPayload(
  replyToken: string,
  replyText: string,
  shouldIntroduce: boolean,
  replyMessages?: LineReplyMessage[],
  suppressAiFooter = false,
) {
  const introducedText = shouldIntroduce && !replyText.includes("AI 客服") ? `${AI_INTRO_TEXT}\n\n${replyText}` : replyText;
  const finalText = suppressAiFooter ? introducedText : appendAiFooter(introducedText);
  const messages = replyMessages?.length
    ? [
        ...(shouldIntroduce && !suppressAiFooter ? [{ type: "text", text: formatReplyText(AI_INTRO_TEXT) } satisfies LineTextMessage] : []),
        ...formatReplyMessages(replyMessages),
        ...(!suppressAiFooter ? [{ type: "text", text: formatReplyText(AI_REPLY_FOOTER) } satisfies LineTextMessage] : []),
      ]
    : [{ type: "text", text: formatReplyText(finalText) } satisfies LineTextMessage];

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

async function classifyEvent(event: LineMessageEvent, includePending: boolean): Promise<ClassifiedDecision> {
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
  let conversationState = applyAutoResumeIfDue(loadedState, currentTime);

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
      await saveConversationContext(nextContext);
      await saveConversationState(conversationState);
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
      await saveConversationState(conversationState);
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
  let usedAiHumanizer = false;
  let usedAiReplyGenerator = false;
  let controlledClassifierAttempted = false;

  if (routedDecision.decisionType === "handoff_pending") {
    const nextState = recordHandoffPending(conversationState, routedDecision.matchedKey, currentIso);

    if (shouldSuppressHandoffReply(conversationState, routedDecision.matchedKey)) {
      conversationState = nextState;
      if (sourceUserId) {
        await saveConversationContext(routedDecision.nextContext);
        await saveConversationState(conversationState);
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

  // Keep structured and factual replies deterministic. These flows often contain
  // exact branch names, booking fields, or approved clinic copy that should not
  // be rephrased by the LLM.
  const canHumanizeReply = false;

  if (
    routedDecision.decisionType === "fallback_reply" &&
    shouldAllowAiFallbackReply(event.message.text ?? "") &&
    shouldUseControlledIntentClassifier(event.message.text ?? "")
  ) {
    controlledClassifierAttempted = true;
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
      routedDecision = {
        ...routedDecision,
        ...scheduleDecision,
        nextContext: {
          ...routedDecision.nextContext,
          lastIntent: scheduleDecision.matchedKey,
        },
      };
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

  if (canHumanizeReply) {
    const humanizedReply = await maybeHumanizeReply({
      baseReplyText: routedDecision.replyText,
      decisionType: routedDecision.decisionType,
      matchedKey: routedDecision.matchedKey,
      matchedType: routedDecision.matchedType,
      messageText: event.message.text ?? "",
    });

    if (humanizedReply) {
      replyText = humanizedReply;
      usedAiHumanizer = true;
    }
  } else if (
    !controlledClassifierAttempted &&
    routedDecision.decisionType === "fallback_reply" &&
    shouldAllowAiFallbackReply(event.message.text ?? "")
  ) {
    const aiReply = await generateAiReply(event.message.text ?? "", {
      bookingBranch: routedDecision.nextContext.bookingDraft.branch,
      bookingTreatment: routedDecision.nextContext.bookingDraft.treatment,
      lastIntent: routedDecision.nextContext.lastIntent,
      lastReferencedBranch: routedDecision.nextContext.lastReferencedBranch,
      lastReferencedTreatment: routedDecision.nextContext.lastReferencedTreatment,
      locationPreference: routedDecision.nextContext.locationPreference,
      preferredBranch: routedDecision.nextContext.preferredBranch,
    });
    if (aiReply) {
      replyText = aiReply.text;
      aiModel = aiReply.model;
      aiTokensIn = (aiTokensIn ?? 0) + aiReply.tokensIn;
      aiTokensOut = (aiTokensOut ?? 0) + aiReply.tokensOut;
      usedAiReplyGenerator = true;
    }
  }

  replyText = formatReplyText(replyText);

  const introducedInReply = replyText.includes(clinicConfig.aiName);
  const nextContext = {
    ...routedDecision.nextContext,
    introSent: existingContext.introSent || introducedInReply || Boolean(replyText),
  };

  if (sourceUserId) {
    await saveConversationContext(nextContext);
    await saveConversationState({
      ...conversationState,
      updatedAt: currentIso,
    });
  }

  return {
    aiModel,
    aiTokensIn,
    aiTokensOut,
    conversationState: {
      ...conversationState,
      updatedAt: currentIso,
    },
    decisionType: usedAiReplyGenerator ? "ai_auto_reply" : routedDecision.decisionType,
      matchedKey: usedAiReplyGenerator ? "ai_general_answer" : routedDecision.matchedKey,
    matchedType: usedAiReplyGenerator ? "guided_reply" : routedDecision.matchedType,
    nextContext,
    replyMessages: usedAiReplyGenerator || usedAiHumanizer ? undefined : routedDecision.replyMessages,
    replyText,
    // Keep the AI disclosure consistent on every customer-facing response.
    suppressAiFooter: false,
    shouldIntroduce: !existingContext.introSent && !introducedInReply,
    usedAiHumanizer,
    usedAiReplyGenerator,
  };
}

export async function processWebhookRequestBody(rawBody: string, options: WebhookProcessOptions) {
  const payload = parseWebhookPayload(rawBody);
  const results: ProcessedWebhookResult[] = [];

  for (const event of payload.events ?? []) {
    const decision = await classifyEvent(event, options.includePending);
    const replyToken = event.replyToken ?? "";
    const replyPayload = replyToken && (decision.replyText || decision.replyMessages?.length)
      ? buildReplyPayload(replyToken, decision.replyText, decision.shouldIntroduce, decision.replyMessages, decision.suppressAiFooter)
      : null;

    results.push({
      aiModel: decision.aiModel,
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
      conversationStatus: decision.conversationState.status,
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
  retryCount: number;
  timeoutMs: number;
};

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
