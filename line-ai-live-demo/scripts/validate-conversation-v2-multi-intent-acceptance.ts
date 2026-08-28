import assert from "node:assert/strict";

import { getConversationDecisionTrace } from "../src/lib/admin-conversation-decision-trace";
import { createStaticClinicFactsProvider } from "../src/lib/clinic-facts";
import { hydrateConversationV2ReplyPlan } from "../src/lib/conversation-v2/hydrate-reply-plan";
import { adaptNluFrameToConversationV2Turn } from "../src/lib/conversation-v2/nlu-adapter";
import { routeConversationTurnV2 } from "../src/lib/conversation-v2/engine";
import { evaluateDialoguePolicy } from "../src/lib/conversation-v2/policy";
import { createConversationV2State } from "../src/lib/conversation-v2/state";
import { parseNluFrame } from "../src/lib/nlu-frame";
import { renderReplyPlan, toReplyRendererPayloadJson } from "../src/lib/reply-renderer";
import { loadSeedData } from "../src/lib/seed-loader";

import { CONVERSATION_V2_MULTI_INTENT_ACCEPTANCE_CASES } from "./fixtures/conversation-v2-multi-intent-acceptance";

const NOW = "2026-08-27T08:00:00.000Z";
const FOOTER = "以上為 AI 客服順順初步回覆。";
const PRICE_ASPECTS = new Set(["price_campaign", "price_regular", "price_unspecified"]);
const SUPPORTED_SECONDARY_ASPECTS = {
  onda_pro: new Set(["overview", "benefits", "mechanism", "suitability", "comfort_recovery", "single_vs_combination", "combination_reason", "general_difference"]),
  botox: new Set(["overview", "benefits", "mechanism", "suitability", "comfort_recovery", "brands"]),
} as const;

function assertSupplementMeaning(
  treatmentKey: "onda_pro" | "botox",
  aspect: string,
  customerText: string,
  caseId: string,
) {
  if (aspect === "overview") {
    assert.match(customerText, treatmentKey === "onda_pro" ? /ONDA Pro/iu : /肉毒/u, `${caseId}: overview copy must name the treatment`);
  } else if (aspect === "benefits") {
    assert.match(customerText, treatmentKey === "onda_pro" ? /(?:局部脂肪|輪廓|下顎線)/u : /(?:動態紋|咀嚼肌|肌肉)/u, `${caseId}: benefits copy must describe an approved improvement direction`);
  } else if (aspect === "mechanism") {
    assert.match(customerText, treatmentKey === "onda_pro" ? /(?:Coolwaves|微波|脂肪)/iu : /(?:放鬆|肌肉)/u, `${caseId}: mechanism copy must explain how the treatment acts`);
  } else if (aspect === "suitability") {
    assert.match(customerText, /評估/u, `${caseId}: suitability copy must preserve evaluation language`);
  } else if (aspect === "comfort_recovery") {
    assert.match(customerText, /(?:冷卻|感受|舒適|恢復|個人狀況)/u, `${caseId}: comfort copy must address experience or recovery`);
  } else if (aspect === "brands") {
    assert.match(customerText, /奇蹟肉毒/u, `${caseId}: brands copy must include 奇蹟肉毒`);
    assert.match(customerText, /經典肉毒/u, `${caseId}: brands copy must include 經典肉毒`);
    assert.match(customerText, /皇家肉毒/u, `${caseId}: brands copy must include 皇家肉毒`);
  } else if (["single_vs_combination", "combination_reason", "general_difference"].includes(aspect)) {
    assert.match(customerText, /(?:ONDA Pro.*肉毒|肉毒.*ONDA Pro)/isu, `${caseId}: combination copy must explain the approved relationship`);
  }
}

function expectedMustAnswer(aspects: readonly string[]) {
  return [
    "price_campaign",
    ...aspects.filter((aspect) => !["price_campaign", "price_regular", "price_unspecified"].includes(aspect)),
  ];
}

function rawNluFrame(input: {
  areas?: string[];
  concerns?: Array<{ area: string | null; key: string }>;
  aspects: readonly [string, ...string[]];
  move: "continue" | "start";
  reference: "active_subject" | "explicit";
  speechAct: "ask_concern" | "learn_treatment";
  treatments?: string[];
}) {
  return {
    areas: input.areas ?? [],
    confidence: 0.96,
    concerns: input.concerns ?? [],
    dialogue: {
      aspects: [...input.aspects],
      focus: input.aspects[0],
      move: input.move,
      reference: input.reference,
      speechAct: input.speechAct,
    },
    intents: ["treatment_consultation"],
    negated: [],
    safety: {
      complaint: false,
      humanRequest: false,
      postTreatmentRisk: false,
      pregnancyNursing: false,
    },
    schemaVersion: 3,
    treatments: input.treatments ?? [],
  };
}

