import assert from "node:assert/strict";

import { createStaticClinicFactsProvider } from "../src/lib/clinic-facts";
import type { DialogueState } from "../src/lib/dialogue-state";
import { hydrateConversationV2ReplyPlan } from "../src/lib/conversation-v2/hydrate-reply-plan";
import { adaptNluFrameToConversationV2Turn } from "../src/lib/conversation-v2/nlu-adapter";
import { evaluateDialoguePolicy } from "../src/lib/conversation-v2/policy";
import { createConversationV2State } from "../src/lib/conversation-v2/state";
import type { DialoguePolicyResult, TurnUnderstanding } from "../src/lib/conversation-v2/types";
import { parseNluFrame } from "../src/lib/nlu-frame";
import {
  buildReplyPlanGuidance,
  legacyDecisionToReplyPlan,
} from "../src/lib/reply-plan";
import { renderReplyPlan } from "../src/lib/reply-renderer";
import {
  cloneResponseContractAttachment,
  createOffResponseContract,
  createResponseContract,
  isResponseContract,
  RESPONSE_CONTRACT_SCHEMA_VERSION,
  type ResponseContractAttachment,
} from "../src/lib/response-contract";
import { loadSeedData } from "../src/lib/seed-loader";

const NOW = "2026-08-20T08:00:00.000Z";
const FOOTER = "以上為 AI 客服順順初步回覆。";

function rendererDialogueState(treatmentKey: string): DialogueState {
  return {
    answeredTopics: [],
    areaKeys: [],
    bookingAction: null,
    bookingIntent: "none",
    concernKeys: [],
    dialogueAct: "answer_followup",
    episodeId: `response-contract-${treatmentKey}`,
    handoffStatus: "ai_active",
    knownNeeds: [],
    lastTransitionAt: NOW,
    primaryConcernKey: undefined,
    schemaVersion: 1,
    topic: "treatment",
    treatmentKeys: [treatmentKey],
  };
}

function turn(overrides: Partial<TurnUnderstanding> = {}): TurnUnderstanding {
  return {
    areas: [],
    concerns: [],
    confidence: 0.98,
    conversationMove: "start",
    dialogueReference: "explicit",
    questionAspect: "overview",
    receivedAt: NOW,
    speechAct: "learn_treatment",
    text: "我想了解 ONDA",
    treatments: [{
      confidence: 0.99,
      key: "onda_pro",
      polarity: "affirmed",
      resolution: "resolved",
    }],
    turnId: "turn-contract",
    ...overrides,
  };
}

function shadowAttachment(): ResponseContractAttachment {
  return {
    contract: {
      ctaPolicy: "allow",
      mustAnswer: ["overview", "benefits"],
      mustNotRepeat: ["mechanism"],
      nextStep: {
        aspect: "need_discovery",
        expectedAnswerType: "concern",
        kind: "ask",
      },
      schemaVersion: RESPONSE_CONTRACT_SCHEMA_VERSION,
      subjectKeys: ["onda_pro"],
    },
    mode: "shadow",
  };
}

function validateExplicitDefaultOff() {
  const legacyPlan = legacyDecisionToReplyPlan({
    decisionType: "treatment_intro_reply",
    matchedKey: "treatment_consult:onda_pro",
    matchedType: "guided_reply",
    replyText: "核准回覆",
  });
  assert.deepEqual(legacyPlan.responseContract, { mode: "off" }, "RC1: legacy plan must explicitly default off");

  const state = createConversationV2State({ episodeId: "episode-contract", now: NOW });
  const result = evaluateDialoguePolicy(state, turn());
  assert.deepEqual(
    result.replyPlan.responseContract,
    {
      contract: {
        ctaPolicy: "allow",
        mustAnswer: ["overview", "benefits", "need_discovery"],
        mustNotRepeat: [],
        nextStep: {
          aspect: "need_discovery",
          expectedAnswerType: "concern",
          kind: "ask",
        },
        schemaVersion: RESPONSE_CONTRACT_SCHEMA_VERSION,
        subjectKeys: ["onda_pro"],
      },
      mode: "shadow",
    },
    "RC1: customer-visible V2 plans must expose a shadow contract",
  );
  assert.deepEqual(createOffResponseContract(), { mode: "off" });
}

