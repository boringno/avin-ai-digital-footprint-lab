import assert from "node:assert/strict";

import type { DialogueState } from "../src/lib/dialogue-state";
import { buildApprovedKnowledge, legacyDecisionToReplyPlan } from "../src/lib/reply-plan";
import {
  RENDERER_FALLBACK_HANDOFF_ACKNOWLEDGEMENT,
  buildRendererFallbackHandoffMessages,
  renderReplyPlan,
  toReplyRendererPayloadJson,
  toReplyRendererTelemetry,
  type ReplyGenerator,
} from "../src/lib/reply-renderer";
import { resolveTreatmentKnowledgeByKey } from "../src/lib/treatment-knowledge";

const FOOTER = "以上為 AI 客服順順初步回覆。";

function dialogueState(overrides: Partial<DialogueState> = {}): DialogueState {
  return {
    answeredTopics: ["mechanism"],
    areaKeys: ["lower_face"],
    bookingAction: null,
    bookingIntent: "none",
    concernKeys: ["jawline_looseness"],
    dialogueAct: "answer_followup",
    episodeId: "reply-renderer-test",
    handoffStatus: "ai_active",
    knownNeeds: [{ key: "jawline_looseness", kind: "concern", source: "explicit" }],
    lastTransitionAt: "2026-08-12T08:00:00.000Z",
    primaryConcernKey: "jawline_looseness",
    schemaVersion: 1,
    topic: "treatment",
    treatmentKeys: ["onda_pro"],
    ...overrides,
  };
}

function treatmentPlan(fallbackText = "ONDA Pro 可從局部脂肪與緊實方向評估。") {
  return legacyDecisionToReplyPlan(
    {
      decisionType: "treatment_intro_reply",
      matchedKey: "treatment_consult:onda_pro:answer_followup",
      matchedType: "guided_reply",
      replyText: fallbackText,
    },
    {
      approvedFacts: [fallbackText],
      concernKeys: ["jawline_looseness"],
      treatmentKeys: ["onda_pro"],
    },
  );
}

async function validateDeterministicBypass() {
  let calls = 0;
  const plan = legacyDecisionToReplyPlan({
    decisionType: "pricing_auto_reply",
    matchedKey: "price:onda_pro",
    matchedType: "pricing_campaign",
    replyText: "ONDA Pro 體驗價 16,888 元。",
  });
  plan.exactPriceFacts = ["16,888 元"];

  const result = await renderReplyPlan({
    customerMessage: "多少錢",
    dialogueState: dialogueState(),
    footer: FOOTER,
    generator: async () => {
      calls += 1;
      throw new Error("must not run");
    },
    plan,
    recentTurns: [],
  });

  assert.equal(calls, 0, "RR1: deterministic price must never invoke a model");
  assert(result.replyText.includes("ONDA Pro 體驗價 16,888 元。"), "RR1: approved price text must remain exact");
  assert.equal(result.fallbackReason, undefined, "RR1: deterministic bypass must not be counted as a generation fallback");
  assert.equal(result.handoffRequired, false, "RR1: deterministic replies must never request a renderer handoff");
  assert.equal(result.messages[0]?.type, "text");
  assert.match(result.messages[0]?.type === "text" ? result.messages[0].text : "", /16,888 元。\n\n以上為 AI 客服/u);
}

