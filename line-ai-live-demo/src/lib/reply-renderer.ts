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
  buildReplyPlanGuidance,
  shouldGenerateReply,
  type DialogueAct,
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

export type ReplyRendererMode = "deterministic" | "fallback" | "generated";
export type ReplyRendererFallbackVariant = "handoff" | "primary" | "secondary" | "safe";

export type ReplyRendererTelemetry = {
  dialogueAct: DialogueAct;
  fallbackReason?: ReplyRendererFallbackReason;
  fallbackVariant?: ReplyRendererFallbackVariant;
  generatedVisible: boolean;
  generatorInvoked: boolean;
  latencyMs: number;
  renderMode: ReplyRendererMode;
};

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
  dialogueAct: DialogueAct;
  fallbackReason?: ReplyRendererFallbackReason;
  fallbackVariant?: ReplyRendererFallbackVariant;
  generated: boolean;
  generatorInvoked: boolean;
  handoffRequired: boolean;
  latencyMs: number;
  messages: LineReplyMessage[];
  model?: string;
  replyText: string;
  renderMode: ReplyRendererMode;
  sourceUrl?: string;
  tokensIn?: number;
  tokensOut?: number;
  usedGroundedKnowledge: boolean;
};

const DEFAULT_GENERATION_TIMEOUT_MS = 6_000;
export const RENDERER_FALLBACK_HANDOFF_ACKNOWLEDGEMENT =
  "🧑‍💬 這題我先幫您轉交真人客服確認，您剛才的問題已保留，客服會接續協助。";
const BLOCKED_GENERATED_CLAIM_PATTERN =
  /(?:(?:保證|一定|必定|立即|馬上|立刻).{0,6}(?:有效|有感|改善|見效)|(?:每個人|人人).{0,10}(?:有效|有感|改善|效果)|永久|百分之百|100%|(?:完全|絕對|零|無|沒有|幾乎沒有|不會).{0,5}(?:風險|副作用|疼痛|痛|恢復期|修復期)|(?:安全).{0,5}(?:無副作用|沒有副作用|零風險)|(?:無痛|免恢復期|無恢復期|無修復期))/iu;
const CUSTOMER_VISIBLE_URL_PATTERN = /(?:https?:\/\/|www\.)\S+/iu;
const CUSTOMER_VISIBLE_ACTIVITY_DATE_PATTERN =
  /(?:(?:活動|優惠|方案|檔期|有效期間|活動期間).{0,16}(?:(?:20\d{2}[年/.\-])?\d{1,2}[月/.\-]\d{1,2}(?:日)?|\d{1,2}月底)|(?:20\d{2}[年/.\-])?\d{1,2}[月/.\-]\d{1,2}(?:日)?\s*(?:至|到|[-~～—])\s*(?:(?:20\d{2}[年/.\-])?\d{1,2}[月/.\-]\d{1,2}(?:日)?))/iu;

const SECONDARY_FALLBACKS: Record<DialogueAct, readonly string[]> = {
  introduce_treatment: [
    "我先從這項療程的特色與改善方向幫您整理。您目前最在意哪個部位或困擾呢？",
    "這項療程可先依您的部位與困擾評估方向。您想優先改善哪一個問題呢？",
  ],
  discover_need: [
    "我先接著了解您的需求。您目前最在意的部位或困擾是什麼呢？",
    "我會依您的目標整理方向；您想先改善哪個部位呢？",
  ],
  answer_followup: [
    "我先直接接著您這題整理。您比較想了解改善方向、療程感受，還是恢復期呢？",
    "我會延續目前的問題說明；您最想先確認哪個重點呢？",
  ],
  compare_options: [
    "這兩個方向的作用重點不同，我可以依您最在意的問題逐項比較。您想先比較效果方向還是療程感受呢？",
    "我先依您的困擾比較兩個選項，不需要先決定療程。您最在意哪個差異呢？",
  ],
  explain_combination: [
    "單做與搭配處理的重點不同，是否需要搭配要看您的主要困擾。您想先比較作用差異還是適合情況呢？",
    "搭配不是一定需要，我可以先依您的需求說明各自作用。您最在意哪個部位呢？",
  ],
  handle_objection: [
    "可以先依您偏好的方向評估，不需要現在決定搭配。您最希望保留或避開的是哪一點呢？",
    "了解您的考量，我先按您的偏好整理選項。您最在意效果、感受還是恢復期呢？",
  ],
  recommend_direction: [
    "我可以依您目前的困擾整理可評估方向，實際選擇仍會看部位與個人狀況。您最想先改善哪一點呢？",
    "先不用決定療程，我會從您的問題反推適合評估的方向。您主要在意哪個部位呢？",
  ],
  quote_approved_price: ["價格以診所目前核准資訊為準，我可以先確認您問的是哪一項療程。"],
  invite_consultation: [
    "可以先安排諮詢了解適不適合，不需要先決定療程。您平日還是假日較方便呢？",
    "我可以先幫您整理免費諮詢需求。您白天還是晚上較方便呢？",
  ],
  collect_booking: ["我接著幫您整理預約資料，請提供目前尚未填寫的館別或方便時段。"],
  manage_booking: ["我先協助確認既有預約要修改或取消的項目，真人客服會接續核對。"],
  answer_clinic_info: ["我先確認您要查詢的館別或診所資訊，再提供正確資料。"],
  answer_safety: ["這個狀況需要依實際情形評估；若症狀明顯或持續，請直接聯絡診所由真人協助。"],
  clarify: [
    "我先確認一個重點：您現在想了解療程內容、價格，還是安排諮詢呢？",
    "為了接著回答正確，請告訴我您目前最想先確認哪個問題。",
  ],
  handoff: ["已為您轉交真人客服，後續會由客服接續協助。"],
  fallback: [
    "我會接著您的問題協助。請告訴我想了解的療程或主要困擾，我先整理方向。",
    "我可以協助療程介紹、價格查詢與預約整理；您目前想先處理哪一項呢？",
  ],
};

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
  if (plan.matchedKey.startsWith("official_treatment_education:")) {
    return plan.matchedKey.split(":", 2)[1] || undefined;
  }

  // A clinic-approved brand list establishes what the clinic offers, but it
  // does not by itself establish product differences. Reuse the constrained
  // official-background lookup for that missing education instead of either
  // inventing a comparison or falling back to a generic treatment intro.
  const brandComparison = plan.matchedKey.match(/^treatment_brand_comparison:([^:]+):/u);
  return brandComparison?.[1] || undefined;
}

