import assert from "node:assert/strict";

import {
  appendRecentConversationTurns,
  createEmptyConversationContext,
  type ConversationContext,
} from "../src/lib/conversation-context";
import { createEmptyConversationState } from "../src/lib/conversation-state";
import { hydrateDialogueState } from "../src/lib/dialogue-state";
import { renderReplyPlan, type ReplyGenerator } from "../src/lib/reply-renderer";
import { buildApprovedKnowledge } from "../src/lib/reply-plan";
import { routeCustomerMessage, type RouterDecision } from "../src/lib/router";
import { findAllTreatmentsByMessage } from "../src/lib/clinic-config";

const NOW = new Date("2026-08-12T11:17:00.000Z");
const FOOTER = "以上為 AI 客服順順初步回覆。";
const ONDA_INTRO_MARKER = "ONDA Pro 是非侵入式的 Coolwaves®";

type JourneyTurn = {
  context: ConversationContext;
  decision: RouterDecision;
  message: string;
  priorContext: ConversationContext;
};

function containsOndaIntro(text: string) {
  return text.includes(ONDA_INTRO_MARKER);
}

function includesAll<T>(values: readonly T[] | undefined, expected: readonly T[]) {
  return expected.every((value) => values?.includes(value));
}

async function routeTurn(message: string, context: ConversationContext): Promise<JourneyTurn> {
  const decision = await routeCustomerMessage({
    conversationContext: context,
    includePending: false,
    message,
    now: NOW,
  });
  const nextContext = appendRecentConversationTurns(decision.nextContext, [
    { role: "user", text: message },
    { role: "assistant", text: decision.replyText },
  ]);
  return { context: nextContext, decision, message, priorContext: context };
}

async function routeJourney(messages: readonly string[], userId: string) {
  let context = createEmptyConversationContext(userId);
  const turns: JourneyTurn[] = [];
  for (const message of messages) {
    const turn = await routeTurn(message, context);
    turns.push(turn);
    context = turn.context;
  }
  return turns;
}

function assertCombinationTurn(turn: JourneyTurn, label: string) {
  assert.equal(
    turn.decision.replyPlan?.dialogueAct,
    "explain_combination",
    `${label}: combination request must own the ReplyPlan act`,
  );
  assert.equal(
    turn.context.dialogueState?.dialogueAct,
    "explain_combination",
    `${label}: canonical state must agree with the ReplyPlan act`,
  );
  assert(
    includesAll(turn.context.dialogueState?.treatmentKeys, ["onda_pro", "botox"]),
    `${label}: ONDA and Botox must both remain in canonical treatment ownership`,
  );
  assert(!containsOndaIntro(turn.decision.replyText), `${label}: combination follow-up must not replay the ONDA introduction`);
}

