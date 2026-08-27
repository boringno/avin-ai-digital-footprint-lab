import assert from "node:assert/strict";

import { createStaticClinicFactsProvider } from "../src/lib/clinic-facts";
import {
  approvedTreatmentSupplementHash,
  resolveApprovedTreatmentSupplements,
} from "../src/lib/clinic-facts/treatment-resolver";
import type { DialogueState } from "../src/lib/dialogue-state";
import { hydrateConversationV2ReplyPlan } from "../src/lib/conversation-v2/hydrate-reply-plan";
import { routeConversationTurnV2 } from "../src/lib/conversation-v2/engine";
import { adaptNluFrameToConversationV2Turn } from "../src/lib/conversation-v2/nlu-adapter";
import {
  evaluateDialoguePolicy,
  resolvePriceSubjectForPolicy,
} from "../src/lib/conversation-v2/policy";
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

function validatePolicyOwnsEnforceEligibility() {
  const baseState = createConversationV2State({ episodeId: "episode-contract-eligibility", now: NOW });
  const policyMode = (overrides: Partial<TurnUnderstanding>) => evaluateDialoguePolicy(
    structuredClone(baseState),
    turn({
      questionAspect: "price_campaign",
      questionAspects: ["price_campaign"],
      speechAct: "ask_price",
      text: "ONDA 活動價多少？",
      turnId: "turn-contract-eligibility",
      ...overrides,
    }),
    { responseContractMode: "enforce" },
  ).replyPlan.responseContract.mode;

  assert.equal(
    policyMode({
      questionAspect: "brands",
      questionAspects: ["brands", "price_campaign"],
      text: "肉毒有哪些品牌？活動價多少？",
      treatments: [{
        confidence: 1,
        key: "botox",
        polarity: "affirmed",
        resolution: "resolved",
      }],
    }),
    "enforce",
    "RC1d: one supported secondary duty on one explicit subject may enter the pilot",
  );
  assert.equal(
    policyMode({}),
    "shadow",
    "RC1d: a pure price answer must not be relabelled as a multi-intent enforce pilot",
  );
  assert.equal(
    policyMode({
      questionAspect: "benefits",
      questionAspects: ["benefits", "price_campaign"],
      text: "ONDA 跟肉毒效果和價格都想知道",
      treatments: [
        { confidence: 1, key: "onda_pro", polarity: "affirmed", resolution: "resolved" },
        { confidence: 1, key: "botox", polarity: "affirmed", resolution: "resolved" },
      ],
    }),
    "shadow",
    "RC1d: multiple subjects must stay observation-only",
  );
  for (const [aspect, text] of [
    ["brand_difference", "肉毒品牌差異和活動價都想知道"],
    ["duration", "ONDA 做多久？活動價多少？"],
  ] as const) {
    assert.equal(
      policyMode({ questionAspect: aspect, questionAspects: [aspect, "price_campaign"], text }),
      "shadow",
      `RC1d: unsupported ${aspect} content must stay observation-only`,
    );
  }
  assert.equal(
    policyMode({
      questionAspect: "suitability",
      questionAspects: ["suitability", "price_campaign"],
      text: "ONDA 適合嗎？活動價多少？",
    }),
    "shadow",
    "RC1d: suitability without a resolved current-turn concern must stay observation-only",
  );
  assert.equal(
    policyMode({
      areas: [{ confidence: 1, key: "jawline", polarity: "affirmed", resolution: "resolved" }],
      concerns: [{ confidence: 1, key: "jawline_looseness", polarity: "affirmed", resolution: "resolved" }],
      questionAspect: "suitability",
      questionAspects: ["suitability", "price_campaign"],
      text: "我雙下巴肉很多，ONDA 適合嗎？活動價多少？",
    }),
    "enforce",
    "RC1d: suitability may enforce only with trusted current-turn concern evidence",
  );
  for (const [polarity, resolution] of [
    ["negated", "resolved"],
    ["affirmed", "underspecified"],
  ] as const) {
    assert.equal(
      policyMode({
        concerns: [{ confidence: 1, key: "jawline_looseness", polarity, resolution }],
        questionAspect: "suitability",
        questionAspects: ["suitability", "price_campaign"],
        text: "ONDA 適合嗎？活動價多少？",
      }),
      "shadow",
      `RC1d: ${polarity}/${resolution} concern evidence must not enable suitability enforcement`,
    );
  }
  assert.equal(
    policyMode({
      concerns: [{
        confidence: 0.1,
        key: "jawline_looseness",
        polarity: "affirmed",
        resolution: "resolved",
      }],
      questionAspect: "suitability",
      questionAspects: ["suitability", "price_campaign"],
      text: "ONDA 適合嗎？活動價多少？",
    }),
    "shadow",
    "RC1d: low-confidence concern evidence must not enable suitability enforcement",
  );
  const oldConcernState = structuredClone(baseState);
  oldConcernState.knowledge.concernKeys = ["jawline_looseness"];
  const oldConcernResult = evaluateDialoguePolicy(
    oldConcernState,
    turn({
      concerns: [],
      questionAspect: "suitability",
      questionAspects: ["suitability", "price_campaign"],
      speechAct: "ask_price",
      text: "ONDA 適合嗎？活動價多少？",
      turnId: "turn-contract-old-concern",
    }),
    { responseContractMode: "enforce" },
  );
  assert.equal(
    oldConcernResult.replyPlan.responseContract.mode,
    "shadow",
    "RC1d: an old state concern must not replace explicit current-turn suitability evidence",
  );

  const turnInput = turn({
    questionAspect: "brands",
    questionAspects: ["brands", "price_campaign"],
    speechAct: "ask_price",
    text: "肉毒有哪些品牌？活動價多少？",
    treatments: [{ confidence: 1, key: "botox", polarity: "affirmed", resolution: "resolved" }],
    turnId: "turn-contract-engine-default",
  });
  assert.deepEqual(
    routeConversationTurnV2(structuredClone(baseState), turnInput),
    routeConversationTurnV2(structuredClone(baseState), turnInput, { responseContractMode: "shadow" }),
    "RC1d: every existing two-argument engine caller must remain exactly shadow-equivalent",
  );
  assert.equal(
    routeConversationTurnV2(
      structuredClone(baseState),
      turnInput,
      { responseContractMode: "enforce" },
    ).result?.replyPlan.responseContract.mode,
    "enforce",
    "RC1d: the engine must forward an explicit enforce rollout request to Policy",
  );
}

