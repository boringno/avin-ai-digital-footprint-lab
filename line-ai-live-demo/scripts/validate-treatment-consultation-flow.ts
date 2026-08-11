import { createEmptyConversationContext } from "../src/lib/conversation-context";
import { routeCustomerMessage } from "../src/lib/router";

const NOW = new Date("2026-08-10T04:00:00.000Z");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function route(
  message: string,
  conversationContext = createEmptyConversationContext("onda-consultation-test"),
  now = NOW,
) {
  return routeCustomerMessage({
    conversationContext,
    includePending: false,
    message,
    now,
  });
}

async function main() {
  const proactiveRecommendation = await route("我想改善雙下巴");
  assert(proactiveRecommendation.decisionType === "treatment_intro_reply", "T1: an ONDA concern must receive a guided treatment reply");
  assert(proactiveRecommendation.matchedKey === "treatment_consult:onda_pro", "T1: double-chin concern must proactively recommend ONDA");
  assert(proactiveRecommendation.replyText.includes("ONDA Pro"), "T1: proactive recommendation must name ONDA Pro");
  assert(proactiveRecommendation.replyText.includes("目前很推薦 ONDA Pro 搭配肉毒小臉"), "T1: double-chin concern must use its approved scenario reply");
  assert(proactiveRecommendation.replyText.includes("12,999元") && proactiveRecommendation.replyText.includes("😊"), "T1: ONDA face reply must quote the approved combo and keep Xiaoying tone");
  assert(proactiveRecommendation.nextContext.lastReferencedTreatment === "ONDA PRO", "T1: proactive recommendation must preserve ONDA context");

  const contextualPrice = await route("多少錢", proactiveRecommendation.nextContext);
  assert(contextualPrice.decisionType === "pricing_auto_reply", "T2: a short price follow-up must use the pricing route");
  assert(contextualPrice.matchedKey === "臉部輪廓組合", "T2: a short price follow-up must retain the selected face combo");
  assert(contextualPrice.replyText.includes("12,999元"), "T2: a short price follow-up must return the combo amount");
  assert(!contextualPrice.replyText.includes("2026") && !contextualPrice.replyText.includes("12/31"), "T2: internal campaign dates must not be shown proactively");
  assert(contextualPrice.replyText.includes("肉毒小臉"), "T2: the selected combo must keep its Botox component");

  const staleBookingDraft = createEmptyConversationContext("onda-pricing-after-botox-test");
  staleBookingDraft.bookingDraft.treatment = "肉毒";
  staleBookingDraft.lastReferencedTreatment = "ONDA PRO";
  const priceAfterOlderBooking = await route("多少錢", staleBookingDraft);
  assert(priceAfterOlderBooking.matchedKey === "pricing_followup", "T3: ambiguous stale treatment state must ask which treatment the customer means");
  assert(!priceAfterOlderBooking.replyText.includes("16,888"), "T3: stale treatment context must not invent an ONDA price subject");
  assert(!priceAfterOlderBooking.replyText.includes("肉毒"), "T3: stale booking data must not send the Botox campaign");

  const features = await route("ONDA 有什麼特色");
  assert(features.matchedKey === "treatment_consult:onda_pro:features", "T4: ONDA feature questions must use the concise approved answer");
  assert(features.replyText.includes("Coolwaves®"), "T4: ONDA feature questions must state the clinic-approved technology description");
  assert(features.replyText.includes("局部脂肪") && features.replyText.includes("肌膚緊實"), "T4: ONDA feature questions must state the supported treatment features");
  assert(features.replyText.includes("🟢") && features.replyText.includes("❄️") && features.replyText.includes("😊"), "T4: ONDA feature answer must keep the approved friendly emoji style");
  assert(features.replyText.length <= 150, "T4: ONDA feature answer must stay concise for LINE");

  const comfort = await route("ONDA 會痛嗎", features.nextContext);
  assert(comfort.matchedKey === "treatment_consult:onda_pro:comfort_and_recovery", "T5: ONDA comfort questions must use the approved short answer");
  assert(!/完全無痛|無副作用|零修復期/.test(comfort.replyText), "T5: ONDA comfort answers must not promise a medical outcome");

  const consultation = await route("想諮詢 ONDA", comfort.nextContext);
  assert(consultation.matchedKey === "treatment_intro:onda_pro", "T6: a consultation question must stay in treatment discovery");
  assert(consultation.nextContext.bookingDraft.treatment === "ONDA PRO", "T6: consultation discovery must preserve the requested ONDA treatment");
  const consultationBooking = await route("想預約諮詢 ONDA", consultation.nextContext);
  assert(consultationBooking.matchedKey === "booking_intake", "T6: an explicit consultation booking request must enter booking intake");

  const bookingAfterOlderTreatment = createEmptyConversationContext("onda-booking-after-botox-test");
  bookingAfterOlderTreatment.bookingDraft.treatment = "肉毒";
  bookingAfterOlderTreatment.lastReferencedTreatment = "ONDA PRO";
  bookingAfterOlderTreatment.lastSeenAt = NOW.toISOString();
  bookingAfterOlderTreatment.treatmentConsultation = {
    concernKeys: ["jawline_looseness"],
    stage: "priority_selected",
    treatmentKey: "onda_pro",
  };
  const bookingForOnda = await route("我想安排預約", bookingAfterOlderTreatment);
  assert(bookingForOnda.matchedKey === "booking_intake", "T6a: an ONDA booking request must stay in booking intake");
  assert(bookingForOnda.nextContext.bookingDraft.treatment === "肉毒、ONDA PRO", "T6a: active ONDA consultation must be added to an earlier Botox booking draft");
  assert(bookingForOnda.replyText.includes("肉毒＋ONDA PRO"), "T6a: booking summary must clearly show every treatment the customer wants to discuss");

  const bodyConcern = await route("我想改善腹部脂肪");
  assert(bodyConcern.matchedKey === "treatment_consult:onda_pro", "T7: local body-fat concern must proactively recommend ONDA");
  assert(bodyConcern.replyText.includes("ONDA PRO"), "T7: local body-fat recommendation must name ONDA PRO");
  assert(bodyConcern.replyText.includes("身體局部脂肪堆積") && bodyConcern.replyText.includes("體驗價 16,888"), "T7: local body-fat concern must use Xiaoying copy and quote the standalone price");

  const intro = await route("想了解 ONDA PRO");
  assert(intro.decisionType === "treatment_intro_reply", "T8: ONDA introduction must stay a treatment reply");
  assert(intro.matchedKey === "treatment_intro:onda_pro", "T8: ONDA introduction must retain its treatment intent");
  assert(intro.replyText.includes("新一代高頻能量 Coolwaves® 技術") && intro.replyText.includes("非侵入式"), "T8: ONDA introduction must use the approved Xiaoying opening");
  assert(intro.replyText.includes("①雙下巴／嘴邊肉"), "T8: ONDA introduction must ask a needs-discovery question");

  const concern = await route("我想改善雙下巴，想了解 ONDA", intro.nextContext);
  assert(concern.decisionType === "treatment_intro_reply", "T9: ONDA concern response must remain an approved treatment reply");
  assert(concern.matchedKey === "treatment_consult:onda_pro", "T9: ONDA concern must use the reusable consultation path");
  assert(concern.replyText.includes("雙下巴") && concern.replyText.includes("12,999元"), "T9: ONDA concern response must use the approved face combo");

  const naturalLanguageConcern = await route("我有肉肉的雙下巴");
  assert(naturalLanguageConcern.matchedKey === "treatment_consult:onda_pro", "T9a: natural double-chin wording must use the ONDA scenario reply");
  assert(naturalLanguageConcern.replyText.includes("目前很推薦 ONDA Pro 搭配肉毒小臉"), "T9a: natural double-chin wording must receive the Xiaoying face reply");

  const doubleChinDetail = await route("我在意厚度，這個能消除雙下巴嗎？", concern.nextContext);
  assert(doubleChinDetail.matchedKey === "treatment_consult:onda_pro", "T9aa: a detail question must stay in the ONDA consultation path");
  assert(doubleChinDetail.replyText.includes("肉感／厚度"), "T9aa: a double-chin thickness question must answer the stated concern");
  assert(doubleChinDetail.replyText.includes("12,999元") && doubleChinDetail.replyText.includes("免費"), "T9aa: a detail question must retain the face combo and booking next step");
  assert(!doubleChinDetail.replyText.includes("雙下巴／嘴邊肉，還是身體局部脂肪"), "T9aa: a detail question must not repeat the first-turn choice");

  const doubleChinIntroduction = await route("幫我介紹雙下巴的部分", concern.nextContext);
  assert(doubleChinIntroduction.replyText.includes("針對雙下巴／嘴邊肉"), "T9ab: a repeated double-chin introduction request must use the unserved introduction aspect");
  assert(!doubleChinIntroduction.replyText.includes("雙下巴／嘴邊肉，還是身體局部脂肪"), "T9ab: a repeated double-chin introduction request must not repeat the first-turn choice");

  const armConcern = await route("蝴蝶袖想改善");
  assert(armConcern.matchedKey === "treatment_consult:onda_pro", "T9b: natural arm-fat wording must use the ONDA scenario reply");
  assert(armConcern.replyText.includes("身體局部脂肪堆積") && armConcern.replyText.includes("16,888"), "T9b: natural arm-fat wording must receive Xiaoying body copy and price");

  const followup = await route("我覺得脂肪感比較明顯", concern.nextContext);
  assert(followup.matchedKey === "treatment_consult:onda_pro", "T10: ONDA follow-up must preserve the consultation path");
  assert(followup.replyText.includes("臉部輪廓") && followup.replyText.includes("脂肪感") && followup.replyText.includes("先以哪個部位為主"), "T10: an ONDA follow-up must combine context and guide one next step");

  const firstJawlineConcern = await route("我想改善嘴邊肉");
  const repeatedJawlineConcern = await route("還有肉肉的雙下巴", firstJawlineConcern.nextContext);
  assert(repeatedJawlineConcern.matchedKey === "treatment_consult:onda_pro", "T10a: a repeated ONDA concern must stay on the guided consultation path");
  assert(repeatedJawlineConcern.replyText.includes("已記下") && repeatedJawlineConcern.replyText.includes("雙下巴"), "T10a: a repeated ONDA concern must acknowledge the added detail");
  assert(!repeatedJawlineConcern.replyText.includes("可再依臉型"), "T10a: a repeated ONDA concern must not repeat the first-turn introduction");

  const combinedConcern = await route("也想改善手臂脂肪", repeatedJawlineConcern.nextContext);
  assert(combinedConcern.matchedKey === "treatment_consult:onda_pro", "T10b: a second ONDA body concern must stay on the guided consultation path");
  assert(combinedConcern.replyText.includes("臉部輪廓") && combinedConcern.replyText.includes("手臂脂肪"), "T10b: a second ONDA concern must combine prior and new needs");
  assert(combinedConcern.replyText.includes("先以哪個部位為主"), "T10b: a combined ONDA concern must advance toward one next question");

  const typoConcern = await route("也想改善雙下八", combinedConcern.nextContext);
  assert(typoConcern.matchedKey === "treatment_consult:onda_pro", "T10c: a common double-chin typo must remain in the ONDA consultation path");
  assert(typoConcern.replyText.includes("雙下八") && typoConcern.replyText.includes("已記下"), "T10c: a common double-chin typo must be acknowledged without restarting the introduction");

  const primaryConcern = await route("主要是雙下巴", typoConcern.nextContext);
  assert(primaryConcern.matchedKey === "treatment_consult:onda_pro:primary:jawline_looseness", "T10d: an explicit primary concern must advance the ONDA consultation stage");
  assert(primaryConcern.replyText.includes("先以 雙下巴") && primaryConcern.replyText.includes("肉肉厚度"), "T10d: an explicit primary concern must receive the next jawline-detail question");
  assert(primaryConcern.nextContext.treatmentConsultation?.primaryConcernKey === "jawline_looseness", "T10d: the selected primary concern must persist in conversation state");

  const staleConsultationContext = {
    ...primaryConcern.nextContext,
    lastSeenAt: new Date(NOW.getTime() - 21 * 60 * 1000).toISOString(),
  };
  const freshStartAfterIdle = await route("我想改善嘴邊肉", staleConsultationContext, NOW);
  assert(freshStartAfterIdle.replyText.includes("目前很推薦 ONDA Pro 搭配肉毒小臉"), "T10e: an expired ONDA consultation must restart with the first-turn face reply");
  assert(!freshStartAfterIdle.replyText.includes("已記下"), "T10e: an expired ONDA consultation must not inherit stale needs");

  const partialConsultationContext = {
    ...primaryConcern.nextContext,
    treatmentConsultation: {
      concernKeys: ["local_contour"],
      treatmentKey: "onda_pro",
    },
  };
  const primaryAfterPartialState = await route("主要是雙下巴", partialConsultationContext);
  assert(primaryAfterPartialState.matchedKey === "treatment_consult:onda_pro:primary:jawline_looseness", "T10f: an explicit primary concern must work even when earlier concern state is incomplete");
  assert(primaryAfterPartialState.nextContext.treatmentConsultation?.primaryConcernKey === "jawline_looseness", "T10f: an explicit primary concern must repair incomplete consultation state");

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
  assert(guarantee.matchedKey === "treatment_intro:onda_pro", "T14: an outcome question must stay in treatment guidance for natural qualification");

  console.log("treatment consultation flow validation passed (34 checks)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
