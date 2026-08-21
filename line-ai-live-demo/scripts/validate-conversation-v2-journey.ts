/**
 * Replays the exact production canary conversation that failed real-customer testing.
 *
 * Every turn below matched a screenshot from the failed canary, so this file is the
 * regression contract for that failure: internal facts sent verbatim, a named
 * treatment losing its price subject, and an explicit booking request answered with
 * "剛剛沒有完整理解您的問題". Unit tests on the guard and the resolver all passed while
 * the product was broken, so the assertions here run the live route end to end.
 *
 * Deterministic only: the NLU frame is injected, facts come from the static provider,
 * and no model or network call is made.
 */

import assert from "node:assert/strict";

import { createStaticClinicFactsProvider } from "@/lib/clinic-facts/static-provider";
import { containsInternalFieldLabel } from "@/lib/conversation-v2/customer-text-guard";
import { routeConversationV2Canary } from "@/lib/conversation-v2/live-runtime";
import {
  createEmptyConversationContext,
  type ConversationContext,
} from "@/lib/conversation-context";
import type { NluFrame } from "@/lib/nlu-frame";

const NOW = new Date("2026-08-24T12:00:00+08:00");
const USER_ID = "U-journey";

const THREE_OPTION_LEGACY_TEXT = "您比較想了解改善方向、療程感受，還是恢復期呢？";

/** Wording the bot uses when it declines to guess which treatment a price belongs to. */
const CLARIFY_PATTERN = /哪一?[項個]療程|指的是|想確認一下/u;

/**
 * ONDA's approved campaign, mirroring the clinic seed row. The static provider ships
 * with no campaigns, so without this every price turn resolves to
 * "unavailable_to_quote" and a price assertion would pass while proving nothing. The
 * exact amount is asserted below: that is the only evidence the approved price path
 * actually ran rather than a clarification.
 */
const ONDA_APPROVED_PRICE_TEXT = "體驗價 16,888";
const ONDA_PRICE_AMOUNT = "16,888";

const ondaCampaign = {
  approval_status: "approved",
  asset_urls: "",
  branch_scope: "all",
  campaign_aliases: "ONDA|ONDA PRO|超微波|ONDA體驗價|ONDA活動|ONDA優惠",
  campaign_name: "2026 ONDA PRO 體驗方案",
  customer_price_approval_status: "approved",
  customer_price_text: ONDA_APPROVED_PRICE_TEXT,
  end_date: "2026-12-31",
  fallback_message: "😊 想先了解哪個部位呢？我可以協助安排諮詢。",
  id: "promo-2026-08-05-onda-pro",
  is_active: "true",
  notes: "journey fixture mirroring the approved clinic seed row",
  price_text: ONDA_APPROVED_PRICE_TEXT,
  start_date: "2026-08-05",
  treatment_name: "ONDA PRO",
};

const ondaFaceCombinationCampaign = {
  ...ondaCampaign,
  booking_treatments: "ONDA PRO|肉毒",
  campaign_aliases: "臉部輪廓組合|ONDA雙下巴|ONDA嘴邊肉|雙下巴方案|嘴邊肉方案|12999|12,999",
  campaign_name: "2026 ONDA Pro＋肉毒小臉方案",
  customer_price_text: "12,999元（ONDA Pro超微波6分鐘＋Neuronox肉毒小臉）",
  end_date: "2026-08-31",
  id: "promo-2026-08-face-contour-combo",
  price_text: "12,999元（ONDA Pro超微波6分鐘＋Neuronox肉毒小臉）",
  treatment_name: "臉部輪廓組合",
};

function factsProvider() {
  return createStaticClinicFactsProvider({
    pricingCampaigns: [ondaCampaign, ondaFaceCombinationCampaign],
  });
}

type FrameOverrides = Partial<NluFrame>;

function frame(overrides: FrameOverrides = {}): NluFrame {
  return {
    areas: [],
    confidence: 0.95,
    concerns: [],
    dialogue: {
      focus: "overview",
      move: "start",
      reference: "explicit",
      speechAct: "learn_treatment",
    },
    intents: ["treatment"],
    negated: [],
    safety: {
      complaint: false,
      humanRequest: false,
      postTreatmentRisk: false,
      pregnancyNursing: false,
    },
    schemaVersion: 2,
    treatments: ["onda_pro"],
    ...overrides,
  };
}