async function validateSupplementSourceGates() {
  const seedData = await loadSeedData();
  const snapshot = await createStaticClinicFactsProvider({
    pricingCampaigns: seedData.pricingCampaigns,
  }).loadSnapshot({ now: new Date(NOW) });
  const input = {
    concernKeys: ["jawline_looseness"],
    requestedAspects: ["suitability"] as const,
    subjectKey: "onda_pro",
  };
  const resolved = resolveApprovedTreatmentSupplements(snapshot, input);
  assert.equal(resolved.sections.length, 1, "RC1e: an offered reviewed treatment may resolve a supplement");
  const sourceTreatment = snapshot.treatments.find((item) => item.key === "onda_pro");
  assert(sourceTreatment, "RC1e: ONDA must exist in the clinic snapshot");
  const section = resolved.sections[0]!;
  const approvedConcernCopy = sourceTreatment.approvedConcernReplies.jawline_looseness?.[0]?.trim();
  assert(
    approvedConcernCopy && section.customerText.includes(approvedConcernCopy),
    "RC1e: customer copy must be assembled from the exact approved concern source",
  );
  assert(
    section.customerText.includes(sourceTreatment.evaluationNote.trim()),
    "RC1e: suitability copy must preserve the reviewed evaluation boundary",
  );
  assert.equal(
    section.sourceFactId,
    `treatment:onda_pro:${sourceTreatment.contentVersion}:response:suitability`,
    "RC1e: provenance must pin the actual treatment content version and aspect",
  );
  assert.equal(
    section.sourceContentHash,
    approvedTreatmentSupplementHash({
      customerText: section.customerText,
      snapshotId: snapshot.snapshotId,
      sourceFactId: section.sourceFactId,
    }),
    "RC1e: provenance hash must bind snapshot, source id, and exact customer copy",
  );

  const blockedSnapshots = [
    { ...snapshot, treatmentSourceAvailable: false },
    { ...snapshot, staleTreatmentKeys: new Set([...snapshot.staleTreatmentKeys, "onda_pro"]) },
    { ...snapshot, notOfferedTreatmentKeys: new Set([...snapshot.notOfferedTreatmentKeys, "onda_pro"]) },
    {
      ...snapshot,
      treatments: snapshot.treatments.map((item) =>
        item.key === "onda_pro" ? { ...item, approvalStatus: "needs_review" as const } : item),
    },
  ];
  for (const blockedSnapshot of blockedSnapshots) {
    const blocked = resolveApprovedTreatmentSupplements(blockedSnapshot, input);
    assert.deepEqual(blocked.sections, [], "RC1e: unavailable, stale, not-offered, or unreviewed content must never hydrate");
    assert.deepEqual(blocked.unresolvedAspects, ["suitability"]);
  }
}

