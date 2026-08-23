import assert from "node:assert/strict";

import { buildReplyPayload, processWebhookRequestBody } from "@/lib/line-webhook";
import type { PriceCatalogEntry } from "@/lib/clinic-facts";
import { createStaticClinicFactsProvider } from "@/lib/clinic-facts/static-provider";
import { withConversationV2QuickReplies } from "@/lib/conversation-v2/quick-replies";
import { routeConversationV2Canary } from "@/lib/conversation-v2/live-runtime";
import { createConversationV2State } from "@/lib/conversation-v2/state";
import { createEmptyConversationContext } from "@/lib/conversation-context";
import { legacyDecisionToReplyPlan } from "@/lib/reply-plan";
import type { LineReplyMessage, LineTextMessage } from "@/lib/treatment-carousel";
import type { NluFrame } from "@/lib/nlu-frame";

const NOW = "2026-08-23T12:00:00.000+08:00";

const ONDA_PRICE: PriceCatalogEntry = {
  approval_status: "approved",
  asset_urls: "",
  branch_scope: "all",
  campaign_aliases: "ONDA|ONDA PRO|ONDA體驗價",
  campaign_name: "ONDA 體驗方案",
  customer_price_approval_status: "approved",
  customer_price_text: "體驗價 16,888 元",
  end_date: "2026-08-31",
  fallback_message: "",
  id: "quick-replies-onda-price",
  is_active: "true",
  notes: "validator",
  price_text: "internal",
  start_date: "2026-08-01",
  treatment_name: "ONDA PRO",
};

function plan(input: { dialogueAct?: "introduce_treatment" | "answer_followup" | "quote_approved_price"; treatmentKeys?: string[] } = {}) {
  return legacyDecisionToReplyPlan({
    decisionType: "treatment_intro_reply",
    matchedKey: "fixture:quick-replies",
    matchedType: "config",
    replyText: "核准的客服回覆。",
  }, {
    dialogueAct: input.dialogueAct ?? "introduce_treatment",
    renderMode: "deterministic",
    treatmentKeys: input.treatmentKeys ?? [],
  });
}

function labels(items: ReturnType<typeof withConversationV2QuickReplies>["quickReplyItems"]) {
  return items.map((item) => item.action.label);
}

function validateOndaChoices() {
  const state = createConversationV2State({ episodeId: "onda-buttons", now: NOW });
  state.knowledge.treatmentKeys = ["onda_pro"];
  const opening = withConversationV2QuickReplies(plan({ treatmentKeys: ["onda_pro"] }), state);
  assert.deepEqual(labels(opening.quickReplyItems), ["雙下巴／嘴邊肉", "身體局部脂肪", "療程特色", "價格／活動"]);

  state.knowledge.concernKeys = ["jawline_looseness"];
  const followup = withConversationV2QuickReplies(plan({
    dialogueAct: "answer_followup",
    treatmentKeys: ["onda_pro"],
  }), state);
  assert.deepEqual(labels(followup.quickReplyItems), ["脂肪堆積", "下顎線鬆弛", "ONDA＋肉毒組合", "預約免費諮詢"]);

  state.knowledge.concernKeys = ["local_contour"];
  const bodyFollowup = withConversationV2QuickReplies(plan({
    dialogueAct: "answer_followup",
    treatmentKeys: ["onda_pro"],
  }), state);
  assert.deepEqual(labels(bodyFollowup.quickReplyItems), ["手臂", "腹部／腰側", "大腿／臀部", "預約免費諮詢"]);
}

function validateBotoxChoices() {
  const state = createConversationV2State({ episodeId: "botox-buttons", now: NOW });
  state.knowledge.treatmentKeys = ["botox"];
  const opening = withConversationV2QuickReplies(plan({ treatmentKeys: ["botox"] }), state);
  assert.deepEqual(labels(opening.quickReplyItems), ["動態紋", "咀嚼肌／小臉", "肩頸／小腿", "腋下／手汗"]);

  state.knowledge.concernKeys = ["masseter_contour"];
  const followup = withConversationV2QuickReplies(plan({
    dialogueAct: "answer_followup",
    treatmentKeys: ["botox"],
  }), state);
  assert.deepEqual(labels(followup.quickReplyItems), ["臉型偏寬", "咬肌緊繃", "價格／活動", "預約免費諮詢"]);

  state.knowledge.concernKeys = ["dynamic_wrinkles"];
  const wrinklesFollowup = withConversationV2QuickReplies(plan({
    dialogueAct: "answer_followup",
    treatmentKeys: ["botox"],
  }), state);
  assert.deepEqual(labels(wrinklesFollowup.quickReplyItems), ["做表情時明顯", "平時也看得到", "價格／活動", "預約免費諮詢"]);

  state.knowledge.concernKeys = ["muscle_contour"];
  const muscleFollowup = withConversationV2QuickReplies(plan({
    dialogueAct: "answer_followup",
    treatmentKeys: ["botox"],
  }), state);
  assert.deepEqual(labels(muscleFollowup.quickReplyItems), ["肌肉線條", "緊繃感", "價格／活動", "預約免費諮詢"]);

  state.knowledge.concernKeys = ["localized_sweating"];
  const sweatingFollowup = withConversationV2QuickReplies(plan({
    dialogueAct: "answer_followup",
    treatmentKeys: ["botox"],
  }), state);
  assert.deepEqual(labels(sweatingFollowup.quickReplyItems), ["腋下多汗", "手汗", "價格／活動", "預約免費諮詢"]);
}

