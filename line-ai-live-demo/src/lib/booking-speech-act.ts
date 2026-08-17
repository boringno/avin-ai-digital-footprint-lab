export type BookingSpeechAct = "inquiry" | "create" | "modify" | "cancel" | "decline" | "none";

const BOOKING_CONTEXT_TERMS = /(?:預約|約診|掛號|直接去|直接到|現場去|現場排|現場等|現場候位)/u;
const EXPLICIT_REQUEST_PREFIX = /(?:我想要?|我要|我希望|幫我|請幫我|麻煩(?:幫我)?|替我)/u;

function normalizeBookingSpeech(message: string) {
  return message
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s，。！？、,.!?]/gu, "")
    .trim();
}

function isExplicitCancelRequest(text: string) {
  if (
    /(?:不想|不要|不用)(?:再)?取消/u.test(text) ||
    (
      /(?:可以|能|可不可以|能不能|是否|有辦法).{0,8}取消/u.test(text) &&
      /(?:嗎|呢)$/u.test(text) &&
      !/(?:幫我|請幫我|麻煩|替我).{0,8}取消/u.test(text)
    )
  ) {
    return false;
  }

  return (
    /(?:我要|我想|幫我|請幫我|麻煩(?:幫我)?|替我).{0,8}(?:取消|撤掉|取消掉)(?:我的|原本的|這次的)?(?:預約|約診)?/u.test(text) ||
    /(?:取消|撤掉|取消掉)(?:我的|原本的|這次的)?(?:預約|約診)/u.test(text) ||
    /(?:這次|原本的?|我的)(?:預約|約診).{0,4}(?:取消|不要了)/u.test(text) ||
    /(?:不約了|先取消)$/u.test(text)
  );
}

function isExplicitModifyRequest(text: string) {
  const modifyAction = /(?:改約|改(?:我的|原本的|這次的)?預約|修改預約|更改預約|改時間|改日期|改期|換時間|換日期|改館別|換館別|改到)/u;
  return (
    new RegExp(`${EXPLICIT_REQUEST_PREFIX.source}.{0,10}${modifyAction.source}`, "u").test(text) ||
    /^(?:幫我|請幫我|麻煩)?(?:改約|改預約|修改預約|更改預約)/u.test(text) ||
    /(?:預約|約診).{0,8}(?:改到|改成|換成).+/u.test(text)
  );
}

function isExplicitCreateRequest(text: string) {
  if (/(?:取消|撤掉|取消掉|改約|改預約|修改預約|更改預約|改時間|改日期|改期|換時間|換日期|改館別|換館別)/u.test(text)) {
    return false;
  }
  if (/(?:不想|不要|不用|不需要).{0,8}(?:預約|約診|想約|取消|修改|改約)/u.test(text)) {
    return false;
  }
  if (/^預約(?:方式|流程|規定|制度|完成|好了|成功|紀錄|記錄|價格|費用)/u.test(text)) {
    return false;
  }
  if (/(?:我想|我要)?(?:問|了解|知道).{0,8}(?:怎麼|如何|是否|能不能|可不可以)?(?:預約|約診)/u.test(text)) {
    return false;
  }
  if (
    /(?:要|需要|一定要|必須|得)(?:先)?(?:預約|約).{0,12}(?:才能|才可以|才行|才可|嗎|呢)/u.test(text) ||
    /(?:預約|約診).{0,8}(?:才能|才可以|才行|才可)(?:去|到|看診|諮詢)/u.test(text)
  ) {
    return false;
  }

  return (
    /(?:我想要?|我要|我希望|想|幫我|請幫我|麻煩(?:幫我)?|替我).{0,10}(?:預約|約診|想約|要約|安排.{0,12}(?:療程|諮詢|時間)|約(?:[a-z0-9\u4e00-\u9fff]+))/u.test(text) ||
    /(?:幫我|請幫我|麻煩(?:幫我)?|替我).{0,8}排(?:週|星期|平日|假日|上午|下午|晚上|白天|\d)/u.test(text) ||
    /^(?:幫我|請幫我|麻煩)?(?:預約|想約|要約|安排(?:療程|諮詢|時間)).+/u.test(text) ||
    /^(?:我)?(?:想約|要約).+/u.test(text) ||
    /^(?:預約|想約|預約諮詢|安排諮詢)$/u.test(text) ||
    /^安排.{1,16}(?:療程|諮詢|時間)$/u.test(text)
  );
}