async function validateIncompleteEnforceDowngradesSafely() {
  const seedData = await loadSeedData();
  const snapshot = await createStaticClinicFactsProvider({
    pricingCampaigns: seedData.pricingCampaigns,
  }).loadSnapshot({ now: new Date(NOW) });
  const cases: Array<{
    expectedPrice: RegExp;
    secondaryAspect: "single_vs_combination" | "suitability";
    turn: TurnUnderstanding;
  }> = [
    {
      expectedPrice: /999/u,
      secondaryAspect: "single_vs_combination",
      turn: turn({
        questionAspect: "single_vs_combination",
        questionAspects: ["single_vs_combination", "price_campaign"],
        speechAct: "ask_price",
        text: "肉毒單做跟搭配差在哪？活動價多少？",
        treatments: [{ confidence: 1, key: "botox", polarity: "affirmed", resolution: "resolved" }],
        turnId: "turn-contract-botox-combination-gap",
      }),
    },
    {
      expectedPrice: /16,888/u,
      secondaryAspect: "suitability",
      turn: turn({
        areas: [{ confidence: 1, key: "face", polarity: "affirmed", resolution: "resolved" }],
        concerns: [{ confidence: 1, key: "dynamic_wrinkles", polarity: "affirmed", resolution: "resolved" }],
        questionAspect: "suitability",
        questionAspects: ["suitability", "price_campaign"],
        speechAct: "ask_price",
        text: "我有皺眉紋，ONDA 適合嗎？活動價多少？",
        turnId: "turn-contract-onda-unrelated-concern",
      }),
    },
  ];
  for (const item of cases) {
    const state = createConversationV2State({ episodeId: `episode-${item.turn.turnId}`, now: NOW });
    const result = evaluateDialoguePolicy(state, item.turn, { responseContractMode: "enforce" });
    assert.equal(
      result.replyPlan.responseContract.mode,
      "enforce",
      "RC1f: policy may request the pilot before runtime content is loaded",
    );
    const hydrated = await hydrateConversationV2ReplyPlan({
      nextState: state,
      result,
      snapshot,
      turn: item.turn,
    });
    assert(hydrated.rendererPlan, "RC1f: canonical price must still hydrate");
    assert.equal(
      hydrated.rendererPlan.responseContract.mode,
      "shadow",
      "RC1f: unresolved or unrelated approved content must explicitly downgrade to observation-only",
    );
    assert.equal(hydrated.rendererPlan.approvedPriceReply?.supplements?.length ?? 0, 0);
    const rendered = await renderReplyPlan({
      customerMessage: item.turn.text,
      dialogueState: rendererDialogueState(item.turn.treatments[0]!.key),
      footer: FOOTER,
      plan: hydrated.rendererPlan,
      recentTurns: [],
    });
    assert.match(rendered.replyText, item.expectedPrice, "RC1f: downgrade must preserve the canonical approved price answer");
    assert.equal(rendered.fallbackReason, undefined, "RC1f: downgrade must not trigger a generic renderer fallback");
    assert.deepEqual(rendered.responseContract.completedAspects, ["price_campaign"]);
    assert.deepEqual(rendered.responseContract.missingAspects, [item.secondaryAspect]);
  }
}