async function validateScreenshotJourneyVerbatim() {
  const messages = [
    "想了解ONDA",
    "雙下巴",
    "想了解ONDA+肉毒的組合",
    "嘴邊肉",
    "想了解ONDA體驗價",
    "雙下巴",
    "好差異是?",
  ] as const;
  const turns = await routeJourney(messages, "dialogue-root-screenshot");

  assert(containsOndaIntro(turns[0].decision.replyText), "DR1: only the first turn should contain the approved ONDA introduction");
  assert(turns[1].context.dialogueState?.concernKeys.includes("jawline_looseness"), "DR1: double chin must become a known concern");

  const concernBeforeCombination = [...(turns[1].context.dialogueState?.concernKeys ?? [])];
  assertCombinationTurn(turns[2], "DR1-turn3");
  assert(
    includesAll(turns[2].context.dialogueState?.concernKeys, concernBeforeCombination),
    "DR1-turn3: opening a combination topic must not clear the known double-chin concern",
  );
  assert.equal(turns[2].context.dialogueState?.awaiting?.kind, "priority", "DR1-turn3: combination explanation must persist its next question");

  assert(
    turns[3].context.dialogueState?.concernKeys.includes("jawline_looseness"),
    "DR1-turn4: the short mouth-corner concern must stay in the same lower-face episode",
  );
  assert.equal(turns[4].decision.decisionType, "pricing_auto_reply", "DR1-turn5: explicit ONDA trial price must remain deterministic");
  assert.match(turns[4].decision.replyText, /16,?888/u, "DR1-turn5: the approved ONDA trial price must be returned");

  assertCombinationTurn(turns[6], "DR1-turn7");
  assert.equal(turns[5].context.dialogueState?.awaiting?.kind, "combination", "DR1-turn6: the offer to compare must persist an awaiting combination task");
  assert.equal(turns[6].context.dialogueState?.awaiting?.kind, "priority", "DR1-turn7: answered comparison must advance to the next priority question");
  assert(
    turns[6].decision.replyText !== turns[5].decision.replyText,
    "DR1-turn7: the answer must advance from the previous need-confirmation turn",
  );
  assert(
    /(?:差異|差別|不同|搭配|ONDA).*(?:肉毒)|(?:肉毒).*(?:差異|差別|不同|搭配|ONDA)/u.test(turns[6].decision.replyText),
    `DR1-turn7: elliptical follow-up must actually answer the combination difference; got ${JSON.stringify(turns[6].decision.replyText)}`,
  );

  for (const [index, turn] of turns.entries()) {
    if (index === 0) continue;
    assert(!containsOndaIntro(turn.decision.replyText), `DR1-turn${index + 1}: no non-first turn may replay the ONDA introduction`);
  }
}

async function validateExplicitCombinationSemanticFamily() {
  const variants = [
    "想了解ONDA+肉毒的組合",
    "ONDA跟肉毒一起做呢",
    "ONDA配肉毒怎麼樣",
    "想比較ONDA和肉毒的搭配",
    "如果ONDA搭肉毒呢",
    "ONDA跟肉毒可以同時做嗎",
    "ONDA及肉毒能同次做嗎",
  ] as const;

  for (const [index, variant] of variants.entries()) {
    const turns = await routeJourney(["想了解ONDA", "雙下巴", variant], `dialogue-root-explicit-${index}`);
    assertCombinationTurn(turns[2], `DR2-${variant}`);
    assert(
      turns[2].context.dialogueState?.concernKeys.includes("jawline_looseness"),
      `DR2-${variant}: semantic variant must preserve the known concern`,
    );
  }
}

async function validateEllipticalCombinationSemanticFamily() {
  const variants = [
    "好差異是?",
    "那兩個有什麼不同",
    "所以單做跟一起做差在哪",
    "可以說明差別嗎",
    "為什麼需要一起做",
  ] as const;

  for (const [index, variant] of variants.entries()) {
    const turns = await routeJourney(
      ["想了解ONDA", "雙下巴", "想了解ONDA+肉毒的組合", variant],
      `dialogue-root-elliptical-${index}`,
    );
    assertCombinationTurn(turns[3], `DR3-${variant}`);
    assert(
      turns[3].context.dialogueState?.concernKeys.includes("jawline_looseness"),
      `DR3-${variant}: elliptical follow-up must retain the previously known concern`,
    );
  }
}

