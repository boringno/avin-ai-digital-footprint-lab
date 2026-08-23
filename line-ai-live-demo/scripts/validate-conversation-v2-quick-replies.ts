import assert from "node:assert/strict";

import { buildReplyPayload } from "@/lib/line-webhook";
import { createStaticClinicFactsProvider } from "@/lib/clinic-facts/static-provider";
import { withConversationV2QuickReplies } from "@/lib/conversation-v2/quick-replies";
import { routeConversationV2Canary } from "@/lib/conversation-v2/live-runtime";
import { createConversationV2State } from "@/lib/conversation-v2/state";
import { createEmptyConversationContext } from "@/lib/conversation-context";
import { legacyDecisionToReplyPlan } from "@/lib/reply-plan";
import type { LineTextMessage } from "@/lib/treatment-carousel";
import type { NluFrame } from "@/lib/nlu-frame";

const NOW = "2026-08-23T12:00:00.000+08:00";

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
  assert.deepEqual(labels(followup.quickReplyItems), ["品牌差異", "價格／活動", "預約免費諮詢", "真人客服協助"]);
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

async function main() {
  validateOndaChoices();
  validateBotoxChoices();
  validateBookingChoicesAndPayload();
  validatePriceCallToAction();
  await validateLiveRuntimeAttachesV2Choices();
  console.log("Conversation V2 quick reply validation passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