function nluResult(value: NluFrame | null) {
  return {
    errorCode: value ? null : "nlu_unavailable",
    frame: value,
    latencyMs: 5,
    model: "fixture-nlu",
    promptVersion: "fixture-v2",
    tokensIn: 10,
    tokensOut: 5,
  };
}

function canarySettings() {
  return { allowlistedUserIds: [USER_ID], mode: "canary" as const };
}

async function routeTurn(input: {
  context: ConversationContext;
  frame: NluFrame | null;
  message: string;
  turnIndex: number;
}) {
  const result = await routeConversationV2Canary({
    context: input.context,
    eventIdentity: `journey-${input.turnIndex}`,
    message: input.message,
    now: NOW,
    sourceType: "user",
    sourceUserId: USER_ID,
  }, {
    factsProvider: factsProvider(),
    getCanarySettings: canarySettings,
    requestFrame: async () => nluResult(input.frame),
  });
  assert.equal(result.kind, "routed", `turn ${input.turnIndex} must be routed by V2`);
  assert.ok("decision" in result && result.decision, `turn ${input.turnIndex} must produce a decision`);
  return result as Extract<typeof result, { kind: "routed" }>;
}

function summarize(label: string, message: string, decision: { matchedKey: string; replyText: string }) {
  const reply = decision.replyText.replace(/\n/gu, " / ").slice(0, 96);
  console.log(`  ${label} [${message}]`);
  console.log(`    ${decision.matchedKey}`);
  console.log(`    ${reply}`);
}

/** Every customer-visible reply in the journey must pass these invariants. */
function assertCustomerVisibleInvariants(turnIndex: number, replyText: string) {
  assert.equal(
    containsInternalFieldLabel(replyText),
    false,
    `turn ${turnIndex}: internal field labels must never reach the customer: ${replyText}`,
  );
  assert.ok(
    !replyText.includes(THREE_OPTION_LEGACY_TEXT),
    `turn ${turnIndex}: the non-advancing three-option menu must not be used`,
  );
  assert.ok(
    !replyText.includes("我會從目前進度接著整理"),
    `turn ${turnIndex}: contextual turns must not use the empty generic fallback`,
  );
}

