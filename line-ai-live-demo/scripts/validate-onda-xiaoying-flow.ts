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
  conversationContext = createEmptyConversationContext("onda-xiaoying-flow"),
) {
  return routeCustomerMessage({ conversationContext, includePending: false, message, now: NOW });
}

async function main() {
  const intro = await route("想了解 ONDA");
  assert(intro.matchedKey === "treatment_intro:onda_pro", "X1: ONDA must use the approved introduction");
  assert(intro.replyText.includes("新一代高頻能量 Coolwaves® 技術"), "X1: intro must use Xiaoying technology copy");
  assert(intro.replyText.includes("全程無痛、舒適體驗"), "X1: intro must preserve clinic-approved Xiaoying wording");
  assert(intro.replyText.includes("①雙下巴／嘴邊肉") && intro.replyText.includes("②身體局部脂肪堆積"), "X1: intro must ask the two approved needs-discovery choices");
  assert(intro.nextContext.lastIntent !== "booking_intake", "X1: introduction alone must not start booking");

  const face = await route("①", intro.nextContext);
  assert(face.matchedKey === "treatment_consult:onda_pro", "X2: choice one must select the ONDA face scenario");
  assert(face.replyText.includes("目前很推薦 ONDA Pro 搭配肉毒小臉"), "X2: face scenario must use Xiaoying copy");
  assert(face.replyText.includes("12,999元") && face.replyText.includes("全館適用"), "X2: face scenario must quote the approved combo");
  assert(face.nextContext.lastIntent === "booking_intake", "X2: an understood face need must start booking intake");
  assert(face.nextContext.bookingDraft.treatment === "ONDA PRO、肉毒", "X2: face combo must preserve both booking treatments");

  const weekday = await route("平日", face.nextContext);
  assert(weekday.matchedKey === "booking_intake", "X3: weekday preference must continue booking intake");
  assert(weekday.nextContext.bookingDraft.timeSlots.includes("平日"), "X3: weekday preference must be collected");
  const contact = await route("我叫王小明，電話0912345678", weekday.nextContext);
  assert(contact.nextContext.bookingDraft.name === "王小明", "X3: booking must collect the customer name");
  assert(contact.nextContext.bookingDraft.phone === "0912345678", "X3: booking must collect the phone number");
  const branchAndTime = await route("高雄館，週三下午", contact.nextContext);
  assert(branchAndTime.nextContext.bookingDraft.branch === "高雄館", "X3: booking must collect the branch");
  assert(branchAndTime.nextContext.bookingDraft.timeSlots.some((slot) => slot.includes("週三下午")), "X3: booking must collect a preferred time");

  const body = await route("②", intro.nextContext);
  assert(body.matchedKey === "treatment_consult:onda_pro", "X4: choice two must select the ONDA body scenario");
  assert(body.replyText.includes("破壞頑固脂肪／減少脂肪厚度"), "X4: body scenario must preserve Xiaoying copy");
  assert(body.replyText.includes("安全無副作用"), "X4: body scenario must preserve clinic-approved wording");
  assert(body.replyText.includes("體驗價 16,888") && body.replyText.includes("全館適用"), "X4: body scenario must quote the ONDA experience price");
  assert(body.nextContext.bookingDraft.treatment === "ONDA PRO", "X4: body scenario must book ONDA only");

  const naturalFace = await route("我有肉肉的雙下巴");
  assert(naturalFace.replyText.includes("12,999元"), "X5: a natural face concern must use the combo price");
  const naturalBody = await route("蝴蝶袖想改善");
  assert(naturalBody.replyText.includes("體驗價 16,888"), "X5: a natural body concern must use the standalone price");

  const botox = await route("肉毒功效是什麼", face.nextContext);
  assert(botox.matchedKey === "treatment_consult:onda_pro:related:botox_small_face", `X6: ONDA combo context must use the related Botox reply, got ${botox.matchedKey}`);
  assert(botox.replyText.includes("韓國原廠 Neuronox 肉毒桿菌"), "X6: related Botox reply must use Xiaoying copy");
  assert(botox.replyText.includes("約2～4週效果逐漸明顯"), "X6: related Botox reply must preserve approved timing copy");
  assert(botox.replyText.includes("12,999元"), "X6: related Botox reply must retain the combo quote");

  const directPrice = await route("ONDA 多少錢");
  assert(directPrice.decisionType === "pricing_auto_reply", "X7: a direct ONDA price question must use controlled pricing");
  assert(directPrice.replyText.includes("體驗價 16,888"), "X7: direct ONDA price must use the standalone amount");
  assert(!directPrice.replyText.includes("12,999"), "X7: direct price without a face need must not substitute the combo");

  const facePriceFollowup = await route("多少錢", face.nextContext);
  assert(facePriceFollowup.replyText.includes("12,999元"), "X8: a face-context price follow-up must retain the combo");
  assert(!facePriceFollowup.replyText.includes("16,888"), "X8: face-context price must not jump to the standalone campaign");

  const wrinkleSwitch = await route("那魚尾紋呢？", face.nextContext);
  assert(wrinkleSwitch.matchedKey === "treatment_consult:botox", "X9: a wrinkle concern must still switch to the Botox pack");
  const pregnancy = await route("我懷孕可以做 ONDA 嗎", intro.nextContext);
  assert(pregnancy.matchedKey === "pregnancy_caution", "X10: pregnancy safety must still override Xiaoying content");

  const oldFaceContext = createEmptyConversationContext("onda-restart-body-flow");
  oldFaceContext.treatmentConsultation = {
    answeredAspectKeys: ["concern:jawline_looseness:overview"],
    concernKeys: ["jawline_looseness"],
    stage: "needs_discovery",
    treatmentKey: "onda_pro",
  };
  const restartedIntro = await route("\u60f3\u4e86\u89e3ONDA", oldFaceContext);
  assert(
    restartedIntro.nextContext.treatmentConsultation?.concernKeys.length === 0,
    "X11: an explicit treatment restart must clear old concern state",
  );
  const bodyTerms = [
    "\u624b\u81c2",
    "\u809a\u5b50",
    "\u6a58\u76ae",
    "\u8179\u90e8",
    "\u5c0f\u8179",
    "\u8774\u8776\u8896",
    "\u63b0\u63b0\u8896",
    "\u5927\u817f",
    "\u8170\u5074",
    "\u5074\u8170",
    "\u8170\u8179",
    "\u809a\u76ae",
  ];
  for (const bodyTerm of bodyTerms) {
    const restartedBody = await route(bodyTerm, restartedIntro.nextContext);
    assert(
      restartedBody.replyText.includes("16,888"),
      `X11: body term ${bodyTerm} after restart must use the ONDA body price`,
    );
    assert(
      !restartedBody.replyText.includes("12,999"),
      `X11: an old face concern must not contaminate body term ${bodyTerm}`,
    );
    assert(
      restartedBody.nextContext.treatmentConsultation?.concernKeys.join(",") === "local_contour",
      `X11: body term ${bodyTerm} must retain only the new body concern`,
    );
  }

  console.log("ONDA Xiaoying flow validation passed (11 scenarios)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