async function validateRouteToRendererUsesThePlan() {
  const turns = await routeJourney(
    ["想了解ONDA", "雙下巴", "想了解ONDA+肉毒的組合"],
    "dialogue-root-renderer-success",
  );
  const turn = turns[2];
  const plan = turn.decision.replyPlan;
  assert(plan, "DR4: routed treatment turn must expose a ReplyPlan");
  assert.equal(plan.dialogueAct, "explain_combination", "DR4: renderer integration must start from the combination plan");

  let generatorCalls = 0;
  const generator: ReplyGenerator = async (_message, context) => {
    generatorCalls += 1;
    assert.equal(context.focusGoal, "explain_combination", "DR4: generator must receive the canonical act");
    assert(context.recentTurns?.some((recent) => recent.text.includes("雙下巴")), "DR4: generator must receive recent conversational context");
    return {
      model: "fake-dialogue-root-model",
      text: "🌿 已承接您在意的雙下巴，接著比較 ONDA Pro 與肉毒的評估方向；實際搭配仍由醫師現場評估。",
      tokensIn: 12,
      tokensOut: 28,
    };
  };
  const lifecycle = createEmptyConversationState(turn.context.userId);
  const dialogueState = hydrateDialogueState(turn.context, lifecycle, { now: NOW });
  const rendered = await renderReplyPlan({
    customerMessage: turn.message,
    dialogueState,
    footer: FOOTER,
    generator,
    plan,
    recentTurns: turn.priorContext.recentTurns ?? [],
  });

  assert.equal(generatorCalls, 1, "DR4: eligible treatment plan must call the injected renderer exactly once");
  assert.equal(rendered.generated, true, "DR4: accepted generated answer must be customer-visible");
  assert.equal(rendered.model, "fake-dialogue-root-model", "DR4: renderer telemetry must preserve the selected model");
  assert.notEqual(rendered.replyText, plan.fallbackText, "DR4: successful generation must not copy the legacy fallback wholesale");
  assert(!containsOndaIntro(rendered.replyText), "DR4: successful combination generation must not replay the first-turn intro");
  assert.match(rendered.replyText, /已承接.*雙下巴/u, "DR4: generated answer must visibly carry the known need forward");
}

async function validateUnapprovedCombination() {
  const variants = [
    "ONDA跟皮秒一起做呢",
    "想比較ONDA與探索皮秒",
    "ONDA配皮秒有什麼不同",
    "ONDA及皮秒可以同時做嗎",
    "ONDA皮秒可以同時做嗎",
  ] as const;
  for (const [index, variant] of variants.entries()) {
    const wrongPair = await routeJourney(
      ["想了解ONDA", "雙下巴", variant],
      `dialogue-root-wrong-pair-${index}`,
    );
    const turn = wrongPair[2];
    assert.equal(turn.decision.replyPlan?.dialogueAct, "compare_options", `DR5-${variant}: unapproved pair must use generic comparison`);
    assert.match(turn.decision.matchedKey, /^treatment_compare:onda_pro:pico$/u, `DR5-${variant}: actual pair must own the route`);
    assert(includesAll(turn.decision.replyPlan?.treatmentKeys, ["onda_pro", "pico"]), `DR5-${variant}: plan must contain only the actual pair`);
    assert(includesAll(turn.context.dialogueState?.treatmentKeys, ["onda_pro", "pico"]), `DR5-${variant}: canonical state must retain the actual pair`);
    const visibleAndKnowledge = `${turn.decision.replyText}\n${turn.decision.replyPlan ? buildApprovedKnowledge(turn.decision.replyPlan) : ""}\n${turn.decision.replyPlan?.recommendationReasons.join("\n") ?? ""}`;
    assert(!/(?:botox|肉毒|咀嚼肌|Neuronox)/iu.test(visibleAndKnowledge), `DR5-${variant}: generic comparison must not leak Botox content`);
  }

  const switchedPair = await routeJourney(
    ["想了解ONDA", "雙下巴", "想了解ONDA+肉毒的組合", "ONDA跟皮秒一起做呢"],
    "dialogue-root-switch-unapproved-pair",
  );
  assert.deepEqual(switchedPair[3].context.dialogueState?.treatmentKeys, ["onda_pro", "pico"], "DR5b: an explicit new pair must replace the previous combo ownership");
  assert(!/(?:botox|肉毒|咀嚼肌|Neuronox)/iu.test(`${switchedPair[3].decision.replyText}\n${buildApprovedKnowledge(switchedPair[3].decision.replyPlan!)}`), "DR5b: switching pairs must remove old Botox knowledge");

  const switchedBackApproved = await routeJourney(
    ["想了解ONDA跟皮秒一起做", "ONDA跟肉毒一起做呢"],
    "dialogue-root-switch-approved-pair",
  );
  assert.equal(switchedBackApproved[1].decision.replyPlan?.dialogueAct, "explain_combination", "DR5c: switching to approved pair must use approved combination act");
  assert.deepEqual(switchedBackApproved[1].context.dialogueState?.treatmentKeys, ["onda_pro", "botox"], "DR5c: approved pair must replace the previous unapproved pair ownership");
}

