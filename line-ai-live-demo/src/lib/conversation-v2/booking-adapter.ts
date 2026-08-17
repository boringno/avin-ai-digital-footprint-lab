import { classifyBookingSpeechAct } from "@/lib/booking-speech-act";
import {
  clinicConfig,
  findAllTreatmentsByMessage,
  findBranchByMessage,
} from "@/lib/clinic-config";
import { parseTreatmentSelection } from "@/lib/treatment-selection";

import type {
  BookingDraft,
  BookingUnderstanding,
  ConversationV2State,
} from "./types";

const TIME_PATTERN = /(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}|\d{1,2}:\d{2}|上午|下午|晚上|中午|今天|明天|後天|平日|假日|週末|周末|週[一二三四五六日天]|星期[一二三四五六日天])/u;

function unique(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function structuredField(message: string, labels: readonly string[]) {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
  const value = message.match(
    new RegExp(`(?:^|[\\n，,、；;。.])\\s*(?:${escaped.join("|")})\\s*[：:]\\s*([^\\n，,、；;。.]+)`, "u"),
  )?.[1]?.trim();
  return value || undefined;
}

type PhoneCandidate = {
  index: number;
  normalized: string;
};

function phoneCandidates(message: string) {
  const candidates: PhoneCandidate[] = [];
  const pattern = /(^|[^\d])((?:\+?886[\s()-]*9|09)(?:[\s()-]*\d){8})(?![\s()-]*\d)/gu;
  for (const match of message.matchAll(pattern)) {
    const raw = match[2];
    if (!raw || match.index === undefined) continue;
    const index = match.index + (match[1]?.length ?? 0);
    const digits = raw.replace(/\D/gu, "");
    const normalized = /^09\d{8}$/u.test(digits)
      ? digits
      : /^8869\d{8}$/u.test(digits)
        ? `0${digits.slice(3)}`
        : null;
    if (!normalized) continue;
    if (/^09/u.test(digits) && /(?:\+?886)\s*$/u.test(message.slice(0, index))) continue;

    const clauseStart = Math.max(
      message.lastIndexOf("，", index - 1),
      message.lastIndexOf(",", index - 1),
      message.lastIndexOf("。", index - 1),
      message.lastIndexOf("；", index - 1),
      message.lastIndexOf(";", index - 1),
      message.lastIndexOf("\n", index - 1),
    ) + 1;
    const clausePrefix = message.slice(clauseStart, index).replace(/\s+/gu, "");
    if (/(?:不是|並非|不要用|別用|不用|不要填|別填|錯的|打錯|取消|改掉)(?:我的)?(?:電話|手機|號碼)?$/u.test(clausePrefix)) {
      continue;
    }
    candidates.push({ index, normalized });
  }
  return candidates;
}

function extractPhone(message: string) {
  return phoneCandidates(message).at(-1)?.normalized;
}

function extractName(
  message: string,
  state: ConversationV2State,
  allowBareExpectedName: boolean,
  allowDelimitedBookingName: boolean,
) {
  const structured = structuredField(message, ["姓名", "名字", "稱呼"]);
  if (structured && isSafeBareName(structured)) return structured.slice(0, 40);
  const explicit = message.match(
    /(?:我叫|名字是|稱呼我)\s*([A-Za-z0-9\u4e00-\u9fff_-]{1,20}?)(?=\s*(?:想|要|預約|在|去|，|,|。|；|;|$))/u,
  )?.[1];
  if (explicit && isSafeBareName(explicit)) return explicit;
  const selfIntroduction = message.match(/^\s*我是\s*([A-Za-z0-9\u4e00-\u9fff_-]{1,20})\s*$/u)?.[1];
  if (selfIntroduction && isSafeBareName(selfIntroduction)) return selfIntroduction;

  if (allowDelimitedBookingName) {
    const phone = phoneCandidates(message).at(-1);
    const delimitedName = phone
      ? message
          .slice(0, phone.index)
          .split(/[，,、；;。\n]+/u)
          .map((value) => value.trim())
          .filter(Boolean)
          .at(-1)
      : undefined;
    if (delimitedName && isSafeDelimitedBookingName(delimitedName)) return delimitedName;
  }

  if (
    !allowBareExpectedName ||
    !["name", "appointment_reference"].includes(state.bookingTask.expectedField ?? "")
  ) {
    return undefined;
  }
  const trimmed = message.trim();
  return isSafeBareName(trimmed) ? trimmed : undefined;
}

function isSafeBareName(value: string) {
  if (
    !value ||
    findBranchByMessage(value) ||
    findAllTreatmentsByMessage(value).length > 0 ||
    TIME_PATTERN.test(value) ||
    /[?？!！]/u.test(value) ||
    /(?:初診|複診|回診|第一次|不知道|不確定|不方便|不想|不要|先不用|跳過|匿名|稍後|改天|謝謝|感謝|好的|了解|可以|不行|方便|何時|高興|麻煩|沒關係|再看看|醫師|醫生|護理師|客服|小姐|先生|價格|價錢|多少|停車|介紹|付款|預約|療程|館別|分店)/u.test(value)
  ) {
    return false;
  }
  return /^[\u4e00-\u9fff]{2,10}$/u.test(value) || /^[A-Za-z][A-Za-z .'-]{1,39}$/u.test(value);
}

function isSafeDelimitedBookingName(value: string) {
  if (!isSafeBareName(value)) return false;
  if (/(?:醫師|醫生|院長|護理師|治療師|小姐|先生)$/u.test(value)) return false;
  // A free-standing clause in a multi-field message is persisted without an
  // LLM reading the PII. Restrict that shortcut to common Taiwanese surnames;
  // uncommon/ambiguous names are asked again or accepted via an explicit label.
  return /^(?:王|李|陳|林|張|黃|吳|劉|蔡|楊|許|鄭|謝|郭|洪|邱|曾|廖|賴|徐|周|葉|蘇|莊|呂|江|何|蕭|羅|高|潘|簡|朱|鍾|游|彭|詹|胡|施|沈|余|趙|盧|梁|顏|柯|孫|魏|方|宋|鄧|杜|傅|侯|曹|薛|丁|卓|阮|馬|董|溫|唐|藍|石|蔣|古|紀|姚|連|馮|歐陽|上官|司馬)[\u4e00-\u9fff]{1,3}$/u.test(value);
}

function extractFirstVisit(message: string) {
  const structured = structuredField(message, ["初複診", "初診", "是否初診"]);
  const source = structured ?? message;
  if (/[?？]/u.test(source) || /(?:嗎|呢)$/u.test(source.replace(/\s+/gu, ""))) {
    return undefined;
  }
  const signals: Array<{ index: number; value: boolean }> = [];
  for (const match of source.matchAll(/(?:初診|第一次來|第一次|首次|複診|回診)/gu)) {
    if (match.index === undefined) continue;
    const firstVisitTerm = /(?:初診|第一次|首次)/u.test(match[0]);
    const negated = /(?:不是|並非|不算|非)\s*$/u.test(
      source.slice(Math.max(0, match.index - 5), match.index),
    );
    signals.push({ index: match.index, value: negated ? !firstVisitTerm : firstVisitTerm });
  }
  if (signals.length > 0) return signals.at(-1)?.value;
  if (structured) {
    if (/(?:否|no)/iu.test(structured)) return false;
    if (/(?:是|yes)/iu.test(structured)) return true;
  }
  return undefined;
}

function extractTimeSlots(message: string) {
  const chunks = message
    .split(/[，,、；;。\n]+|(?:但是|可是|不過|但)/u)
    .map((chunk) => chunk.trim())
    .filter((chunk) =>
      TIME_PATTERN.test(chunk) &&
      !/(?:不要|不行|不方便|不能|沒辦法|排除|不可以|無法|沒空|沒有空|有事|太遠|不適合)/u.test(chunk),
    );
  return unique(chunks).slice(0, 3);
}

function extractAffirmedBranch(message: string) {
  const matches: Array<{ branch: (typeof clinicConfig.branches)[number]; index: number }> = [];
  for (const branch of clinicConfig.branches.filter((item) => item.isActive)) {
    for (const alias of [branch.name, branch.city, ...branch.aliases]) {
      let from = 0;
      while (from < message.length) {
        const index = message.indexOf(alias, from);
        if (index < 0) break;
        const clauseStart = Math.max(
          message.lastIndexOf("，", index - 1),
          message.lastIndexOf(",", index - 1),
          message.lastIndexOf("。", index - 1),
          message.lastIndexOf("；", index - 1),
          message.lastIndexOf(";", index - 1),
          message.lastIndexOf("\n", index - 1),
        ) + 1;
        const suffix = message.slice(index + alias.length);
        const boundaryOffsets = ["，", ",", "。", "；", ";", "\n"]
          .map((separator) => suffix.indexOf(separator))
          .filter((offset) => offset >= 0);
        const clauseEnd = index + alias.length + (
          boundaryOffsets.length > 0 ? Math.min(...boundaryOffsets) : suffix.length
        );
        const before = message.slice(clauseStart, index);
        const after = message.slice(index + alias.length, clauseEnd);
        const negated = (
          /(?:不要|不去|不選|排除|不方便|不行|不能|不是|不想(?:去|跑)?)\s*$/u.test(before) ||
          /^\s*(?:不要|不行|不方便|不能|不可以|無法|沒空|有事|太遠|不考慮)/u.test(after)
        );
        const exactClause = message.slice(clauseStart, clauseEnd).trim() === alias;
        const affirmed = exactClause ||
          /(?:我要|我選|選擇|改成|改到|換到|想去|要去|就)\s*$/u.test(before) ||
          /^\s*(?:可以|方便|比較近|就好|為主)/u.test(after) ||
          /(?:預約|約診).{0,12}$/u.test(before);
        if (!negated && affirmed) matches.push({ branch, index });
        from = index + Math.max(alias.length, 1);
      }
    }
  }
  return matches.sort((left, right) => right.index - left.index)[0]?.branch;
}

function extractFields(
  message: string,
  state: ConversationV2State,
  allowBareExpectedName = false,
  allowDelimitedBookingName = false,
): Partial<BookingDraft> {
  const branch = extractAffirmedBranch(message);
  const treatmentKeys = parseTreatmentSelection(message).selectedKeys;
  const phone = extractPhone(message);
  const name = extractName(
    message,
    state,
    allowBareExpectedName,
    allowDelimitedBookingName,
  );
  const firstVisit = extractFirstVisit(message);
  const timeSlots = extractTimeSlots(message);
  const fields: Partial<BookingDraft> = {};

  if (branch) fields.branch = branch.name;
  if (treatmentKeys.length > 0) fields.treatmentKeys = unique(treatmentKeys);
  if (phone) fields.phone = phone;
  if (name) fields.name = name;
  if (firstVisit !== undefined) fields.firstVisit = firstVisit;
  if (timeSlots.length > 0) fields.timeSlots = timeSlots;

  if (
    state.bookingTask.intent === "modify" &&
    state.bookingTask.expectedField === "change_request" &&
    message.trim()
  ) {
    fields.changeRequest = message.trim().slice(0, 300);
  }
  if (
    ["modify", "cancel"].includes(state.bookingTask.intent) &&
    state.bookingTask.expectedField === "appointment_reference" &&
    (phone || name)
  ) {
    fields.appointmentReference = unique([name ?? "", phone ?? ""]).join(" ");
  }

  return fields;
}

function hasFields(fields: Partial<BookingDraft>) {
  return Object.values(fields).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== undefined && value !== "",
  );
}

/**
 * Deterministic adapter for booking mutations and sensitive contact fields.
 * The LLM may understand the conversation, but it is never the source of the
 * phone/name values that are persisted into a booking draft.
 */
export function buildConversationV2BookingUnderstanding(input: {
  allowBareExpectedName?: boolean;
  message: string;
  state: ConversationV2State;
}): BookingUnderstanding | undefined {
  const speechAct = classifyBookingSpeechAct(input.message);
  const explicitIntent = ["create", "modify", "cancel"].includes(speechAct)
    ? speechAct as "create" | "modify" | "cancel"
    : null;
  const activeIntent = input.state.bookingTask.status === "collecting" || input.state.bookingTask.status === "suspended"
    ? input.state.bookingTask.intent
    : "none";
  const intent = explicitIntent ?? activeIntent;
  const fields = extractFields(
    input.message,
    input.state,
    input.allowBareExpectedName,
    Boolean(explicitIntent),
  );

  if (intent === "none") return undefined;
  if (
    ["modify", "cancel"].includes(intent) &&
    !fields.appointmentReference &&
    (fields.name || fields.phone)
  ) {
    fields.appointmentReference = unique([fields.name ?? "", fields.phone ?? ""]).join(" ");
  }
  if (
    intent === "modify" &&
    !fields.changeRequest &&
    (
      fields.branch ||
      fields.timeSlots?.length ||
      fields.treatmentKeys?.length ||
      /(?:改到|改成|改為|換到|換成|更改(?:日期|時間|時段|館別|療程))/u.test(input.message)
    )
  ) {
    fields.changeRequest = input.message.trim().slice(0, 300);
  }
  return {
    explicit: Boolean(explicitIntent),
    ...(hasFields(fields) ? { fields } : {}),
    intent,
  };
}

export function hasConversationV2BookingFields(message: string, state: ConversationV2State) {
  return hasFields(extractFields(message, state));
}