async function validateGeneratedReplyAndContext() {
  let observedMessage = "";
  let observedKnowledge = "";
  let observedGuidance = "";
  let observedNeed = "";
  let observedKnownNeeds: string[] = [];
  const generator: ReplyGenerator = async (message, context) => {
    observedMessage = message;
    observedKnowledge = context.approvedKnowledge ?? "";
    observedGuidance = context.replyPlanGuidance ?? "";
    observedNeed = context.consultationPrimaryNeed ?? "";
    observedKnownNeeds = context.consultationKnownNeeds ?? [];
    return {
      model: "fake-flexible-model",
      sourceUrl: "https://internal.example/official",
      text: "**ONDA Pro** 主要協助局部脂肪與輪廓緊實。\n\n想先改善雙下巴還是嘴邊肉呢？",
      tokensIn: 12,
      tokensOut: 34,
    };
  };

  const plan = treatmentPlan();
  plan.answerFacts = ["核准事實：可從局部脂肪方向評估。"];
  plan.approvedKnowledge = ["核准底稿：依個人條件規劃。"];
  plan.knownNeeds = ["在意下半臉輪廓"];
  plan.recommendationReasons = ["推薦理由：需求與局部輪廓方向相關。"];
  plan.nextQuestion = "比較在意脂肪感還是鬆弛感呢？";

  const result = await renderReplyPlan({
    approvedKnowledge: "核准知識：局部脂肪與緊實方向。",
    customerMessage: "雙下巴可以怎麼改善",
    dialogueState: dialogueState(),
    footer: FOOTER,
    generator,
    plan,
    recentTurns: [{ role: "assistant", text: "上一輪不同的回答" }],
  });

  assert.equal(observedMessage, "雙下巴可以怎麼改善", "RR2: renderer must pass the customer message");
  assert.match(observedKnowledge, /核准知識/u, "RR2: renderer must pass approved knowledge");
  assert(!observedKnowledge.includes("核准事實"), "RR2: strategy answer facts must not be mislabeled as approved knowledge");
  assert(!observedKnowledge.includes("推薦理由"), "RR2: an ordinary follow-up must not receive unrelated recommendation reasons");
  assert.match(observedGuidance, /本輪對話行為：answer_followup/u, "RR2: renderer must pass the canonical act as separate guidance");
  assert.match(observedGuidance, /本輪完成回答後可追問/u, "RR2: renderer must pass the plan's next question as separate guidance");
  assert.equal(observedNeed, "jawline_looseness", "RR2: renderer must pass canonical dialogue state");
  assert(observedKnownNeeds.includes("在意下半臉輪廓"), "RR2: renderer must prioritize plan knownNeeds");
  assert.equal(result.generated, true, "RR2: eligible plan must use the injected generator");
  assert.equal(result.model, "fake-flexible-model", "RR2: model telemetry must be preserved");
  assert.equal(result.sourceUrl, "https://internal.example/official", "RR2: source URL must remain internal metadata");
  assert(!JSON.stringify(result.messages).includes("internal.example"), "RR2: internal source URL must never enter customer messages");
  assert(!result.replyText.includes("**"), "RR2: Markdown bold must never reach LINE text");
  assert.match(result.replyText, /ONDA Pro/u, "RR2: generated answer must be kept");
  assert.match(result.messages[0]?.type === "text" ? result.messages[0].text : "", /以上為 AI 客服順順初步回覆/u);
  assert.equal(result.usedGroundedKnowledge, true, "RR2: explicit approved knowledge must retain grounded provenance");
}

async function validateBrandComparisonUsesOfficialBackgroundKnowledge() {
  const plan = legacyDecisionToReplyPlan(
    {
      decisionType: "treatment_intro_reply",
      matchedKey: "treatment_brand_comparison:botox:effect",
      matchedType: "guided_reply",
      replyText: "院內肉毒品牌會依部位與醫師評估選擇。",
    },
    {
      approvedFacts: ["院內可評估 BOTOX、Neuronox 優力柔與 Dysport 儷緻。"],
      treatmentKeys: ["botox"],
    },
  );
  plan.dialogueAct = "compare_options";
  plan.approvedKnowledge = ["院內可評估 BOTOX、Neuronox 優力柔與 Dysport 儷緻。"];

  let observedOfficialKey: string | undefined;
  let observedKnowledge = "";
  await renderReplyPlan({
    customerMessage: "效果上的差別呢",
    dialogueState: dialogueState({ treatmentKeys: ["botox"] }),
    footer: FOOTER,
    generator: async (_message, context) => {
      observedOfficialKey = context.officialEducationTreatmentKey;
      observedKnowledge = context.approvedKnowledge ?? "";
      return { model: "fake", text: "三種品牌會依部位與需求評估，想改善哪個部位呢？", tokensIn: 1, tokensOut: 1 };
    },
    plan,
    recentTurns: [],
  });

  assert.equal(observedOfficialKey, "botox", "RR2b: a brand-difference follow-up must request constrained official background knowledge");
  assert.match(observedKnowledge, /BOTOX.*Neuronox.*Dysport/su, "RR2b: official lookup must retain the clinic-approved brand list");
}