function validateDeterministicShadowPilot() {
  const state = createConversationV2State({ episodeId: "episode-contract-pilot", now: NOW });
  const price = evaluateDialoguePolicy(state, turn({
    questionAspect: "suitability",
    speechAct: "ask_price",
    text: "我雙下巴肉很多，ONDA 適合嗎？最近有活動嗎？",
    turnId: "turn-contract-price-multi-intent",
  }));
  assert.equal(price.action.type, "answer_price", "RC1b: deterministic price must remain the winning action");
  assert.deepEqual(
    price.replyPlan.responseContract,
    {
      contract: {
        ctaPolicy: "allow",
        mustAnswer: ["price_campaign", "suitability"],
        mustNotRepeat: [],
        nextStep: { kind: "none" },
        schemaVersion: RESPONSE_CONTRACT_SCHEMA_VERSION,
        subjectKeys: ["onda_pro"],
      },
      mode: "shadow",
    },
    "RC1b: the shadow contract must preserve a non-price secondary obligation",
  );

  const handoff = evaluateDialoguePolicy(state, turn({
    handoffReason: "human_request",
    questionAspect: "none",
    speechAct: "request_handoff",
    text: "我要找真人客服",
    treatments: [],
    turnId: "turn-contract-handoff",
  }));
  assert.equal(handoff.action.type, "queue_handoff", "RC1b: handoff policy must remain deterministic");
  assert.deepEqual(
    handoff.replyPlan.responseContract,
    {
      contract: {
        ctaPolicy: "require",
        mustAnswer: ["handoff_confirmation"],
        mustNotRepeat: [],
        nextStep: { kind: "handoff" },
        schemaVersion: RESPONSE_CONTRACT_SCHEMA_VERSION,
        subjectKeys: [],
      },
      mode: "shadow",
    },
    "RC1b: handoff must expose a measurable shadow obligation",
  );
}

