import {
  buildApprovedKnowledge,
  getReplyPlanFallback,
  inferDialogueActFromLegacy,
  legacyDecisionToReplyPlan,
  shouldGenerateReply,
  shouldUseDeterministicReply,
} from "../src/lib/reply-plan";
import { applyControlledScheduleDecision, shouldSuppressOuterAiFooter } from "../src/lib/line-webhook";
import { createEmptyConversationContext } from "../src/lib/conversation-context";
import { clinicConfig } from "../src/lib/clinic-config";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function validateHardDeterministicPolicies() {
  const hardRoutes = [
    ["handoff_pending", "handoff_rule", "post_procedure_emergency"],
    ["pricing_auto_reply", "pricing_campaign", "ONDA PRO"],
    ["booking_intake_reply", "guided_reply", "booking_intake"],
    ["clinic_info_reply", "config", "branch_address:高雄館"],
    ["medical_guidance_reply", "guided_reply", "pregnancy_caution"],
    ["doctor_schedule_auto_reply", "doctor_schedule", "doctor_schedule"],
  ] as const;

  for (const [decisionType, matchedType, matchedKey] of hardRoutes) {
    const plan = legacyDecisionToReplyPlan(
      { decisionType, matchedKey, matchedType, replyText: "固定核准回覆" },
      { renderMode: "generated" },
    );
    assert(plan.renderMode === "deterministic", `RP1: ${decisionType} must remain deterministic`);
    assert(!shouldGenerateReply(plan), `RP1: ${decisionType} must never invoke a reply model`);
  }
}

function validateGeneratedTreatmentPlan() {
  const plan = legacyDecisionToReplyPlan(
    {
      decisionType: "treatment_intro_reply",
      matchedKey: "treatment_consult:onda_pro:behavior:combination_comparison",
      matchedType: "guided_reply",
      replyText: "ONDA Pro 與肉毒的核准比較底稿。",
    },
    {
      approvedFacts: [" ONDA Pro 處理局部脂肪與緊實方向 ", "肉毒小臉著重咀嚼肌", "肉毒小臉著重咀嚼肌"],
      concernKeys: ["jawline_looseness", "jawline_looseness"],
      exactPriceFacts: ["12,999 元"],
      nextQuestion: " 比較在意脂肪感還是咀嚼肌呢？ ",
      treatmentKeys: ["onda_pro", "botox"],
    },
  );

  assert(plan.dialogueAct === "explain_combination", "RP2: combination comparison must map to explain_combination");
  assert(plan.renderMode === "generated" && shouldGenerateReply(plan), "RP2: ordinary consultation should be generated");
  assert(plan.approvedFacts.length === 2, "RP2: approved facts must be normalized and de-duplicated");
  assert(plan.concernKeys.length === 1, "RP2: concern keys must be de-duplicated");
  assert(plan.nextQuestion === "比較在意脂肪感還是咀嚼肌呢？", "RP2: next question must be normalized");
  const approvedKnowledge = buildApprovedKnowledge(plan);
  assert(!approvedKnowledge.includes("肉毒小臉著重咀嚼肌"), "RP2: approvedFacts alone must not be mislabeled as approved knowledge");
  assert(approvedKnowledge.includes("ONDA PRO可評估方向"), "RP2: comparison plans must receive structured treatment directions");
  assert(approvedKnowledge.includes("搭配評估理由"), "RP2: an approved combination plan must receive clinic-approved combination reasons");

  const ordinaryComparison = {
    ...plan,
    dialogueAct: "compare_options" as const,
    recommendationReasons: [],
  };
  const comparisonKnowledge = buildApprovedKnowledge(ordinaryComparison);
  assert(comparisonKnowledge.includes("ONDA PRO可評估方向"), "RP2: ordinary comparisons must retain structured treatment directions");
  assert(!comparisonKnowledge.includes("搭配評估理由"), "RP2: ordinary comparisons must not inherit combination-only reasons");
  assert(getReplyPlanFallback(plan) === "ONDA Pro 與肉毒的核准比較底稿。", "RP2: legacy text must remain the fallback");
}

function validateCoolingControlKnowledge() {
  const onda = clinicConfig.treatmentList.find((treatment) => treatment.key === "onda_pro");
  const cooling = onda?.consultationGuide?.quickReplies?.find((reply) => reply.key === "cooling_control");
  assert(cooling, "RP2b: ONDA must define an approved cooling-control answer");
  assert(cooling.terms.includes("冷卻") && cooling.terms.includes("控溫"), "RP2b: cooling-control terms must cover natural follow-up wording");
  assert(cooling.reply.includes("保護肌膚表面") && cooling.reply.includes("舒適度"), "RP2b: the cooling answer must explain its purpose in customer language");
}