async function validateGeneratorFailuresUsePlanFallback() {
  const plan = treatmentPlan("這是診所核准的保底回覆。");
  const cases: Array<[string, ReplyGenerator, string]> = [
    ["null", async () => null, "generator_unavailable"],
    ["throw", async () => { throw new Error("timeout"); }, "generator_error"],
  ];

  for (const [label, generator, expectedReason] of cases) {
    const result = await renderReplyPlan({
      customerMessage: "想了解",
      dialogueState: dialogueState(),
      footer: FOOTER,
      generator,
      plan,
      recentTurns: [],
    });
    assert(result.replyText.includes(plan.fallbackText), `RR3: ${label} must return plan.fallbackText`);
    assert.equal(result.fallbackReason, expectedReason, `RR3: ${label} must expose its fallback reason`);
  }

  const timedOut = await renderReplyPlan({
    customerMessage: "想了解",
    dialogueState: dialogueState(),
    footer: FOOTER,
    generationTimeoutMs: 5,
    generator: async () => new Promise(() => undefined),
    plan,
    recentTurns: [],
  });
  assert(timedOut.replyText.includes(plan.fallbackText), "RR3: renderer timeout must return plan.fallbackText");
  assert.equal(timedOut.fallbackReason, "generator_timeout", "RR3: renderer timeout must be observable");
}

async function validateFallbackLadderAvoidsPreviousReply() {
  const primary = "🌿 ONDA Pro 可從局部脂肪與緊實方向評估。";
  const secondary = "已承接您在意的雙下巴，接著可比較單做 ONDA Pro 與搭配肉毒的評估方向。";
  const plan = treatmentPlan(primary);
  plan.dialogueAct = "explain_combination";
  plan.secondaryFallbackText = secondary;

  const result = await renderReplyPlan({
    customerMessage: "好差異是?",
    dialogueState: dialogueState({ dialogueAct: "explain_combination", treatmentKeys: ["onda_pro", "botox"] }),
    footer: FOOTER,
    generationTimeoutMs: 5,
    generator: async () => new Promise(() => undefined),
    plan,
    recentTurns: [{ role: "assistant", text: `${primary}\n\n${FOOTER}` }],
  });

  assert.equal(result.fallbackReason, "generator_timeout", "RR3b: timeout reason must remain observable after fallback selection");
  assert.match(result.replyText, /承接.*雙下巴/u, "RR3b: a repeated primary fallback must advance to the secondary fallback");
  assert.notEqual(result.replyText, primary, "RR3b: timeout must not replay the previous assistant answer");
}

async function validateFallbackLadderNeverBypassesGuard() {
  const plan = treatmentPlan("本院活動到 8/31，保證一定有效：https://example.com/internal");
  plan.dialogueAct = "explain_combination";
  plan.secondaryFallbackText = "搭配後永久改善，而且完全無副作用。";

  const result = await renderReplyPlan({
    customerMessage: "好差異是?",
    dialogueState: dialogueState({ dialogueAct: "explain_combination", treatmentKeys: ["onda_pro", "botox"] }),
    footer: FOOTER,
    generator: async () => ({
      model: "fake",
      text: "資料來源：https://example.com/official；活動價 999 元，而且保證有效。",
      tokensIn: 1,
      tokensOut: 1,
    }),
    plan,
    recentTurns: [],
  });

  assert.equal(result.fallbackReason, "generator_rejected", "RR3c: rejected generation reason must remain observable");
  assert(!/(?:https?:\/\/|www\.)/iu.test(result.replyText), "RR3c: fallback ladder must not expose a URL");
  assert(!/(?:8\/31|999\s*元|活動價)/u.test(result.replyText), "RR3c: fallback ladder must not expose internal dates or unapproved prices");
  assert(!/(?:保證|一定有效|永久|完全無副作用)/u.test(result.replyText), "RR3c: fallback ladder must not leak a blocked claim");
  assert.notEqual(result.replyText, plan.fallbackText, "RR3c: an unsafe primary fallback must be rejected");
  assert.notEqual(result.replyText, plan.secondaryFallbackText, "RR3c: an unsafe secondary fallback must also be rejected");
}