async function validateNegatedCombinationToSingle() {
  const declined = await routeJourney(
    ["想了解ONDA", "雙下巴", "想了解ONDA+肉毒的組合", "我不要肉毒，只想做ONDA", "多少錢"],
    "dialogue-root-decline",
  );
  assert.equal(declined[3].decision.replyPlan?.dialogueAct, "handle_objection", "DR6: declining Botox must become a single-treatment objection turn");
  assert.deepEqual(declined[3].context.dialogueState?.treatmentKeys, ["onda_pro"], "DR6: declining Botox must remove it from canonical treatment ownership");
  assert(declined[3].context.dialogueState?.concernKeys.includes("jawline_looseness"), "DR6: declining the combination must preserve the known double-chin concern");
  assert(!containsOndaIntro(declined[3].decision.replyText), "DR6: declining the combination must not replay the ONDA introduction");
  assert.match(declined[4].decision.replyText, /16,?888/u, `DR6: price after declining Botox must belong to ONDA only; got ${JSON.stringify(declined[4].decision.replyText)}`);
  assert(!declined[4].decision.replyText.includes("12,999"), "DR6: declined combination price must not survive");

  const delayedPrice = await routeJourney(
    ["想了解ONDA", "雙下巴", "想了解ONDA加肉毒組合", "我不要肉毒，只做ONDA", "冷卻系統是什麼", "多少錢"],
    "dialogue-root-delayed-price-after-decline",
  );
  assert.deepEqual(delayedPrice[4].context.dialogueState?.treatmentKeys, ["onda_pro"], "DR6a: an intervening follow-up must preserve the ONDA-only selection");
  assert.match(delayedPrice[5].decision.replyText, /16,?888/u, "DR6a: a declined combo must not revive after an intervening follow-up");
  assert(!delayedPrice[5].decision.replyText.includes("12,999"), "DR6a: stale combo campaign must remain ineligible after later turns");
}

