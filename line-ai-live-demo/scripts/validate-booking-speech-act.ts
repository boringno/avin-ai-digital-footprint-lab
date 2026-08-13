import assert from "node:assert/strict";

import {
  classifyBookingSpeechAct,
  isBookingMutationSpeechAct,
  type BookingSpeechAct,
} from "../src/lib/booking-speech-act";

const CASES: ReadonlyArray<readonly [BookingSpeechAct, string]> = [
  ["inquiry", "要先預約嗎還是直接去就好"],
  ["inquiry", "需要先預約嗎"],
  ["inquiry", "一定要預約嗎"],
  ["inquiry", "要預約才能去嗎"],
  ["inquiry", "我要先預約才能去嗎"],
  ["inquiry", "我要先預約才可以看診嗎"],
  ["inquiry", "是預約制嗎？"],
  ["inquiry", "可以直接去嗎"],
  ["inquiry", "可以直接現場去嗎"],
  ["inquiry", "可以現場排嗎"],
  ["inquiry", "現場候位可以嗎"],
  ["inquiry", "怎麼預約"],
  ["inquiry", "預約方式是什麼"],
  ["inquiry", "可以預約嗎？"],
  ["inquiry", "可以取消預約嗎？"],
  ["inquiry", "有辦法取消預約嗎"],
  ["inquiry", "可以改預約時間嗎？"],
  ["inquiry", "我想問怎麼預約"],

  ["create", "我想預約肉毒"],
  ["create", "我要約 ONDA"],
  ["create", "幫我約 ONDA"],
  ["create", "安排 ONDA 療程"],
  ["create", "我要預約 ONDA"],
  ["create", "幫我預約高雄館"],
  ["create", "可以幫我預約嗎？"],
  ["create", "請幫我安排諮詢"],
  ["create", "麻煩幫我安排療程"],
  ["create", "麻煩幫我安排肉毒諮詢"],
  ["create", "預約肉毒"],
  ["create", "預約"],

  ["modify", "我要改我的預約"],
  ["modify", "我想改約"],
  ["modify", "幫我改預約時間"],
  ["modify", "請幫我換日期"],
  ["modify", "麻煩改約到週五"],
  ["modify", "預約改到明天下午"],
  ["modify", "改預約"],

  ["cancel", "我要取消預約"],
  ["cancel", "幫我取消這次預約"],
  ["cancel", "取消我的預約"],
  ["cancel", "這次預約不要了"],
  ["cancel", "不約了"],
  ["cancel", "先取消"],

  ["decline", "先不預約"],
  ["decline", "暫時不預約"],
  ["decline", "目前不需要預約"],
  ["decline", "我不急著預約"],
  ["decline", "先不要約"],
  ["decline", "先了解就好"],
  ["decline", "暫時先了解"],

  ["none", "想了解 ONDA"],
  ["none", "肉毒多少錢"],
  ["none", "高雄館在哪"],
  ["none", "效果上的差別呢"],
  ["none", "我已經預約了"],
  ["none", "預約完成了"],
  ["none", "我有預約紀錄"],
  ["none", "我不想取消預約"],
  ["none", "今天天氣如何"],
];

for (const [expected, message] of CASES) {
  const actual = classifyBookingSpeechAct(message);
  assert.equal(actual, expected, `BSA1: ${JSON.stringify(message)} should be ${expected}, got ${actual}`);
}

for (const message of CASES.filter(([expected]) => expected === "inquiry").map(([, message]) => message)) {
  const actual = classifyBookingSpeechAct(message);
  assert.equal(
    isBookingMutationSpeechAct(actual),
    false,
    `BSA2: policy inquiry must never authorize a booking mutation: ${JSON.stringify(message)}`,
  );
}

for (const message of ["我要取消預約", "我要改我的預約", "我想預約肉毒"] as const) {
  assert.equal(
    isBookingMutationSpeechAct(classifyBookingSpeechAct(message)),
    true,
    `BSA3: explicit booking action should authorize a transition: ${JSON.stringify(message)}`,
  );
}

assert.equal(classifyBookingSpeechAct("Ｉ want to book"), "none", "BSA4: unrelated NFKC text must remain none");

console.log(`booking speech act validation passed (${CASES.length + 4} assertions)`);
