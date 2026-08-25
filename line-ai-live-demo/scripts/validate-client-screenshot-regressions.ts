import assert from "node:assert/strict";

import {
  appendRecentConversationTurns,
  createEmptyConversationContext,
  type ConversationContext,
} from "../src/lib/conversation-context";
import { routeCustomerMessage, type RouterDecision } from "../src/lib/router";

const NOW = new Date("2026-08-13T08:00:00.000Z");

async function route(message: string, context: ConversationContext) {
  const decision = await routeCustomerMessage({
    conversationContext: context,
    includePending: false,
    message,
    now: NOW,
  });
  return {
    context: appendRecentConversationTurns(decision.nextContext, [
      { role: "user", text: message },
      { role: "assistant", text: decision.replyText },
    ]),
    decision,
  };
}

async function journey(messages: readonly string[], userId: string) {
  let context = createEmptyConversationContext(userId);
  const decisions: RouterDecision[] = [];
  for (const message of messages) {
    const turn = await route(message, context);
    context = turn.context;
    decisions.push(turn.decision);
  }
  return { context, decisions };
}

async function validateBranchQuestionFamilies() {
  const cases: Array<[string, RegExp, RegExp]> = [
    ["你們有哪些館", /高雄館.*台中館.*桃園館.*林口館/su, /地址是|中正路|文心路|經國路/u],
    ["目前有哪幾館", /高雄館.*台中館.*桃園館.*林口館/su, /目前沒有開放/u],
    ["有幾間分館", /共有\s*4\s*間/u, /地址是|中正路|文心路|經國路/u],
    ["現在有幾家", /共有\s*4\s*間/u, /地址是|中正路|文心路|經國路/u],
    ["所有館別在哪", /高雄館.*台中館.*桃園館.*林口館/su, /目前沒有開放/u],
  ];
  for (const [message, expected, forbidden] of cases) {
    const { decisions } = await journey([message], `screen-branch-${message}`);
    const decision = decisions[0];
    assert.equal(decision.matchedKey, "branch_list", `${message}: must use list intent before unknown-branch detection`);
    assert.match(decision.replyText, expected, `${message}: must answer the requested branch fact`);
    assert.doesNotMatch(decision.replyText, forbidden, `${message}: must not dump irrelevant detail or invent an unavailable branch`);
  }


  const nonAddress = await journey(["作用位置在哪一層"], "screen-branch-negative-position");
  assert.notEqual(nonAddress.decisions[0].matchedKey, "branch_list", "a treatment mechanism's 作用位置 must not be treated as a clinic address");
}

async function validateEveryPriceWordingReturnsCurrentApprovedOffer() {
  const contexts = [
    { amount: /16,?888/u, setup: ["想了解ONDA", "雙下巴", "多少錢"] },
    { amount: /12,?999/u, setup: ["想了解ONDA", "雙下巴", "想了解ONDA加肉毒組合", "多少錢"] },
    { amount: /\b999\b/u, setup: ["想了解肉毒", "皺眉紋", "多少錢"] },
  ] as const;
  const followups = [
    "那這個正常價格的話呢",
    "那原價呢",
    "活動結束後多少錢",
    "還有其他價格嗎",
    "那平常怎麼算",
    "優惠沒了呢",
    "非活動期間是多少",
    "平常的價位呢",
  ] as const;
  for (const [contextIndex, { amount, setup }] of contexts.entries()) {
    for (const followup of followups) {
      const base = await journey(setup, `screen-price-${contextIndex}-${followup}`);
      const turn = await route(followup, base.context);
      assert.equal(turn.decision.matchedType, "pricing_campaign", `${followup}: must use the approved current offer`);
      assert.match(turn.decision.replyText, amount, `${followup}: must quote the active approved amount`);
      assert.doesNotMatch(turn.decision.replyText, /尚未有核准資料|我不會自行猜價/u, `${followup}: must not reject a valid active offer`);
    }
  }

  const nonPriceAlternative = await journey(
    ["想了解肉毒", "皺眉紋", "還有其他方案嗎"],
    "screen-price-alternate-negative",
  );
  assert.equal(
    nonPriceAlternative.decisions.at(-1)?.decisionType,
    "treatment_intro_reply",
    "a treatment alternative question without price context must remain a consultation",
  );
}