function buildGeneratorContext(
  input: ReplyRendererInput,
  approvedKnowledge: string | undefined,
  replyPlanGuidance: string,
): AiReplyContext {
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
    replyPlanGuidance,
    treatmentFocus: plan.treatmentKeys[0] ?? dialogueState.treatmentKeys[0],
  };
}

export function toReplyRendererTelemetry(result: ReplyRendererResult): ReplyRendererTelemetry {
  return {
    dialogueAct: result.dialogueAct,
    fallbackReason: result.fallbackReason,
    fallbackVariant: result.fallbackVariant,
    generatedVisible: result.generated,
    generatorInvoked: result.generatorInvoked,
    latencyMs: result.latencyMs,
    renderMode: result.renderMode,
  };
}

export function toReplyRendererPayloadJson(telemetry: ReplyRendererTelemetry | undefined) {
  return {
    renderer_dialogue_act: telemetry?.dialogueAct ?? null,
    renderer_fallback_reason: telemetry?.fallbackReason ?? null,
    renderer_fallback_variant: telemetry?.fallbackVariant ?? null,
    renderer_generated_visible: telemetry?.generatedVisible ?? null,
    renderer_generator_invoked: telemetry?.generatorInvoked ?? null,
    renderer_latency_ms: telemetry?.latencyMs ?? null,
    renderer_mode: telemetry?.renderMode ?? null,
  };
}

function stripComparisonNoise(text: string, footer: string | undefined) {
  const withoutFooter = footer ? text.replace(footer, "") : text;
  return formatReplyText(withoutFooter)
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "")
    .replace(/\s+/gu, "")
    .trim();
}

function buildCharacterNgrams(text: string, size = 3) {
  const grams = new Set<string>();
  const characters = Array.from(text);
  for (let index = 0; index <= characters.length - size; index += 1) {
    grams.add(characters.slice(index, index + size).join(""));
  }
  return grams;
}

function substantiallyRepeatsPreviousReply(candidate: string, previous: string) {
  if (candidate === previous) return true;
  if (Math.min(candidate.length, previous.length) < 60) return false;
  if (candidate.includes(previous) || previous.includes(candidate)) return true;

  const candidateGrams = buildCharacterNgrams(candidate);
  const previousGrams = buildCharacterNgrams(previous);
  if (candidateGrams.size === 0 || previousGrams.size === 0) return false;
  let shared = 0;
  for (const gram of candidateGrams) {
    if (previousGrams.has(gram)) shared += 1;
  }
  return shared / Math.min(candidateGrams.size, previousGrams.size) >= 0.72;
}

