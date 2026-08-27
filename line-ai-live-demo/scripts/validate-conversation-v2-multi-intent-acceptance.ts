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

  for (const item of CONVERSATION_V2_MULTI_INTENT_ACCEPTANCE_CASES) {
    const rawFrame = {
      areas: [],
      confidence: 0.96,
      concerns: [],
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
    const result = evaluateDialoguePolicy(state, turn);
    assert.equal(result.action.type, "answer_price", `${item.id}: price remains the one winning action`);
    const expected = expectedMustAnswer(item.aspects);
    assert.equal(result.replyPlan.responseContract.mode, "shadow", `${item.id}: contract stays shadow-only`);
    if (result.replyPlan.responseContract.mode === "shadow") {
      assert.deepEqual(result.replyPlan.responseContract.contract.mustAnswer, expected, `${item.id}: contract must retain secondary duties`);
      assert.deepEqual(result.replyPlan.responseContract.contract.subjectKeys, [item.treatmentKey], `${item.id}: contract must retain the single treatment owner`);
    }

    const hydrated = await hydrateConversationV2ReplyPlan({ nextState: state, result, snapshot, turn });
    assert(hydrated.rendererPlan, `${item.id}: reply plan must hydrate`);
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
    assert.deepEqual(rendered.responseContract.completedAspects, ["price_campaign"], `${item.id}: only the deterministic price receipt may be marked complete`);
    assert.deepEqual(rendered.responseContract.missingAspects, expected.slice(1), `${item.id}: all secondary duties must remain visible as missing`);
    assert.equal(rendered.responseContract.coverageStatus, expected.length === 1 ? "verified" : "missing", `${item.id}: coverage must be honest`);

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
    assert.deepEqual(trace.responseContractMissingAspects, expected.slice(1), `${item.id}: trace must expose missing secondary duties`);
  }

  console.log("Conversation V2 multi-intent acceptance passed (32 same-subject ONDA/Botox cases through parser, policy, renderer, and decision trace)");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