function isBookingDecline(text: string) {
  return (
    /(?:先|暫時|目前|現在|還)?不(?:想|要|用|需要|考慮|急著)?(?:先)?(?:預約|約診|約)(?:了|喔|哦)?$/u.test(text) ||
    /(?:先不預約|暫時不預約|目前不預約|還不預約|不急著預約|先不要約|先不用約)/u.test(text) ||
    /(?:先了解(?:就好|看看)?|暫時先了解)/u.test(text)
  );
}

function isBookingInquiry(text: string, originalMessage: string) {
  const asksQuestion = /[?？]/u.test(originalMessage) || /(?:嗎|呢|可不可以|能不能|是否|如何|怎麼)(?:了)?$/u.test(text);
  const asksPolicy =
    /(?:預約制|預約方式|預約流程|怎麼預約|如何預約)/u.test(text) ||
    /(?:要|需要|一定要|必須|得)(?:先)?(?:預約|約).{0,12}(?:嗎|呢|才能|才可以|還是)/u.test(text) ||
    /(?:可以|能|可不可以|能不能|是否).{0,12}(?:直接(?:去|到)|現場(?:去|排|等|候位)|不用預約|不預約)/u.test(text) ||
    /(?:直接(?:去|到)|現場(?:去|排|等|候位)).{0,8}(?:可以|行不行|嗎|呢)/u.test(text);

  return asksPolicy || (asksQuestion && BOOKING_CONTEXT_TERMS.test(text));
}

function isBookingMutationInquiry(text: string, originalMessage: string) {
  const asksQuestion = /[?？]/u.test(originalMessage) || /(?:嗎|呢)$/u.test(text);
  const mutation = /(?:取消|撤掉|取消掉|改約|改預約|修改預約|更改預約|改時間|改日期|改期|換時間|換日期|改館別|換館別)/u;
  if (!mutation.test(text)) return false;

  if (/(?:想問|想知道|想了解|要了解|請問|詢問).{0,18}(?:怎麼|如何)?(?:取消|撤掉|修改|更改|改約|改預約)/u.test(text)) {
    return true;
  }

  // Polite imperatives remain actions: "可以幫我取消預約嗎" is a request,
  // not a question about cancellation policy.
  if (new RegExp(`${EXPLICIT_REQUEST_PREFIX.source}.{0,12}${mutation.source}`, "u").test(text)) {
    return false;
  }
  return (
    /^(?:怎麼|如何).{0,12}(?:取消|修改|更改|改約|改預約)/u.test(text) ||
    /(?:取消|修改|更改|改約|改預約).{0,16}(?:怎麼做|如何做|流程|方式|規定|需要提供|要提供|會收費|費用|收費)/u.test(text) ||
    (asksQuestion && /(?:取消|修改|更改|改約|改預約).{0,16}(?:需要|要|會|可以|能|是否)/u.test(text))
  );
}

/**
 * Classify what the customer is doing with booking language, independently of
 * the current booking state.  In particular, asking about the appointment
 * policy is not permission to create or mutate a booking draft.
 */
export function classifyBookingSpeechAct(message: string): BookingSpeechAct {
  const text = normalizeBookingSpeech(message);
  if (!text) return "none";

  if (isBookingMutationInquiry(text, message)) return "inquiry";
  // Explicit first-person or imperative actions are allowed to remain actions
  // even when phrased politely as a question (for example, "可以幫我預約嗎").
  if (isExplicitCancelRequest(text)) return "cancel";
  if (isExplicitModifyRequest(text)) return "modify";
  if (isExplicitCreateRequest(text)) return "create";
  if (isBookingDecline(text)) return "decline";
  if (isBookingInquiry(text, message)) return "inquiry";

  return "none";
}

export const parseBookingSpeechAct = classifyBookingSpeechAct;

export function isBookingMutationSpeechAct(act: BookingSpeechAct) {
  return act === "create" || act === "modify" || act === "cancel";
}
