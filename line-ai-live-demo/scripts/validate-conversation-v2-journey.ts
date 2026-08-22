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
import { isExplicitTreatmentOverviewRestart } from "@/lib/conversation-v2/episode-policy";
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
const ONDA_JAWLINE_FAT_ASSET_COPY =
  "🌿 了解😊 目前先記下是雙下巴的脂肪型困擾（肉感／厚度）。ONDA Pro 可從局部脂肪厚度與下顎線條方向評估。";

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
  customer_price_text: "ONDA＋肉毒小臉組合 12,999 元",
  end_date: "2026-08-31",
  id: "promo-2026-08-face-contour-combo",
  price_text: "ONDA＋肉毒小臉組合 12,999 元",
  treatment_name: "臉部輪廓組合",
};

const botoxCampaign = {
  ...ondaCampaign,
  asset_urls: "https://line-ai-live-demo.vercel.app/demo/promotions/summer-2026-07-09-to-07-20/botox-wrinkle-999.png",
  campaign_aliases: "肉毒|肉毒除皺|肉毒12U|12U999|999",
  campaign_name: "2026 盛夏光采肉毒除皺",
  customer_price_text: "肉毒 12U 999 元",
  dose: "12U",
  end_date: "2026-08-31",
  id: "promo-2026-07-09-botox-wrinkle",
  price_text: "肉毒12U 999元",
  start_date: "2026-07-09",
  treatment_name: "肉毒除皺",
  variant_key: "",
};