async function validateParsedMultiAspectPipeline() {
  const seedData = await loadSeedData();
  const snapshot = await createStaticClinicFactsProvider({
    pricingCampaigns: seedData.pricingCampaigns,
  }).loadSnapshot({ now: new Date(NOW) });
  const cases = [
    {
      expectedMustAnswer: ["price_campaign", "suitability", "comfort_recovery"],
      expectedMissing: ["suitability", "comfort_recovery"],
      expectedPrice: /16,888/u,
      expectedSubject: "onda_pro",
      id: "onda-suitability-campaign",
      rawFrame: {
        areas: ["jawline"],
        confidence: 0.96,
        concerns: [{ area: "jawline", key: "jawline_looseness" }],
        dialogue: {
          aspects: ["suitability", "comfort_recovery", "price_campaign"],
          focus: "suitability",
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
        treatments: ["onda_pro"],
      },
      text: "我雙下巴肉很多，ONDA 適合嗎？恢復期呢？最近有活動嗎？",
    },
    {
      expectedMustAnswer: ["price_campaign", "brands"],
      expectedMissing: ["brands"],
      expectedPrice: /999/u,
      expectedSubject: "botox",
      id: "botox-brands-campaign",
      rawFrame: {
        areas: [],
        confidence: 0.95,
        concerns: [],
        dialogue: {
          aspects: ["brands", "price_campaign"],
          focus: "brands",
          move: "continue",
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
        treatments: ["botox"],
      },
      text: "肉毒有哪些品牌？現在活動價格多少？",
    },
  ] as const;

  for (const item of cases) {
    const parsed = parseNluFrame(item.rawFrame);
    assert(parsed, `RC1c ${item.id}: schema-v3 NLU frame must parse`);
    const adapted = adaptNluFrameToConversationV2Turn({
      frame: parsed,
      receivedAt: NOW,
      text: item.text,
      turnId: `turn-contract-${item.id}`,
    });
    assert.deepEqual(
      adapted.questionAspects,
      item.rawFrame.dialogue.aspects,
      `RC1c ${item.id}: adapter must preserve ordered current-message aspects`,
    );

    const state = createConversationV2State({
      episodeId: `episode-contract-${item.id}`,
      now: NOW,
    });
    const result = evaluateDialoguePolicy(state, adapted);
    assert.equal(
      result.action.type,
      "answer_price",
      `RC1c ${item.id}: deterministic price must remain the single winning action`,
    );
    assert.deepEqual(
      result.replyPlan.responseContract,
      {
        contract: {
          ctaPolicy: "allow",
          mustAnswer: item.expectedMustAnswer,
          mustNotRepeat: [],
          nextStep: { kind: "none" },
          schemaVersion: RESPONSE_CONTRACT_SCHEMA_VERSION,
          subjectKeys: [item.expectedSubject],
        },
        mode: "shadow",
      },
      `RC1c ${item.id}: contract must order the deterministic action before secondary obligations`,
    );

    const offPlan = {
      ...result.replyPlan,
      responseContract: createOffResponseContract(),
    } as typeof result.replyPlan;
    const shadowHydrated = await hydrateConversationV2ReplyPlan({
      nextState: state,
      result,
      snapshot,
      turn: adapted,
    });
    const offHydrated = await hydrateConversationV2ReplyPlan({
      nextState: state,
      result: { ...result, replyPlan: offPlan },
      snapshot,
      turn: adapted,
    });
    assert(shadowHydrated.rendererPlan, `RC1c ${item.id}: shadow plan must hydrate`);
    assert(offHydrated.rendererPlan, `RC1c ${item.id}: off plan must hydrate`);
    const {
      responseContract: shadowContract,
      ...shadowCustomerPlan
    } = shadowHydrated.rendererPlan;
    const {
      responseContract: offContract,
      ...offCustomerPlan
    } = offHydrated.rendererPlan;
    assert.equal(shadowContract.mode, "shadow");
    assert.equal(offContract.mode, "off");
    assert.deepEqual(
      shadowCustomerPlan,
      offCustomerPlan,
      `RC1c ${item.id}: shadow contract must not alter customer text or renderer input`,
    );

    const dialogueState = rendererDialogueState(item.expectedSubject);
    const shadowRendered = await renderReplyPlan({
      customerMessage: item.text,
      dialogueState,
      footer: FOOTER,
      generator: async () => { throw new Error("deterministic price path must not call a model"); },
      plan: shadowHydrated.rendererPlan,
      recentTurns: [],
    });
    const offRendered = await renderReplyPlan({
      customerMessage: item.text,
      dialogueState,
      footer: FOOTER,
      generator: async () => { throw new Error("deterministic price path must not call a model"); },
      plan: offHydrated.rendererPlan,
      recentTurns: [],
    });
    assert.match(
      shadowRendered.replyText,
      item.expectedPrice,
      `RC1c ${item.id}: the actual final renderer text must include the approved price`,
    );
    assert.equal(
      shadowRendered.replyText,
      offRendered.replyText,
      `RC1c ${item.id}: shadow observation must not alter final customer text`,
    );
    assert.deepEqual(
      shadowRendered.responseContract.completedAspects,
      ["price_campaign"],
      `RC1c ${item.id}: renderer may claim only the deterministic price receipt`,
    );
    assert.deepEqual(
      shadowRendered.responseContract.missingAspects,
      item.expectedMissing,
      `RC1c ${item.id}: unanswered secondary intent must remain visible instead of becoming a false green`,
    );
    assert.equal(shadowRendered.responseContract.coverageStatus, "missing");
  }
}

function validateAttachmentIsDeepClonedAndGuidanceNeutral() {
  const attachment = shadowAttachment();
  const shadowPlan = legacyDecisionToReplyPlan(
    {
      decisionType: "treatment_intro_reply",
      matchedKey: "treatment_consult:onda_pro",
      matchedType: "guided_reply",
      replyText: "核准回覆",
    },
    { responseContract: attachment },
  );
  const offPlan = legacyDecisionToReplyPlan(
    {
      decisionType: "treatment_intro_reply",
      matchedKey: "treatment_consult:onda_pro",
      matchedType: "guided_reply",
      replyText: "核准回覆",
    },
    { responseContract: createOffResponseContract() },
  );
  assert.deepEqual(shadowPlan.responseContract, attachment, "RC2: attachment semantics must survive adapter");
  assert.notEqual(shadowPlan.responseContract, attachment, "RC2: attachment object must be cloned");
  if (attachment.mode === "shadow") attachment.contract.mustAnswer.push("duration");
  if (shadowPlan.responseContract.mode === "shadow") {
    assert(!shadowPlan.responseContract.contract.mustAnswer.includes("duration"), "RC2: nested arrays must be cloned");
  }
  assert.equal(
    buildReplyPlanGuidance(shadowPlan),
    buildReplyPlanGuidance(offPlan),
    "RC2: skeleton must not alter model guidance before canary approval",
  );

  const cloned = cloneResponseContractAttachment(shadowPlan.responseContract);
  assert.deepEqual(cloned, shadowPlan.responseContract);
  assert.notEqual(cloned, shadowPlan.responseContract);
}

function validateContractStructureAndContradictions() {
  const valid = shadowAttachment();
  assert(valid.mode === "shadow");
  assert(isResponseContract(valid.contract), "RC3: valid contract must pass structural validation");
  const created = createResponseContract(valid.contract);
  assert.deepEqual(created, valid.contract);
  assert.notEqual(created.mustAnswer, valid.contract.mustAnswer, "RC3: constructor must clone arrays");
  assert.notEqual(created.subjectKeys, valid.contract.subjectKeys, "RC3: constructor must clone subject ownership");

  const overlap = {
    ...valid.contract,
    mustNotRepeat: ["overview"],
  };
  assert(!isResponseContract(overlap), "RC3: one aspect cannot be required and forbidden together");
  assert(
    !isResponseContract({ ...valid.contract, subjectKeys: ["onda_pro", "onda_pro"] }),
    "RC3: treatment subject ownership cannot contain duplicates",
  );
  const forbiddenCta = {
    ...valid.contract,
    ctaPolicy: "forbid",
    nextStep: { kind: "invite_consultation" },
  };
  assert(!isResponseContract(forbiddenCta), "RC3: forbidden CTA cannot invite consultation");
  const missingRequiredCta = {
    ...valid.contract,
    ctaPolicy: "require",
    nextStep: { kind: "none" },
  };
  assert(!isResponseContract(missingRequiredCta), "RC3: required CTA must identify an actionable next step");
  const repeatedNextQuestion = {
    ...valid.contract,
    mustNotRepeat: ["need_discovery"],
  };
  assert(
    !isResponseContract(repeatedNextQuestion),
    "RC3: the next question cannot repeat an aspect explicitly forbidden for this subject",
  );
  assert.throws(() => createResponseContract(overlap as typeof valid.contract), /Invalid Response Contract/);
}

async function validateHydrationPassesContractWithoutConsumingIt() {
  const state = createConversationV2State({ episodeId: "episode-hydrate-contract", now: NOW });
  const attachment = shadowAttachment();
  const action: DialoguePolicyResult["action"] = {
    at: NOW,
    prompt: "比較想先了解哪個部分呢？",
    turnId: "turn-hydrate-contract",
    type: "fallback_clarify",
  };
  const result: DialoguePolicyResult = {
    action,
    replyPlan: {
      action: "fallback_clarify",
      dialogueAct: "clarify",
      mode: "deterministic",
      nextQuestion: action.prompt,
      responseContract: attachment,
      sourceTurnId: action.turnId,
      templateKey: "fallback_clarify",
      templateVariables: { prompt: action.prompt },
    },
  };
  const snapshot = await createStaticClinicFactsProvider().loadSnapshot({ now: new Date(NOW) });
  const hydrated = await hydrateConversationV2ReplyPlan({
    nextState: state,
    result,
    snapshot,
    turn: turn({
      confidence: 0.4,
      dialogueReference: "unresolved",
      speechAct: "unknown",
      text: "我想了解那個",
      treatments: [],
      turnId: action.turnId,
    }),
  });
  assert(hydrated.rendererPlan, "RC3: deterministic plan must hydrate");
  assert.deepEqual(
    hydrated.rendererPlan.responseContract,
    attachment,
    "RC3: hydrate must pass contract unchanged to renderer plan",
  );
  assert.equal(hydrated.rendererPlan.fallbackText, action.prompt, "RC3: customer text must remain unchanged");

  const responseContext = {
    affirmedAreaKeys: [],
    affirmedConcernKeys: ["jawline_looseness"],
    affirmedTreatmentKeys: ["onda_pro"],
    conversationMove: "start" as const,
    declinedTreatmentKeys: [],
    dialogueReference: "explicit" as const,
    excludedAreaKeys: [],
    excludedConcernKeys: [],
    excludedTreatmentKeys: [],
    questionAspect: "overview" as const,
    treatmentApproach: "unspecified" as const,
  };
  const generatedResult: DialoguePolicyResult = {
    action: {
      areaKeys: [],
      at: NOW,
      concernKeys: ["jawline_looseness"],
      knowledgeMode: "merge",
      responseContext,
      taskKind: "learn_treatment",
      treatmentKeys: ["onda_pro"],
      turnId: "turn-contract-generated",
      type: "learn_treatment",
    },
    replyPlan: {
      action: "learn_treatment",
      dialogueAct: "introduce_treatment",
      knowledgeQuery: {
        approvedFactIds: [],
        areaKeys: [],
        concernKeys: ["jawline_looseness"],
        treatmentKeys: ["onda_pro"],
      },
      mode: "generated",
      objective: "自然介紹療程",
      responseContract: attachment,
      responseContext,
      sourceTurnId: "turn-contract-generated",
    },
  };
  const priceResult: DialoguePolicyResult = {
    action: {
      at: NOW,
      priceKind: "unspecified",
      treatmentKeys: ["onda_pro"],
      turnId: "turn-contract-price",
      type: "answer_price",
    },
    replyPlan: {
      action: "answer_price",
      dialogueAct: "answer_price",
      mode: "deterministic",
      pricingQuery: { kind: "unspecified", treatmentKeys: ["onda_pro"] },
      responseContract: attachment,
      sourceTurnId: "turn-contract-price",
      templateKey: "approved_price_lookup",
      templateVariables: { priceKind: "unspecified", treatmentKeys: ["onda_pro"] },
    },
  };
  const bookingState = createConversationV2State({ episodeId: "episode-contract-booking", now: NOW });
  bookingState.activeTask = { id: "booking", kind: "booking", startedAt: NOW };
  bookingState.bookingTask = {
    draft: { timeSlots: [], treatmentKeys: [] },
    expectedField: "treatment",
    id: "booking-contract",
    intent: "create",
    status: "collecting",
  };
  const bookingResult: DialoguePolicyResult = {
    action: {
      at: NOW,
      initialDraft: {},
      intent: "create",
      turnId: "turn-contract-booking",
      type: "start_booking",
    },
    replyPlan: {
      action: "start_booking",
      dialogueAct: "collect_booking",
      mode: "deterministic",
      responseContract: attachment,
      sourceTurnId: "turn-contract-booking",
      templateKey: "start_booking",
      templateVariables: {},
    },
  };
  const handoffResult: DialoguePolicyResult = {
    action: {
      at: NOW,
      handoffId: "handoff-contract",
      reason: "customer_requested_human",
      turnId: "turn-contract-handoff",
      type: "queue_handoff",
    },
    replyPlan: {
      action: "queue_handoff",
      dialogueAct: "handoff",
      mode: "deterministic",
      responseContract: attachment,
      sourceTurnId: "turn-contract-handoff",
      templateKey: "handoff_queued",
      templateVariables: {},
    },
  };
  const cases = [
    { name: "generated", nextState: state, result: generatedResult, turn: turn({ turnId: "turn-contract-generated" }) },
    { name: "price", nextState: state, result: priceResult, turn: turn({ questionAspect: "price_unspecified", speechAct: "ask_price", text: "ONDA 多少錢", turnId: "turn-contract-price" }) },
    { name: "booking", nextState: bookingState, result: bookingResult, turn: turn({ booking: { explicit: true, intent: "create" }, speechAct: "book_consultation", text: "我要預約諮詢", treatments: [], turnId: "turn-contract-booking" }) },
    { name: "handoff", nextState: state, result: handoffResult, turn: turn({ speechAct: "request_handoff", text: "我要真人", treatments: [], turnId: "turn-contract-handoff" }) },
  ];
  for (const item of cases) {
    const caseHydrated = await hydrateConversationV2ReplyPlan({
      nextState: item.nextState,
      result: item.result,
      snapshot,
      turn: item.turn,
    });
    assert(caseHydrated.rendererPlan, `RC4: ${item.name} path must hydrate a renderer plan`);
    assert.deepEqual(
      caseHydrated.rendererPlan.responseContract,
      attachment,
      `RC4: ${item.name} path must not drop or replace its contract`,
    );
  }
}

async function main() {
  validateExplicitDefaultOff();
  validateDeterministicShadowPilot();
  await validateParsedMultiAspectPipeline();
  validateAttachmentIsDeepClonedAndGuidanceNeutral();
  validateContractStructureAndContradictions();
  await validateHydrationPassesContractWithoutConsumingIt();
  console.log("PASS: Response Contract skeleton validation");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