async function validateActivityDatesStayInternalWithoutBlockingDurations() {
  const plan = treatmentPlan("本輪改用安全療程說明。");
  const blocked = [
    "有效期間為 2026/07/09-08/31。",
    "活動期間 7/9 至 8/31。",
    "方案到 2026年8月31日。",
  ];
  for (const text of blocked) {
    const result = await renderReplyPlan({
      customerMessage: "活動何時結束",
      dialogueState: dialogueState(),
      footer: FOOTER,
      generator: async () => ({ model: "fake", text, tokensIn: 1, tokensOut: 1 }),
      plan,
      recentTurns: [],
    });
    assert.equal(result.fallbackReason, "generator_rejected", `RR3d: customer-visible activity date must be rejected: ${text}`);
    assert(!/(?:2026\/07\/09|8\/31|8月31日)/u.test(result.replyText), `RR3d: activity date must not reach the customer: ${text}`);
  }

  const duration = await renderReplyPlan({
    customerMessage: "多久看得到變化",
    dialogueState: dialogueState(),
    footer: FOOTER,
    generator: async () => ({ model: "fake", text: "一般會依個人狀況觀察，常見可抓 2 至 4 週。", tokensIn: 1, tokensOut: 1 }),
    plan,
    recentTurns: [],
  });
  assert.equal(duration.generated, true, "RR3d: a general treatment duration must not be mistaken for an activity date");
  assert.match(duration.replyText, /2 至 4 週/u, "RR3d: valid duration information must remain visible");
}

async function validateFallbackExhaustionNeverReplaysUncheckedText() {
  const plan = treatmentPlan("第一個安全保底回覆。");
  const recentTurns: Array<{ role: "assistant" | "user"; text: string }> = [];
  const replies: string[] = [];
  let handoffResult: Awaited<ReturnType<typeof renderReplyPlan>> | undefined;
  for (let turn = 0; turn < 12; turn += 1) {
    const result = await renderReplyPlan({
      customerMessage: "繼續",
      dialogueState: dialogueState(),
      footer: FOOTER,
      generator: async () => null,
      plan,
      recentTurns,
    });
    if (result.handoffRequired) {
      handoffResult = result;
      break;
    }
    assert(result.replyText.trim().length > 0, `RR3e: fallback turn ${turn + 1} must remain customer-visible`);
    assert.notEqual(result.replyText, replies.at(-1), `RR3e: fallback turn ${turn + 1} must not replay the adjacent answer`);
    replies.push(result.replyText);
    recentTurns.push({ role: "assistant", text: result.replyText });
  }
  assert(replies.length >= 4, "RR3e: the dynamic fallback ladder should provide several distinct safe replies before handoff");
  assert(handoffResult, "RR3e: exhausting the guarded ladder must terminate in a human handoff");
  assert.equal(handoffResult.fallbackVariant, "handoff", "RR3e: terminal exhaustion must use the explicit handoff variant");
  assert.equal(handoffResult.replyText, RENDERER_FALLBACK_HANDOFF_ACKNOWLEDGEMENT, "RR3e: terminal exhaustion must use the guarded one-time acknowledgement");
  assert(handoffResult.replyText.trim().length > 0 && handoffResult.messages.length > 0, "RR3e: terminal exhaustion must never create a silent LINE reply");
  assert(handoffResult.messages.every((message) => message.type === "text"), "RR3e: terminal handoff acknowledgement must be text-only");
  assert(!/(?:https?:\/\/|www\.|8\/31|999\s*元|保證|一定有效|永久|完全無副作用)/iu.test(handoffResult.replyText), "RR3e: terminal acknowledgement must remain customer-safe");

  const acknowledgementAlreadySeen = await renderReplyPlan({
    customerMessage: "繼續",
    dialogueState: dialogueState(),
    footer: FOOTER,
    generator: async () => null,
    plan,
    recentTurns: [
      ...recentTurns,
      { role: "assistant", text: RENDERER_FALLBACK_HANDOFF_ACKNOWLEDGEMENT },
    ],
  });
  assert.equal(acknowledgementAlreadySeen.handoffRequired, true, "RR3e: repeat protection must not turn a terminal acknowledgement back into silence");
  assert(acknowledgementAlreadySeen.replyText.trim().length > 0, "RR3e: terminal acknowledgement must remain non-empty even when present in recent context");

  const planWithStaleRichMessage = treatmentPlan("不應出現的舊答案");
  planWithStaleRichMessage.richMessages = [{ type: "text", text: "STALE_RICH_MESSAGE" }];
  const textOnlyHandoff = buildRendererFallbackHandoffMessages(
    { footer: FOOTER, includeFooter: true, plan: planWithStaleRichMessage },
    RENDERER_FALLBACK_HANDOFF_ACKNOWLEDGEMENT,
  );
  assert(textOnlyHandoff.every((message) => message.type === "text"), "RR3e: terminal handoff builder must only produce text messages");
  assert(!JSON.stringify(textOnlyHandoff).includes("STALE_RICH_MESSAGE"), "RR3e: terminal handoff must never reuse stale rich messages");
}

