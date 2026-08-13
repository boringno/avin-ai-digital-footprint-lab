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
  assert(face.replyText.includes("ONDA Pro 超微波6分鐘"), "X2: face scenario must use the approved ONDA copy");
  assert(!face.replyText.includes("很多在意下顎線的客人都會選擇這個組合"), "X2: face selection alone must not hard-sell Botox");
  assert(!face.replyText.includes("12,999元"), "X2: selecting a concern must not quote before a price question");
  assert(face.nextContext.lastIntent === "treatment_consult:onda_pro", "X2: an understood face need must remain consultation");
  assert(!face.nextContext.bookingDraft.treatment, "X2: consultation must not populate a booking draft");

  const bookingStart = await route("想預約諮詢 ONDA", face.nextContext);
  assert(bookingStart.matchedKey === "booking_intake", "X3: only an explicit booking request may start intake");
  const weekday = await route("平日", bookingStart.nextContext);
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
  assert(!body.replyText.includes("體驗價 16,888"), "X4: body concern must not quote before a price question");
  assert(!body.nextContext.bookingDraft.treatment, "X4: body consultation must not start booking");

  const naturalFace = await route("我有肉肉的雙下巴");
  assert(naturalFace.replyText.includes("ONDA Pro 超微波6分鐘"), "X5: a natural face concern must use the approved scenario");
  assert(!naturalFace.replyText.includes("很多在意下顎線的客人都會選擇這個組合"), "X5: a natural face concern alone must not hard-sell Botox");
  assert(!naturalFace.replyText.includes("12,999元"), "X5: a natural face concern must not quote without a price question");
  const naturalBody = await route("蝴蝶袖想改善");
  assert(naturalBody.replyText.includes("身體局部脂肪堆積"), "X5: a natural body concern must use the approved scenario");
  assert(!naturalBody.replyText.includes("體驗價 16,888"), "X5: a natural body concern must not quote without a price question");

  const botox = await route("肉毒功效是什麼", face.nextContext);
  assert(botox.matchedKey === "treatment_consult:onda_pro:related:botox_small_face:botox", `X6: ONDA combo context must use the related Botox reply with its knowledge owner, got ${botox.matchedKey}`);
  assert(botox.replyText.includes("韓國原廠 Neuronox 肉毒桿菌"), "X6: related Botox reply must use Xiaoying copy");
  assert(botox.replyText.includes("約2～4週效果逐漸明顯"), "X6: related Botox reply must preserve approved timing copy");
  assert(!botox.replyText.includes("12,999元"), "X6: related treatment education must not quote without a price question");

  const directPrice = await route("ONDA 多少錢");
  assert(directPrice.decisionType === "pricing_auto_reply", "X7: a direct ONDA price question must use controlled pricing");
  assert(directPrice.replyText.includes("體驗價 16,888"), "X7: direct ONDA price must use the standalone amount");
  assert(!directPrice.replyText.includes("12,999"), "X7: direct price without a face need must not substitute the combo");

  const facePriceFollowup = await route("多少錢", face.nextContext);
  assert(facePriceFollowup.replyText.includes("16,888"), "X8: a face concern alone must retain the standalone ONDA price");
  assert(!facePriceFollowup.replyText.includes("12,999"), "X8: a face concern alone must not silently select the combo campaign");

  const explicitCombo = await route("想了解ONDA加肉毒的組合", face.nextContext);
  const explicitComboPrice = await route("多少錢", explicitCombo.nextContext);
  assert(explicitComboPrice.replyText.includes("12,999元"), "X8b: an explicitly selected ONDA and Botox combination must retain the combo price");

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
  const continuedIntro = await route("\u60f3\u4e86\u89e3ONDA", oldFaceContext);
  assert(
    continuedIntro.nextContext.treatmentConsultation?.concernKeys.includes("jawline_looseness"),
    "X11: mentioning the active treatment again must preserve its confirmed concern",
  );
  assert(
    !continuedIntro.replyText.includes("\u76ee\u524d\u91ab\u7f8e\u754c\u975e\u5e38\u71b1\u9580"),
    "X11: mentioning the active treatment again must not replay the first-turn introduction",
  );
  const restartedIntro = await route("\u6211\u60f3\u91cd\u65b0\u958b\u59cb\u4e86\u89e3 ONDA", continuedIntro.nextContext);
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
      restartedBody.replyText.includes("身體局部脂肪堆積"),
      `X11: body term ${bodyTerm} after restart must use the ONDA body scenario`,
    );
    assert(
      !restartedBody.replyText.includes("12,999") && !restartedBody.replyText.includes("16,888"),
      `X11: body term ${bodyTerm} must not quote without a price question`,
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