function validateBookingChoicesAndPayload() {
  const state = createConversationV2State({ episodeId: "booking-buttons", now: NOW });
  state.bookingTask = {
    draft: { timeSlots: [], treatmentKeys: ["onda_pro"] },
    expectedField: "branch",
    id: "booking-buttons",
    intent: "create",
    status: "collecting",
  };
  const withBranches = withConversationV2QuickReplies(plan({ treatmentKeys: ["onda_pro"] }), state);
  assert.deepEqual(labels(withBranches.quickReplyItems), ["高雄館", "台中館", "桃園館", "林口館"]);

  const payload = buildReplyPayload(
    "reply-token",
    "請問較方便前往哪個館別？",
    false,
    [{ type: "text", text: "請問較方便前往哪個館別？", quickReply: { items: withBranches.quickReplyItems } }],
  );
  const textMessage = payload.messages
    .filter((message): message is LineTextMessage => message.type === "text")
    .find((message) => (message.quickReply?.items.length ?? 0) > 0);
  assert.deepEqual(
    textMessage?.type === "text" ? textMessage.quickReply?.items.map((item) => item.action.label) : [],
    ["高雄館", "台中館", "桃園館", "林口館"],
    "explicit V2 quick replies must survive the final LINE payload builder",
  );

  state.bookingTask.expectedField = "first_visit";
  const withFirstVisit = withConversationV2QuickReplies(plan(), state);
  assert.deepEqual(labels(withFirstVisit.quickReplyItems), ["初診", "複診"]);
}

function validatePriceCallToAction() {
  const state = createConversationV2State({ episodeId: "price-buttons", now: NOW });
  state.knowledge.treatmentKeys = ["onda_pro"];
  const quoted = withConversationV2QuickReplies(plan({
    dialogueAct: "quote_approved_price",
    treatmentKeys: ["onda_pro"],
  }), state);
  assert.deepEqual(labels(quoted.quickReplyItems), ["預約免費諮詢", "真人客服協助", "繼續詢問"]);
}

async function validateLiveRuntimeAttachesV2Choices() {
  const frame: NluFrame = {
    areas: [],
    confidence: 0.99,
    concerns: [],
    dialogue: { focus: "overview", move: "start", reference: "explicit", speechAct: "learn_treatment" },
    intents: ["treatment"],
    negated: [],
    safety: { complaint: false, humanRequest: false, postTreatmentRisk: false, pregnancyNursing: false },
    schemaVersion: 2,
    treatments: ["onda_pro"],
  };
  const routed = await routeConversationV2Canary({
    context: createEmptyConversationContext("U-v2-buttons"),
    eventIdentity: "quick-replies-live-route",
    message: "我想了解 ONDA",
    now: new Date(NOW),
    sourceType: "user",
    sourceUserId: "U-v2-buttons",
  }, {
    factsProvider: createStaticClinicFactsProvider(),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-v2-buttons"], mode: "canary" }),
    requestFrame: async () => ({
      errorCode: null,
      frame,
      latencyMs: 1,
      model: "fixture",
      promptVersion: "fixture",
      tokensIn: 1,
      tokensOut: 1,
    }),
  });
  assert.equal(routed.kind, "routed");
  assert.deepEqual(
    labels(routed.decision.replyPlan?.quickReplyItems ?? []),
    ["雙下巴／嘴邊肉", "身體局部脂肪", "療程特色", "價格／活動"],
    "the live V2 route must attach ONDA choices before rendering",
  );
}