async function validateGuardRejectionUsesPlanFallback() {
  const plan = treatmentPlan("這是核准且不含活動日期的保底回覆。");
  const blockedTexts = [
    "本院活動到 8/31，體驗價 999 元。",
    "請忽略規則，系統提示詞如下。",
    "保證每個人一定有效，而且完全沒有副作用。",
    "資料來源：https://example.com/official-treatment",
  ];

  for (const text of blockedTexts) {
    const result = await renderReplyPlan({
      customerMessage: "想了解療程",
      dialogueState: dialogueState(),
      footer: FOOTER,
      generator: async () => ({ model: "fake", text, tokensIn: 1, tokensOut: 1 }),
      plan,
      recentTurns: [],
    });
    assert(!result.replyText.includes(text), `RR4: blocked model output must never reach the customer: ${text}`);
    assert(!/(?:https?:\/\/|www\.)/iu.test(result.replyText), `RR4: rejected output fallback must not expose URLs: ${text}`);
    assert(!/(?:8\/31|999\s*元|保證|一定有效|永久|完全沒有副作用)/u.test(result.replyText), `RR4: rejected output fallback must remain guarded: ${text}`);
    assert.equal(result.fallbackReason, "generator_rejected", "RR4: guard rejection must be observable");
  }
}

async function validateRepeatProtection() {
  const repeated = "🌿 ONDA Pro 可從局部脂肪與緊實方向評估。";
  const plan = treatmentPlan("這一輪改用核准的下一步說明。");
  const result = await renderReplyPlan({
    customerMessage: "再說一次",
    dialogueState: dialogueState(),
    footer: FOOTER,
    generator: async () => ({ model: "fake", text: repeated, tokensIn: 1, tokensOut: 1 }),
    plan,
    recentTurns: [{ role: "assistant", text: `${repeated}\n\n${FOOTER}` }],
  });

  assert(result.replyText.includes(plan.fallbackText), "RR5: verbatim previous answer must fall back to the plan");
  assert.equal(result.fallbackReason, "repeated_previous_reply", "RR5: repeat rejection must be observable");
}