function validateRichMessagePolicy() {
  const plan = legacyDecisionToReplyPlan(
    {
      decisionType: "treatment_intro_reply",
      matchedKey: "treatment_carousel",
      matchedType: "config",
      replyMessages: [{ text: "療程列表", type: "text" }],
      replyText: "療程列表",
    },
    { renderMode: "generated" },
  );

  assert(plan.renderMode === "deterministic", "RP3: rich messages must bypass generation");
  assert(plan.richMessages.length === 1, "RP3: legacy rich messages must be preserved");
  assert(shouldUseDeterministicReply(plan), "RP3: rich messages must use deterministic rendering");
}

function validateHumanAndPriceBoundaries() {
  const handoff = legacyDecisionToReplyPlan({
    decisionType: "handoff_pending",
    matchedKey: "plastic_surgery_scope",
    matchedType: "handoff_rule",
    replyText: "轉真人客服。",
  });
  assert(handoff.requiresHuman, "RP4: handoff route must require a human");
  assert(handoff.handoffReason === "plastic_surgery_scope", "RP4: handoff reason must default to matched key");

  const price = legacyDecisionToReplyPlan({
    decisionType: "treatment_intro_reply",
    matchedKey: "treatment_intro:botox",
    matchedType: "config",
    replyText: "療程名稱含有數字 HA35，但這不是核准價格。",
  });
  assert(price.exactPriceFacts.length === 0, "RP4: exact prices must never be inferred from reply copy");
  assert(price.prohibitedClaims.some((claim) => claim.includes("未核准價格")), "RP4: default price prohibition must be present");
}

function validateDialogueActInference() {
  const cases = [
    ["booking_intake_reply", "booking_modify_request", "guided_reply", "manage_booking"],
    ["booking_intake_reply", "booking_intake", "guided_reply", "collect_booking"],
    ["pricing_auto_reply", "ONDA PRO", "pricing_campaign", "quote_approved_price"],
    ["treatment_intro_reply", "concern:local_contour", "guided_reply", "recommend_direction"],
    ["treatment_intro_reply", "treatment_compare:onda_pro:pico", "guided_reply", "compare_options"],
    ["fallback_reply", "guided_clarify", "guided_reply", "clarify"],
  ] as const;

  for (const [decisionType, matchedKey, matchedType, expected] of cases) {
    const actual = inferDialogueActFromLegacy({ decisionType, matchedKey, matchedType, replyText: "測試" });
    assert(actual === expected, `RP5: ${matchedKey} expected ${expected}, got ${actual}`);
  }
}

function validatePostRouterOverrideFreshness() {
  const oldPlan = legacyDecisionToReplyPlan({
    decisionType: "fallback_reply",
    matchedKey: "generic_fallback",
    matchedType: "generic_fallback",
    replyText: "舊 fallback。",
  });
  const merged = applyControlledScheduleDecision(
    {
      decisionType: "fallback_reply",
      matchedKey: "generic_fallback",
      matchedType: "generic_fallback",
      nextContext: createEmptyConversationContext("reply-plan-override"),
      replyPlan: oldPlan,
      replyText: "舊 fallback。",
    },
    {
      decisionType: "doctor_schedule_auto_reply",
      matchedKey: "doctor_schedule_unpublished:2026-08",
      matchedType: "doctor_schedule",
      replyText: "本月門診表尚未公告。",
    },
  );
  assert(merged.replyPlan === undefined, "RP6: a controlled override must invalidate the stale fallback plan");
  const rebuilt = legacyDecisionToReplyPlan(merged);
  assert(rebuilt.renderMode === "deterministic", "RP6: the rebuilt schedule plan must bypass the reply model");
  assert(rebuilt.fallbackText === "本月門診表尚未公告。", "RP6: timeout fallback must belong to the schedule turn");
  assert(shouldSuppressOuterAiFooter(false, { suppressAiFooter: true }), "RP6: deterministic rich-message footer policy must reach the outer payload");
  assert(
    !shouldSuppressOuterAiFooter(false, { suppressAiFooter: false }),
    "RP6: ordinary renderer text must delegate its one disclosure to the outer LINE payload",
  );
}

function main() {
  validateHardDeterministicPolicies();
  validateGeneratedTreatmentPlan();
  validateCoolingControlKnowledge();
  validateRichMessagePolicy();
  validateHumanAndPriceBoundaries();
  validateDialogueActInference();
  validatePostRouterOverrideFreshness();
  console.log("Reply plan validation passed: hard policies, generated plans, facts, prices, handoff, and rich messages");
}

try {
  main();
} catch (error) {
  console.error("FAIL:", error);
  process.exitCode = 1;
}