async function validateHydrationOwnsLowConfidenceDowngrade() {
  const seedData = await loadSeedData();
  const snapshot = await createStaticClinicFactsProvider({
    pricingCampaigns: seedData.pricingCampaigns,
  }).loadSnapshot({ now: new Date(NOW) });
  const state = createConversationV2State({ episodeId: "episode-hydrate-low-confidence", now: NOW });
  const trustedTurn = turn({
    areas: [{ confidence: 1, key: "jawline", polarity: "affirmed", resolution: "resolved" }],
    concerns: [{ confidence: 1, key: "jawline_looseness", polarity: "affirmed", resolution: "resolved" }],
    questionAspect: "suitability",
    questionAspects: ["suitability", "price_campaign"],
    speechAct: "ask_price",
    text: "我雙下巴肉很多，ONDA 適合嗎？活動價多少？",
    turnId: "turn-hydrate-low-confidence",
  });
  const result = evaluateDialoguePolicy(state, trustedTurn, { responseContractMode: "enforce" });
  assert.equal(result.replyPlan.responseContract.mode, "enforce");

  // Keep the already-authorized contract but replace only the runtime evidence.
  // This proves Hydration independently refuses an untrusted concern instead of
  // relying on Policy to have downgraded the contract first.
  const lowConfidenceTurn = turn({
    ...trustedTurn,
    concerns: [{ confidence: 0.1, key: "jawline_looseness", polarity: "affirmed", resolution: "resolved" }],
  });
  const hydrated = await hydrateConversationV2ReplyPlan({
    nextState: state,
    result,
    snapshot,
    turn: lowConfidenceTurn,
  });
  assert(hydrated.rendererPlan, "RC1f2: canonical price must still hydrate");
  assert.equal(
    hydrated.rendererPlan.responseContract.mode,
    "shadow",
    "RC1f2: Hydration must independently downgrade untrusted current-turn concern evidence",
  );
  assert.equal(hydrated.rendererPlan.approvedPriceReply?.supplements?.length ?? 0, 0);
  const rendered = await renderReplyPlan({
    customerMessage: lowConfidenceTurn.text,
    dialogueState: rendererDialogueState("onda_pro"),
    footer: FOOTER,
    plan: hydrated.rendererPlan,
    recentTurns: [],
  });
  assert.match(rendered.replyText, /16,888/u, "RC1f2: downgrade must preserve the approved price");
  assert.equal(rendered.fallbackReason, undefined);
}