async function validateTreatmentPolarityAcrossConversationAndBooking() {
  const variants = [
    "肉毒先不要，我只要ONDA",
    "我只要ONDA，肉毒先不要",
    "除了肉毒以外想了解ONDA",
  ] as const;
  for (const [index, variant] of variants.entries()) {
    const turns = await routeJourney(
      ["想了解ONDA+肉毒的組合", "我想預約", variant, "多少錢"],
      `dialogue-root-polarity-${index}`,
    );
    assert.deepEqual(turns[2].context.dialogueState?.treatmentKeys, ["onda_pro"], `DR6c-${variant}: canonical state must remove Botox`);
    assert(!/(?:肉毒|BOTOX)/iu.test(turns[2].context.bookingDraft.treatment ?? ""), `DR6c-${variant}: booking draft must remove excluded treatment`);
    assert.match(turns[3].decision.replyText, /16,?888/u, `DR6c-${variant}: price must belong to ONDA`);
    assert(!turns[3].decision.replyText.includes("12,999"), `DR6c-${variant}: combination price must not survive exclusion`);
  }

  const neutral = await routeJourney(
    ["想了解ONDA+肉毒的組合", "ONDA不是肉毒"],
    "dialogue-root-neutral-identity",
  );
  assert(includesAll(neutral[1].context.dialogueState?.treatmentKeys, ["onda_pro", "botox"]), "DR6d: identity contrast must not silently shrink a combo");

  const corrections = [
    ["把 ONDA 換成肉毒", "botox", /肉毒/u],
    ["更正為 ONDA", "onda_pro", /ONDA PRO/u],
  ] as const;
  for (const [message, expectedKey, expectedBooking] of corrections) {
    const turns = await routeJourney(
      ["想了解ONDA+肉毒的組合", "我想預約", message],
      `dialogue-root-correction-${expectedKey}`,
    );
    assert.deepEqual(turns[2].context.dialogueState?.treatmentKeys, [expectedKey], `DR6e-${message}: correction must replace canonical treatment ownership`);
    assert.match(turns[2].context.bookingDraft.treatment ?? "", expectedBooking, `DR6e-${message}: correction must replace booking treatment`);
    assert.equal((turns[2].context.bookingDraft.treatment ?? "").split("、").length, 1, `DR6e-${message}: correction must leave one booking treatment`);
    if (expectedKey === "onda_pro") {
      assert(!/(?:肉毒|咀嚼肌)/u.test(turns[2].decision.replyText), `DR6e-${message}: correction to ONDA must not immediately push the removed Botox direction again`);
    }
  }

  for (const [index, message] of ["肉毒不是不能做", "ONDA不是肉毒"].entries()) {
    const neutralTurn = await routeJourney(
      ["想了解ONDA", "雙下巴", "想了解ONDA+肉毒的組合", "我想預約", message],
      `dialogue-root-neutral-${index}`,
    );
    assert(includesAll(neutralTurn[4].context.dialogueState?.treatmentKeys, ["onda_pro", "botox"]), `DR6f-${message}: neutral contrast must not shrink canonical combo`);
    assert(/ONDA PRO/u.test(neutralTurn[4].context.bookingDraft.treatment ?? "") && /肉毒/u.test(neutralTurn[4].context.bookingDraft.treatment ?? ""), `DR6f-${message}: neutral contrast must not shrink booking combo`);
  }

  const negativeOnly = await routeJourney(
    ["想了解肉毒", "肉毒先不要", "多少錢"],
    "dialogue-root-negative-only",
  );
  assert.deepEqual(negativeOnly[1].context.dialogueState?.treatmentKeys, [], "DR6g: rejecting the only treatment must clear canonical ownership");
  assert.equal(negativeOnly[2].decision.matchedKey, "pricing_followup", "DR6g: later price inquiry must clarify instead of quoting the rejected treatment");
  assert(!/999/u.test(negativeOnly[2].decision.replyText), "DR6g: rejected Botox price must not survive");

  const bookingNegativeOnly = await routeJourney(
    ["我想預約肉毒", "肉毒先不要", "多少錢"],
    "dialogue-root-booking-negative-only",
  );
  assert.deepEqual(bookingNegativeOnly[1].context.dialogueState?.treatmentKeys, [], "DR6g2: rejecting the only booked treatment must clear canonical ownership");
  assert.equal(bookingNegativeOnly[1].context.bookingDraft.treatment, undefined, "DR6g2: rejecting the only booked treatment must clear booking ownership");
  assert.equal(bookingNegativeOnly[1].context.activeFocus?.treatmentKey, undefined, "DR6g2: rejected treatment must not survive in legacy booking focus");
  assert.equal(bookingNegativeOnly[2].decision.matchedKey, "pricing_followup", "DR6g2: later booking price inquiry must clarify");
  assert.deepEqual(bookingNegativeOnly[2].context.dialogueState?.treatmentKeys, [], "DR6g2: later pricing must not resurrect the rejected treatment");

  const comboNegativeOnly = await routeJourney(
    ["想了解ONDA", "雙下巴", "想了解ONDA+肉毒的組合", "肉毒先不要"],
    "dialogue-root-combo-negative-only",
  );
  assert.deepEqual(comboNegativeOnly[3].context.dialogueState?.treatmentKeys, ["onda_pro"], "DR6h: rejecting one member of a combo must retain the other treatment");
  for (const [index, message] of ["我不要搭肉毒", "我不搭配肉毒", "先不要搭肉毒"].entries()) {
    const declinedPair = await routeJourney(
      ["想了解ONDA", "雙下巴", "想了解ONDA+肉毒的組合", "我想預約", message],
      `dialogue-root-decline-pair-${index}`,
    );
    assert.deepEqual(declinedPair[4].context.dialogueState?.treatmentKeys, ["onda_pro"], `DR6h-${message}: declining a paired treatment must retain ONDA`);
    assert.equal(declinedPair[4].context.bookingDraft.treatment, "ONDA PRO", `DR6h-${message}: booking must remove the declined pair member`);
  }
  const aliasFirstDecline = await routeJourney(
    ["想了解ONDA", "雙下巴", "肉毒不搭", "多少錢"],
    "dialogue-root-alias-first-decline",
  );
  assert.deepEqual(aliasFirstDecline[2].context.dialogueState?.treatmentKeys, ["onda_pro"], "DR6h1: alias-first decline must retain ONDA ownership");
  assert.match(aliasFirstDecline[3].decision.replyText, /16,?888/u, "DR6h1: alias-first decline must make later price belong to ONDA");
  assert(!aliasFirstDecline[3].decision.replyText.includes("12,999"), "DR6h1: alias-first decline must not revive combo campaign");
  for (const [index, message] of ["先不考慮一起做", "先不要搭配了", "我不想一起做"].entries()) {
    const declinedUnnamedPair = await routeJourney(
      ["想了解ONDA", "雙下巴", "想了解ONDA+肉毒的組合", message, "多少錢"],
      `dialogue-root-decline-unnamed-pair-${index}`,
    );
    assert.deepEqual(declinedUnnamedPair[3].context.dialogueState?.treatmentKeys, ["onda_pro"], `DR6h2-${message}: unnamed combination decline must retain only the primary treatment`);
    assert.match(declinedUnnamedPair[4].decision.replyText, /16,?888/u, `DR6h2-${message}: later price must belong to ONDA`);
    assert(!declinedUnnamedPair[4].decision.replyText.includes("12,999"), `DR6h2-${message}: declined combo price must not survive`);
  }
  const unnamedBookingDecline = await routeJourney(
    ["想了解ONDA", "雙下巴", "想了解ONDA+肉毒的組合", "我想預約", "我不想一起做", "多少錢"],
    "dialogue-root-unnamed-booking-decline",
  );
  assert.equal(unnamedBookingDecline[4].context.bookingDraft.treatment, "ONDA PRO", "DR6h3: unnamed decline must align the active booking draft to ONDA");
  assert.match(unnamedBookingDecline[5].decision.replyText, /16,?888/u, "DR6h3: aligned booking must return ONDA price");

  const singleBookingNeutral = await routeJourney(
    ["我想預約ONDA", "肉毒不是不能做"],
    "dialogue-root-single-booking-neutral",
  );
  assert.deepEqual(singleBookingNeutral[1].context.dialogueState?.treatmentKeys, ["onda_pro"], "DR6i: neutral double negation must restore exact prior single-treatment ownership");
  assert.equal(singleBookingNeutral[1].context.bookingDraft.treatment, "ONDA PRO", "DR6i: neutral double negation must not change booking treatment");
  assert.equal(singleBookingNeutral[1].context.activeFocus?.treatmentKey, "onda_pro", "DR6i: neutral statement must not switch legacy focus");
  assert.equal(singleBookingNeutral[1].decision.matchedKey, "treatment_neutral_clarification", "DR6i: neutral statement must clarify instead of opening a new treatment");
  const neutralFollowup = await routeTurn("那有什麼差異", singleBookingNeutral[1].context);
  assert.deepEqual(neutralFollowup.context.dialogueState?.treatmentKeys, ["onda_pro"], "DR6i: an elliptical follow-up must continue from one consistent owner");
}