async function validateBrandComparisonContinuity() {
  const first = await journey(["肉毒有哪些品牌"], "screen-brand");
  assert.equal(first.decisions[0].matchedKey, "treatment_brand:botox");
  const variants = [
    "效果上的差別呢",
    "這三種有什麼差異",
    "哪一種效果比較好",
    "那維持時間呢",
    "品牌差在哪",
    "差在哪裡",
    "各有什麼特色",
    "持久度有差嗎",
    "哪個比較自然",
    "哪個維持比較久",
    "三種各自的優點呢",
  ] as const;
  for (const message of variants) {
    const turn = await route(message, first.context);
    assert.match(turn.decision.matchedKey, /^treatment_brand_comparison:botox:/u, `${message}: must continue the brand task`);
    assert.equal(turn.decision.replyPlan?.dialogueAct, "compare_options", `${message}: must be planned as a comparison`);
    assert.match(turn.decision.replyText, /BOTOX.*Neuronox.*Dysport/su, `${message}: must stay grounded in clinic-approved brands`);
    assert.doesNotMatch(turn.decision.replyText, /肉毒可作為動態紋路/u, `${message}: must not fall back to the generic Botox introduction`);
  }
}

async function validateBookingPolicyDoesNotMutateDraft() {
  const policyQuestions = [
    "要先預約嗎還是直接去就好",
    "一定要預約嗎",
    "可以直接現場去嗎",
    "怎麼預約",
    "我要先預約才能去嗎",
  ] as const;
  const completeDraft: ConversationContext = {
    ...createEmptyConversationContext("screen-booking-draft"),
    activeFocus: {
      answeredTopics: [], areaKeys: [], bookingExplicit: true, concernKeys: [], goal: "book_consultation", treatmentKey: "onda_pro",
    },
    bookingDraft: {
      branch: "高雄館",
      isFirstVisit: "yes",
      name: "王小美",
      phone: "0912345678",
      requestedTimeSlots: ["平日下午", "週六上午", "週日下午"],
      timeSlots: ["平日下午", "週六上午", "週日下午"],
      treatment: "ONDA PRO",
    },
    bookingSession: { action: "replace", lastActiveAt: NOW.toISOString(), status: "collecting" },
    lastSeenAt: NOW.toISOString(),
    lastIntent: "booking_intake",
  };
  const freshCompleteDraft = () => structuredClone(completeDraft);
  for (const [index, message] of policyQuestions.entries()) {
    for (const context of [createEmptyConversationContext(`screen-policy-${index}`), freshCompleteDraft()]) {
      const beforeDraft = structuredClone(context.bookingDraft);
      const turn = await route(message, context);
      assert.equal(turn.decision.matchedKey, "appointment_policy", `${message}: must answer appointment policy`);
      assert.equal(turn.decision.replyPlan?.dialogueAct, "answer_clinic_info", `${message}: must not become collect_booking`);
      if (beforeDraft.treatment) {
        const normalizeDraft = (draft: ConversationContext["bookingDraft"]) => ({
          branch: draft.branch,
          campaignId: draft.campaignId,
          campaignName: draft.campaignName,
          isFirstVisit: draft.isFirstVisit,
          name: draft.name,
          phone: draft.phone,
          requestedTimeSlots: draft.requestedTimeSlots ?? [],
          timeSlots: draft.timeSlots,
          treatment: draft.treatment,
        });
        assert.deepEqual(normalizeDraft(turn.decision.nextContext.bookingDraft), normalizeDraft(beforeDraft), `${message}: must preserve the draft byte-for-byte`);
      } else {
        assert.equal(Boolean(turn.decision.nextContext.bookingDraft.treatment), false, `${message}: must not invent booking data`);
        assert.equal(turn.decision.nextContext.bookingDraft.timeSlots.length, 0, `${message}: must not invent time slots`);
      }
    }
  }

  for (const message of ["我想預約肉毒", "我要約 ONDA", "幫我約 ONDA", "安排 ONDA 療程", "麻煩幫我安排肉毒諮詢"] as const) {
    const turn = await route(message, createEmptyConversationContext(`screen-create-${message}`));
    assert.equal(turn.decision.matchedKey, "booking_intake", `${message}: explicit commitment must start booking`);
    assert.equal(turn.decision.replyPlan?.dialogueAct, "collect_booking", `${message}: explicit booking must collect the next missing field`);
  }
}

async function main() {
  await validateBranchQuestionFamilies();
  await validateEveryPriceWordingReturnsCurrentApprovedOffer();
  await validateBrandComparisonContinuity();
  await validateBookingPolicyDoesNotMutateDraft();
  console.log("client screenshot regressions validation passed (four semantic families)");
}

main().catch((error) => {
  console.error("FAIL:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