async function validateInheritedPriceSubjectDoesNotOverrideCurrentConcern() {
  const conflictingState = createConversationV2State({
    episodeId: "episode-inherited-price-conflict",
    now: NOW,
  });
  conflictingState.activeTask = {
    id: "active-onda",
    kind: "learn_treatment",
    startedAt: NOW,
    subjectKey: "treatment:onda_pro",
  };
  conflictingState.knowledge.treatmentKeys = ["onda_pro"];
  const conflictingTurn = turn({
    areas: [{ confidence: 1, key: "face", polarity: "affirmed", resolution: "resolved" }],
    concerns: [{ confidence: 1, key: "dynamic_wrinkles", polarity: "affirmed", resolution: "resolved" }],
    dialogueReference: "active_subject",
    questionAspect: "price_unspecified",
    questionAspects: ["price_unspecified"],
    speechAct: "ask_price",
    text: "皺眉紋多少錢？",
    treatments: [],
    turnId: "turn-inherited-price-conflict",
  });
  assert.deepEqual(
    resolvePriceSubjectForPolicy(conflictingState, conflictingTurn),
    {
      blockedByUnconfirmedMention: false,
      source: "inherited_context",
      treatmentKeys: ["onda_pro"],
    },
    "RC1h: Policy must explicitly mark a contextual owner so the snapshot-aware live adapter can validate compatibility before state commit",
  );

  const compatibleState = structuredClone(conflictingState);
  const compatibleTurn = turn({
    areas: [{ confidence: 1, key: "jawline", polarity: "affirmed", resolution: "resolved" }],
    concerns: [{ confidence: 1, key: "jawline_looseness", polarity: "affirmed", resolution: "resolved" }],
    dialogueReference: "active_subject",
    questionAspect: "price_unspecified",
    questionAspects: ["price_unspecified"],
    speechAct: "ask_price",
    text: "雙下巴多少錢？",
    treatments: [],
    turnId: "turn-inherited-price-compatible",
  });
  assert.equal(
    resolvePriceSubjectForPolicy(compatibleState, compatibleTurn).source,
    "inherited_context",
  );

  const explicitLowConfidenceTurn = turn({
    confidence: 0.4,
    concerns: [{ confidence: 0.4, key: "dynamic_wrinkles", polarity: "affirmed", resolution: "underspecified" }],
    dialogueReference: "active_subject",
    questionAspect: "price_unspecified",
    questionAspects: ["price_unspecified"],
    speechAct: "ask_price",
    text: "ONDA 皺眉紋多少錢？",
    treatments: [{ confidence: 0.4, key: "onda_pro", polarity: "affirmed", resolution: "underspecified" }],
    turnId: "turn-explicit-low-confidence-price-owner",
  });
  assert.deepEqual(
    resolvePriceSubjectForPolicy(conflictingState, explicitLowConfidenceTurn),
    {
      blockedByUnconfirmedMention: false,
      source: "explicit_current",
      treatmentKeys: ["onda_pro"],
    },
    "RC1h: exact current text, not NLU confidence, owns an explicitly named price subject",
  );
}

async function validateOldConcernDoesNotLeakIntoCurrentPriceCopy() {
  const seedData = await loadSeedData();
  const snapshot = await createStaticClinicFactsProvider({
    pricingCampaigns: seedData.pricingCampaigns,
  }).loadSnapshot({ now: new Date(NOW) });
  const state = createConversationV2State({ episodeId: "episode-old-concern-copy", now: NOW });
  state.knowledge.concernKeys = ["dynamic_wrinkles"];
  const currentTurn = turn({
    concerns: [],
    questionAspect: "brands",
    questionAspects: ["brands", "price_campaign"],
    speechAct: "ask_price",
    text: "肉毒有哪些品牌？活動價多少？",
    treatments: [{ confidence: 1, key: "botox", polarity: "affirmed", resolution: "resolved" }],
    turnId: "turn-old-concern-copy",
  });
  const routed = routeConversationTurnV2(state, currentTurn, { responseContractMode: "enforce" });
  assert(routed.result);
  const hydrated = await hydrateConversationV2ReplyPlan({
    nextState: routed.nextState,
    result: routed.result,
    snapshot,
    turn: currentTurn,
  });
  assert(hydrated.rendererPlan);
  const rendered = await renderReplyPlan({
    customerMessage: currentTurn.text,
    dialogueState: rendererDialogueState("botox"),
    footer: FOOTER,
    plan: hydrated.rendererPlan,
    recentTurns: [],
  });
  assert.match(rendered.replyText, /999/u);
  assert.doesNotMatch(
    rendered.replyText,
    /您提到在意/u,
    "RC1i: an old concern must not appear as if the customer stated it on the current turn",
  );
}