async function validateAffirmativeCombinationToSingle() {
  const single = await routeJourney(
    ["想了解ONDA", "雙下巴", "想了解ONDA+肉毒的組合", "那我先只了解ONDA單做"],
    "dialogue-root-single-after-combo",
  );
  assert.equal(single[3].decision.replyPlan?.dialogueAct, "handle_objection", "DR6b: affirmative single-treatment preference must leave combination explanation mode");
  assert.deepEqual(single[3].context.dialogueState?.treatmentKeys, ["onda_pro"], "DR6b: affirmative ONDA-only follow-up must contract canonical ownership to ONDA");
  assert(single[3].context.dialogueState?.concernKeys.includes("jawline_looseness"), "DR6b: choosing ONDA only must preserve the known double-chin concern");
  assert(!containsOndaIntro(single[3].decision.replyText), "DR6b: choosing ONDA only after a combination must not replay the introduction");
}

async function validateUnrelatedWhyAfterCombination() {
  const variants = ["ONDA為什麼需要冷卻？", "冷卻系統做什麼", "控溫有什麼用"] as const;
  for (const [index, variant] of variants.entries()) {
    const unrelatedWhy = await routeJourney(
      ["想了解ONDA", "雙下巴", "想了解ONDA+肉毒的組合", variant],
      `dialogue-root-unrelated-why-${index}`,
    );
    const turn = unrelatedWhy[3];
    assert.notEqual(turn.decision.replyPlan?.dialogueAct, "explain_combination", `DR7-${variant}: cooling question must leave combination mode`);
    assert.equal(turn.decision.matchedKey, "treatment_consult:onda_pro:cooling_control", `DR7-${variant}: cooling pack must own the route`);
    assert.deepEqual(turn.decision.replyPlan?.treatmentKeys, ["onda_pro"], `DR7-${variant}: cooling knowledge ownership must be scoped to ONDA`);
    assert.match(turn.decision.replyText, /(?:冷卻|控溫).*(?:肌膚|舒適)/u, `DR7-${variant}: approved answer must explain cooling`);
    assert(!/(?:肉毒|咀嚼肌)/u.test(turn.decision.replyText), `DR7-${variant}: cooling reply must not leak combination copy`);
    assert(!/(?:肉毒|咀嚼肌|Neuronox)/u.test(buildApprovedKnowledge(turn.decision.replyPlan!)), `DR7-${variant}: model knowledge must not leak combo treatment facts`);
  }
}