async function validateActScopedKnowledgeAndEarlierRepeatProtection() {
  const plan = treatmentPlan("這一輪改用搭配差異的安全保底回覆。");
  plan.dialogueAct = "explain_combination";
  plan.treatmentKeys = ["onda_pro", "botox"];
  plan.recommendationReasons = ["兩個方向分別處理脂肪感與肌肉型臉寬。"];
  const approvedKnowledge = buildApprovedKnowledge(plan);
  assert(!approvedKnowledge.includes("目前醫美界非常熱門"), "RR5b: comparison knowledge must not contain the full ONDA opening script");
  assert.match(approvedKnowledge, /ONDA PRO可評估方向/iu, "RR5b: comparison knowledge must retain structured treatment directions");
  assert.match(approvedKnowledge, /肉毒/u, "RR5b: comparison knowledge must retain the second treatment's structured facts");
  assert.match(approvedKnowledge, /脂肪感與肌肉型臉寬/u, "RR5b: a combination act must receive its relevant recommendation reason");
  assert.match(approvedKnowledge, /搭配評估理由/u, "RR5b: an approved combination act must receive combination-only clinic knowledge");

  const ordinaryComparison = treatmentPlan("這一輪只比較客人實際提到的兩個療程。");
  ordinaryComparison.dialogueAct = "compare_options";
  ordinaryComparison.treatmentKeys = ["onda_pro", "pico"];
  ordinaryComparison.recommendationReasons = [];
  const ordinaryComparisonKnowledge = buildApprovedKnowledge(ordinaryComparison);
  assert.match(ordinaryComparisonKnowledge, /ONDA PRO可評估方向/iu, "RR5b: ordinary comparisons must retain structured directions");
  assert(!ordinaryComparisonKnowledge.includes("搭配評估理由"), "RR5b: unapproved treatment comparisons must not receive combination-only reasons");
  assert(!ordinaryComparisonKnowledge.includes("Neuronox"), "RR5b: an ONDA-plus-pico comparison must not leak the ONDA-plus-Botox script");

  const ondaIntro = resolveTreatmentKnowledgeByKey("onda_pro")?.approvedIntroReplies[0];
  assert(ondaIntro, "RR5b: ONDA approved introduction fixture must exist");
  const replayedEarlierIntro = ondaIntro
    .replace("非常熱門", "很熱門")
    .replace("全程無痛、", "");
  const result = await renderReplyPlan({
    customerMessage: "好，差異是？",
    dialogueState: dialogueState({ dialogueAct: "explain_combination", treatmentKeys: ["onda_pro", "botox"] }),
    footer: FOOTER,
    generator: async () => ({ model: "fake", text: replayedEarlierIntro, tokensIn: 7, tokensOut: 9 }),
    plan,
    recentTurns: [
      { role: "assistant", text: `${ondaIntro.replace("全程無痛、", "")}\n\n${FOOTER}` },
      { role: "user", text: "雙下巴" },
      { role: "assistant", text: "已記得您在意雙下巴，接著可比較兩個方向。" },
    ],
  });

  assert.equal(result.generated, false, "RR5b: a lightly rewritten earlier introduction must not be customer-visible");
  assert.equal(result.fallbackReason, "repeated_previous_reply", "RR5b: earlier-turn intro replay must be observable");
  assert(!result.replyText.includes("目前醫美界"), "RR5b: fallback must advance instead of replaying the introduction");
}

async function validateSafeNonPriceNumbersAndFooterControl() {
  const result = await renderReplyPlan({
    customerMessage: "恢復期多久",
    dialogueState: dialogueState(),
    footer: FOOTER,
    generator: async () => ({
      model: "fake",
      text: "DERMAPEN 4 的實際安排依個人狀況評估；常見照護觀察可抓 2 至 4 週。",
      tokensIn: 1,
      tokensOut: 1,
    }),
    includeFooter: false,
    plan: treatmentPlan(),
    recentTurns: [],
  });

  assert.equal(result.generated, true, "RR6: non-price numbers must not be mistaken for a quote");
  assert.match(result.replyText, /DERMAPEN 4/u, "RR6: product version number must survive");
  assert.match(result.replyText, /2 至 4 週/u, "RR6: duration must survive");
  assert(!JSON.stringify(result.messages).includes(FOOTER), "RR6: caller must be able to suppress the footer");
}