function factsProvider() {
  return createStaticClinicFactsProvider({
    pricingCampaigns: [ondaCampaign, ondaFaceCombinationCampaign, botoxCampaign],
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
  now?: Date;
  turnIndex: number;
}) {
  const result = await routeConversationV2Canary({
    context: input.context,
    eventIdentity: `journey-${input.turnIndex}`,
    message: input.message,
    now: input.now ?? NOW,
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

type AcceptanceTreatment = {
  areaKey: string;
  concernKey: string;
  concernMessage: string;
  key: "onda_pro" | "botox";
  labelPattern: RegExp;
  restartMessage: string;
};

const ACCEPTANCE_TREATMENTS: readonly AcceptanceTreatment[] = [
  {
    areaKey: "jawline",
    concernKey: "jawline_looseness",
    concernMessage: "雙下巴",
    key: "onda_pro",
    labelPattern: /ONDA Pro|ONDA PRO/u,
    restartMessage: "請重新介紹 ONDA",
  },
  {
    areaKey: "face",
    concernKey: "dynamic_wrinkles",
    concernMessage: "皺眉紋",
    key: "botox",
    labelPattern: /肉毒|BOTOX/u,
    restartMessage: "請重新介紹肉毒",
  },
] as const;

async function primeAcceptanceTreatment(
  treatment: AcceptanceTreatment,
  turnIndex: number,
) {
  const opening = await routeTurn({
    context: createEmptyConversationContext(USER_ID),
    frame: frame({ treatments: [treatment.key] }),
    message: treatment.key === "onda_pro" ? "想了解 ONDA" : "想了解肉毒",
    turnIndex,
  });
  const concern = await routeTurn({
    context: opening.decision.nextContext,
    frame: frame({
      concerns: [{ area: treatment.areaKey, key: treatment.concernKey }],
      dialogue: {
        focus: "overview",
        move: "continue",
        reference: "active_subject",
        speechAct: "ask_concern",
      },
      treatments: [],
    }),
    message: treatment.concernMessage,
    turnIndex: turnIndex + 1,
  });
  return concern.decision.nextContext;
}

/**
 * Monday's two-treatment acceptance contract. A customer may explicitly ask
 * to hear a treatment again even when the model calls it a continuation; the
 * next short concern must then advance from the newly restarted overview.
 */
async function validateExplicitRestartForAcceptanceTreatments() {
  console.log("### ONDA/Botox explicit overview restart");
  let turnIndex = 700;
  for (const treatment of ACCEPTANCE_TREATMENTS) {
    const primedContext = await primeAcceptanceTreatment(treatment, turnIndex);
    turnIndex += 10;
    const variants: Array<{ frame: NluFrame | null; label: string }> = [
      { frame: null, label: "frame-null" },
      {
        frame: frame({
          confidence: 0.4,
          dialogue: {
            focus: "overview",
            move: "continue",
            reference: "active_subject",
            speechAct: "unknown",
          },
          treatments: [treatment.key],
        }),
        label: "low-confidence continuation echo",
      },
      {
        frame: frame({
          confidence: 0.95,
          dialogue: {
            focus: "overview",
            move: "continue",
            reference: "active_subject",
            speechAct: "learn_treatment",
          },
          treatments: [treatment.key],
        }),
        label: "high-confidence continuation echo",
      },
    ];

    for (const variant of variants) {
      const restarted = await routeTurn({
        context: structuredClone(primedContext),
        frame: variant.frame,
        message: treatment.restartMessage,
        turnIndex: turnIndex++,
      });
      summarize(
        `J4-${treatment.key}-${variant.label}`,
        treatment.restartMessage,
        restarted.decision,
      );
      assert.match(
        restarted.decision.replyText,
        treatment.labelPattern,
        `${treatment.key}/${variant.label}: explicit restart must return approved treatment content`,
      );
      assert.doesNotMatch(
        restarted.decision.replyText,
        /不重複前面的介紹|目前的療程脈絡我有保留|想先了解這個部位可評估的方向/u,
        `${treatment.key}/${variant.label}: explicit restart must not return process narration or generic fallback`,
      );
      assert.deepEqual(
        restarted.decision.nextContext.conversationV2State?.knowledge.concernKeys,
        [],
        `${treatment.key}/${variant.label}: explicit restart must clear the prior concern`,
      );

      const selectedConcern = await routeTurn({
        context: restarted.decision.nextContext,
        frame: null,
        message: treatment.concernMessage,
        turnIndex: turnIndex++,
      });
      assert.match(
        selectedConcern.decision.replyText,
        treatment.labelPattern,
        `${treatment.key}/${variant.label}: the next short concern must retain the treatment owner`,
      );
      assert.match(
        selectedConcern.decision.replyText,
        treatment.key === "onda_pro" ? /雙下巴|下顎/u : /皺眉|眉間|動態紋/u,
        `${treatment.key}/${variant.label}: the next short concern must receive grounded approved content`,
      );
      assert.doesNotMatch(
        selectedConcern.decision.replyText,
        /想先了解這個部位可評估的方向|目前的療程脈絡我有保留/u,
        `${treatment.key}/${variant.label}: the next short concern must not degrade to generic fallback`,
      );
    }
  }
  console.log("PASS: J4 ONDA/Botox explicit overview restart");
}

async function validateThirtyMinuteEpisodeBoundary() {
  console.log("### 30-minute consultation episode boundary");
  let turnIndex = 800;
  for (const treatment of ACCEPTANCE_TREATMENTS) {
    const primedContext = await primeAcceptanceTreatment(treatment, turnIndex);
    turnIndex += 10;
    const treatmentMessage = treatment.key === "onda_pro" ? "ONDA" : "肉毒";
    const beforeBoundary = await routeTurn({
      context: structuredClone(primedContext),
      frame: null,
      message: treatmentMessage,
      now: new Date(NOW.getTime() + 29 * 60 * 1000),
      turnIndex: turnIndex++,
    });
    assert.ok(
      beforeBoundary.decision.nextContext.conversationV2State?.knowledge.concernKeys.includes(
        treatment.concernKey,
      ),
      `J5/${treatment.key}: 29 minutes of inactivity must not erase the active concern`,
    );

    const afterBoundary = await routeTurn({
      context: structuredClone(primedContext),
      frame: null,
      message: treatmentMessage,
      now: new Date(NOW.getTime() + 30 * 60 * 1000 + 1),
      turnIndex: turnIndex++,
    });
    summarize(`J5-${treatment.key}`, `30 minutes later: ${treatmentMessage}`, afterBoundary.decision);
    assert.match(
      afterBoundary.decision.replyText,
      treatment.labelPattern,
      `J5/${treatment.key}: the first grounded subject after 30 minutes must restart with approved treatment content`,
    );
    assert.deepEqual(
      afterBoundary.decision.nextContext.conversationV2State?.knowledge.concernKeys,
      [],
      `J5/${treatment.key}: the new consultation episode must not inherit the prior concern`,
    );
    assert.doesNotMatch(
      afterBoundary.decision.replyText,
      /目前的療程脈絡我有保留|想先了解這個部位可評估的方向/u,
      `J5/${treatment.key}: the new consultation episode must not return a context-only fallback`,
    );
  }

  assert.equal(
    isExplicitTreatmentOverviewRestart("不要重新介紹 ONDA"),
    false,
    "J5: a negated restart phrase must not reset the consultation episode",
  );

  const bookingStart = await routeTurn({
    context: createEmptyConversationContext("U-episode-booking"),
    frame: null,
    message: "我要預約諮詢",
    turnIndex: turnIndex++,
  });
  const bookingAfterBoundary = await routeTurn({
    context: bookingStart.decision.nextContext,
    frame: null,
    message: "ONDA",
    now: new Date(NOW.getTime() + 31 * 60 * 1000),
    turnIndex: turnIndex++,
  });
  assert.equal(
    bookingAfterBoundary.decision.nextContext.conversationV2State?.bookingTask.status,
    "suspended",
    "J5: an incomplete booking must pause after the episode boundary",
  );
  assert.match(
    bookingAfterBoundary.decision.replyText,
    /繼續剛才的預約資料.*先詢問其他問題/su,
    "J5: the first message after 30 minutes must ask whether to resume",
  );
  assert.deepEqual(
    bookingAfterBoundary.decision.nextContext.conversationV2State?.bookingTask.draft.treatmentKeys,
    [],
    "J5: the message that triggers the resume choice must not be silently stored as booking data",
  );

  const resumed = await routeTurn({
    context: bookingAfterBoundary.decision.nextContext,
    frame: null,
    message: "繼續剛才的預約資料",
    now: new Date(NOW.getTime() + 31 * 60 * 1000 + 1_000),
    turnIndex: turnIndex++,
  });
  assert.equal(resumed.decision.nextContext.conversationV2State?.bookingTask.status, "collecting");
  assert.match(resumed.decision.replyText, /想預約諮詢哪一項療程/u);

  const bookingTreatment = await routeTurn({
    context: resumed.decision.nextContext,
    frame: null,
    message: "ONDA",
    now: new Date(NOW.getTime() + 31 * 60 * 1000 + 2_000),
    turnIndex: turnIndex++,
  });
  assert.ok(
    bookingTreatment.decision.nextContext.conversationV2State?.bookingTask.draft.treatmentKeys.includes(
      "onda_pro",
    ),
    "J5: the resumed booking must accept the expected treatment field",
  );
  assert.equal(bookingTreatment.decision.nextContext.conversationV2State?.bookingTask.expectedField, "branch");
  console.log("PASS: J5 30-minute consultation episode boundary");
}

/** The second Monday acceptance treatment must work as a full customer journey. */
async function validateBotoxAcceptanceJourney() {
  console.log("### Botox Monday acceptance journey");
  let turnIndex = 900;
  const opening = await routeTurn({
    context: createEmptyConversationContext("U-monday-botox"),
    frame: null,
    message: "我想了解肉毒",
    turnIndex: turnIndex++,
  });
  assert.match(opening.decision.replyText, /肉毒/u, "J6: Botox opening must use approved content");

  const concern = await routeTurn({
    context: opening.decision.nextContext,
    frame: null,
    message: "皺眉紋",
    turnIndex: turnIndex++,
  });
  assert.match(
    concern.decision.replyText,
    /皺眉紋|眉間動態紋/u,
    "J6: a short frown-line concern must receive approved Botox content",
  );
  assert.ok(
    concern.decision.nextContext.conversationV2State?.knowledge.treatmentKeys.includes("botox"),
    "J6: the short concern must retain Botox as its owner",
  );

  const brands = await routeTurn({
    context: concern.decision.nextContext,
    frame: null,
    message: "肉毒有哪些品牌",
    turnIndex: turnIndex++,
  });
  summarize("J6-3", "肉毒有哪些品牌", brands.decision);
  assert.match(brands.decision.replyText, /奇蹟肉毒/u, "J6: approved miracle Botox alias must be returned");
  assert.match(brands.decision.replyText, /經典肉毒/u, "J6: approved classic Botox alias must be returned");
  assert.match(brands.decision.replyText, /皇家肉毒/u, "J6: approved royal Botox alias must be returned");
  assert.doesNotMatch(brands.decision.replyText, /BOTOX|Neuronox|Dysport/u, "J6: generic brand answer should stop at approved customer aliases");

  const price = await routeTurn({
    context: brands.decision.nextContext,
    frame: frame({
      confidence: 0.4,
      dialogue: {
        focus: "price_unspecified",
        move: "continue",
        reference: "active_subject",
        speechAct: "ask_price",
      },
      treatments: [],
    }),
    message: "那價格呢",
    turnIndex: turnIndex++,
  });
  summarize("J6-4", "那價格呢", price.decision);
  assert.match(price.decision.replyText, /999/u, "J6: contextual Botox price must use the approved amount");
  assert.doesNotMatch(
    price.decision.replyText,
    /16,888|12,999/u,
    "J6: Botox price must not inherit an ONDA campaign",
  );

  const booking = await routeTurn({
    context: price.decision.nextContext,
    frame: null,
    message: "我要預約肉毒諮詢",
    turnIndex: turnIndex++,
  });
  assert.equal(
    booking.decision.nextContext.conversationV2State?.bookingTask.status,
    "collecting",
    "J6: explicit Botox booking must enter booking collection",
  );
  assert.ok(
    booking.decision.nextContext.conversationV2State?.bookingTask.draft.treatmentKeys.includes("botox"),
    "J6: explicit Botox booking must preserve its treatment",
  );
  console.log("PASS: J6 Botox Monday acceptance journey");
}

async function validateMondayConsultationCtaJourneys() {
  console.log("### Monday 2-3 turn consultation CTA journeys");
  let turnIndex = 980;

  let ondaContext = createEmptyConversationContext("U-monday-onda-cta");
  for (const message of ["ONDA", "雙下巴", "脂肪堆積"] as const) {
    const routed = await routeTurn({ context: ondaContext, frame: null, message, turnIndex: turnIndex++ });
    ondaContext = routed.decision.nextContext;
  }
  const ondaCta = await routeTurn({
    context: ondaContext,
    frame: null,
    message: "我只做ONDA可以嗎",
    turnIndex: turnIndex++,
  });
  assert.match(
    ondaCta.decision.replyText,
    /📅 預約免費諮詢[\s\S]*👩‍💼 真人客服協助[\s\S]*💬 繼續詢問/u,
    "J6a: ONDA must offer the three approved next steps after substantive consultation",
  );
  assert.doesNotMatch(
    ondaCta.decision.replyText,
    /ONDA Pro 是非侵入式/u,
    "J6a: ONDA CTA turn must not replay the opening introduction",
  );

  let botoxContext = createEmptyConversationContext("U-monday-botox-cta");
  for (const message of ["肉毒", "皺眉紋"] as const) {
    const routed = await routeTurn({ context: botoxContext, frame: null, message, turnIndex: turnIndex++ });
    botoxContext = routed.decision.nextContext;
  }
  const botoxCta = await routeTurn({
    context: botoxContext,
    frame: null,
    message: "做表情時比較明顯",
    turnIndex: turnIndex++,
  });
  assert.match(
    botoxCta.decision.replyText,
    /📅 預約免費諮詢[\s\S]*👩‍💼 真人客服協助[\s\S]*💬 繼續詢問/u,
    "J6a: Botox must offer the three approved next steps after the deeper answer",
  );
  assert.match(botoxCta.decision.replyText, /表情肌活動|動態紋/u);

  const continues = await routeTurn({
    context: botoxCta.decision.nextContext,
    frame: null,
    message: "繼續詢問",
    turnIndex: turnIndex++,
  });
  assert.match(continues.decision.replyText, /改善方向.*品牌差異.*價格/su);

  const declinesBooking = await routeTurn({
    context: botoxCta.decision.nextContext,
    frame: null,
    message: "先不用，暫時不預約",
    turnIndex: turnIndex++,
  });
  assert.notEqual(
    declinesBooking.decision.nextContext.conversationV2State?.bookingTask.status,
    "collecting",
    "J6a: declining the invitation must not start booking collection",
  );
  const sameTopicFollowup = await routeTurn({
    context: declinesBooking.decision.nextContext,
    frame: null,
    message: "平時也看得到",
    turnIndex: turnIndex++,
  });
  assert.doesNotMatch(
    sameTopicFollowup.decision.replyText,
    /📅 預約免費諮詢/u,
    "J6a: the same treatment episode must not repeat its booking invitation after a decline",
  );
  console.log("PASS: J6a Monday consultation CTA journeys");
}

/** Monday customers may start with natural questions, typos, aliases or terse follow-ups. */
async function validateMondayNaturalInputFamilies() {
  console.log("### Monday natural-language and alias families");
  let turnIndex = 960;

  for (const [message, expected] of [
    ["響了解ONDA", /ONDA Pro|ONDA PRO/u],
    ["ONDA主要改善啥", /ONDA Pro|ONDA PRO/u],
    ["奇績肉毒是什麼", /Neuronox|奇蹟肉毒/u],
    ["dyspot是什麼肉毒", /Dysport|皇家肉毒/u],
  ] as const) {
    const routed = await routeTurn({
      context: createEmptyConversationContext(`U-natural-${turnIndex}`),
      frame: null,
      message,
      turnIndex: turnIndex++,
    });
    assert.match(routed.decision.replyText, expected, `J7: ${message} must receive grounded approved content`);
    assert.doesNotMatch(routed.decision.replyText, CLARIFY_PATTERN, `J7: ${message} must not ask which treatment`);
  }

  for (const [message, expectedBrand] of [
    ["Neuronox是什麼", /Neuronox|奇蹟肉毒/u],
    ["優力柔是什麼肉毒", /Neuronox|奇蹟肉毒/u],
    ["neruonox可以改善什麼", /Neuronox|奇蹟肉毒/u],
    ["BOTOX是什麼", /BOTOX|經典肉毒/u],
    ["經典肉毒可以打哪裡", /BOTOX|經典肉毒/u],
    ["Dysport是什麼", /Dysport|皇家肉毒/u],
    ["儷緻肉毒可以改善什麼", /Dysport|皇家肉毒/u],
    ["皇家肉毒是什麼", /Dysport|皇家肉毒/u],
  ] as const) {
    const routed = await routeTurn({
      context: createEmptyConversationContext(`U-brand-alias-${turnIndex}`),
      frame: null,
      message,
      turnIndex: turnIndex++,
    });
    assert.match(routed.decision.replyText, expectedBrand, `J7: ${message} must resolve to the approved clinic brand`);
    assert.doesNotMatch(routed.decision.replyText, CLARIFY_PATTERN, `J7: ${message} must not ask which treatment`);
  }

  const ondaPrice = await routeTurn({
    context: createEmptyConversationContext("U-natural-onda-price"),
    frame: null,
    message: "ONDA怎麼收費?",
    turnIndex: turnIndex++,
  });
  assert.match(ondaPrice.decision.replyText, /16,888/u, "J7: a natural ONDA price opening must quote the approved offer");

  let botoxContext = createEmptyConversationContext("U-natural-botox-short");
  const botoxOpening = await routeTurn({
    context: botoxContext,
    frame: null,
    message: "肉毒可以幹嘛",
    turnIndex: turnIndex++,
  });
  botoxContext = botoxOpening.decision.nextContext;
  const shortConcern = await routeTurn({
    context: botoxContext,
    frame: null,
    message: "眉間那條呢",
    turnIndex: turnIndex++,
  });
  assert.match(shortConcern.decision.replyText, /皺眉紋|眉間/u, "J7: a terse concern question must inherit Botox");
  botoxContext = shortConcern.decision.nextContext;
  const shortBrand = await routeTurn({
    context: botoxContext,
    frame: null,
    message: "牌子呢",
    turnIndex: turnIndex++,
  });
  assert.match(shortBrand.decision.replyText, /奇蹟肉毒.*經典肉毒.*皇家肉毒/su, "J7: a terse brand question must inherit Botox and use approved aliases");

  for (const message of [
    "肉毒多少錢",
    "奇蹟肉毒多少錢",
    "奇迹肉毒12u價格",
    "Neuronox怎麼收費",
    "優力柔12U多少錢",
    "neruonox價錢",
  ] as const) {
    const quoted = await routeTurn({
      context: createEmptyConversationContext(`U-price-${turnIndex}`),
      frame: null,
      message,
      turnIndex: turnIndex++,
    });
    assert.match(quoted.decision.replyText, /12U\s*999/u, `J7: ${message} must quote only the approved 12U offer`);
    assert.doesNotMatch(
      quoted.decision.replyText,
      /奇蹟肉毒[^\n。]*12U|Neuronox[^\n。]*12U|優力柔[^\n。]*12U/u,
      `J7: ${message} must not attribute the generic offer to a brand`,
    );
  }

  for (const message of [
    "經典肉毒多少錢",
    "BOTOX 12U多少錢",
    "皇家肉毒價格",
    "Dysport怎麼收費",
    "儷緻肉毒價錢",
    "dyspot 12U多少錢",
  ] as const) {
    const unquoted = await routeTurn({
      context: createEmptyConversationContext(`U-unquoted-${turnIndex}`),
      frame: null,
      message,
      turnIndex: turnIndex++,
    });
    assert.match(unquoted.decision.replyText, /12U\s*999/u, `J7: ${message} must proactively offer the generic approved alternative`);
    assert.match(unquoted.decision.replyText, /真人客服|上班時間/u, `J7: ${message} must offer staff price confirmation`);
    assert.equal(unquoted.toolRequest?.type, "request_fact_confirmation", `J7: ${message} must create a price confirmation obligation`);
  }

  for (const [label, candidateFrame] of [
    ["frame-null", null],
    [
      "low-confidence",
      frame({
        confidence: 0.3,
        dialogue: {
          focus: "none",
          move: "none",
          reference: "unresolved",
          speechAct: "unknown",
        },
        intents: ["unknown"],
        treatments: [],
      }),
    ],
  ] as const) {
    const fuzzy = await routeTurn({
      context: createEmptyConversationContext(`U-fuzzy-${label}`),
      frame: candidateFrame,
      message: "想了解ONAD",
      turnIndex: turnIndex++,
    });
    assert.match(fuzzy.decision.replyText, /想確認一下.*ONDA/u, `J7: ${label} typo must propose ONDA`);
    assert.deepEqual(
      fuzzy.decision.nextContext.conversationV2State?.awaiting?.options.map((option) => option.value),
      ["onda_pro"],
      `J7: ${label} typo must stay pending instead of committing ONDA`,
    );
    assert.deepEqual(
      fuzzy.decision.nextContext.conversationV2State?.knowledge.treatmentKeys,
      [],
      `J7: ${label} typo must not become canonical knowledge before confirmation`,
    );

    const confirmed = await routeTurn({
      context: fuzzy.decision.nextContext,
      frame: null,
      message: "ONDA",
      turnIndex: turnIndex++,
    });
    assert.match(confirmed.decision.replyText, /ONDA Pro|ONDA PRO/u, `J7: ${label} confirmation must answer ONDA`);
    assert.deepEqual(
      confirmed.decision.nextContext.conversationV2State?.knowledge.treatmentKeys,
      ["onda_pro"],
      `J7: ${label} confirmation must commit ONDA only after customer selection`,
    );
  }

  const fuzzyPrice = await routeTurn({
    context: createEmptyConversationContext("U-fuzzy-price"),
    frame: null,
    message: "Botx怎麼收費",
    turnIndex: turnIndex++,
  });
  assert.match(fuzzyPrice.decision.replyText, /想確認一下.*BOTOX.*價格/u, "J7: a likely brand typo must receive a price-specific clarification");
  assert.deepEqual(
    fuzzyPrice.decision.nextContext.conversationV2State?.knowledge.treatmentKeys,
    [],
    "J7: an unconfirmed price typo must not own pricing state",
  );
  const confirmedFuzzyPrice = await routeTurn({
    context: fuzzyPrice.decision.nextContext,
    frame: null,
    message: "BOTOX價格",
    turnIndex: turnIndex++,
  });
  assert.match(confirmedFuzzyPrice.decision.replyText, /12U\s*999/u, "J7: confirmed BOTOX may offer the generic approved alternative without attributing it to BOTOX");
  assert.match(confirmedFuzzyPrice.decision.replyText, /真人客服|上班時間/u, "J7: confirmed BOTOX price must route to staff confirmation");

  for (const message of ["不要ONAD", "哪間有ONAD", "做完ONAD後呼吸困難"] as const) {
    const rejected = await routeTurn({
      context: createEmptyConversationContext(`U-fuzzy-reject-${turnIndex}`),
      frame: null,
      message,
      turnIndex: turnIndex++,
    });
    assert.doesNotMatch(rejected.decision.replyText, /是想(?:問|了解).*ONDA/u, `J7: ${message} must not receive a treatment typo suggestion`);
  }
  console.log("PASS: J7 natural openings, short questions, aliases, typos and brand-scoped prices");
}

async function validateMondayCompleteBookingJourneys() {
  console.log("### Monday ONDA/Botox complete booking journeys");
  let turnIndex = 1100;

  for (const journey of [
    { opening: "ONDA主要改善啥", treatmentKey: "onda_pro" },
    { opening: "奇績肉毒是什麼", treatmentKey: "botox" },
  ] as const) {
    let context = createEmptyConversationContext(`U-full-booking-${journey.treatmentKey}`);
    const opening = await routeTurn({
      context,
      frame: null,
      message: journey.opening,
      turnIndex: turnIndex++,
    });
    context = opening.decision.nextContext;

    const booking = await routeTurn({
      context,
      frame: null,
      message: "我要預約諮詢",
      turnIndex: turnIndex++,
    });
    context = booking.decision.nextContext;
    let state = context.conversationV2State;
    assert.ok(state, `J8 ${journey.treatmentKey}: booking state must exist`);
    assert.equal(state.bookingTask.status, "collecting");
    assert.deepEqual(state.bookingTask.draft.treatmentKeys, [journey.treatmentKey]);
    assert.equal(state.bookingTask.expectedField, "branch");

    for (const [message, expectedField] of [
      ["高雄館", "time_slots"],
      ["平日上午、週三下午、週六上午", "first_visit"],
      ["初診", "name"],
      ["王小美", "phone"],
    ] as const) {
      const step = await routeTurn({
        context,
        frame: null,
        message,
        turnIndex: turnIndex++,
      });
      context = step.decision.nextContext;
      state = context.conversationV2State;
      assert.ok(state, `J8 ${journey.treatmentKey}: state missing after ${message}`);
      assert.equal(state.bookingTask.status, "collecting", `J8 ${message}`);
      assert.equal(state.bookingTask.expectedField, expectedField, `J8 ${message}`);
      assert.equal(step.toolRequest?.type, "persist_booking_progress", `J8 ${message}`);
    }

    const completed = await routeTurn({
      context,
      frame: null,
      message: "0912345678",
      turnIndex: turnIndex++,
    });
    state = completed.decision.nextContext.conversationV2State;
    assert.ok(state);
    assert.equal(state.bookingTask.status, "completed");
    assert.equal(state.bookingTask.expectedField, undefined);
    assert.equal(state.bookingTask.draft.name, "王小美");
    assert.equal(state.bookingTask.draft.phone, "0912345678");
    assert.equal(state.bookingTask.draft.branch, "高雄館");
    assert.equal(state.bookingTask.draft.timeSlots.length, 3);
    assert.equal(completed.toolRequest?.type, "persist_booking_progress");
    assert.match(completed.decision.replyText, /真人客服|接續確認/u);
  }
  console.log("PASS: J8 ONDA/Botox complete booking journeys");
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
 * Replays the later Production regression where an exact treatment and a short
 * answer were both downgraded by the model's turn-level confidence. The
 * deterministic anchor must preserve the canonical ONDA + jawline subject and
 * select reviewed customer copy; it must not restart treatment discovery.
 */
async function validateLowConfidenceSemanticAnchorJourney() {
  let context = createEmptyConversationContext("U-low-confidence-anchor");
  console.log("### Low-confidence semantic-anchor journey");

  const turns: Array<{
    frame: NluFrame;
    message: string;
    turnIndex: number;
  }> = [
    {
      frame: frame({
        confidence: 0.4,
        dialogue: { focus: "overview", move: "start", reference: "explicit", speechAct: "learn_treatment" },
        treatments: ["onda_pro"],
      }),
      message: "ONDA",
      turnIndex: 21,
    },
    {
      frame: frame({
        confidence: 0.4,
        concerns: [{ area: "jawline", key: "jawline_looseness" }],
        dialogue: { focus: "overview", move: "continue", reference: "active_subject", speechAct: "ask_concern" },
        // Production NLU echoed the active treatment even though it was not in
        // the current message. The anchor must use current-message evidence
        // and canonical state rather than trusting this echo blindly.
        treatments: ["onda_pro"],
      }),
      message: "雙下巴",
      turnIndex: 22,
    },
    {
      frame: frame({
        confidence: 0.4,
        concerns: [],
        dialogue: { focus: "benefits", move: "continue", reference: "active_subject", speechAct: "ask_treatment_detail" },
        treatments: ["onda_pro"],
      }),
      message: "脂肪堆積",
      turnIndex: 23,
    },
    {
      frame: frame({
        confidence: 0.4,
        dialogue: { focus: "overview", move: "continue", reference: "explicit", speechAct: "learn_treatment" },
        treatments: ["onda_pro"],
      }),
      message: "ONDA",
      turnIndex: 24,
    },
  ];

  const replies: string[] = [];
  for (const item of turns) {
    const routed = await routeTurn({
      context,
      frame: item.frame,
      message: item.message,
      turnIndex: item.turnIndex,
    });
    summarize(String(item.turnIndex), item.message, routed.decision);
    assertCustomerVisibleInvariants(item.turnIndex, routed.decision.replyText);
    assert.doesNotMatch(
      routed.decision.replyText,
      /(?:指的是|哪一項|哪個)療程/u,
      `turn ${item.turnIndex}: a grounded turn must not ask which treatment: ${routed.decision.replyText}`,
    );
    if (item.turnIndex === 23) {
      assert.equal(
        routed.toolRequest,
        undefined,
        "turn 23: a reviewed reply asset must satisfy the request without fact confirmation",
      );
    }
    replies.push(routed.decision.replyText);
    context = routed.decision.nextContext;
  }

  assert.equal(
    context.activeFocus?.treatmentKey,
    "onda_pro",
    "J1a: the active treatment must remain ONDA across short answers",
  );
  assert.ok(
    context.activeFocus?.concernKeys.includes("jawline_looseness"),
    "J1a: the double-chin concern must remain in canonical state",
  );
  assert.match(
    replies[0] ?? "",
    /ONDA Pro/u,
    "J1a: low-confidence exact ONDA must still produce customer-visible ONDA content",
  );
  assert.ok(
    (replies[2] ?? "").includes(ONDA_JAWLINE_FAT_ASSET_COPY),
    `J1a: the customer must receive the reviewed fat-type asset verbatim: ${replies[2] ?? ""}`,
  );
  assert.notEqual(
    replies[3],
    replies[0],
    "J1a: repeating the active treatment must advance instead of replaying the introduction",
  );

  console.log("PASS: J1a low-confidence semantic-anchor journey");
}

/**
 * When NLU is unavailable, a short answer can still be both an exact treatment
 * anchor and the booking field the bot just requested. The active booking task
 * owns that answer; treatment discovery must not restart.
 */
async function validateFrameNullBookingTreatmentContinuation() {
  console.log("### Booking continuation owns expected treatment across NLU variants");
  const variants: Array<{ frame: NluFrame | null; label: string; startIndex: number }> = [
    { frame: null, label: "frame=null", startIndex: 31 },
    {
      frame: frame({ confidence: 0.4 }),
      label: "low-confidence learn_treatment",
      startIndex: 33,
    },
    {
      frame: frame({ confidence: 0.95 }),
      label: "high-confidence learn_treatment",
      startIndex: 35,
    },
  ];

  for (const variant of variants) {
    let context = createEmptyConversationContext(USER_ID);
    const bookingStart = await routeTurn({
      context,
      frame: null,
      message: "我要預約諮詢",
      turnIndex: variant.startIndex,
    });
    const startedState = bookingStart.decision.nextContext.conversationV2State;
    assert.equal(startedState?.bookingTask.status, "collecting", "J1b: booking must start collecting");
    assert.equal(
      startedState?.bookingTask.expectedField,
      "treatment",
      "J1b: the first missing booking field must be treatment",
    );
    context = bookingStart.decision.nextContext;
    const answerIndex = variant.startIndex + 1;
    const treatmentAnswer = await routeTurn({
      context,
      frame: variant.frame,
      message: "ONDA",
      turnIndex: answerIndex,
    });
    summarize(String(answerIndex), `ONDA (${variant.label}, expected booking treatment)`, treatmentAnswer.decision);
    assertCustomerVisibleInvariants(answerIndex, treatmentAnswer.decision.replyText);
    assert.doesNotMatch(
      treatmentAnswer.decision.matchedKey,
      /learn_treatment/u,
      `J1b: ${variant.label} must not restart treatment discovery: ${treatmentAnswer.decision.matchedKey}`,
    );
    const continuedState = treatmentAnswer.decision.nextContext.conversationV2State;
    assert.ok(
      continuedState?.bookingTask.draft.treatmentKeys.includes("onda_pro"),
      `J1b: ${variant.label} must capture ONDA in the booking draft`,
    );
    assert.equal(
      continuedState?.bookingTask.status,
      "collecting",
      `J1b: ${variant.label} must keep booking collection active`,
    );
    assert.ok(
      continuedState?.bookingTask.expectedField &&
        continuedState.bookingTask.expectedField !== "treatment",
      `J1b: ${variant.label} must advance to the next missing field`,
    );
  }

  const rejectedTreatmentAnswers = [
    "我沒有要ONDA",
    "我沒要ONDA",
    "ONDA聯絡電話",
    "哪間有 ONDA",
    "ONDA我還沒決定",
    "ONDA跟海芙音波哪個好",
    "我朋友綽號叫鳳凰",
    "ONDA收費怎麼算",
    "可以約 ONDA 嗎",
  ];
  const rejectedFrameVariants: Array<{ frame: NluFrame | null; label: string }> = [
    { frame: null, label: "frame=null" },
    {
      frame: frame({
        confidence: 0.4,
        dialogue: { focus: "none", move: "continue", reference: "active_subject", speechAct: "provide_booking_field" },
      }),
      label: "low-confidence provide_booking_field",
    },
    {
      frame: frame({
        confidence: 0.95,
        dialogue: { focus: "none", move: "continue", reference: "active_subject", speechAct: "provide_booking_field" },
      }),
      label: "high-confidence provide_booking_field",
    },
    {
      frame: frame({
        confidence: 0.95,
        dialogue: { focus: "none", move: "continue", reference: "active_subject", speechAct: "book_consultation" },
      }),
      label: "high-confidence book_consultation",
    },
    {
      frame: frame({
        confidence: 0.95,
        dialogue: { focus: "none", move: "continue", reference: "active_subject", speechAct: "manage_booking" },
      }),
      label: "high-confidence manage_booking",
    },
  ];
  for (const [messageOffset, message] of rejectedTreatmentAnswers.entries()) {
    for (const [variantOffset, variant] of rejectedFrameVariants.entries()) {
      const startIndex = 120 + messageOffset * 20 + variantOffset * 2;
      let context = createEmptyConversationContext(
        `U-booking-reject-${messageOffset}-${variantOffset}`,
      );
      const bookingStart = await routeTurn({
        context,
        frame: null,
        message: "我要預約諮詢",
        turnIndex: startIndex,
      });
      context = bookingStart.decision.nextContext;
      const rejected = await routeTurn({
        context,
        frame: variant.frame,
        message,
        turnIndex: startIndex + 1,
      });
      const state = rejected.decision.nextContext.conversationV2State;
      const label = `${variant.label}: ${message}`;
      assert.ok(state);
      assert.equal(state.bookingTask.status, "collecting", label);
      assert.equal(state.bookingTask.expectedField, "treatment", label);
      assert.deepEqual(
        state.bookingTask.draft.treatmentKeys,
        [],
        `a model speech act must not bypass the treatment short-answer whitelist: ${label}`,
      );
      assert.equal(state.activeTask.kind, "booking", label);
    }
  }

  console.log("PASS: J1b booking treatment continuation across NLU variants");
}

async function primeOndaJawlineContext(startIndex: number) {
  let context = createEmptyConversationContext(`U-active-subject-${startIndex}`);
  const treatment = await routeTurn({
    context,
    frame: frame(),
    message: "ONDA",
    turnIndex: startIndex,
  });
  context = treatment.decision.nextContext;
  const concern = await routeTurn({
    context,
    frame: frame({
      concerns: [{ area: "jawline", key: "jawline_looseness" }],
      dialogue: { focus: "benefits", move: "continue", reference: "active_subject", speechAct: "ask_concern" },
      treatments: [],
    }),
    message: "雙下巴",
    turnIndex: startIndex + 1,
  });
  return concern.decision.nextContext;
}

/**
 * An active treatment owns explicit follow-up questions even when the model is
 * uncertain, but only the facts layer may decide whether the answer exists.
 * Unsupported new concerns must start a clean topic instead of contaminating
 * the ONDA + jawline state.
 */
async function validateActiveSubjectFactObligationsAndTopicSwitch() {
  console.log("### Active-subject fact obligations and clean topic switch");
  const factQueries = [
    {
      aspect: "brands" as const,
      frame: frame({
        confidence: 0.4,
        concerns: [],
        dialogue: { focus: "brands", move: "continue", reference: "active_subject", speechAct: "ask_treatment_detail" },
        treatments: ["onda_pro"],
      }),
      label: "low-confidence brand",
      message: "脂肪堆積是哪個品牌",
      startIndex: 41,
    },
    {
      aspect: "side_effects" as const,
      frame: frame({
        confidence: 0.4,
        concerns: [],
        dialogue: { focus: "side_effects", move: "continue", reference: "active_subject", speechAct: "ask_treatment_detail" },
        treatments: ["onda_pro"],
      }),
      label: "low-confidence side effects",
      message: "脂肪型副作用",
      startIndex: 44,
    },
    {
      aspect: "brands" as const,
      frame: null,
      label: "frame-null brand",
      message: "ONDA 哪個品牌",
      startIndex: 47,
    },
    {
      aspect: "side_effects" as const,
      frame: frame({
        confidence: 0.95,
        concerns: [],
        dialogue: { focus: "side_effects", move: "continue", reference: "active_subject", speechAct: "ask_treatment_detail" },
        treatments: [],
      }),
      label: "high-confidence active-subject side effects",
      message: "ONDA副作用是什麼",
      startIndex: 50,
    },
    {
      aspect: "side_effects" as const,
      frame: frame({
        confidence: 0.4,
        concerns: [],
        dialogue: { focus: "side_effects", move: "continue", reference: "active_subject", speechAct: "ask_treatment_detail" },
        treatments: ["onda_pro"],
      }),
      label: "natural low-confidence side effects",
      message: "脂肪型會不會有副作用",
      startIndex: 53,
    },
    {
      aspect: "brands" as const,
      frame: frame({
        confidence: 0.4,
        concerns: [],
        dialogue: { focus: "brands", move: "continue", reference: "active_subject", speechAct: "ask_treatment_detail" },
        treatments: ["onda_pro"],
      }),
      label: "natural low-confidence brand",
      message: "脂肪堆積用什麼品牌",
      startIndex: 56,
    },
    {
      aspect: "side_effects" as const,
      frame: null,
      label: "frame-null active-subject prospective side effects",
      message: "做完有沒有副作用",
      startIndex: 59,
    },
    {
      aspect: "side_effects" as const,
      frame: frame({
        confidence: 0.4,
        concerns: [],
        dialogue: { focus: "overview", move: "continue", reference: "active_subject", speechAct: "unknown" },
        treatments: [],
      }),
      label: "low-confidence active-subject prospective risk",
      message: "打完會不會發炎",
      startIndex: 62,
    },
    {
      aspect: "side_effects" as const,
      frame: frame({
        confidence: 0.95,
        concerns: [],
        dialogue: { focus: "side_effects", move: "continue", reference: "active_subject", speechAct: "ask_treatment_detail" },
        treatments: [],
      }),
      label: "high-confidence active-subject prospective risk",
      message: "做了之後會不會發炎",
      startIndex: 65,
    },
    {
      aspect: "side_effects" as const,
      frame: null,
      label: "frame-null active-subject side-effect grammar",
      message: "有後遺症嗎",
      startIndex: 91,
    },
    {
      aspect: "side_effects" as const,
      frame: frame({
        confidence: 0.4,
        concerns: [],
        dialogue: { focus: "overview", move: "continue", reference: "active_subject", speechAct: "unknown" },
        treatments: [],
      }),
      label: "low-confidence active-subject side-effect grammar",
      message: "會不會傷身",
      startIndex: 94,
    },
    {
      aspect: "side_effects" as const,
      frame: frame({
        confidence: 0.95,
        concerns: [],
        dialogue: { focus: "overview", move: "continue", reference: "active_subject", speechAct: "unknown" },
        treatments: [],
      }),
      label: "high-confidence active-subject side-effect grammar",
      message: "有什麼風險",
      startIndex: 97,
    },
    {
      aspect: "brands" as const,
      frame: null,
      label: "frame-null active-subject brand grammar",
      message: "品牌叫什麼",
      startIndex: 100,
    },
    {
      aspect: "brands" as const,
      frame: frame({
        confidence: 0.4,
        concerns: [],
        dialogue: { focus: "overview", move: "continue", reference: "active_subject", speechAct: "unknown" },
        treatments: [],
      }),
      label: "low-confidence active-subject brand grammar",
      message: "原廠是哪家",
      startIndex: 103,
    },
    {
      aspect: "brands" as const,
      frame: frame({
        confidence: 0.95,
        concerns: [],
        dialogue: { focus: "overview", move: "continue", reference: "active_subject", speechAct: "unknown" },
        treatments: [],
      }),
      label: "high-confidence active-subject brand grammar",
      message: "機器品牌是什麼",
      startIndex: 106,
    },
    {
      aspect: "brands" as const,
      frame: frame({
        confidence: 0.2,
        concerns: [],
        dialogue: { focus: "benefits", move: "continue", reference: "active_subject", speechAct: "unknown" },
        treatments: [],
      }),
      label: "low-confidence wrong-aspect brand question",
      message: "脂肪堆積是哪個品牌",
      startIndex: 109,
    },
    {
      aspect: "side_effects" as const,
      frame: frame({
        confidence: 0.2,
        concerns: [],
        dialogue: { focus: "mechanism", move: "continue", reference: "active_subject", speechAct: "unknown" },
        treatments: [],
      }),
      label: "low-confidence wrong-aspect side-effect question",
      message: "脂肪型副作用",
      startIndex: 112,
    },
    {
      aspect: "brands" as const,
      frame: frame({
        confidence: 0.95,
        concerns: [],
        dialogue: { focus: "mechanism", move: "continue", reference: "active_subject", speechAct: "unknown" },
        treatments: [],
      }),
      label: "high-confidence wrong-aspect brand question",
      message: "脂肪堆積是哪個品牌",
      startIndex: 115,
    },
    {
      aspect: "side_effects" as const,
      frame: frame({
        confidence: 0.95,
        concerns: [],
        dialogue: { focus: "benefits", move: "continue", reference: "active_subject", speechAct: "unknown" },
        treatments: [],
      }),
      label: "high-confidence wrong-aspect side-effect question",
      message: "脂肪型副作用",
      startIndex: 118,
    },
    {
      aspect: "side_effects" as const,
      frame: null,
      label: "frame-null compositional risk",
      message: "安不安全",
      startIndex: 600,
    },
    {
      aspect: "brands" as const,
      frame: null,
      label: "frame-null compositional brand",
      message: "用的是哪個牌",
      startIndex: 603,
    },
    {
      aspect: "side_effects" as const,
      frame: null,
      label: "frame-null compositional symptom",
      message: "做完腫不腫",
      startIndex: 606,
    },
    {
      aspect: "side_effects" as const,
      frame: frame({
        confidence: 0.2,
        concerns: [],
        dialogue: { focus: "benefits", move: "continue", reference: "active_subject", speechAct: "unknown" },
        treatments: [],
      }),
      label: "low wrong-focus compositional risk",
      message: "有無風險",
      startIndex: 609,
    },
    {
      aspect: "brands" as const,
      frame: frame({
        confidence: 0.2,
        concerns: [],
        dialogue: { focus: "benefits", move: "continue", reference: "active_subject", speechAct: "unknown" },
        treatments: [],
      }),
      label: "low wrong-focus compositional brand",
      message: "機台是哪個牌子",
      startIndex: 612,
    },
    {
      aspect: "side_effects" as const,
      frame: frame({
        confidence: 0.2,
        concerns: [],
        dialogue: { focus: "benefits", move: "continue", reference: "active_subject", speechAct: "unknown" },
        treatments: [],
      }),
      label: "low wrong-focus compositional symptom",
      message: "打完痛不痛",
      startIndex: 615,
    },
    {
      aspect: "side_effects" as const,
      frame: frame({
        confidence: 0.95,
        concerns: [],
        dialogue: { focus: "benefits", move: "continue", reference: "active_subject", speechAct: "ask_treatment_detail" },
        treatments: ["onda_pro"],
      }),
      label: "high wrong-focus compositional risk",
      message: "副作用常不常見",
      startIndex: 618,
    },
    {
      aspect: "brands" as const,
      frame: frame({
        confidence: 0.95,
        concerns: [],
        dialogue: { focus: "benefits", move: "continue", reference: "active_subject", speechAct: "ask_treatment_detail" },
        treatments: ["onda_pro"],
      }),
      label: "high wrong-focus compositional brand",
      message: "哪家公司出的",
      startIndex: 621,
    },
    {
      aspect: "side_effects" as const,
      frame: frame({
        confidence: 0.95,
        concerns: [],
        dialogue: { focus: "benefits", move: "continue", reference: "active_subject", speechAct: "ask_treatment_detail" },
        treatments: ["onda_pro"],
      }),
      label: "high wrong-focus compositional symptom",
      message: "發炎嚴不嚴重",
      startIndex: 624,
    },
    {
      aspect: "side_effects" as const,
      frame: null,
      label: "frame-null modifier risk",
      message: "後遺症多不多",
      startIndex: 627,
    },
    {
      aspect: "side_effects" as const,
      frame: frame({
        confidence: 0.4,
        concerns: [],
        dialogue: { focus: "overview", move: "continue", reference: "active_subject", speechAct: "unknown" },
        treatments: [],
      }),
      label: "low modifier risk",
      message: "會有風險對嗎",
      startIndex: 630,
    },
    {
      aspect: "side_effects" as const,
      frame: frame({
        confidence: 0.95,
        concerns: [],
        dialogue: { focus: "benefits", move: "continue", reference: "active_subject", speechAct: "ask_treatment_detail" },
        treatments: ["onda_pro"],
      }),
      label: "high wrong-focus modifier risk",
      message: "做起來危險不危險",
      startIndex: 633,
    },
    {
      aspect: "brands" as const,
      frame: null,
      label: "frame-null possessor brand",
      message: "牌子為何",
      startIndex: 636,
    },
    {
      aspect: "brands" as const,
      frame: frame({
        confidence: 0.4,
        concerns: [],
        dialogue: { focus: "overview", move: "continue", reference: "active_subject", speechAct: "unknown" },
        treatments: [],
      }),
      label: "low possessor brand",
      message: "是誰家的機器",
      startIndex: 639,
    },
    {
      aspect: "brands" as const,
      frame: frame({
        confidence: 0.95,
        concerns: [],
        dialogue: { focus: "benefits", move: "continue", reference: "active_subject", speechAct: "ask_treatment_detail" },
        treatments: ["onda_pro"],
      }),
      label: "high wrong-focus possessor brand",
      message: "設備是哪家的",
      startIndex: 642,
    },
  ];

  for (const item of factQueries) {
    const context = await primeOndaJawlineContext(item.startIndex);
    const answerIndex = item.startIndex + 2;
    const answer = await routeTurn({
      context,
      frame: item.frame,
      message: item.message,
      turnIndex: answerIndex,
    });
    summarize(String(answerIndex), item.message, answer.decision);
    assertCustomerVisibleInvariants(answerIndex, answer.decision.replyText);
    assert.equal(
      answer.toolRequest?.type,
      "request_fact_confirmation",
      `${item.label}: a missing approved fact must create an internal confirmation obligation`,
    );
    assert.equal(
      answer.decision.nextContext.activeFocus?.treatmentKey,
      "onda_pro",
      `${item.label}: the active treatment must remain ONDA`,
    );
    assert.ok(
      answer.decision.nextContext.activeFocus?.concernKeys.includes("jawline_looseness"),
      `${item.label}: the active jawline concern must be preserved`,
    );
    assert.doesNotMatch(
      answer.decision.replyText,
      /(?:哪一項|哪個)療程/u,
      `${item.label}: an active-subject fact question must not ask which treatment`,
    );
    const state = answer.decision.nextContext.conversationV2State;
    assert.ok(state, `${item.label}: canonical V2 state must remain available`);
    assert.deepEqual(
      state.knowledge.treatmentKeys,
      ["onda_pro"],
      `${item.label}: the canonical fact-query owner must remain ONDA only`,
    );
    assert.equal(
      state.awaiting?.pendingKnowledge?.treatmentKeys.includes("botox") ?? false,
      false,
      `${item.label}: a fact query must not leave a foreign treatment pending`,
    );
  }

  for (const [variantOffset, variant] of [
    {
      concerns: [{ area: "jawline" as const, key: "jawline_looseness" }],
      treatments: ["onda_pro"],
    },
    {
      concerns: [{ area: "jawline" as const, key: "jawline_looseness" }],
      treatments: [],
    },
    {
      concerns: [],
      treatments: ["onda_pro"],
    },
  ].entries()) {
    const startIndex = 530 + variantOffset * 4;
    const context = await primeOndaJawlineContext(startIndex);
    const answer = await routeTurn({
      context,
      frame: frame({
        confidence: 0.95,
        concerns: variant.concerns,
        dialogue: {
          focus: "benefits",
          move: "continue",
          reference: "active_subject",
          speechAct: "ask_treatment_detail",
        },
        treatments: variant.treatments,
      }),
      message: "脂肪堆積",
      turnIndex: startIndex + 2,
    });
    const label = `high-confidence approved asset variant ${variantOffset + 1}`;
    assert.equal(answer.toolRequest, undefined, label);
    assert.ok(answer.decision.replyText.includes(ONDA_JAWLINE_FAT_ASSET_COPY), label);
    const state = answer.decision.nextContext.conversationV2State;
    assert.ok(state, label);
    assert.deepEqual(state.knowledge.treatmentKeys, ["onda_pro"], label);
    assert.ok(state.knowledge.concernKeys.includes("jawline_looseness"), label);
  }

  for (const [caseOffset, item] of [
    { aspect: "side_effects" as const, message: "ONDA有後遺症嗎" },
    { aspect: "brands" as const, message: "ONDA哪個品牌" },
    { aspect: "side_effects" as const, message: "ONDA做完會不會發炎" },
  ].entries()) {
    const turnIndex = 550 + caseOffset;
    const answer = await routeTurn({
      context: createEmptyConversationContext(`U-explicit-wrong-focus-${caseOffset}`),
      frame: frame({
        confidence: 0.95,
        concerns: [],
        dialogue: {
          focus: "benefits",
          move: "continue",
          reference: "explicit",
          speechAct: "ask_treatment_detail",
        },
        treatments: ["onda_pro"],
      }),
      message: item.message,
      turnIndex,
    });
    const state = answer.decision.nextContext.conversationV2State;
    assert.ok(state, item.message);
    assert.equal(answer.toolRequest?.type, "request_fact_confirmation", item.message);
    assert.deepEqual(state.knowledge.treatmentKeys, ["onda_pro"], item.message);
    assert.doesNotMatch(answer.decision.replyText, /(?:哪一項|哪個)療程/u, item.message);
  }

  for (const [messageOffset, activeMessage] of [
    "做完紅不紅",
    "術後發炎嚴不嚴重",
  ].entries()) {
    for (const [scopeOffset, scope] of (["active", "explicit"] as const).entries()) {
      for (const [frameOffset, nluFrame] of [
        null,
        frame({
          confidence: 0.4,
          concerns: [],
          dialogue: { focus: "overview", move: "continue", reference: scope === "active" ? "active_subject" : "explicit", speechAct: "unknown" },
          treatments: scope === "explicit" ? ["onda_pro"] : [],
        }),
        frame({
          confidence: 0.95,
          concerns: [],
          dialogue: { focus: "side_effects", move: "continue", reference: scope === "active" ? "active_subject" : "explicit", speechAct: "ask_treatment_detail" },
          treatments: scope === "explicit" ? ["onda_pro"] : [],
        }),
      ].entries()) {
        const startIndex = 680 + messageOffset * 20 + scopeOffset * 8 + frameOffset;
        const context = scope === "active"
          ? await primeOndaJawlineContext(startIndex)
          : createEmptyConversationContext(`U-prospective-morphology-${startIndex}`);
        const message = scope === "explicit" ? `ONDA${activeMessage}` : activeMessage;
        const answer = await routeTurn({
          context,
          frame: nluFrame,
          message,
          turnIndex: startIndex + (scope === "active" ? 2 : 0),
        });
        const label = `${scope} ${frameOffset} ${message}`;
        const state = answer.decision.nextContext.conversationV2State;
        assert.ok(state, label);
        assert.equal(answer.toolRequest?.type, "request_fact_confirmation", label);
        assert.deepEqual(state.knowledge.treatmentKeys, ["onda_pro"], label);
        assert.doesNotMatch(answer.decision.replyText, /(?:哪一項|哪個)療程/u, label);
      }
    }
  }

  for (const [caseOffset, item] of [
    {
      aspect: "side_effects" as const,
      frame: null,
      message: "ONDA後遺症多不多",
    },
    {
      aspect: "side_effects" as const,
      frame: frame({
        confidence: 0.4,
        concerns: [],
        dialogue: { focus: "overview", move: "continue", reference: "explicit", speechAct: "unknown" },
        treatments: ["onda_pro"],
      }),
      message: "ONDA會有風險對嗎",
    },
    {
      aspect: "side_effects" as const,
      frame: frame({
        confidence: 0.95,
        concerns: [],
        dialogue: { focus: "benefits", move: "continue", reference: "explicit", speechAct: "ask_treatment_detail" },
        treatments: ["onda_pro"],
      }),
      message: "ONDA做起來危險不危險",
    },
    {
      aspect: "brands" as const,
      frame: null,
      message: "ONDA牌子為何",
    },
    {
      aspect: "brands" as const,
      frame: frame({
        confidence: 0.4,
        concerns: [],
        dialogue: { focus: "overview", move: "continue", reference: "explicit", speechAct: "unknown" },
        treatments: ["onda_pro"],
      }),
      message: "ONDA是誰家的機器",
    },
    {
      aspect: "brands" as const,
      frame: frame({
        confidence: 0.95,
        concerns: [],
        dialogue: { focus: "benefits", move: "continue", reference: "explicit", speechAct: "ask_treatment_detail" },
        treatments: ["onda_pro"],
      }),
      message: "ONDA設備是哪家的",
    },
  ].entries()) {
    const turnIndex = 650 + caseOffset;
    const answer = await routeTurn({
      context: createEmptyConversationContext(`U-explicit-compositional-${caseOffset}`),
      frame: item.frame,
      message: item.message,
      turnIndex,
    });
    const state = answer.decision.nextContext.conversationV2State;
    assert.ok(state, item.message);
    assert.equal(answer.toolRequest?.type, "request_fact_confirmation", item.message);
    assert.deepEqual(state.knowledge.treatmentKeys, ["onda_pro"], item.message);
    assert.doesNotMatch(answer.decision.replyText, /(?:哪一項|哪個)療程/u, item.message);
  }

  for (const [caseOffset, item] of [
    {
      aspect: "brands" as const,
      message: "脂肪堆積是哪個品牌",
    },
    {
      aspect: "side_effects" as const,
      message: "脂肪型副作用",
    },
    {
      aspect: "side_effects" as const,
      message: "做了之後會不會發炎",
    },
  ].entries()) {
    const startIndex = 500 + caseOffset * 4;
    const context = await primeOndaJawlineContext(startIndex);
    const answer = await routeTurn({
      context,
      frame: frame({
        confidence: 0.95,
        concerns: [{ area: "jawline", key: "jawline_looseness" }],
        dialogue: {
          focus: item.aspect,
          move: "continue",
          reference: "active_subject",
          speechAct: "ask_treatment_detail",
        },
        // Deliberately wrong high-confidence owner: current text never names
        // botox, so the trusted active-subject query must retain ONDA only.
        treatments: ["botox"],
      }),
      message: item.message,
      turnIndex: startIndex + 2,
    });
    const state = answer.decision.nextContext.conversationV2State;
    assert.ok(state);
    assert.equal(answer.toolRequest?.type, "request_fact_confirmation", item.message);
    assert.deepEqual(state.knowledge.treatmentKeys, ["onda_pro"], item.message);
    assert.ok(!state.knowledge.treatmentKeys.includes("botox"), item.message);
    assert.equal(
      state.awaiting?.pendingKnowledge?.treatmentKeys.includes("botox") ?? false,
      false,
      item.message,
    );
    assert.match(state.activeTask.subjectKey ?? "", /onda_pro/u, item.message);
    assert.doesNotMatch(state.activeTask.subjectKey ?? "", /botox/u, item.message);
  }

  for (const item of [
    {
      frame: null,
      label: "frame-null explicit prospective risk",
      message: "ONDA做了之後會不會發炎",
      turnIndex: 68,
    },
    {
      frame: frame({
        confidence: 0.4,
        concerns: [],
        dialogue: { focus: "overview", move: "continue", reference: "explicit", speechAct: "unknown" },
        treatments: ["onda_pro"],
      }),
      label: "low-confidence explicit prospective side effects",
      message: "ONDA做完有沒有副作用",
      turnIndex: 69,
    },
    {
      frame: frame({
        confidence: 0.95,
        concerns: [],
        dialogue: { focus: "side_effects", move: "continue", reference: "explicit", speechAct: "ask_treatment_detail" },
        treatments: ["onda_pro"],
      }),
      label: "high-confidence explicit prospective risk",
      message: "ONDA打完會不會發炎",
      turnIndex: 70,
    },
  ]) {
    const answer = await routeTurn({
      context: createEmptyConversationContext(`U-explicit-risk-${item.turnIndex}`),
      frame: item.frame,
      message: item.message,
      turnIndex: item.turnIndex,
    });
    summarize(String(item.turnIndex), item.message, answer.decision);
    assertCustomerVisibleInvariants(item.turnIndex, answer.decision.replyText);
    assert.equal(
      answer.toolRequest?.type,
      "request_fact_confirmation",
      `${item.label}: missing approved side-effect facts must create an internal confirmation obligation`,
    );
    assert.equal(
      answer.decision.nextContext.activeFocus?.treatmentKey,
      "onda_pro",
      `${item.label}: the explicit treatment must become the retained subject`,
    );
    assert.doesNotMatch(
      answer.decision.replyText,
      /(?:哪一項|哪個)療程/u,
      `${item.label}: a resolved prospective-risk owner must not ask which treatment`,
    );
  }

  const switchIndex = 71;
  const switchContext = await primeOndaJawlineContext(switchIndex);
  const switched = await routeTurn({
    context: switchContext,
    frame: frame({
      confidence: 0.4,
      concerns: [{ area: "skin", key: "pores_texture" }],
      dialogue: { focus: "benefits", move: "start", reference: "explicit", speechAct: "ask_concern" },
      // Production models may echo the old owner. Current-message ontology
      // evidence must detach it because ONDA does not support pores_texture.
      treatments: ["onda_pro"],
    }),
    message: "毛孔",
    turnIndex: switchIndex + 2,
  });
  summarize(String(switchIndex + 2), "毛孔", switched.decision);
  const switchedState = switched.decision.nextContext.conversationV2State;
  assert.ok(switchedState, "topic switch must retain canonical V2 state");
  assert.ok(
    switchedState.knowledge.concernKeys.includes("pores_texture"),
    "topic switch must record the newly named pores concern",
  );
  assert.ok(
    !switchedState.knowledge.concernKeys.includes("jawline_looseness"),
    "topic switch must not merge the old jawline concern into pores",
  );
  assert.ok(
    !switchedState.knowledge.treatmentKeys.includes("onda_pro"),
    "an unsupported new concern must detach the old ONDA owner",
  );
  assert.doesNotMatch(
    switchedState.activeTask.subjectKey ?? "",
    /onda_pro|jawline_looseness/u,
    "the active task must not retain a mixed ONDA/jawline subject after the switch",
  );

  const highSwitchContext = await primeOndaJawlineContext(460);
  const highSwitched = await routeTurn({
    context: highSwitchContext,
    frame: frame({
      confidence: 0.95,
      concerns: [{ area: "skin", key: "pores_texture" }],
      dialogue: { focus: "benefits", move: "start", reference: "explicit", speechAct: "ask_concern" },
      // The model confidently echoed the previous owner even though ONDA is
      // absent from the current text and does not support this new concern.
      treatments: ["onda_pro"],
    }),
    message: "毛孔",
    turnIndex: 462,
  });
  const highSwitchState = highSwitched.decision.nextContext.conversationV2State;
  assert.ok(highSwitchState);
  assert.deepEqual(highSwitchState.knowledge.areaKeys, ["skin"]);
  assert.deepEqual(highSwitchState.knowledge.concernKeys, ["pores_texture"]);
  assert.deepEqual(
    highSwitchState.knowledge.treatmentKeys,
    [],
    "high-confidence stale ONDA echo must not own an unsupported current-text concern",
  );
  assert.doesNotMatch(
    highSwitchState.activeTask.subjectKey ?? "",
    /onda_pro|jawline_looseness/u,
    "high-confidence switch must not retain the stale owner or old concern",
  );
  assert.equal(
    highSwitchState.awaiting?.pendingKnowledge?.treatmentKeys.includes("onda_pro") ?? false,
    false,
    "the stale owner must not remain pending after a high-confidence switch",
  );

  const supportedContext = await primeOndaJawlineContext(470);
  const supportedFollowup = await routeTurn({
    context: supportedContext,
    frame: frame({
      confidence: 0.95,
      concerns: [{ area: "jawline", key: "jawline_looseness" }],
      dialogue: { focus: "benefits", move: "continue", reference: "active_subject", speechAct: "ask_concern" },
      treatments: ["onda_pro"],
    }),
    message: "雙下巴",
    turnIndex: 472,
  });
  const supportedState = supportedFollowup.decision.nextContext.conversationV2State;
  assert.ok(supportedState);
  assert.ok(supportedState.knowledge.treatmentKeys.includes("onda_pro"));
  assert.ok(supportedState.knowledge.concernKeys.includes("jawline_looseness"));

  const explicitSwitchContext = await primeOndaJawlineContext(480);
  const explicitSwitch = await routeTurn({
    context: explicitSwitchContext,
    frame: frame({
      confidence: 0.95,
      concerns: [],
      dialogue: { focus: "overview", move: "start", reference: "explicit", speechAct: "learn_treatment" },
      treatments: ["botox"],
    }),
    message: "肉毒",
    turnIndex: 482,
  });
  const explicitSwitchState = explicitSwitch.decision.nextContext.conversationV2State;
  assert.ok(explicitSwitchState);
  assert.deepEqual(explicitSwitchState.knowledge.treatmentKeys, ["botox"]);
  assert.ok(!explicitSwitchState.knowledge.treatmentKeys.includes("onda_pro"));

  console.log("PASS: J1c active-subject facts and topic switch");
}

/**
 * The current customer sentence owns polarity. A model that echoes a positive
 * concern must not turn `我沒有脂肪堆積` into canonical positive state, at any
 * confidence and even when the model is unavailable.
 */
async function validateCurrentTextNegationOwnsPolarity() {
  console.log("### Current-text negation owns polarity");
  const variants: Array<{ frame: NluFrame | null; label: string; turnIndex: number }> = [
    {
      frame: frame({
        confidence: 0.4,
        concerns: [{ area: "jawline", key: "jawline_looseness" }],
        dialogue: { focus: "benefits", move: "start", reference: "explicit", speechAct: "ask_concern" },
        treatments: [],
      }),
      label: "low-confidence positive NLU echo",
      turnIndex: 81,
    },
    {
      frame: frame({
        confidence: 0.95,
        concerns: [{ area: "jawline", key: "jawline_looseness" }],
        dialogue: { focus: "benefits", move: "start", reference: "explicit", speechAct: "ask_concern" },
        treatments: [],
      }),
      label: "high-confidence positive NLU echo",
      turnIndex: 82,
    },
    { frame: null, label: "frame=null", turnIndex: 83 },
    {
      frame: frame({
        confidence: 0.4,
        concerns: [{ area: "jawline", key: "jawline_looseness" }],
        dialogue: { focus: "benefits", move: "start", reference: "explicit", speechAct: "ask_concern" },
        treatments: [],
      }),
      label: "short 沒 negation",
      turnIndex: 85,
    },
    {
      frame: frame({
        confidence: 0.95,
        concerns: [{ area: "jawline", key: "jawline_looseness" }],
        dialogue: { focus: "benefits", move: "start", reference: "explicit", speechAct: "ask_concern" },
        treatments: [],
      }),
      label: "short exact 沒 negation",
      turnIndex: 86,
    },
    {
      frame: frame({
        confidence: 0.4,
        concerns: [{ area: "jawline", key: "jawline_looseness" }],
        dialogue: { focus: "benefits", move: "start", reference: "explicit", speechAct: "ask_concern" },
        treatments: [],
      }),
      label: "並非 negation",
      turnIndex: 87,
    },
    {
      frame: frame({
        confidence: 0.95,
        concerns: [{ area: "jawline", key: "jawline_looseness" }],
        dialogue: { focus: "benefits", move: "start", reference: "explicit", speechAct: "ask_concern" },
        treatments: [],
      }),
      label: "非 negation",
      turnIndex: 88,
    },
    {
      frame: frame({
        confidence: 0.4,
        concerns: [{ area: "jawline", key: "jawline_looseness" }],
        dialogue: { focus: "benefits", move: "start", reference: "explicit", speechAct: "ask_concern" },
        treatments: [],
      }),
      label: "無 negation",
      turnIndex: 89,
    },
  ];

  const messages = new Map<number, string>([
    [81, "我沒有脂肪堆積"],
    [82, "我沒有脂肪堆積"],
    [83, "我沒有脂肪堆積"],
    [85, "我沒脂肪堆積"],
    [86, "沒雙下巴"],
    [87, "我並非脂肪型"],
    [88, "非脂肪型"],
    [89, "我無脂肪堆積"],
  ]);

  for (const variant of variants) {
    const message = messages.get(variant.turnIndex)!;
    const routed = await routeTurn({
      context: createEmptyConversationContext(`U-negation-${variant.turnIndex}`),
      frame: variant.frame,
      message,
      turnIndex: variant.turnIndex,
    });
    summarize(String(variant.turnIndex), `${variant.label}: ${message}`, routed.decision);
    const state = routed.decision.nextContext.conversationV2State;
    assert.ok(state, `${variant.label}: canonical V2 state must exist`);
    assert.deepEqual(
      state.knowledge,
      { approvedFactIds: [], areaKeys: [], concernKeys: [], treatmentKeys: [] },
      `${variant.label}: no model-positive entity may enter canonical knowledge`,
    );
    assert.equal(
      state.awaiting?.pendingKnowledge,
      undefined,
      `${variant.label}: no positive entity may become pending knowledge`,
    );
    assert.doesNotMatch(
      state.activeTask.subjectKey ?? "",
      /jawline|local_contour|onda_pro|^concern:$/u,
      `${variant.label}: no positive concern or treatment may own the active task`,
    );
    assert.equal(
      routed.decision.nextContext.activeFocus?.concernKeys.some(
        (key) => ["jawline_looseness", "local_contour"].includes(key),
      ) ?? false,
      false,
      `${variant.label}: legacy context projection must not receive a positive concern either`,
    );
  }

  const exact = await routeTurn({
    context: createEmptyConversationContext("U-negation-exact"),
    frame: frame({
      confidence: 0.95,
      concerns: [{ area: "jawline", key: "jawline_looseness" }],
      dialogue: { focus: "benefits", move: "start", reference: "explicit", speechAct: "ask_concern" },
      treatments: [],
    }),
    message: "我沒有雙下巴",
    turnIndex: 84,
  });
  const exactState = exact.decision.nextContext.conversationV2State;
  assert.ok(exactState);
  assert.deepEqual(exactState.knowledge.concernKeys, []);
  assert.ok(
    exactState.preferences.excludedConcernKeys.includes("jawline_looseness"),
    "an exact negated ontology entity may be retained only as an exclusion",
  );
  assert.equal(exactState.awaiting?.pendingKnowledge, undefined);
  assert.equal(exactState.activeTask.kind, "idle", "negation-only must not create an empty treatment task");
  assert.notEqual(exactState.activeTask.subjectKey, "concern:");

  const activeCorrectionVariants: Array<{
    frame: NluFrame | null;
    label: string;
    startIndex: number;
  }> = [
    { frame: null, label: "frame=null active correction", startIndex: 150 },
    {
      frame: frame({
        confidence: 0.4,
        concerns: [{ area: "jawline", key: "jawline_looseness" }],
        dialogue: { focus: "benefits", move: "continue", reference: "active_subject", speechAct: "ask_concern" },
        treatments: ["onda_pro"],
      }),
      label: "low-confidence active correction",
      startIndex: 153,
    },
    {
      frame: frame({
        confidence: 0.95,
        concerns: [{ area: "jawline", key: "jawline_looseness" }],
        dialogue: { focus: "benefits", move: "continue", reference: "active_subject", speechAct: "ask_concern" },
        treatments: ["onda_pro"],
      }),
      label: "high-confidence active correction",
      startIndex: 156,
    },
  ];
  for (const variant of activeCorrectionVariants) {
    const context = await primeOndaJawlineContext(variant.startIndex);
    const corrected = await routeTurn({
      context,
      frame: variant.frame,
      message: "我沒有脂肪堆積",
      turnIndex: variant.startIndex + 2,
    });
    const state = corrected.decision.nextContext.conversationV2State;
    assert.ok(state);
    assert.ok(
      state.knowledge.treatmentKeys.includes("onda_pro"),
      `${variant.label}: correcting the concern must not discard ONDA`,
    );
    assert.ok(
      !state.knowledge.concernKeys.includes("jawline_looseness"),
      `${variant.label}: the old positive concern must be removed`,
    );
    assert.ok(
      state.preferences.excludedConcernKeys.includes("jawline_looseness"),
      `${variant.label}: the corrected concern must be retained as an exclusion`,
    );
    assert.equal(
      state.awaiting?.pendingKnowledge?.concernKeys.includes("jawline_looseness") ?? false,
      false,
      `${variant.label}: the old concern must not remain pending`,
    );
    assert.match(state.activeTask.subjectKey ?? "", /onda_pro/u, variant.label);
    assert.doesNotMatch(state.activeTask.subjectKey ?? "", /jawline_looseness/u, variant.label);
  }

  const activeMixedContext = await primeOndaJawlineContext(159);
  const activeMixed = await routeTurn({
    context: activeMixedContext,
    frame: frame({
      confidence: 0.95,
      concerns: [{ area: "jawline", key: "jawline_looseness" }],
      dialogue: { focus: "overview", move: "continue", reference: "active_subject", speechAct: "learn_treatment" },
      treatments: ["onda_pro"],
    }),
    message: "我沒有脂肪堆積，但想了解ONDA",
    turnIndex: 161,
  });
  const activeMixedState = activeMixed.decision.nextContext.conversationV2State;
  assert.ok(activeMixedState);
  assert.ok(activeMixedState.knowledge.treatmentKeys.includes("onda_pro"));
  assert.ok(!activeMixedState.knowledge.concernKeys.includes("jawline_looseness"));
  assert.ok(activeMixedState.preferences.excludedConcernKeys.includes("jawline_looseness"));

  const postfixVariants: Array<{ confidence?: number; frame: NluFrame | null; label: string }> = [
    { frame: null, label: "frame=null" },
    {
      confidence: 0.4,
      frame: frame({ confidence: 0.4 }),
      label: "low-confidence positive echo",
    },
    {
      confidence: 0.95,
      frame: frame({ confidence: 0.95 }),
      label: "high-confidence positive echo",
    },
  ];
  const negativeIntentIntroCases = [
    "我沒有興趣想了解ONDA",
    "我沒興趣想問ONDA",
    "我並無意願想知道ONDA",
    "我無意想諮詢ONDA",
    "我沒有打算想了解ONDA",
    "沒有興趣要了解ONDA",
    "沒有意願要問ONDA",
    "並無打算要知道ONDA",
    "不是有興趣想了解ONDA",
    "並不是有意願想諮詢ONDA",
    "我沒有太大興趣想了解ONDA",
    "我沒多少興趣想問ONDA",
    "我並無特別意願想知道ONDA",
    "我沒有那個打算想了解ONDA",
    "我沒有這個念頭想問ONDA",
    "我沒有特別需求想知道ONDA",
    "我沒有半點興趣想了解ONDA",
    "我沒有很大的意願想諮詢ONDA",
    "我沒啥興趣想問ONDA",
    "我沒有興趣再想了解ONDA",
    "我沒有多大興趣想了解ONDA",
    "我沒有太大的興趣想了解ONDA",
    "我並沒有多少的意願想問ONDA",
    "我沒有絲毫興趣想知道ONDA",
    "我沒有真正的意願想諮詢ONDA",
    "我沒有任何的打算想了解ONDA",
    "我沒有這方面的需求想問ONDA",
    "我沒有一丁點興趣想了解ONDA",
  ];
  const postfixStrongRejectionCases = [
    "ONDA我不會選",
    "ONDA我不選擇",
    "ONDA我不打算選",
    "ONDA我不需要",
    "ONDA我不接受",
    "ONDA我不做",
    "ONDA我不打",
    "ONDA我不用",
    "ONDA我不考慮選",
    "ONDA絕對不選",
  ];
  for (const [variantOffset, variant] of postfixVariants.entries()) {
    for (const [messageOffset, item] of [
      {
        expectedExclusion: "onda_pro",
        frame: variant.frame,
        message: "ONDA不是我想要的",
        type: "treatment" as const,
      },
      {
        expectedExclusion: "onda_pro",
        frame: variant.frame,
        message: "我不想了解ONDA",
        type: "treatment" as const,
      },
      {
        expectedExclusion: "onda_pro",
        frame: variant.frame,
        message: "ONDA我不選",
        type: "treatment" as const,
      },
      {
        expectedExclusion: null,
        frame: variant.frame && frame({
          confidence: variant.confidence ?? 0.95,
          concerns: [{ area: "jawline", key: "jawline_looseness" }],
          dialogue: { focus: "benefits", move: "start", reference: "explicit", speechAct: "ask_concern" },
          treatments: [],
        }),
        message: "脂肪堆積不是我的困擾",
        type: "concern" as const,
      },
      {
        expectedExclusion: null,
        frame: variant.frame && frame({
          confidence: variant.confidence ?? 0.95,
          concerns: [{ area: "jawline", key: "jawline_looseness" }],
          dialogue: { focus: "benefits", move: "start", reference: "explicit", speechAct: "ask_concern" },
          treatments: [],
        }),
        message: "脂肪型我並沒有",
        type: "concern" as const,
      },
      {
        expectedExclusion: null,
        frame: variant.frame && frame({
          confidence: variant.confidence ?? 0.95,
          concerns: [{ area: "jawline", key: "jawline_looseness" }],
          dialogue: { focus: "benefits", move: "start", reference: "explicit", speechAct: "ask_concern" },
          treatments: [],
        }),
        message: "脂肪堆積我並非",
        type: "concern" as const,
      },
      {
        expectedExclusion: null,
        frame: variant.frame && frame({
          confidence: variant.confidence ?? 0.95,
          concerns: [{ area: "jawline", key: "jawline_looseness" }],
          dialogue: { focus: "benefits", move: "start", reference: "explicit", speechAct: "ask_concern" },
          treatments: [],
        }),
        message: "脂肪型我不是",
        type: "concern" as const,
      },
      ...negativeIntentIntroCases.map((message) => ({
        expectedExclusion: "onda_pro",
        frame: variant.frame,
        message,
        type: "treatment" as const,
      })),
      ...postfixStrongRejectionCases.map((message) => ({
        expectedExclusion: "onda_pro",
        frame: variant.frame,
        message,
        type: "treatment" as const,
      })),
    ].entries()) {
      const turnIndex = 280 + variantOffset * 100 + messageOffset;
      const routed = await routeTurn({
        context: createEmptyConversationContext(`U-postfix-empty-${turnIndex}`),
        frame: item.frame,
        message: item.message,
        turnIndex,
      });
      const state = routed.decision.nextContext.conversationV2State;
      assert.ok(state);
      assert.deepEqual(
        state.knowledge,
        { approvedFactIds: [], areaKeys: [], concernKeys: [], treatmentKeys: [] },
        `${variant.label}: a postfix-negated ${item.type} must not become positive knowledge`,
      );
      assert.equal(
        state.awaiting?.pendingKnowledge,
        undefined,
        `${variant.label}: postfix negation must not create pending positive knowledge`,
      );
      assert.doesNotMatch(
        state.activeTask.subjectKey ?? "",
        /onda_pro|jawline_looseness|^concern:$/u,
        `${variant.label}: postfix negation must not own an active positive task`,
      );
      if (item.expectedExclusion) {
        assert.ok(
          state.preferences.excludedTreatmentKeys.includes(item.expectedExclusion),
          `${variant.label}: exact postfix-negated ONDA must be retained only as an exclusion`,
        );
      }
    }
  }

  for (const [variantOffset, variant] of postfixVariants.entries()) {
    for (const [messageOffset, item] of [
      { message: "脂肪堆積不是我的困擾", type: "concern" as const },
      { message: "脂肪堆積我沒有", type: "concern" as const },
      { message: "雙下巴我沒有", type: "concern" as const },
      { message: "脂肪型我並沒有", type: "concern" as const },
      { message: "脂肪堆積我並非", type: "concern" as const },
      { message: "脂肪型我不是", type: "concern" as const },
      { message: "ONDA不是我想要的", type: "treatment" as const },
      { message: "我不想了解ONDA", type: "treatment" as const },
      { message: "ONDA我不選", type: "treatment" as const },
      ...negativeIntentIntroCases.map((message) => ({
        message,
        type: "treatment" as const,
      })),
      ...postfixStrongRejectionCases.map((message) => ({
        message,
        type: "treatment" as const,
      })),
    ].entries()) {
      const startIndex = 1320 + variantOffset * 100 + messageOffset * 3;
      const context = await primeOndaJawlineContext(startIndex);
      const correctionFrame = variant.frame === null
        ? null
        : item.type === "concern"
          ? frame({
              confidence: variant.confidence ?? 0.95,
              concerns: [{ area: "jawline", key: "jawline_looseness" }],
              dialogue: { focus: "benefits", move: "continue", reference: "active_subject", speechAct: "ask_concern" },
              treatments: ["onda_pro"],
            })
          : frame({
              confidence: variant.confidence ?? 0.95,
              concerns: [{ area: "jawline", key: "jawline_looseness" }],
              dialogue: { focus: "overview", move: "continue", reference: "active_subject", speechAct: "learn_treatment" },
              treatments: ["onda_pro"],
            });
      const corrected = await routeTurn({
        context,
        frame: correctionFrame,
        message: item.message,
        turnIndex: startIndex + 2,
      });
      const state = corrected.decision.nextContext.conversationV2State;
      assert.ok(state);
      if (item.type === "concern") {
        assert.ok(state.knowledge.treatmentKeys.includes("onda_pro"), variant.label);
        assert.ok(!state.knowledge.concernKeys.includes("jawline_looseness"), variant.label);
        assert.ok(state.preferences.excludedConcernKeys.includes("jawline_looseness"), variant.label);
      } else {
        assert.ok(!state.knowledge.treatmentKeys.includes("onda_pro"), variant.label);
        assert.ok(state.preferences.excludedTreatmentKeys.includes("onda_pro"), variant.label);
      }
      assert.equal(
        state.awaiting?.pendingKnowledge?.treatmentKeys.includes("onda_pro") ?? false,
        false,
        `${variant.label}: an excluded treatment must not remain pending`,
      );
    }
  }

  const contentIntroMatrix = ["想", "要", "只想"].flatMap((lead) =>
    ["了解", "問", "知道", "諮詢", "看看"].flatMap((verb) => [
      `我沒做過醫美${lead}${verb}ONDA`,
      `我沒有問題${lead}${verb}ONDA`,
    ]),
  );
  const positiveClauseCases = [
    "我沒有做過醫美，想了解ONDA",
    "我不是很懂，想了解ONDA",
    "我沒有問題。想了解ONDA",
    "我不是要預約，只想了解ONDA",
    "我沒有脂肪堆積，但想了解ONDA",
    "我沒有做過醫美，可是想了解ONDA",
    "我不是很懂。想了解ONDA",
    "我沒有問題，但想了解ONDA",
    "我不是要預約，可是只想了解ONDA",
    "我沒有做過醫美想了解ONDA",
    "我不是很懂想了解ONDA",
    "我沒有問題想了解ONDA",
    "我不是要預約只想了解ONDA",
    "我沒有問題只想問ONDA",
    "我沒做過醫美要諮詢ONDA",
    "我沒有經驗想了解ONDA",
    "我沒有概念想了解ONDA",
    "我不是專家想了解ONDA",
    "我沒有費用資料想了解ONDA",
    ...contentIntroMatrix,
  ];
  const positiveClauseFrameVariants: Array<{ confidence?: number; frame: "frame" | null; label: string }> = [
    { frame: null, label: "frame=null" },
    { confidence: 0.4, frame: "frame", label: "low-confidence" },
    { confidence: 0.95, frame: "frame", label: "high-confidence" },
  ];
  for (const [messageOffset, message] of positiveClauseCases.entries()) {
    for (const [variantOffset, variant] of positiveClauseFrameVariants.entries()) {
      const turnIndex = 400 + messageOffset * 4 + variantOffset;
      const routed = await routeTurn({
        context: createEmptyConversationContext(`U-negation-positive-${turnIndex}`),
        frame: variant.frame === null
          ? null
          : frame({
              confidence: variant.confidence ?? 0.95,
              concerns: message.includes("脂肪堆積")
                ? [{ area: "jawline", key: "jawline_looseness" }]
                : [],
              dialogue: { focus: "overview", move: "start", reference: "explicit", speechAct: "learn_treatment" },
              treatments: ["onda_pro"],
            }),
        message,
        turnIndex,
      });
      assertCustomerVisibleInvariants(turnIndex, routed.decision.replyText);
      const state = routed.decision.nextContext.conversationV2State;
      assert.ok(state);
      assert.ok(
        state.knowledge.treatmentKeys.includes("onda_pro"),
        `${variant.label}: an unrelated negative clause must preserve ONDA: ${message}`,
      );
      assert.doesNotMatch(
        routed.decision.replyText,
        /(?:哪一項|哪個)療程/u,
        `${variant.label}: explicit ONDA must not be answered with treatment clarification`,
      );
      assert.match(
        routed.decision.replyText,
        /ONDA Pro/u,
        `${variant.label}: the customer-visible answer must contain grounded ONDA content: ${message}`,
      );
      if (message.includes("脂肪堆積")) {
        assert.deepEqual(
          state.knowledge.concernKeys,
          [],
          "the negated concern must be removed while the independent ONDA clause is retained",
        );
      }
    }
  }

  console.log("PASS: J1d deterministic current-text negation");
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

/**
 * Production keeps one durable context per LINE user. A returning customer can
 * therefore name the same treatment a day later while the stored task still holds
 * yesterday's concern. That explicit overview must start a fresh consultation
 * episode instead of returning a context-only fallback.
 */
async function validateStaleOverviewStartsFreshEpisode() {
  let context = createEmptyConversationContext(USER_ID);
  const oldIntro = await routeTurn({
    context,
    frame: frame(),
    message: "我想了解 ONDA",
    turnIndex: 201,
  });
  context = oldIntro.decision.nextContext;
  const oldConcern = await routeTurn({
    context,
    frame: frame({
      concerns: [{ area: "jawline", key: "jawline_looseness" }],
      dialogue: { focus: "overview", move: "continue", reference: "active_subject", speechAct: "ask_concern" },
      treatments: [],
    }),
    message: "雙下巴",
    turnIndex: 202,
  });
  context = oldConcern.decision.nextContext;
  assert(context.conversationV2State, "J3 setup must persist V2 state");

  const immediateExplicitRestart = await routeTurn({
    context,
    frame: frame(),
    message: "我想了解 ONDA",
    turnIndex: 205,
  });
  assert.match(
    immediateExplicitRestart.decision.replyText,
    /ONDA Pro|ONDA PRO/u,
    "J3: an explicit overview request must be answerable immediately",
  );
  assert.deepEqual(
    immediateExplicitRestart.decision.nextContext.conversationV2State?.knowledge.concernKeys,
    [],
    "J3: an explicit overview request must clear the stale concern without an idle wait",
  );

  const immediateBareContinuation = await routeTurn({
    context,
    frame: frame(),
    message: "ONDA",
    turnIndex: 206,
  });
  assert.ok(
    immediateBareContinuation.decision.nextContext.conversationV2State?.knowledge.concernKeys.includes("jawline_looseness"),
    "J3: a bare active treatment name must not erase the current concern",
  );

  const stalePriceOwner = await routeTurn({
    context,
    frame: frame({
      dialogue: { focus: "price_unspecified", move: "continue", reference: "active_subject", speechAct: "ask_price" },
      intents: ["pricing"],
      treatments: [],
    }),
    message: "體驗價是多少呢",
    turnIndex: 207,
  });
  context = stalePriceOwner.decision.nextContext;
  assert.equal(
    context.conversationV2State?.activeTask.kind,
    "pricing",
    "J3: setup must also cover a stale episode whose last task was pricing",
  );

  context = {
    ...context,
    conversationV2State: {
      ...context.conversationV2State,
      activeTask: {
        ...context.conversationV2State.activeTask,
        startedAt: "2026-08-23T10:00:00+08:00",
      },
      updatedAt: "2026-08-23T10:05:00+08:00",
    },
  };

  const restarted = await routeTurn({
    context,
    frame: frame(),
    message: "我想了解 ONDA",
    turnIndex: 203,
  });
  summarize("J3-1", "隔日再次想了解 ONDA", restarted.decision);
  assert.match(
    restarted.decision.replyText,
    /ONDA Pro|ONDA PRO/u,
    `J3: a stale explicit overview must return approved treatment content: ${restarted.decision.replyText}`,
  );
  assert.doesNotMatch(
    restarted.decision.replyText,
    /目前的療程脈絡我有保留|想先了解這個部位可評估的方向/u,
    "J3: a new episode must not return a context-only fallback",
  );
  assert.deepEqual(
    restarted.decision.nextContext.conversationV2State?.knowledge.concernKeys,
    [],
    "J3: a stale concern must not leak into the restarted treatment overview",
  );
  assert.deepEqual(
    restarted.decision.nextContext.activeFocus?.concernKeys ?? [],
    [],
    "J3: the projected legacy focus must also clear the stale concern",
  );
  assert.equal(
    restarted.decision.nextContext.conversationV2State?.activeTask.startedAt,
    NOW.toISOString(),
    "J3: restarting the same subject must refresh the task timestamp",
  );

  const selectedConcern = await routeTurn({
    context: restarted.decision.nextContext,
    frame: frame({
      concerns: [{ area: "jawline", key: "jawline_looseness" }],
      dialogue: { focus: "overview", move: "continue", reference: "active_subject", speechAct: "ask_concern" },
      treatments: [],
    }),
    message: "雙下巴",
    turnIndex: 204,
  });
  summarize("J3-2", "新回合選擇雙下巴", selectedConcern.decision);
  assert.match(
    selectedConcern.decision.replyText,
    /雙下巴|下顎/u,
    `J3: the next short answer must receive a grounded concern response: ${selectedConcern.decision.replyText}`,
  );
  assert.doesNotMatch(
    selectedConcern.decision.replyText,
    /目前的療程脈絡我有保留|我會直接承接這一輪的新問題/u,
    "J3: a selected concern must not degrade to process narration",
  );
  console.log("PASS: J3 stale overview starts a fresh episode");
}

async function main() {
  await validateSixTurnJourney();
  await validateLowConfidenceSemanticAnchorJourney();
  await validateFrameNullBookingTreatmentContinuation();
  await validateActiveSubjectFactObligationsAndTopicSwitch();
  await validateCurrentTextNegationOwnsPolarity();
  await validatePricingOwnership();
  await validateStaleOverviewStartsFreshEpisode();
  await validateExplicitRestartForAcceptanceTreatments();
  await validateThirtyMinuteEpisodeBoundary();
  await validateBotoxAcceptanceJourney();
  await validateMondayConsultationCtaJourneys();
  await validateMondayNaturalInputFamilies();
  await validateMondayCompleteBookingJourneys();
  console.log("Conversation V2 journey validation passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