async function validateRelatedTreatmentKnowledgeOwnership() {
  for (const [index, message] of ["肉毒功效", "咀嚼肌", "國字臉"].entries()) {
    const turns = await routeJourney(
      ["想了解ONDA", "雙下巴", message],
      `dialogue-root-related-knowledge-${index}`,
    );
    const turn = turns[2];
    assert.equal(turn.decision.matchedKey, "treatment_consult:onda_pro:related:botox_small_face:botox", `DR7b-${message}: related pack answer must carry its configured target owner`);
    assert(includesAll(turn.decision.replyPlan?.treatmentKeys, ["onda_pro", "botox"]), `DR7b-${message}: related answer must retain both relevant treatment knowledge owners`);
    assert.match(buildApprovedKnowledge(turn.decision.replyPlan!), /肉毒/u, `DR7b-${message}: related answer model context must include Botox facts`);
  }
}

async function validateConcernKnowledgeOwnershipAfterCombination() {
  for (const [index, concern] of ["肚子", "雙下巴"].entries()) {
    const turns = await routeJourney(
      ["想了解ONDA", "雙下巴", "想了解ONDA+肉毒的組合", concern],
      `dialogue-root-pack-owner-${index}`,
    );
    const turn = turns[3];
    assert.equal(turn.decision.matchedKey, "treatment_consult:onda_pro", `DR7c-${concern}: ONDA pack must own the concern answer`);
    assert.deepEqual(turn.decision.replyPlan?.treatmentKeys, ["onda_pro"], `DR7c-${concern}: concern knowledge must scope to pack owner`);
    assert(!/(?:肉毒|咀嚼肌|Neuronox)/u.test(buildApprovedKnowledge(turn.decision.replyPlan!)), `DR7c-${concern}: pack concern model knowledge must not leak combo facts`);
  }
}