function repeatsPreviousAssistantReply(
  candidate: string,
  recentTurns: readonly RecentConversationTurn[],
  footer: string | undefined,
) {
  const normalizedCandidate = stripComparisonNoise(candidate, footer);
  if (!normalizedCandidate) return false;

  return recentTurns
    .filter((turn) => turn.role === "assistant")
    .some((turn) => substantiallyRepeatsPreviousReply(
      normalizedCandidate,
      stripComparisonNoise(turn.text, footer),
    ));
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

export function buildRendererFallbackHandoffMessages(
  input: Pick<ReplyRendererInput, "footer" | "includeFooter" | "plan">,
  replyText: string,
) {
  // Do not reuse input.plan.richMessages. They belong to the failed/stale
  // answer and can obscure the terminal human-handoff acknowledgement.
  return appendFooter(
    [{ type: "text", text: replyText } satisfies LineTextMessage],
    input.footer,
    input.includeFooter ?? true,
    false,
  );
}

function renderDeterministic(
  input: ReplyRendererInput,
  usedGroundedKnowledge: boolean,
  startedAt: number,
): ReplyRendererResult {
  const replyText = formatReplyText(addCustomerReplyTone(
    input.plan.deterministicReply ?? input.plan.fallbackText,
    { decisionType: input.plan.decisionType, matchedKey: input.plan.matchedKey },
  ));
  return {
    dialogueAct: input.plan.dialogueAct,
    generated: false,
    generatorInvoked: false,
    handoffRequired: false,
    latencyMs: Date.now() - startedAt,
    messages: buildMessages(replyText, input.plan, input.footer, input.includeFooter ?? true),
    replyText,
    renderMode: "deterministic",
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
  if (
    BLOCKED_GENERATED_CLAIM_PATTERN.test(generatedText) ||
    CUSTOMER_VISIBLE_URL_PATTERN.test(generatedText) ||
    CUSTOMER_VISIBLE_ACTIVITY_DATE_PATTERN.test(generatedText)
  ) {
    return true;
  }
  const rejectionSentinel = constrainMedicalAiReply("", footer, options);
  return constrainedText === rejectionSentinel;
}

function guardFallbackCandidate(
  input: ReplyRendererInput,
  candidate: string,
  usedGroundedKnowledge: boolean,
  options: { checkRecentReplies?: boolean } = {},
) {
  const toned = addCustomerReplyTone(candidate, {
    decisionType: input.plan.decisionType,
    matchedKey: input.plan.matchedKey,
  });
  const medical = input.medical ?? inferMedicalReply(input.plan, input.dialogueState);
  const guardOptions = { groundedByApprovedKnowledge: usedGroundedKnowledge, medical };
  const constrained = constrainMedicalAiReply(toned, input.footer ?? "", guardOptions);
  if (wasRejectedByExistingGuard(toned, constrained, input.footer ?? "", guardOptions)) {
    return null;
  }
  const formatted = formatReplyText(constrained);
  if (
    !formatted ||
    (options.checkRecentReplies !== false && repeatsPreviousAssistantReply(formatted, input.recentTurns, input.footer))
  ) {
    return null;
  }
  return formatted;
}

function renderGuardedFallback(
  input: ReplyRendererInput,
  fallbackReason: ReplyRendererFallbackReason,
  usedGroundedKnowledge: boolean,
  startedAt: number,
  generationMetadata?: GeneratedAiReply,
): ReplyRendererResult {
  const dynamicSafeCandidates = [
    input.plan.nextQuestion
      ? `我會從目前進度接著整理。${input.plan.nextQuestion}`
      : "我會從目前進度接著整理，您可以直接補充最想先確認的重點。",
    input.plan.knownNeeds.length > 0
      ? `已保留您先前提到的需求，我會直接承接這一輪的新問題。`
      : "目前的療程脈絡我有保留，我會直接承接這一輪的新問題。",
    "這一輪不重複前面的介紹，我們直接往您現在最在意的差異繼續。",
    "前面的內容不用重說，您可以直接告訴我這次最想比較或確認的部分。",
  ];
  const secondaryCandidates = [
    input.plan.secondaryFallbackText,
    ...SECONDARY_FALLBACKS[input.plan.dialogueAct],
    ...dynamicSafeCandidates,
  ].filter((candidate): candidate is string => Boolean(candidate?.trim()));
  const candidates: Array<{ text: string; variant: ReplyRendererFallbackVariant }> = [
    { text: input.plan.fallbackText, variant: "primary" },
    ...secondaryCandidates.map((text, index) => ({
      text,
      variant: index === secondaryCandidates.length - 1 ? "safe" as const : "secondary" as const,
    })),
  ];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const normalized = formatReplyText(candidate.text);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    const replyText = guardFallbackCandidate(input, normalized, usedGroundedKnowledge);
    if (!replyText) continue;
    return {
      dialogueAct: input.plan.dialogueAct,
      fallbackReason,
      fallbackVariant: candidate.variant,
      generated: false,
      generatorInvoked: true,
      handoffRequired: false,
      latencyMs: Date.now() - startedAt,
      messages: buildMessages(replyText, input.plan, input.footer, input.includeFooter ?? true),
      model: generationMetadata?.model,
      replyText,
      renderMode: "fallback",
      sourceUrl: generationMetadata?.sourceUrl,
      tokensIn: generationMetadata?.tokensIn,
      tokensOut: generationMetadata?.tokensOut,
      usedGroundedKnowledge,
    };
  }

  // Exhausting every guarded, non-repeating fallback is a terminal condition,
  // not permission to go silent. The acknowledgement still passes the same
  // customer-safety guard, but deliberately skips the repeat check because the
  // webhook immediately records a pending human handoff and will not invoke
  // the renderer again while that handoff is pending.
  const handoffReply = guardFallbackCandidate(
    input,
    RENDERER_FALLBACK_HANDOFF_ACKNOWLEDGEMENT,
    usedGroundedKnowledge,
    { checkRecentReplies: false },
  );
  if (!handoffReply) {
    throw new Error("Renderer fallback handoff acknowledgement was rejected by the customer guard");
  }

  return {
    dialogueAct: input.plan.dialogueAct,
    fallbackReason,
    fallbackVariant: "handoff",
    generated: false,
    generatorInvoked: true,
    handoffRequired: true,
    latencyMs: Date.now() - startedAt,
    // A terminal handoff acknowledgement must stay plain text. Reusing the
    // plan's rich carousel here could repeat the stale answer that exhausted
    // the renderer and obscure the escalation.
    messages: buildRendererFallbackHandoffMessages(input, handoffReply),
    model: generationMetadata?.model,
    replyText: handoffReply,
    renderMode: "fallback",
    sourceUrl: generationMetadata?.sourceUrl,
    tokensIn: generationMetadata?.tokensIn,
    tokensOut: generationMetadata?.tokensOut,
    usedGroundedKnowledge,
  };
}

export async function renderReplyPlan(input: ReplyRendererInput): Promise<ReplyRendererResult> {
  const startedAt = Date.now();
  const replyPlanGuidance = buildReplyPlanGuidance(input.plan);
  const approvedKnowledge = normalizeKnowledge([
    input.approvedKnowledge,
    buildApprovedKnowledge(input.plan),
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
    return renderDeterministic(input, usedGroundedKnowledge, startedAt);
  }

  const generator = input.generator ?? generateAiReply;
  let generatedReply: GeneratedAiReply | null;
  let generationTimer: ReturnType<typeof setTimeout> | undefined;
  const timeoutMarker = Symbol("reply-generation-timeout");
  try {
    const generated = generator(
      input.customerMessage,
      buildGeneratorContext(input, approvedKnowledge, replyPlanGuidance),
    );
    const timeout = new Promise<typeof timeoutMarker>((resolve) => {
      generationTimer = setTimeout(
        () => resolve(timeoutMarker),
        input.generationTimeoutMs ?? DEFAULT_GENERATION_TIMEOUT_MS,
      );
    });
    const settled = await Promise.race([generated, timeout]);
    if (settled === timeoutMarker) {
      return renderGuardedFallback(input, "generator_timeout", usedGroundedKnowledge, startedAt);
    }
    generatedReply = settled;
  } catch {
    return renderGuardedFallback(input, "generator_error", usedGroundedKnowledge, startedAt);
  } finally {
    if (generationTimer) clearTimeout(generationTimer);
  }

  if (!generatedReply) {
    return renderGuardedFallback(input, "generator_unavailable", usedGroundedKnowledge, startedAt);
  }

  const medical = input.medical ?? inferMedicalReply(input.plan, input.dialogueState);
  const guardOptions = { groundedByApprovedKnowledge: usedGroundedKnowledge, medical };
  const constrained = constrainMedicalAiReply(generatedReply.text, input.footer ?? "", guardOptions);
  if (wasRejectedByExistingGuard(generatedReply.text, constrained, input.footer ?? "", guardOptions)) {
    return renderGuardedFallback(input, "generator_rejected", usedGroundedKnowledge, startedAt, generatedReply);
  }

  const formatted = formatReplyText(constrained);
  if (!formatted || repeatsPreviousAssistantReply(formatted, input.recentTurns, input.footer)) {
    return renderGuardedFallback(input, "repeated_previous_reply", usedGroundedKnowledge, startedAt, generatedReply);
  }

  const replyText = formatReplyText(addCustomerReplyTone(formatted, {
    decisionType: input.plan.decisionType,
    matchedKey: input.plan.matchedKey,
  }));

  return {
    dialogueAct: input.plan.dialogueAct,
    generated: true,
    generatorInvoked: true,
    handoffRequired: false,
    latencyMs: Date.now() - startedAt,
    messages: buildMessages(replyText, input.plan, input.footer, input.includeFooter ?? true),
    model: generatedReply.model,
    replyText,
    renderMode: "generated",
    sourceUrl: generatedReply.sourceUrl,
    tokensIn: generatedReply.tokensIn,
    tokensOut: generatedReply.tokensOut,
    usedGroundedKnowledge,
  };
}
