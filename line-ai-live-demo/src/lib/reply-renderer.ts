import {
  generateAiReply,
  type AiReplyContext,
  type GeneratedAiReply,
} from "@/lib/ai-reply-client";
import { constrainMedicalAiReply } from "@/lib/ai-fallback-guard";
import type { RecentConversationTurn } from "@/lib/conversation-context";
import type { DialogueState } from "@/lib/dialogue-state";
import {
  buildApprovedKnowledge,
  buildReplyPlanContext,
  shouldGenerateReply,
  type ReplyPlan,
} from "@/lib/reply-plan";
import { formatReplyMessages, formatReplyText } from "@/lib/reply-text-format";
import { addCustomerReplyTone } from "@/lib/reply-tone";
import type { LineReplyMessage, LineTextMessage } from "@/lib/treatment-carousel";

export type ReplyGenerator = (
  customerMessage: string,
  context: AiReplyContext,
) => Promise<GeneratedAiReply | null>;

export type ReplyRendererFallbackReason =
  | "generation_disabled"
  | "generator_error"
  | "generator_rejected"
  | "generator_timeout"
  | "generator_unavailable"
  | "repeated_previous_reply";

export type ReplyRendererInput = {
  approvedKnowledge?: string;
  customerMessage: string;
  dialogueState: DialogueState;
  footer?: string;
  generationTimeoutMs?: number;
  generator?: ReplyGenerator;
  groundedByApprovedKnowledge?: boolean;
  includeFooter?: boolean;
  medical?: boolean;
  plan: ReplyPlan;
  recentTurns: readonly RecentConversationTurn[];
};

export type ReplyRendererResult = {
  fallbackReason?: ReplyRendererFallbackReason;
  generated: boolean;
  messages: LineReplyMessage[];
  model?: string;
  replyText: string;
  sourceUrl?: string;
  tokensIn?: number;
  tokensOut?: number;
  usedGroundedKnowledge: boolean;
};

const DEFAULT_GENERATION_TIMEOUT_MS = 6_000;
const BLOCKED_GENERATED_CLAIM_PATTERN =
  /(?:(?:保證|一定|必定|立即|馬上|立刻).{0,6}(?:有效|有感|改善|見效)|(?:每個人|人人).{0,10}(?:有效|有感|改善|效果)|永久|百分之百|100%|(?:完全|絕對|零|無|沒有|幾乎沒有|不會).{0,5}(?:風險|副作用|疼痛|痛|恢復期|修復期)|(?:安全).{0,5}(?:無副作用|沒有副作用|零風險)|(?:無痛|免恢復期|無恢復期|無修復期))/iu;
const CUSTOMER_VISIBLE_URL_PATTERN = /(?:https?:\/\/|www\.)\S+/iu;

function normalizeKnowledge(value: string | undefined) {
  return value?.trim() || undefined;
}

function inferMedicalReply(plan: ReplyPlan, dialogueState: DialogueState) {
  return Boolean(
    plan.treatmentKeys.length > 0 ||
      plan.concernKeys.length > 0 ||
      dialogueState.topic === "treatment" ||
      dialogueState.topic === "post_procedure" ||
      plan.decisionType === "treatment_intro_reply" ||
      plan.matchedKey.startsWith("official_treatment_education:") ||
      plan.matchedKey.startsWith("unavailable_treatment_alternative:"),
  );
}

function getOfficialEducationTreatmentKey(plan: ReplyPlan) {
  if (!plan.matchedKey.startsWith("official_treatment_education:")) return undefined;
  return plan.matchedKey.split(":", 2)[1] || undefined;
}

function buildGeneratorContext(input: ReplyRendererInput, approvedKnowledge: string | undefined): AiReplyContext {
  const { dialogueState, plan } = input;
  return {
    approvedKnowledge,
    consultationAnsweredTopics: dialogueState.answeredTopics,
    consultationKnownNeeds: Array.from(new Set([
      ...plan.knownNeeds,
      ...dialogueState.knownNeeds.map((need) => need.key),
    ])),
    consultationPrimaryNeed: dialogueState.primaryConcernKey,
    controlledMedicalFallback: input.medical ?? inferMedicalReply(plan, dialogueState),
    focusAwaiting: dialogueState.awaiting?.questionSummary,
    focusGoal: dialogueState.dialogueAct,
    lastIntent: plan.matchedKey,
    officialEducationTreatmentKey: getOfficialEducationTreatmentKey(plan),
    recentTurns: [...input.recentTurns],
    treatmentFocus: plan.treatmentKeys[0] ?? dialogueState.treatmentKeys[0],
  };
}

function stripComparisonNoise(text: string, footer: string | undefined) {
  const withoutFooter = footer ? text.replace(footer, "") : text;
  return formatReplyText(withoutFooter)
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "")
    .replace(/\s+/gu, "")
    .trim();
}

function repeatsPreviousAssistantReply(
  candidate: string,
  recentTurns: readonly RecentConversationTurn[],
  footer: string | undefined,
) {
  const normalizedCandidate = stripComparisonNoise(candidate, footer);
  if (!normalizedCandidate) return false;

  const previousAssistantTurn = [...recentTurns].reverse().find((turn) => turn.role === "assistant");
  if (!previousAssistantTurn) return false;
  return stripComparisonNoise(previousAssistantTurn.text, footer) === normalizedCandidate;
}