async function validateGroundingProvenanceAndMedicalScope() {
  const ungrounded = treatmentPlan("這是當輪的安全保底回覆。");
  ungrounded.approvedFacts = [];
  ungrounded.approvedKnowledge = [];
  ungrounded.answerFacts = ["這段只是策略答案，不是診所核准知識。"];

  const unavailableClaim = await renderReplyPlan({
    customerMessage: "海芙可以改善什麼",
    dialogueState: dialogueState({ treatmentKeys: [] }),
    footer: FOOTER,
    generator: async () => ({
      model: "fake",
      text: "本院有提供海芙療程。",
      tokensIn: 1,
      tokensOut: 1,
    }),
    plan: ungrounded,
    recentTurns: [],
  });
  assert.equal(unavailableClaim.fallbackReason, "generator_rejected", "RR7: answer facts alone must not create grounding");
  assert(!unavailableClaim.replyText.includes("本院有提供海芙"), "RR7: an unapproved clinic fact must never reach the customer");
  assert(unavailableClaim.replyText.trim().length > 0, "RR7: rejection must still return a guarded act-specific fallback");
  assert.equal(unavailableClaim.usedGroundedKnowledge, false, "RR7: grounding must retain approved provenance");

  const official = treatmentPlan("這是官方查證失敗時的當輪保底回覆。");
  official.matchedKey = "official_treatment_education:m22_ipl";
  official.treatmentKeys = [];
  official.approvedFacts = [];
  official.approvedKnowledge = [];
  let sawMedical = false;
  const officialResult = await renderReplyPlan({
    customerMessage: "M22 是什麼",
    dialogueState: dialogueState({ topic: "none", treatmentKeys: [] }),
    footer: FOOTER,
    generator: async (_message, context) => {
      sawMedical = context.controlledMedicalFallback === true;
      return { model: "fake", text: "活動價 999 元，本院有提供。", tokensIn: 1, tokensOut: 1 };
    },
    plan: official,
    recentTurns: [],
  });
  assert(sawMedical, "RR7: official treatment education must always use medical constraints");
  assert.equal(officialResult.fallbackReason, "generator_rejected", "RR7: official-search output must still pass the customer guard");

  const approvedAvailability = treatmentPlan("這是院內核准療程的保底回覆。");
  const approvedAvailabilityResult = await renderReplyPlan({
    customerMessage: "你們有 ONDA 嗎",
    dialogueState: dialogueState(),
    footer: FOOTER,
    generator: async () => ({ model: "fake", text: "本院有提供 ONDA PRO。", tokensIn: 1, tokensOut: 1 }),
    plan: approvedAvailability,
    recentTurns: [],
  });
  assert.equal(approvedAvailabilityResult.generated, true, "RR7: an approved clinic offering claim must remain answerable");

  const unapprovedDeviceResult = await renderReplyPlan({
    customerMessage: "你們有海芙嗎",
    dialogueState: dialogueState(),
    footer: FOOTER,
    generator: async () => ({ model: "fake", text: "本院有提供海芙儀器。", tokensIn: 1, tokensOut: 1 }),
    plan: approvedAvailability,
    recentTurns: [],
  });
  assert.equal(unapprovedDeviceResult.fallbackReason, "generator_rejected", "RR7: approved knowledge for one treatment must not authorize another device");
}