function validateShortAnswerContinuation() {
  const flows = [
    {
      id: "SHORT-ONDA-DOUBLE-CHIN",
      treatmentKey: "onda_pro",
      concernKey: "jawline_looseness",
      turns: [
        { text: "想了解 ONDA", frame: rawNluFrame({ aspects: ["overview"], move: "start", reference: "explicit", speechAct: "learn_treatment", treatments: ["onda_pro"] }) },
        { text: "雙下巴", frame: rawNluFrame({ areas: ["jawline"], concerns: [{ area: "jawline", key: "jawline_looseness" }], aspects: ["benefits"], move: "continue", reference: "active_subject", speechAct: "ask_concern" }) },
      ],
    },
    {
      id: "SHORT-ONDA-FAT",
      treatmentKey: "onda_pro",
      concernKey: "local_contour",
      turns: [
        { text: "我想問 ONDA", frame: rawNluFrame({ aspects: ["overview"], move: "start", reference: "explicit", speechAct: "learn_treatment", treatments: ["onda_pro"] }) },
        { text: "脂肪", frame: rawNluFrame({ concerns: [{ area: null, key: "local_contour" }], aspects: ["benefits"], move: "continue", reference: "active_subject", speechAct: "ask_concern" }) },
      ],
    },
    {
      id: "SHORT-BOTOX-FROWN",
      treatmentKey: "botox",
      concernKey: "dynamic_wrinkles",
      turns: [
        { text: "想了解肉毒", frame: rawNluFrame({ aspects: ["overview"], move: "start", reference: "explicit", speechAct: "learn_treatment", treatments: ["botox"] }) },
        { text: "皺眉紋", frame: rawNluFrame({ areas: ["face"], concerns: [{ area: "face", key: "dynamic_wrinkles" }], aspects: ["benefits"], move: "continue", reference: "active_subject", speechAct: "ask_concern" }) },
      ],
    },
    {
      id: "SHORT-BOTOX-MASSETER",
      treatmentKey: "botox",
      concernKey: "masseter_contour",
      turns: [
        { text: "肉毒", frame: rawNluFrame({ aspects: ["overview"], move: "start", reference: "explicit", speechAct: "learn_treatment", treatments: ["botox"] }) },
        { text: "咀嚼肌", frame: rawNluFrame({ areas: ["face"], concerns: [{ area: "face", key: "masseter_contour" }], aspects: ["benefits"], move: "continue", reference: "active_subject", speechAct: "ask_concern" }) },
      ],
    },
  ] as const;

  for (const flow of flows) {
    let state = createConversationV2State({ episodeId: flow.id, now: NOW });
    for (const [index, item] of flow.turns.entries()) {
      const parsed = parseNluFrame(item.frame);
      assert(parsed, `${flow.id}.${index + 1}: raw short-answer frame must parse`);
      const turn = adaptNluFrameToConversationV2Turn({
        frame: parsed,
        receivedAt: NOW,
        text: item.text,
        turnId: `${flow.id}-${index + 1}`,
      });
      const routed = routeConversationTurnV2(state, turn);
      assert.equal(routed.duplicate, false, `${flow.id}.${index + 1}: short-answer turn must not be discarded`);
      assert(routed.result, `${flow.id}.${index + 1}: short-answer turn must choose an action`);
      assert.equal(routed.result.action.type, "learn_treatment", `${flow.id}.${index + 1}: short-answer turn must continue treatment consultation`);
      state = routed.nextState;
    }
    assert(state.knowledge.treatmentKeys.includes(flow.treatmentKey), `${flow.id}: active treatment must survive a short answer`);
    assert(state.knowledge.concernKeys.includes(flow.concernKey), `${flow.id}: short answer must add its current concern`);
  }
}