async function validateSixTurnJourney() {
  let context = createEmptyConversationContext(USER_ID);
  console.log("### Six-turn journey replay");

  // Turn 1: opening treatment question. The canary answered with "療程名稱：ONDA PRO".
  const turn1 = await routeTurn({
    context,
    frame: frame(),
    message: "我想了解 ONDA",
    turnIndex: 1,
  });
  summarize("1", "我想了解 ONDA", turn1.decision);
  assertCustomerVisibleInvariants(1, turn1.decision.replyText);
  assert.ok(turn1.decision.replyText.trim(), "turn 1 must produce a reply");
  context = turn1.decision.nextContext;

  // Turn 2: a bare concern answer. The canary replied with a generic three-way menu.
  const turn2 = await routeTurn({
    context,
    frame: frame({
      concerns: [{ area: "jawline", key: "jawline_looseness" }],
      dialogue: { focus: "overview", move: "continue", reference: "active_subject", speechAct: "ask_concern" },
      treatments: [],
    }),
    message: "雙下巴",
    turnIndex: 2,
  });
  summarize("2", "雙下巴", turn2.decision);
  assertCustomerVisibleInvariants(2, turn2.decision.replyText);
  assert.ok(
    turn2.decision.nextContext.activeFocus?.concernKeys.includes("jawline_looseness"),
    "turn 2 must record the double-chin concern on the active focus",
  );
  assert.ok(
    /雙下巴|下顎/u.test(turn2.decision.replyText),
    `turn 2 must answer the selected concern rather than show a generic menu: ${turn2.decision.replyText}`,
  );
  context = turn2.decision.nextContext;

  // Turn 3: restating treatment + concern together must not replay the intro.
  const turn3 = await routeTurn({
    context,
    frame: frame({
      concerns: [{ area: "jawline", key: "jawline_looseness" }],
      dialogue: { focus: "overview", move: "continue", reference: "active_subject", speechAct: "ask_treatment_detail" },
    }),
    message: "我想要 ONDA 處理雙下巴",
    turnIndex: 3,
  });
  summarize("3", "我想要 ONDA 處理雙下巴", turn3.decision);
  assertCustomerVisibleInvariants(3, turn3.decision.replyText);
  assert.notEqual(
    turn3.decision.replyText,
    turn1.decision.replyText,
    "turn 3 must not replay the first-turn introduction verbatim",
  );
  assert.notEqual(
    turn3.decision.replyText,
    turn2.decision.replyText,
    "turn 3 must advance rather than repeat the immediately previous concern reply",
  );
  assert.equal(
    turn3.decision.nextContext.activeFocus?.treatmentKey,
    "onda_pro",
    "turn 3 must keep ONDA as the focus treatment",
  );
  context = turn3.decision.nextContext;

  // Turn 4: price question with no treatment named. Must inherit the active ONDA.
  const turn4 = await routeTurn({
    context,
    frame: frame({
      dialogue: { focus: "price_unspecified", move: "continue", reference: "active_subject", speechAct: "ask_price" },
      intents: ["pricing"],
      treatments: [],
    }),
    message: "體驗價是多少呢",
    turnIndex: 4,
  });
  summarize("4", "體驗價是多少呢", turn4.decision);
  assertCustomerVisibleInvariants(4, turn4.decision.replyText);
  assert.ok(
    !turn4.decision.replyText.includes("哪一項療程"),
    "turn 4 must not ask which treatment when ONDA is already active",
  );
  assert.ok(
    turn4.decision.replyText.includes("16,888") &&
      turn4.decision.replyText.includes("12,999") &&
      turn4.decision.replyText.includes("內容不同"),
    `turn 4 must distinguish standalone and combination prices in a face-concern context: ${turn4.decision.replyText}`,
  );
  context = turn4.decision.nextContext;

  // Turn 5: price question that names ONDA outright. The canary still clarified.
  const turn5 = await routeTurn({
    context,
    frame: frame({
      dialogue: { focus: "price_unspecified", move: "continue", reference: "explicit", speechAct: "ask_price" },
      intents: ["pricing"],
    }),
    message: "ONDA 有沒有活動價格",
    turnIndex: 5,
  });
  summarize("5", "ONDA 有沒有活動價格", turn5.decision);
  assertCustomerVisibleInvariants(5, turn5.decision.replyText);
  assert.ok(
    !turn5.decision.replyText.includes("哪一項療程"),
    "turn 5 must not clarify the subject when the turn names ONDA",
  );
  context = turn5.decision.nextContext;

  // Turn 6: explicit booking with the NLU deliberately unavailable. This is the
  // regression that mattered most: booking parsing is deterministic and must not be
  // discarded when the model returns no frame.
  const turn6 = await routeTurn({
    context,
    frame: null,
    message: "我要預約諮詢",
    turnIndex: 6,
  });
  summarize("6", "我要預約諮詢 (frame=null)", turn6.decision);
  assertCustomerVisibleInvariants(6, turn6.decision.replyText);
  assert.ok(
    !turn6.decision.matchedKey.startsWith("conversation_v2_unavailable:"),
    `turn 6 must not fall back to the deterministic "did not understand" reply: ${turn6.decision.matchedKey}`,
  );
  assert.ok(
    !turn6.decision.replyText.includes("剛剛沒有完整理解"),
    "turn 6 must not tell an explicitly booking customer that it did not understand",
  );
  const bookingSignal = Boolean(turn6.toolRequest) ||
    turn6.decision.matchedKey.includes("booking") ||
    turn6.decision.decisionType === "booking_intake_reply";
  assert.ok(
    bookingSignal,
    `turn 6 must enter the booking flow: ${turn6.decision.matchedKey}`,
  );
  assert.ok(
    !/已(?:完成|為您)預約|預約成功/u.test(turn6.decision.replyText),
    "turn 6 must not claim the booking is already complete",
  );

  console.log("PASS: J1 six-turn journey");
}

/**
 * Price ownership. Asserting the subject alone is not enough: the reply has to carry
 * approved price data, which is what proves the resolver ran instead of a clarify.
 */