function quickReplyLabelsFromPayload(messages: readonly LineReplyMessage[]) {
  const message = messages.find((item): item is LineTextMessage =>
    item.type === "text" && (item.quickReply?.items.length ?? 0) > 0,
  );
  return message?.quickReply?.items.map((item) => item.action.label) ?? [];
}

function webhookEvent(input: { id: string; message: string; userId: string }) {
  return JSON.stringify({
    events: [{
      message: { id: input.id, text: input.message, type: "text" },
      replyToken: `reply-${input.id}`,
      source: { type: "user", userId: input.userId },
      timestamp: new Date(NOW).getTime(),
      type: "message",
      webhookEventId: `event-${input.id}`,
    }],
  });
}

async function validateFinalWebhookPayload() {
  const userId = `U-v2-quick-replies-e2e-${Date.now()}`;
  const fixtureRoute = (value: NluFrame | null) =>
    async (input: Parameters<typeof routeConversationV2Canary>[0]) =>
      routeConversationV2Canary(input, {
        factsProvider: createStaticClinicFactsProvider({ pricingCampaigns: [ONDA_PRICE] }),
        getCanarySettings: () => ({
          allowlistedUserIds: [userId, `${userId}-booking`],
          mode: "canary" as const,
        }),
        requestFrame: async () => ({
          errorCode: value ? null : "nlu_unavailable",
          frame: value,
          latencyMs: 1,
          model: "fixture",
          promptVersion: "fixture",
          tokensIn: 1,
          tokensOut: 1,
        }),
      });

  const priceFrame: NluFrame = {
    areas: [],
    confidence: 0.99,
    concerns: [],
    dialogue: { focus: "price_unspecified", move: "continue", reference: "explicit", speechAct: "ask_price" },
    intents: ["pricing"],
    negated: [],
    safety: { complaint: false, humanRequest: false, postTreatmentRisk: false, pregnancyNursing: false },
    schemaVersion: 2,
    treatments: ["onda_pro"],
  };
  const price = await processWebhookRequestBody(
    webhookEvent({ id: "v2-price", message: "ONDA 體驗價多少", userId }),
    {
      includePending: false,
      routeConversationV2: fixtureRoute(priceFrame),
      routeLegacy: async () => {
        throw new Error("V1 must not run when the V2 price route is eligible");
      },
    },
  );
  const pricePayload = price.results[0]?.replyPayload;
  assert.ok(pricePayload, "the final webhook payload must exist for an approved V2 price reply");
  assert.match(JSON.stringify(pricePayload), /16,888/u, "the final payload must retain the approved ONDA price");
  assert.deepEqual(
    quickReplyLabelsFromPayload(pricePayload.messages),
    ["預約免費諮詢", "真人客服協助", "繼續詢問"],
    "the approved-price CTA choices must survive V2 route, renderer, and webhook formatting",
  );

  const bookingUserId = `${userId}-booking`;
  const overviewFrame: NluFrame = {
    areas: [],
    confidence: 0.99,
    concerns: [],
    dialogue: { focus: "overview", move: "start", reference: "explicit", speechAct: "learn_treatment" },
    intents: ["treatment"],
    negated: [],
    safety: { complaint: false, humanRequest: false, postTreatmentRisk: false, pregnancyNursing: false },
    schemaVersion: 2,
    treatments: ["onda_pro"],
  };
  await processWebhookRequestBody(
    webhookEvent({ id: "v2-booking-onda", message: "我想了解 ONDA", userId: bookingUserId }),
    {
      includePending: false,
      routeConversationV2: fixtureRoute(overviewFrame),
      routeLegacy: async () => {
        throw new Error("V1 must not run when the V2 ONDA context route is eligible");
      },
    },
  );
  const booking = await processWebhookRequestBody(
    webhookEvent({ id: "v2-booking", message: "我要預約免費諮詢", userId: bookingUserId }),
    {
      includePending: false,
      routeConversationV2: fixtureRoute(null),
      routeLegacy: async () => {
        throw new Error("V1 must not run when explicit V2 booking is eligible");
      },
    },
  );
  const bookingPayload = booking.results[0]?.replyPayload;
  assert.ok(bookingPayload, "the final webhook payload must exist for V2 booking intake");
  assert.deepEqual(
    quickReplyLabelsFromPayload(bookingPayload.messages),
    ["高雄館", "台中館", "桃園館", "林口館"],
    "booking branch choices must survive V2 route, renderer, and webhook formatting",
  );

  const followupUserId = `${userId}-followup`;
  const botoxOverviewFrame: NluFrame = {
    ...overviewFrame,
    treatments: ["botox"],
  };
  const dynamicWrinklesFrame: NluFrame = {
    areas: ["face"],
    confidence: 0.99,
    concerns: [{ area: "face", key: "dynamic_wrinkles" }],
    dialogue: { focus: "benefits", move: "continue", reference: "explicit", speechAct: "ask_concern" },
    intents: ["treatment_consultation"],
    negated: [],
    safety: { complaint: false, humanRequest: false, postTreatmentRisk: false, pregnancyNursing: false },
    schemaVersion: 2,
    treatments: ["botox"],
  };
  const routeFollowupJourney = async (input: Parameters<typeof routeConversationV2Canary>[0]) =>
    routeConversationV2Canary(input, {
      factsProvider: createStaticClinicFactsProvider(),
      getCanarySettings: () => ({ allowlistedUserIds: [followupUserId], mode: "canary" as const }),
      requestFrame: async (message) => ({
        errorCode: null,
        frame: message.includes("動態紋") ? dynamicWrinklesFrame : botoxOverviewFrame,
        latencyMs: 1,
        model: "fixture",
        promptVersion: "fixture",
        tokensIn: 1,
        tokensOut: 1,
      }),
    });
  await processWebhookRequestBody(
    webhookEvent({ id: "v2-botox-open", message: "我想了解肉毒", userId: followupUserId }),
    { includePending: false, routeConversationV2: routeFollowupJourney },
  );
  const dynamicWrinkles = await processWebhookRequestBody(
    webhookEvent({ id: "v2-botox-wrinkles", message: "我想改善動態紋", userId: followupUserId }),
    { includePending: false, routeConversationV2: routeFollowupJourney },
  );
  const dynamicPayload = dynamicWrinkles.results[0]?.replyPayload;
  assert.ok(dynamicPayload, "the final webhook payload must exist for an understood Botox concern");
  assert.deepEqual(
    quickReplyLabelsFromPayload(dynamicPayload.messages),
    ["做表情時明顯", "平時也看得到", "價格／活動", "預約免費諮詢"],
    "an understood Botox concern must receive its own state-driven next-step buttons in the final LINE payload",
  );

  const flexPlan = legacyDecisionToReplyPlan({
    decisionType: "clinic_info_reply",
    matchedKey: "fixture:v2-flex-quick-replies",
    matchedType: "config",
    replyMessages: [{
      altText: "活動卡片",
      contents: {
        contents: [{ body: { contents: [{ text: "核准活動", type: "text" }], layout: "vertical", type: "box" }, type: "bubble" }],
        type: "carousel",
      },
      type: "flex",
    }],
    replyText: "核准活動內容。",
  }, {
    dialogueAct: "quote_approved_price",
    renderMode: "deterministic",
    treatmentKeys: ["onda_pro"],
  });
  const flexState = createConversationV2State({ episodeId: "flex-buttons", now: NOW });
  flexState.knowledge.treatmentKeys = ["onda_pro"];
  const flexDecision = withConversationV2QuickReplies(flexPlan, flexState);
  const flex = await processWebhookRequestBody(
    webhookEvent({ id: "v2-flex", message: "活動卡片", userId: `${userId}-flex` }),
    {
      includePending: false,
      routeConversationV2: async ({ context }) => ({
        dataStatus: "ready" as const,
        decision: {
          decisionType: "clinic_info_reply" as const,
          matchedKey: flexDecision.matchedKey,
          matchedType: "config" as const,
          nextContext: context,
          replyPlan: flexDecision,
          replyText: flexDecision.fallbackText,
        },
        gate: { eligible: true, reason: "eligible" as const },
        kind: "routed" as const,
      }),
      routeLegacy: async () => {
        throw new Error("V1 must not run when the V2 flex fixture is eligible");
      },
    },
  );
  const flexPayload = flex.results[0]?.replyPayload;
  assert.ok(flexPayload, "the final webhook payload must exist for the V2 flex fixture");
  assert.ok(
    flexPayload.messages.some((message) => message.type === "flex"),
    "webhook formatting must preserve a V2 rich Flex message",
  );
  assert.deepEqual(
    quickReplyLabelsFromPayload(flexPayload.messages),
    ["預約免費諮詢", "真人客服協助", "繼續詢問"],
    "a V2 Flex reply must retain its CTA quick replies after webhook formatting",
  );
}

async function main() {
  validateOndaChoices();
  validateBotoxChoices();
  validateBookingChoicesAndPayload();
  validatePriceCallToAction();
  await validateLiveRuntimeAttachesV2Choices();
  await validateFinalWebhookPayload();
  console.log("Conversation V2 quick reply validation passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