async function main() {
  assert.equal(CONVERSATION_V2_MULTI_INTENT_ACCEPTANCE_CASES.length, 32, "must cover exactly 32 ONDA/Botox cases");
  const ids = CONVERSATION_V2_MULTI_INTENT_ACCEPTANCE_CASES.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, "case IDs must be unique");
  assert.equal(
    CONVERSATION_V2_MULTI_INTENT_ACCEPTANCE_CASES.filter((item) => item.treatmentKey === "onda_pro").length,
    16,
    "must cover 16 ONDA cases",
  );
  assert.equal(
    CONVERSATION_V2_MULTI_INTENT_ACCEPTANCE_CASES.filter((item) => item.treatmentKey === "botox").length,
    16,
    "must cover 16 Botox cases",
  );
  validateShortAnswerContinuation();

  const seedData = await loadSeedData();
  const snapshot = await createStaticClinicFactsProvider({
    pricingCampaigns: seedData.pricingCampaigns,
  }).loadSnapshot({ now: new Date(NOW) });
  const coverageCounts = { full: 0, partial: 0, priceOnly: 0 };

  for (const item of CONVERSATION_V2_MULTI_INTENT_ACCEPTANCE_CASES) {
    const rawFrame = {
      areas: [...(item.areas ?? [])],
      confidence: 0.96,
      concerns: [...(item.concerns ?? [])],
      dialogue: {
        aspects: [...item.aspects],
        focus: item.aspects[0],
        move: "start",
        reference: "explicit",
        speechAct: "ask_price",
      },
      intents: ["pricing"],
      negated: [],
      safety: {
        complaint: false,
        humanRequest: false,
        postTreatmentRisk: false,
        pregnancyNursing: false,
      },
      schemaVersion: 3,
      treatments: [item.treatmentKey],
    };
    const parsed = parseNluFrame(rawFrame);
    assert(parsed, `${item.id}: raw schema-v3 NLU fixture must parse`);
    const turn = adaptNluFrameToConversationV2Turn({
      frame: parsed,
      receivedAt: NOW,
      text: item.text,
      turnId: item.id,
    });
    assert.deepEqual(turn.questionAspects, item.aspects, `${item.id}: adapter must preserve every ordered aspect`);

    const state = createConversationV2State({ episodeId: `multi-intent-${item.id}`, now: NOW });
    const result = evaluateDialoguePolicy(state, turn, {
      responseContractMode: "enforce",
    });
    assert.equal(result.action.type, "answer_price", `${item.id}: price remains the one winning action`);
    const expected = expectedMustAnswer(item.aspects);
    const secondary = expected.filter((aspect) => !PRICE_ASPECTS.has(aspect));
    const pilotEligible = secondary.length > 0 &&
      secondary.every((aspect) => SUPPORTED_SECONDARY_ASPECTS[item.treatmentKey].has(aspect)) &&
      (!secondary.includes("suitability") || (item.concerns?.length ?? 0) > 0);
    assert.equal(
      result.replyPlan.responseContract.mode,
      pilotEligible ? "enforce" : "shadow",
      `${item.id}: Policy alone must own the approved rollout mode`,
    );
    assert.deepEqual(result.replyPlan.responseContract.contract.mustAnswer, expected, `${item.id}: contract must retain secondary duties`);
    assert.deepEqual(result.replyPlan.responseContract.contract.subjectKeys, [item.treatmentKey], `${item.id}: contract must retain the single treatment owner`);

    const hydrated = await hydrateConversationV2ReplyPlan({ nextState: state, result, snapshot, turn });
    assert(hydrated.rendererPlan, `${item.id}: reply plan must hydrate`);
    const completed = pilotEligible ? expected : expected.filter((aspect) => PRICE_ASPECTS.has(aspect));
    const missing = expected.filter((aspect) => !completed.includes(aspect));
    assert.equal(
      hydrated.rendererPlan.responseContract.mode,
      pilotEligible ? "enforce" : "shadow",
      `${item.id}: hydration must preserve the Policy-owned mode`,
    );
    if (!pilotEligible) {
      assert.equal(
        hydrated.rendererPlan.approvedPriceReply?.supplements?.length ?? 0,
        0,
        `${item.id}: shadow mode must never change customer-visible price content`,
      );
    }
    const rendered = await renderReplyPlan({
      customerMessage: item.text,
      dialogueState: {
        answeredTopics: [],
        areaKeys: [],
        bookingAction: null,
        bookingIntent: "none",
        concernKeys: [],
        dialogueAct: "answer_followup",
        episodeId: `multi-intent-renderer-${item.id}`,
        handoffStatus: "ai_active",
        knownNeeds: [],
        lastTransitionAt: NOW,
        schemaVersion: 1,
        topic: "treatment",
        treatmentKeys: [item.treatmentKey],
      },
      footer: FOOTER,
      generator: async () => { throw new Error(`${item.id}: deterministic price reply must not call the generator`); },
      plan: hydrated.rendererPlan,
      recentTurns: [],
    });
    assert.match(rendered.replyText, item.treatmentKey === "onda_pro" ? /16,888/u : /999/u, `${item.id}: final customer text must contain the current approved offer`);
    for (const supplement of hydrated.rendererPlan.approvedPriceReply?.supplements ?? []) {
      assert.match(rendered.replyText, new RegExp(supplement.customerText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"), `${item.id}: every typed supplement must be customer-visible`);
      for (const aspect of supplement.aspects) {
        assertSupplementMeaning(item.treatmentKey, aspect, supplement.customerText, item.id);
      }
    }
    assert.deepEqual(rendered.responseContract.completedAspects, completed, `${item.id}: typed receipts must prove every completed duty`);
    assert.deepEqual(rendered.responseContract.missingAspects, missing, `${item.id}: unresolved duties must remain visible as missing`);
    assert.equal(rendered.responseContract.coverageStatus, missing.length === 0 ? "verified" : "missing", `${item.id}: coverage must be honest`);

    if (item.id === "MI-ONDA-01") {
      assert.match(rendered.replyText, /雙下巴/u, `${item.id}: suitability reply must acknowledge the concern`);
      assert.match(rendered.replyText, /(?:局部脂肪|脂肪感)/u, `${item.id}: suitability reply must explain the approved direction`);
      assert.match(rendered.replyText, /評估/u, `${item.id}: suitability reply must preserve evaluation language`);
      assert.match(rendered.replyText, /12,999/u, `${item.id}: ONDA reply must retain the approved combination alternative`);
    }
    if (item.id === "MI-BOTOX-12") {
      assert.match(rendered.replyText, /奇蹟肉毒/u, `${item.id}: brand answer must be visible`);
      assert.match(rendered.replyText, /經典肉毒/u, `${item.id}: brand answer must be visible`);
      assert.match(rendered.replyText, /皇家肉毒/u, `${item.id}: brand answer must be visible`);
      assert.match(rendered.replyText, /動態紋/u, `${item.id}: benefits answer must be visible`);
      assert.match(rendered.replyText, /肌肉線條/u, `${item.id}: benefits answer must be visible`);
      const priceLine = rendered.replyText.split("\n").find((line) => line.includes("999")) ?? "";
      assert.doesNotMatch(priceLine, /奇蹟|經典|皇家|12U/u, `${item.id}: 999 must not be bound to a brand or dose`);
    }
    assert.doesNotMatch(rendered.replyText, /https?:\/\/|www\.|療程名稱：|可評估方向：|20\d{2}[年/.-]/u, `${item.id}: customer text must not expose URLs, internal labels, or campaign dates`);

    if (secondary.length === 0) coverageCounts.priceOnly += 1;
    else if (missing.length === 0) coverageCounts.full += 1;
    else coverageCounts.partial += 1;

    const trace = getConversationDecisionTrace({
      conversation_v2_nlu_confidence: parsed.confidence,
      conversation_v2_nlu_status: "success",
      conversation_v2_policy_action: result.action.type,
      route_version: "v2",
      ...toReplyRendererPayloadJson({
        dialogueAct: rendered.dialogueAct,
        fallbackReason: rendered.fallbackReason,
        fallbackVariant: rendered.fallbackVariant,
        generatedVisible: rendered.generated,
        generatorInvoked: rendered.generatorInvoked,
        guardReplacedText: rendered.guardReplacedText,
        latencyMs: rendered.latencyMs,
        replyTextSource: rendered.replyTextSource,
        renderMode: rendered.renderMode,
        responseContract: rendered.responseContract,
      }),
    });
    assert(trace, `${item.id}: rendered reply must expose an admin decision trace`);
    assert.equal(trace.routeVersion, "v2", `${item.id}: trace must identify V2`);
    assert.equal(trace.policyAction, "answer_price", `${item.id}: trace must identify the winning action`);
    assert.deepEqual(trace.responseContractMustAnswer, expected, `${item.id}: trace must preserve every duty`);
    assert.deepEqual(trace.responseContractCompletedAspects, completed, `${item.id}: trace must preserve typed completion receipts`);
    assert.deepEqual(trace.responseContractMissingAspects, missing, `${item.id}: trace must expose only unresolved duties`);
  }

  assert.deepEqual(coverageCounts, { full: 20, partial: 10, priceOnly: 2 });
  console.log("Conversation V2 multi-intent acceptance passed (20 fully covered / 10 partial shadow / 2 price-only; 32 total)");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