async function validatePricingOwnership() {
  console.log("### Pricing ownership");

  async function primedOndaContext() {
    let context = createEmptyConversationContext("U-price");
    const intro = await routeConversationV2Canary({
      context,
      eventIdentity: "price-intro",
      message: "我想了解 ONDA",
      now: NOW,
      sourceType: "user",
      sourceUserId: "U-price",
    }, {
      factsProvider: factsProvider(),
      getCanarySettings: () => ({ allowlistedUserIds: ["U-price"], mode: "canary" as const }),
      requestFrame: async () => nluResult(frame()),
    });
    assert.ok("decision" in intro && intro.decision, "priming turn must produce a decision");
    context = intro.decision.nextContext;
    return context;
  }

  async function askPrice(input: {
    context: ConversationContext;
    frameOverrides: FrameOverrides;
    message: string;
    userId: string;
  }) {
    const result = await routeConversationV2Canary({
      context: input.context,
      eventIdentity: `price-${input.message}`,
      message: input.message,
      now: NOW,
      sourceType: "user",
      sourceUserId: input.userId,
    }, {
      factsProvider: factsProvider(),
      getCanarySettings: () => ({ allowlistedUserIds: [input.userId], mode: "canary" as const }),
      requestFrame: async () => nluResult(frame(input.frameOverrides)),
    });
    assert.ok("decision" in result && result.decision, "price turn must produce a decision");
    return result as Extract<typeof result, { kind: "routed" }>;
  }

  const activeContext = await primedOndaContext();
  const activeSubject = await askPrice({
    context: activeContext,
    frameOverrides: {
      dialogue: { focus: "price_unspecified", move: "continue", reference: "active_subject", speechAct: "ask_price" },
      intents: ["pricing"],
      treatments: [],
    },
    message: "體驗價多少",
    userId: "U-price",
  });
  summarize("P1", "active ONDA + 體驗價多少", activeSubject.decision);
  assert.ok(
    !activeSubject.decision.replyText.includes("哪一項療程"),
    "P1: an active ONDA must own a subjectless price question",
  );
  assert.ok(
    activeSubject.decision.replyText.includes(ONDA_PRICE_AMOUNT),
    `P1: an active ONDA must quote the approved amount: ${activeSubject.decision.replyText}`,
  );

  const explicitSubject = await askPrice({
    context: createEmptyConversationContext("U-price-explicit"),
    frameOverrides: {
      dialogue: { focus: "price_unspecified", move: "start", reference: "explicit", speechAct: "ask_price" },
      intents: ["pricing"],
    },
    message: "ONDA 有沒有活動價格",
    userId: "U-price-explicit",
  });
  summarize("P2", "本句 ONDA + 有沒有活動價格", explicitSubject.decision);
  assert.ok(
    !explicitSubject.decision.replyText.includes("哪一項療程"),
    "P2: a treatment named in the turn must own the price question",
  );
  assert.ok(
    explicitSubject.decision.replyText.includes(ONDA_PRICE_AMOUNT),
    `P2: the reply must quote the approved ONDA amount: ${explicitSubject.decision.replyText}`,
  );

  const priceAndConcern = await askPrice({
    context: activeContext,
    frameOverrides: {
      concerns: [{ area: "face", key: "jawline_looseness" }],
      dialogue: { focus: "price_campaign", move: "continue", reference: "active_subject", speechAct: "ask_price" },
      intents: ["pricing"],
      treatments: [],
    },
    message: "有活動嗎？我在意肉肉臉",
    userId: "U-price",
  });
  summarize("P2a", "有活動嗎？我在意肉肉臉", priceAndConcern.decision);
  assert.ok(
    priceAndConcern.decision.replyText.includes("16,888") &&
      priceAndConcern.decision.replyText.includes("12,999"),
    `P2a: same-turn price plus concern must explain both approved offers: ${priceAndConcern.decision.replyText}`,
  );
  assert.ok(
    priceAndConcern.decision.nextContext.activeFocus?.concernKeys.includes("jawline_looseness"),
    "P2a: same-turn concern must remain in canonical context",
  );
  assert.doesNotMatch(
    priceAndConcern.decision.replyText,
    /(?:2026|08[\/-]31|8\s*月\s*31)/u,
    "P2a: campaign dates are internal only",
  );

  const noSubject = await askPrice({
    context: createEmptyConversationContext("U-price-none"),
    frameOverrides: {
      dialogue: { focus: "price_unspecified", move: "start", reference: "none", speechAct: "ask_price" },
      intents: ["pricing"],
      treatments: [],
    },
    message: "多少錢",
    userId: "U-price-none",
  });
  summarize("P3", "無主體 + 多少錢", noSubject.decision);
  assert.ok(
    CLARIFY_PATTERN.test(noSubject.decision.replyText),
    `P3: a subjectless price question must clarify rather than guess: ${noSubject.decision.replyText}`,
  );
  assert.ok(
    !noSubject.decision.replyText.includes(ONDA_PRICE_AMOUNT),
    `P3: a subjectless price question must not quote any treatment's price: ${noSubject.decision.replyText}`,
  );

  const hedged = await askPrice({
    context: createEmptyConversationContext("U-price-hedged"),
    frameOverrides: {
      confidence: 0.4,
      dialogue: { focus: "price_unspecified", move: "start", reference: "none", speechAct: "ask_price" },
      intents: ["pricing"],
      treatments: [],
    },
    message: "我好像想問那個肉毒多少",
    userId: "U-price-hedged",
  });
  summarize("P4", "猶疑句 + 肉毒多少", hedged.decision);
  // The fixture only carries the ONDA campaign, so asserting the absence of some other
  // treatment's amount would be vacuous. The reachable failure is being handed ONDA's
  // price, so that is what this pins.
  assert.ok(
    !hedged.decision.replyText.includes(ONDA_PRICE_AMOUNT),
    `P4: a hedged mention must not be answered with another treatment's price: ${hedged.decision.replyText}`,
  );
  assert.ok(
    CLARIFY_PATTERN.test(hedged.decision.replyText),
    `P4: a hedged mention must clarify the subject: ${hedged.decision.replyText}`,
  );

  // P5 reproduces the actual production shape: the NLU returned low confidence while
  // the customer named ONDA outright. That is the path that produced
  // "想確認一下，您指的是哪一項療程呢？" in the failed canary, so a high-confidence
  // fixture alone proves nothing about it.
  const lowConfidenceNamed = await askPrice({
    context: createEmptyConversationContext("U-price-lowconf"),
    frameOverrides: {
      confidence: 0.4,
      dialogue: { focus: "price_unspecified", move: "start", reference: "explicit", speechAct: "ask_price" },
      intents: ["pricing"],
      treatments: ["onda_pro"],
    },
    message: "ONDA 有沒有活動價格",
    userId: "U-price-lowconf",
  });
  summarize("P5", "低信心 + 本句 ONDA", lowConfidenceNamed.decision);
  assert.ok(
    !lowConfidenceNamed.decision.replyText.includes("您指的是哪一項療程"),
    `P5: a named treatment must survive low NLU confidence: ${lowConfidenceNamed.decision.replyText}`,
  );
  assert.ok(
    lowConfidenceNamed.decision.replyText.includes(ONDA_PRICE_AMOUNT),
    `P5: low-confidence named ONDA must still quote the approved amount: ${lowConfidenceNamed.decision.replyText}`,
  );

  // P6 is the counterpart to P5. P4 hedges with no active subject and low confidence,
  // so it never reaches the subject-inheritance path. Here ONDA is already active and
  // the NLU is confident, which is the combination that can silently hand the customer
  // ONDA's price for a treatment they only hedged at.
  const hedgedWithActiveSubject = await askPrice({
    context: await primedOndaContext(),
    frameOverrides: {
      confidence: 0.9,
      dialogue: { focus: "price_unspecified", move: "continue", reference: "active_subject", speechAct: "ask_price" },
      intents: ["pricing"],
      treatments: [],
    },
    message: "我好像想問那個肉毒多少",
    userId: "U-price",
  });
  summarize("P6", "active ONDA + 高信心猶疑肉毒", hedgedWithActiveSubject.decision);
  assert.ok(
    !hedgedWithActiveSubject.decision.replyText.includes(ONDA_PRICE_AMOUNT),
    `P6: a hedged treatment must not inherit the active subject's price: ${hedgedWithActiveSubject.decision.replyText}`,
  );
  assert.ok(
    CLARIFY_PATTERN.test(hedgedWithActiveSubject.decision.replyText),
    `P6: a hedged treatment must clarify instead of inheriting the active subject: ${hedgedWithActiveSubject.decision.replyText}`,
  );

  console.log("PASS: J2 pricing ownership");
}

async function main() {
  await validateSixTurnJourney();
  await validatePricingOwnership();
  console.log("Conversation V2 journey validation passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
