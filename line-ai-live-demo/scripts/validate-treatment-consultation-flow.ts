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
  const intro = await route("想了解 ONDA PRO");
  assert(intro.decisionType === "treatment_intro_reply", "T1: ONDA introduction must stay a treatment reply");
  assert(intro.matchedKey === "treatment_intro:onda_pro", "T1: ONDA introduction must retain its treatment intent");
  assert(intro.replyText.includes("臉部輪廓、雙下巴"), "T1: ONDA introduction must ask a needs-discovery question");
  assert(intro.replyText.includes("療程特色"), "T1: ONDA introduction must include the approved feature framing");

  const concern = await route("我想改善雙下巴，想了解 ONDA", intro.nextContext);
  assert(concern.decisionType === "treatment_intro_reply", "T2: ONDA concern response must remain an approved treatment reply");
  assert(concern.matchedKey === "treatment_consult:onda_pro", "T2: ONDA concern must use the reusable consultation path");
  assert(concern.replyText.includes("雙下巴"), "T2: ONDA concern response must acknowledge the stated concern");
  assert(concern.replyText.includes("療程特色"), "T2: ONDA concern response must include the approved feature framing");
  assert(!/保證|一定有效/.test(concern.replyText), "T2: ONDA concern response must not promise an outcome");

  const followup = await route("我覺得脂肪感比較明顯", concern.nextContext);
  assert(followup.matchedKey === "treatment_consult:onda_pro", "T3: ONDA follow-up must preserve the consultation path");
  assert(followup.replyText.includes("方便的館別"), "T3: ONDA follow-up must guide the next consultation step");

  const price = await route("ONDA 體驗價", intro.nextContext);
  assert(price.decisionType === "pricing_auto_reply", "T4: ONDA experience-price question must use the controlled pricing path");
  assert(price.matchedKey === "ONDA PRO", "T4: ONDA experience price must use the approved ONDA campaign");
  assert(price.replyText.includes("體驗價 16,888"), "T4: ONDA experience price must use the approved amount");
  assert(price.replyText.includes("全館適用"), "T4: ONDA experience price must state the approved branch scope");

  const pregnancy = await route("我懷孕可以做 ONDA 嗎", intro.nextContext);
  assert(pregnancy.matchedKey === "pregnancy_caution", "T5: pregnancy guidance must still override ONDA consultation");

  const payment = await route("可以刷卡嗎", intro.nextContext);
  assert(payment.matchedKey === "payment_methods", "T6: unrelated clinic FAQ must not get trapped in ONDA consultation");

  const guarantee = await route("ONDA 保證有效嗎", intro.nextContext);
  assert(guarantee.matchedKey === "effect_guarantee_request", "T7: outcome guarantee must still route to human handoff");

  console.log("treatment consultation flow validation passed (7 checks)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
