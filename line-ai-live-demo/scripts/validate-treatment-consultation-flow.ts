import { createEmptyConversationContext } from "../src/lib/conversation-context";
import { routeCustomerMessage } from "../src/lib/router";

const NOW = new Date("2026-08-05T04:00:00.000Z");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function route(message: string, conversationContext = createEmptyConversationContext("onda-consultation-test")) {
  return routeCustomerMessage({
    conversationContext,
    includePending: false,
    message,
    now: NOW,
  });
}

async function main() {
  const proactiveRecommendation = await route("我想改善雙下巴");
  assert(proactiveRecommendation.decisionType === "treatment_intro_reply", "T1: an ONDA concern must receive a guided treatment reply");
  assert(proactiveRecommendation.matchedKey === "treatment_consult:onda_pro", "T1: double-chin concern must proactively recommend ONDA");
  assert(proactiveRecommendation.replyText.includes("ONDA PRO"), "T1: proactive recommendation must name ONDA PRO");
  assert(proactiveRecommendation.replyText.length <= 72, "T1: proactive recommendation must stay concise for LINE");
  assert(proactiveRecommendation.nextContext.lastReferencedTreatment === "ONDA PRO", "T1: proactive recommendation must preserve ONDA context");

  const contextualPrice = await route("多少錢", proactiveRecommendation.nextContext);
  assert(contextualPrice.decisionType === "pricing_auto_reply", "T2: a short price follow-up must use the pricing route");
  assert(contextualPrice.matchedKey === "ONDA PRO", "T2: a short price follow-up must retain the recommended ONDA context");
  assert(contextualPrice.replyText.includes("體驗價 16,888"), "T2: a short price follow-up must return the ONDA amount");
  assert(!contextualPrice.replyText.includes("2026") && !contextualPrice.replyText.includes("12/31"), "T2: internal campaign dates must not be shown proactively");
  assert(!contextualPrice.replyText.includes("肉毒"), "T2: a short ONDA price follow-up must not jump to another promotion");

  const staleBookingDraft = createEmptyConversationContext("onda-pricing-after-botox-test");
  staleBookingDraft.bookingDraft.treatment = "肉毒";
  staleBookingDraft.lastReferencedTreatment = "ONDA PRO";
  const priceAfterOlderBooking = await route("多少錢", staleBookingDraft);
  assert(priceAfterOlderBooking.matchedKey === "ONDA PRO", "T3: the latest ONDA topic must win over an older Botox booking draft");
  assert(priceAfterOlderBooking.replyText.includes("體驗價 16,888"), "T3: a conflicting stale booking draft must still return the ONDA amount");
  assert(!priceAfterOlderBooking.replyText.includes("肉毒"), "T3: a conflicting stale booking draft must not send the Botox campaign");

  const features = await route("ONDA 有什麼特色");
  assert(features.matchedKey === "treatment_consult:onda_pro:features", "T4: ONDA feature questions must use the concise approved answer");
  assert(features.replyText.includes("非侵入式"), "T4: ONDA feature questions must state the approved non-invasive description");
  assert(features.replyText.includes("局部脂肪") && features.replyText.includes("肌膚緊實"), "T4: ONDA feature questions must state the supported treatment features");
  assert(features.replyText.length <= 100, "T4: ONDA feature answer must stay concise for LINE");

  const comfort = await route("ONDA 會痛嗎", features.nextContext);
  assert(comfort.matchedKey === "treatment_consult:onda_pro:comfort_and_recovery", "T5: ONDA comfort questions must use the approved short answer");
  assert(!/完全無痛|無副作用|零修復期/.test(comfort.replyText), "T5: ONDA comfort answers must not promise a medical outcome");

  const consultation = await route("想諮詢 ONDA", comfort.nextContext);
  assert(consultation.matchedKey === "booking_intake", "T6: an explicit ONDA consultation request must enter booking intake");
  assert(consultation.nextContext.bookingDraft.treatment === "ONDA PRO", "T6: booking intake must preserve the requested ONDA treatment");

  const bodyConcern = await route("我想改善腹部脂肪");
  assert(bodyConcern.matchedKey === "treatment_consult:onda_pro", "T7: local body-fat concern must proactively recommend ONDA");
  assert(bodyConcern.replyText.includes("ONDA PRO"), "T7: local body-fat recommendation must name ONDA PRO");

  const intro = await route("想了解 ONDA PRO");
  assert(intro.decisionType === "treatment_intro_reply", "T8: ONDA introduction must stay a treatment reply");
  assert(intro.matchedKey === "treatment_intro:onda_pro", "T8: ONDA introduction must retain its treatment intent");
  assert(intro.replyText.includes("局部輪廓與體態管理"), "T8: ONDA introduction must use the approved short opening");
  assert(intro.replyText.includes("雙下巴、下顎線"), "T8: ONDA introduction must ask a needs-discovery question");
  assert(intro.replyText.length <= 88, "T8: ONDA introduction must stay concise for LINE");

  const concern = await route("我想改善雙下巴，想了解 ONDA", intro.nextContext);
  assert(concern.decisionType === "treatment_intro_reply", "T9: ONDA concern response must remain an approved treatment reply");
  assert(concern.matchedKey === "treatment_consult:onda_pro", "T9: ONDA concern must use the reusable consultation path");
  assert(concern.replyText.includes("雙下巴"), "T9: ONDA concern response must acknowledge the stated concern");
  assert(concern.replyText.length <= 72, "T9: ONDA concern response must stay concise for LINE");
  assert(!/保證|一定有效/.test(concern.replyText), "T9: ONDA concern response must not promise an outcome");

  const followup = await route("我覺得脂肪感比較明顯", concern.nextContext);
  assert(followup.matchedKey === "treatment_consult:onda_pro", "T10: ONDA follow-up must preserve the consultation path");
  assert(followup.replyText.includes("腹部、手臂或大腿"), "T10: ONDA follow-up must guide the next consultation step");

  const price = await route("ONDA 體驗價", intro.nextContext);
  assert(price.decisionType === "pricing_auto_reply", "T11: ONDA experience-price question must use the controlled pricing path");
  assert(price.matchedKey === "ONDA PRO", "T11: ONDA experience price must use the approved ONDA campaign");
  assert(price.replyText.includes("體驗價 16,888"), "T11: ONDA experience price must use the approved amount");
  assert(price.replyText.includes("全館適用"), "T11: ONDA experience price must state the approved branch scope");

  const pregnancy = await route("我懷孕可以做 ONDA 嗎", intro.nextContext);
  assert(pregnancy.matchedKey === "pregnancy_caution", "T12: pregnancy guidance must still override ONDA consultation");

  const payment = await route("可以刷卡嗎", intro.nextContext);
  assert(payment.matchedKey === "payment_methods", "T13: unrelated clinic FAQ must not get trapped in ONDA consultation");

  const guarantee = await route("ONDA 保證有效嗎", intro.nextContext);
  assert(guarantee.matchedKey === "effect_guarantee_request", "T14: outcome guarantee must still route to human handoff");

  console.log("treatment consultation flow validation passed (14 checks)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