async function validateCombinationBookingOwnership() {
  const booking = await routeJourney(
    ["想了解ONDA", "雙下巴", "想了解ONDA+肉毒的組合", "我想預約"],
    "dialogue-root-combo-booking",
  );
  assert.match(booking[3].context.bookingDraft.treatment ?? "", /ONDA PRO/u, "DR8: combination booking must retain ONDA");
  assert.match(booking[3].context.bookingDraft.treatment ?? "", /肉毒/u, "DR8: combination booking must retain Botox");
}

async function validateTreatmentAliases() {
  assert.deepEqual(findAllTreatmentsByMessage("蜂巢皮秒").map((item) => item.key), ["pico_honeycomb_tip"], "DR9: shared honeycomb alias must resolve to one treatment");

  const approvedPairAliases = await routeJourney(
    ["想了解ONDA", "雙下巴", "超微波搭Botox怎麼樣"],
    "dialogue-root-combination-aliases",
  );
  assertCombinationTurn(approvedPairAliases[2], "DR9b-approved-pair-aliases");
  assert(approvedPairAliases[2].context.dialogueState?.concernKeys.includes("jawline_looseness"), "DR9b: aliases must preserve the known concern while opening the approved combination");
}

async function validateExplicitRestart() {
  const restart = await routeJourney(
    ["想了解ONDA", "雙下巴", "請從頭介紹ONDA"],
    "dialogue-root-restart",
  );
  assert.notEqual(restart[2].context.dialogueState?.episodeId, restart[1].context.dialogueState?.episodeId, "DR10: explicit restart must open a new episode");
  assert.equal(restart[2].decision.replyPlan?.dialogueAct, "introduce_treatment", "DR10: explicit restart must intentionally return to the introduction act");
  assert.deepEqual(restart[2].context.dialogueState?.treatmentKeys, ["onda_pro"], "DR10: explicit restart must retain only the requested treatment");
  assert.deepEqual(restart[2].context.dialogueState?.concernKeys, [], "DR10: explicit restart must clear canonical concerns");
  assert.deepEqual(restart[2].context.dialogueState?.answeredTopics, [], "DR10: explicit restart must clear canonical answered topics");
  assert.equal(restart[2].context.dialogueState?.awaiting?.kind, "concern", "DR10: restarted introduction must await fresh need discovery");
  assert(containsOndaIntro(restart[2].decision.replyText), "DR10: explicit restart must intentionally replay the introduction");
}

async function main() {
  const scenarios = [
    ["verbatim screenshot journey", validateScreenshotJourneyVerbatim],
    ["explicit combination semantic family", validateExplicitCombinationSemanticFamily],
    ["elliptical combination semantic family", validateEllipticalCombinationSemanticFamily],
    ["route-to-renderer integration", validateRouteToRendererUsesThePlan],
    ["unapproved combination", validateUnapprovedCombination],
    ["negated combination to single", validateNegatedCombinationToSingle],
    ["treatment polarity across conversation and booking", validateTreatmentPolarityAcrossConversationAndBooking],
    ["affirmative combination to single", validateAffirmativeCombinationToSingle],
    ["unrelated why after combination", validateUnrelatedWhyAfterCombination],
    ["related treatment knowledge ownership", validateRelatedTreatmentKnowledgeOwnership],
    ["concern knowledge ownership after combination", validateConcernKnowledgeOwnershipAfterCombination],
    ["combination booking ownership", validateCombinationBookingOwnership],
    ["treatment aliases", validateTreatmentAliases],
    ["explicit restart", validateExplicitRestart],
  ] as const;
  const failures: string[] = [];
  for (const [name, validate] of scenarios) {
    try {
      await validate();
      console.log(`PASS: ${name}`);
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
  console.log("dialogue root-fix validation passed (verbatim journey, semantic families, renderer integration)");
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