function appendFooter(
  messages: readonly LineReplyMessage[],
  footer: string | undefined,
  includeFooter: boolean,
  suppressAiFooter: boolean,
) {
  const normalizedFooter = formatReplyText(footer ?? "");
  if (!includeFooter || suppressAiFooter || !normalizedFooter) {
    return [...messages];
  }
  if (messages.some((message) => message.type === "text" && message.text.includes(normalizedFooter))) {
    return [...messages];
  }

  if (messages.length === 1 && messages[0]?.type === "text") {
    return [{
      ...messages[0],
      text: `${messages[0].text}\n\n${normalizedFooter}`,
    } satisfies LineTextMessage];
  }

  return [
    ...messages,
    { type: "text", text: normalizedFooter } satisfies LineTextMessage,
  ];
}

function buildMessages(
  replyText: string,
  plan: ReplyPlan,
  footer: string | undefined,
  includeFooter: boolean,
) {
  const baseMessages = plan.richMessages.length > 0
    ? formatReplyMessages(plan.richMessages)
    : [{ type: "text", text: replyText } satisfies LineTextMessage];
  return appendFooter(baseMessages, footer, includeFooter, plan.suppressAiFooter);
}

function renderFallback(
  input: ReplyRendererInput,
  fallbackReason: ReplyRendererFallbackReason,
  usedGroundedKnowledge: boolean,
  deterministicReply?: string,
): ReplyRendererResult {
  const replyText = formatReplyText(addCustomerReplyTone(
    deterministicReply ?? input.plan.fallbackText,
    { decisionType: input.plan.decisionType, matchedKey: input.plan.matchedKey },
  ));
  return {
    fallbackReason,
    generated: false,
    messages: buildMessages(replyText, input.plan, input.footer, input.includeFooter ?? true),
    replyText,
    usedGroundedKnowledge,
  };
}

function wasRejectedByExistingGuard(
  generatedText: string,
  constrainedText: string,
  footer: string,
  options: { groundedByApprovedKnowledge: boolean; medical: boolean },
) {
  if (!generatedText.trim()) return true;
  if (BLOCKED_GENERATED_CLAIM_PATTERN.test(generatedText) || CUSTOMER_VISIBLE_URL_PATTERN.test(generatedText)) {
    return true;
  }
  const rejectionSentinel = constrainMedicalAiReply("", footer, options);
  return constrainedText === rejectionSentinel;
}

export async function renderReplyPlan(input: ReplyRendererInput): Promise<ReplyRendererResult> {
  const planKnowledge = [
    buildReplyPlanContext(input.plan),
    input.plan.nextQuestion ? `本輪可用的下一步問題：${input.plan.nextQuestion}` : "",
  ].filter(Boolean).join("\n");
  const approvedKnowledge = normalizeKnowledge([
    input.approvedKnowledge,
    planKnowledge,
  ].filter(Boolean).join("\n"));
  const usedGroundedKnowledge = input.groundedByApprovedKnowledge ?? Boolean(
    input.approvedKnowledge?.trim() ||
      input.plan.approvedKnowledge.length > 0 ||
      input.plan.recommendationReasons.length > 0 ||
      input.plan.exactPriceFacts.length > 0,
  );

  // Exact prices, handoffs, rich messages and every hard-policy decision keep
  // the plan's approved copy (apart from plain-text formatting) and never pass
  // through a reply model.
  if (!shouldGenerateReply(input.plan) || input.plan.exactPriceFacts.length > 0) {
    return renderFallback(
      input,
      "generation_disabled",
      usedGroundedKnowledge,
      input.plan.deterministicReply ?? input.plan.fallbackText,
    );
  }

  const generator = input.generator ?? generateAiReply;
  let generatedReply: GeneratedAiReply | null;
  let generationTimer: ReturnType<typeof setTimeout> | undefined;
  const timeoutMarker = Symbol("reply-generation-timeout");
  try {
    const generated = generator(
      input.customerMessage,
      buildGeneratorContext(input, approvedKnowledge),
    );
    const timeout = new Promise<typeof timeoutMarker>((resolve) => {
      generationTimer = setTimeout(
        () => resolve(timeoutMarker),
        input.generationTimeoutMs ?? DEFAULT_GENERATION_TIMEOUT_MS,
      );
    });
    const settled = await Promise.race([generated, timeout]);
    if (settled === timeoutMarker) {
      return renderFallback(input, "generator_timeout", usedGroundedKnowledge);
    }
    generatedReply = settled;
  } catch {
    return renderFallback(input, "generator_error", usedGroundedKnowledge);
  } finally {
    if (generationTimer) clearTimeout(generationTimer);
  }

  if (!generatedReply) {
    return renderFallback(input, "generator_unavailable", usedGroundedKnowledge);
  }

  const medical = input.medical ?? inferMedicalReply(input.plan, input.dialogueState);
  const guardOptions = { groundedByApprovedKnowledge: usedGroundedKnowledge, medical };
  const constrained = constrainMedicalAiReply(generatedReply.text, input.footer ?? "", guardOptions);
  if (wasRejectedByExistingGuard(generatedReply.text, constrained, input.footer ?? "", guardOptions)) {
    return renderFallback(input, "generator_rejected", usedGroundedKnowledge);
  }

  const formatted = formatReplyText(constrained);
  if (!formatted || repeatsPreviousAssistantReply(formatted, input.recentTurns, input.footer)) {
    return renderFallback(input, "repeated_previous_reply", usedGroundedKnowledge);
  }

  const replyText = formatReplyText(addCustomerReplyTone(formatted, {
    decisionType: input.plan.decisionType,
    matchedKey: input.plan.matchedKey,
  }));

  return {
    generated: true,
    messages: buildMessages(replyText, input.plan, input.footer, input.includeFooter ?? true),
    model: generatedReply.model,
    replyText,
    sourceUrl: generatedReply.sourceUrl,
    tokensIn: generatedReply.tokensIn,
    tokensOut: generatedReply.tokensOut,
    usedGroundedKnowledge,
  };
}