async function validateCurrentConcernOwnsSupplement() {
  const seedData = await loadSeedData();
  const snapshot = await createStaticClinicFactsProvider({
    pricingCampaigns: seedData.pricingCampaigns,
  }).loadSnapshot({ now: new Date(NOW) });
  const cases = [
    {
      currentArea: "jawline",
      currentConcern: "jawline_looseness",
      oldConcern: "dynamic_wrinkles",
      text: "我雙下巴肉很多，ONDA 適合嗎？活動價多少？",
      treatmentKey: "onda_pro",
    },
    {
      currentArea: "face",
      currentConcern: "dynamic_wrinkles",
      oldConcern: "masseter_contour",
      text: "我皺眉紋很明顯，肉毒適合嗎？活動價多少？",
      treatmentKey: "botox",
    },
  ] as const;
  for (const item of cases) {
    const state = createConversationV2State({
      episodeId: `episode-current-concern-${item.treatmentKey}`,
      now: NOW,
    });
    state.knowledge.concernKeys = [item.oldConcern];
    state.knowledge.treatmentKeys = [item.treatmentKey];
    const currentTurn = turn({
      areas: [{ confidence: 1, key: item.currentArea, polarity: "affirmed", resolution: "resolved" }],
      concerns: [{ confidence: 1, key: item.currentConcern, polarity: "affirmed", resolution: "resolved" }],
      questionAspect: "suitability",
      questionAspects: ["suitability", "price_campaign"],
      speechAct: "ask_price",
      text: item.text,
      treatments: [{ confidence: 1, key: item.treatmentKey, polarity: "affirmed", resolution: "resolved" }],
      turnId: `turn-current-concern-${item.treatmentKey}`,
    });
    const routed = routeConversationTurnV2(state, currentTurn, { responseContractMode: "enforce" });
    assert.equal(routed.result?.replyPlan.responseContract.mode, "enforce");
    assert(routed.result, "RC1g: current concern route must produce a policy result");
    const hydrated = await hydrateConversationV2ReplyPlan({
      nextState: routed.nextState,
      result: routed.result,
      snapshot,
      turn: currentTurn,
    });
    assert(hydrated.rendererPlan, "RC1g: current concern route must hydrate");
    const supplement = hydrated.rendererPlan.approvedPriceReply?.supplements?.[0];
    assert(supplement, "RC1g: current relevant concern must produce a suitability supplement");
    const treatment = snapshot.treatments.find((candidate) => candidate.key === item.treatmentKey);
    assert(treatment, "RC1g: treatment must exist in snapshot");
    const currentCopy = treatment.approvedConcernReplies[item.currentConcern]?.[0]?.trim();
    assert(currentCopy && supplement.customerText.includes(currentCopy));
    const oldCopy = treatment.approvedConcernReplies[item.oldConcern]?.[0]?.trim();
    if (oldCopy && oldCopy !== currentCopy) {
      assert(
        !supplement.customerText.includes(oldCopy),
        "RC1g: append-only state must not overwrite the explicit current-message concern",
      );
    }
  }
}