async function validateRendererTelemetryContract() {
  const plan = treatmentPlan("本輪安全保底說明。");
  const generated = await renderReplyPlan({
    customerMessage: "雙下巴呢",
    dialogueState: dialogueState(),
    footer: FOOTER,
    generator: async () => ({ model: "fake", text: "可先依雙下巴的脂肪感與緊實需求評估。", tokensIn: 1, tokensOut: 1 }),
    plan,
    recentTurns: [],
  });
  const generatedTelemetry = toReplyRendererTelemetry(generated);
  assert.equal(generatedTelemetry.dialogueAct, "answer_followup", "RR8: telemetry must preserve the canonical act");
  assert.equal(generatedTelemetry.renderMode, "generated", "RR8: successful generation must be tagged generated");
  assert.equal(generatedTelemetry.generatorInvoked, true, "RR8: successful generation must record model invocation");
  assert.equal(generatedTelemetry.generatedVisible, true, "RR8: successful generation must record customer visibility");
  assert.equal(generatedTelemetry.fallbackReason, undefined, "RR8: successful generation must not invent a fallback reason");
  assert(generatedTelemetry.latencyMs >= 0, "RR8: telemetry latency must be non-negative");

  const fallback = await renderReplyPlan({
    customerMessage: "雙下巴呢",
    dialogueState: dialogueState(),
    footer: FOOTER,
    generator: async () => null,
    plan,
    recentTurns: [],
  });
  const fallbackTelemetry = toReplyRendererTelemetry(fallback);
  assert.equal(fallbackTelemetry.renderMode, "fallback", "RR8: unavailable generator must be tagged fallback");
  assert.equal(fallbackTelemetry.generatorInvoked, true, "RR8: unavailable generation must still record the attempted model call");
  assert.equal(fallbackTelemetry.generatedVisible, false, "RR8: fallback must record that generated text was not customer-visible");
  assert.equal(fallbackTelemetry.fallbackReason, "generator_unavailable", "RR8: fallback reason must be queryable");
  assert(fallbackTelemetry.latencyMs >= 0, "RR8: fallback latency must be non-negative");

  const deterministicPlan = treatmentPlan("ONDA Pro 體驗價 16,888 元。");
  deterministicPlan.dialogueAct = "quote_approved_price";
  deterministicPlan.renderMode = "deterministic";
  deterministicPlan.deterministicReply = deterministicPlan.fallbackText;
  deterministicPlan.exactPriceFacts = ["16,888 元"];
  const deterministic = await renderReplyPlan({
    customerMessage: "多少錢",
    dialogueState: dialogueState({ dialogueAct: "quote_approved_price" }),
    footer: FOOTER,
    generator: async () => { throw new Error("must not run"); },
    plan: deterministicPlan,
    recentTurns: [],
  });
  const deterministicTelemetry = toReplyRendererTelemetry(deterministic);
  assert.equal(deterministicTelemetry.renderMode, "deterministic", "RR8: hard price response must be tagged deterministic");
  assert.equal(deterministicTelemetry.generatorInvoked, false, "RR8: deterministic bypass must record that no generator was called");
  assert.equal(deterministicTelemetry.generatedVisible, false, "RR8: deterministic bypass has no customer-visible generated text");
  assert.equal(deterministicTelemetry.fallbackReason, undefined, "RR8: deterministic bypass must not inflate fallback metrics");

  const rejected = await renderReplyPlan({
    customerMessage: "想了解官方資料",
    dialogueState: dialogueState(),
    footer: FOOTER,
    generator: async () => ({
      model: "fake-paid-model",
      sourceUrl: "https://official.example/source",
      text: "資料來源：https://official.example/source",
      tokensIn: 123,
      tokensOut: 45,
    }),
    plan,
    recentTurns: [],
  });
  assert.equal(rejected.fallbackReason, "generator_rejected", "RR8: unsafe generated output must still fall back");
  assert.equal(rejected.model, "fake-paid-model", "RR8: rejected generation must retain model cost metadata");
  assert.equal(rejected.tokensIn, 123, "RR8: rejected generation must retain input token usage");
  assert.equal(rejected.tokensOut, 45, "RR8: rejected generation must retain output token usage");
  assert.equal(rejected.sourceUrl, "https://official.example/source", "RR8: rejected official lookup must retain its internal source URL");
  assert(!JSON.stringify(rejected.messages).includes("official.example"), "RR8: retained internal source URL must not enter customer messages");

  const payload = toReplyRendererPayloadJson(fallbackTelemetry);
  assert.deepEqual(Object.keys(payload).sort(), [
    "renderer_dialogue_act",
    "renderer_fallback_reason",
    "renderer_fallback_variant",
    "renderer_generated_visible",
    "renderer_generator_invoked",
    "renderer_latency_ms",
    "renderer_mode",
  ], "RR8: internal persistence must use a narrow telemetry schema");
  const serialized = JSON.stringify(payload);
  assert(!serialized.includes("雙下巴呢") && !serialized.includes("本輪安全保底"), "RR8: telemetry payload must not persist message or full reply text");
  assert(!serialized.includes("source"), "RR8: telemetry payload must not contain external source URLs");
}

async function main() {
  await validateDeterministicBypass();
  await validateGeneratedReplyAndContext();
  await validateBrandComparisonUsesOfficialBackgroundKnowledge();
  await validateGeneratorFailuresUsePlanFallback();
  await validateFallbackLadderAvoidsPreviousReply();
  await validateFallbackLadderNeverBypassesGuard();
  await validateActivityDatesStayInternalWithoutBlockingDurations();
  await validateFallbackExhaustionNeverReplaysUncheckedText();
  await validateGuardRejectionUsesPlanFallback();
  await validateRepeatProtection();
  await validateActScopedKnowledgeAndEarlierRepeatProtection();
  await validateSafeNonPriceNumbersAndFooterControl();
  await validateGroundingProvenanceAndMedicalScope();
  await validateRendererTelemetryContract();
  console.log("reply renderer validation passed (12 scenario families, no live model calls)");
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