async function validateParsedMultiAspectPipeline() {
  const seedData = await loadSeedData();
  const snapshot = await createStaticClinicFactsProvider({
    pricingCampaigns: seedData.pricingCampaigns,
  }).loadSnapshot({ now: new Date(NOW) });
  const cases = [
    {
      expectedMustAnswer: ["price_campaign", "suitability", "comfort_recovery"],
      expectedMissing: [],
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
      expectedMissing: [],
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
    const shadowResult = evaluateDialoguePolicy(state, adapted);
    const enforcedResult = evaluateDialoguePolicy(state, adapted, {
      responseContractMode: "enforce",
    });
    assert.equal(
      shadowResult.action.type,
      "answer_price",
      `RC1c ${item.id}: deterministic price must remain the single winning action`,
    );
    assert.deepEqual(
      shadowResult.replyPlan.responseContract,
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
    assert.equal(
      enforcedResult.replyPlan.responseContract.mode,
      "enforce",
      `RC1c ${item.id}: only the explicit policy rollout may enable enforcement`,
    );

    const offPlan = {
      ...shadowResult.replyPlan,
      responseContract: createOffResponseContract(),
    } as typeof shadowResult.replyPlan;
    const shadowHydrated = await hydrateConversationV2ReplyPlan({
      nextState: state,
      result: shadowResult,
      snapshot,
      turn: adapted,
    });
    const enforcedHydrated = await hydrateConversationV2ReplyPlan({
      nextState: state,
      result: enforcedResult,
      snapshot,
      turn: adapted,
    });
    const offHydrated = await hydrateConversationV2ReplyPlan({
      nextState: state,
      result: { ...shadowResult, replyPlan: offPlan },
      snapshot,
      turn: adapted,
    });
    assert(shadowHydrated.rendererPlan, `RC1c ${item.id}: shadow plan must hydrate`);
    assert(enforcedHydrated.rendererPlan, `RC1c ${item.id}: enforce plan must hydrate`);
    assert(offHydrated.rendererPlan, `RC1c ${item.id}: off plan must hydrate`);
    const { responseContract: shadowContract } = shadowHydrated.rendererPlan;
    const { responseContract: enforcedContract } = enforcedHydrated.rendererPlan;
    const { responseContract: offContract } = offHydrated.rendererPlan;
    assert.equal(shadowContract.mode, "shadow");
    assert.equal(enforcedContract.mode, "enforce");
    assert.equal(offContract.mode, "off");
    assert.equal(
      shadowHydrated.rendererPlan.approvedPriceReply?.supplements?.length ?? 0,
      0,
      `RC1c ${item.id}: shadow must not alter customer-visible price content`,
    );
    assert(
      (enforcedHydrated.rendererPlan.approvedPriceReply?.supplements?.length ?? 0) > 0,
      `RC1c ${item.id}: fully grounded duties must hydrate typed supplements`,
    );
    assert.equal(
      offHydrated.rendererPlan.approvedPriceReply?.supplements?.length ?? 0,
      0,
      `RC1c ${item.id}: off contract must not create supplemental duties`,
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
    const enforcedRendered = await renderReplyPlan({
      customerMessage: item.text,
      dialogueState,
      footer: FOOTER,
      generator: async () => { throw new Error("deterministic price path must not call a model"); },
      plan: enforcedHydrated.rendererPlan,
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
      enforcedRendered.replyText,
      item.expectedPrice,
      `RC1c ${item.id}: the actual final renderer text must include the approved price`,
    );
    assert.equal(
      shadowRendered.replyText,
      offRendered.replyText,
      `RC1c ${item.id}: shadow observation must not alter final customer text`,
    );
    assert.notEqual(
      enforcedRendered.replyText,
      shadowRendered.replyText,
      `RC1c ${item.id}: enforce path must add reviewed secondary answers`,
    );
    for (const supplement of enforcedHydrated.rendererPlan.approvedPriceReply?.supplements ?? []) {
      assert(
        enforcedRendered.replyText.includes(supplement.customerText),
        `RC1c ${item.id}: every typed supplement must be customer-visible`,
      );
    }
    assert.deepEqual(
      enforcedRendered.responseContract.completedAspects,
      item.expectedMustAnswer,
      `RC1c ${item.id}: typed receipts must complete every grounded duty`,
    );
    assert.deepEqual(
      enforcedRendered.responseContract.missingAspects,
      item.expectedMissing,
      `RC1c ${item.id}: unanswered secondary intent must remain visible instead of becoming a false green`,
    );
    assert.equal(enforcedRendered.responseContract.coverageStatus, "verified");
    assert.deepEqual(
      shadowRendered.responseContract.completedAspects,
      ["price_campaign"],
      `RC1c ${item.id}: shadow trace may count the price receipt only`,
    );
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
  validatePolicyOwnsEnforceEligibility();
  await validateSupplementSourceGates();
  await validateIncompleteEnforceDowngradesSafely();
  await validateHydrationOwnsLowConfidenceDowngrade();
  await validateInheritedPriceSubjectDoesNotOverrideCurrentConcern();
  await validateOldConcernDoesNotLeakIntoCurrentPriceCopy();
  await validateCurrentConcernOwnsSupplement();
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
