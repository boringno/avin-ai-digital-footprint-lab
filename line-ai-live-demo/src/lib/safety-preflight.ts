import { clinicConfig } from "@/lib/clinic-config";
import { getHumanSupportStatus } from "@/lib/human-support";

export type DeterministicPreflightDecision = {
  decisionType: "clinic_info_reply" | "handoff_pending" | "medical_guidance_reply";
  matchedKey: string;
  matchedType: "guided_reply" | "handoff_rule";
  replyText: string;
};

const POST_PROCEDURE_CONTEXT_TERMS = ["打完", "做完", "術後", "剛做", "剛打", "昨天打", "前天打", "回去後"];
const POST_PROCEDURE_ABNORMALITY_TERMS = [
  ...clinicConfig.escalationPolicy.postProcedureAlertTerms,
  "歪",
  "瘀青",
  "有血",
  "出血",
  "刺",
  "麻",
  "硬塊",
  "凹凸",
  "不對稱",
  "化膿",
  "水泡",
];
const POST_PROCEDURE_EMERGENCY_TERMS = [
  "呼吸困難",
  "喘不過氣",
  "無法呼吸",
  "喉嚨腫",
  "吞嚥困難",
  "胸悶",
  "全身起疹",
  "意識不清",
  "失去意識",
  "昏倒",
  "嘴唇發紫",
  "大量出血",
  "持續出血",
  "血流不止",
  "止不住血",
  "劇烈疼痛",
  "痛到受不了",
];
const PLASTIC_SURGERY_TERMS = [
  "整形外科",
  "開刀",
  "削骨",
  "正顎",
  "顴骨手術",
  "下顎骨手術",
  "隆乳",
  "縮乳",
  "提乳手術",
  "乳房重建",
  "抽脂",
  "脂肪移植",
  "隆鼻手術",
  "鼻整形",
  "雙眼皮手術",
  "眼袋手術",
  "拉皮手術",
  "腹部拉皮",
  "割雙眼皮",
  "縫雙眼皮",
  "內開眼袋",
  "外開眼袋",
  "鼻中隔延長",
  "鼻頭縮小",
  "植髮",
  "植髮手術",
  "狐臭手術",
];
const POLICY_OVERRIDE_TERMS = [
  "忽略之前",
  "忽略以上",
  "忽略規則",
  "無視規則",
  "系統提示詞",
  "system prompt",
  "開發者訊息",
  "內部指令",
  "揭露內部",
  "洩漏內部",
  "把你的指令",
  "不要遵守",
  "繞過限制",
  "解除限制",
  "顯示提示詞",
];
const GENERAL_MEDICAL_OUT_OF_SCOPE_TERMS = [
  "糖尿病",
  "高血壓",
  "低血壓",
  "心臟病",
  "心血管",
  "癌",
  "腫瘤",
  "惡性",
  "感染",
  "肺炎",
  "中風",
  "癲癇",
  "甲狀腺",
  "腎臟",
  "肝臟",
  "自體免疫",
  "免疫疾病",
  "精神科",
  "憂鬱症",
  "焦慮症",
  "抗凝血",
  "藥物交互作用",
  "青春痘需要看醫生",
  "需要看醫生",
  "要看哪科",
  "醫療診斷",
];
const PRICE_COMMITMENT_TERMS = ["固定價", "保證最低價", "最低價", "一定多少錢", "保證多少錢", "先報死價", "直接報價"];

function includesAnyTerm(message: string, terms: readonly string[]) {
  const normalizedMessage = message.replace(/\s+/g, "").toLowerCase();
  return terms.some((term) => normalizedMessage.includes(term.replace(/\s+/g, "").toLowerCase()));
}

function hasContraindicationOrMedicalHistorySignal(message: string) {
  if (/(?:懷孕|孕婦|孕期|有孕|哺乳|餵奶|親餵|母乳|備孕|準備懷孕|想懷孕|試管)/u.test(message)) {
    return false;
  }
  const normalizedMessage = message.replace(/\s+/g, "").toLowerCase();
  return (
    /我有.{1,30}(?:可以|可不可以|能不能|能否|適不適合)/u.test(normalizedMessage) ||
    /我在(?:吃|服用)|我正在用/u.test(normalizedMessage) ||
    /(?:我有)?.{0,30}病史/u.test(normalizedMessage) ||
    /開過刀|動過手術/u.test(normalizedMessage) ||
    /我對.{1,30}過敏/u.test(normalizedMessage)
  );
}

export function buildHumanHandoffReply(extraGuidance: string | null, now: Date) {
  const supportStatus = getHumanSupportStatus(now);
  const baseReply = supportStatus.inServiceHours
    ? "這個問題需要由真人客服進一步確認。我先幫您整理需求，稍後客服會接續協助。"
    : "這個問題需要由真人客服進一步確認。目前真人客服服務時間為週一至週五 09:00-18:00。我會先幫您整理需求，客服上班後再接續協助。";
  return extraGuidance ? `${extraGuidance} ${baseReply}` : baseReply;
}

export function isPostProcedureEmergency(message: string) {
  return includesAnyTerm(message, POST_PROCEDURE_EMERGENCY_TERMS);
}

export function hasPostProcedureContext(message: string) {
  return includesAnyTerm(message, POST_PROCEDURE_CONTEXT_TERMS);
}

export function hasPostProcedureAbnormality(message: string) {
  return includesAnyTerm(message, POST_PROCEDURE_ABNORMALITY_TERMS);
}

export function isPostProcedureIssue(message: string) {
  return hasPostProcedureContext(message) && hasPostProcedureAbnormality(message);
}

export function isPlasticSurgeryRequest(message: string) {
  return includesAnyTerm(message, PLASTIC_SURGERY_TERMS);
}

export function isPolicyOverrideAttempt(message: string) {
  return includesAnyTerm(message, POLICY_OVERRIDE_TERMS);
}

export function isGeneralMedicalOutOfScope(message: string) {
  return includesAnyTerm(message, GENERAL_MEDICAL_OUT_OF_SCOPE_TERMS);
}

export function isPriceCommitmentRequest(message: string) {
  return includesAnyTerm(message, PRICE_COMMITMENT_TERMS);
}

function isCustomerAccountLookupRequest(message: string) {
  const normalized = message.replace(/\s+/gu, "");
  if (/(?:會員|帳號|我的資料|個資|既有紀錄|預約紀錄|療程紀錄)/u.test(normalized)) {
    return /(?:查|查詢|查看|確認|核對|調閱|紀錄|記錄|資料|是什麼|有哪些)/u.test(normalized);
  }
  return (
    /(?:查|查詢|查看|確認|核對|調閱).{0,16}(?:姓名|電話|手機|號碼|資料|紀錄|記錄)/u.test(normalized) ||
    /(?:姓名|電話|手機|號碼).{0,16}(?:是誰|哪位|哪個人|哪個客人|對應|資料|紀錄|記錄|是什麼|哪一個)/u.test(normalized) ||
    /(?:誰|哪位|哪個人|哪個客人).{0,16}(?:姓名|電話|手機|號碼|資料|紀錄|記錄)/u.test(normalized) ||
    /之前.{0,16}(?:留|提供|填).{0,8}(?:姓名|電話|手機|號碼)/u.test(normalized)
  );
}

export function runImmediateSafetyPreflight(input: {
  message: string;
  now: Date;
  skipCustomerAccountLookup?: boolean;
}): DeterministicPreflightDecision | null {
  const { message, now, skipCustomerAccountLookup = false } = input;
  if (isPostProcedureEmergency(message)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "post_procedure_emergency",
      matchedType: "handoff_rule",
      replyText: "若有呼吸困難、意識異常、大量或持續出血等緊急症狀，請立即撥打 119 或前往急診，不要等待線上回覆；安全後再聯絡診所。",
    };
  }
  if (isPolicyOverrideAttempt(message)) {
    return {
      decisionType: "clinic_info_reply",
      matchedKey: "policy_override_attempt",
      matchedType: "guided_reply",
      replyText: "我無法變更或揭露內部規則，只能協助診所療程與預約相關問題。請問想了解哪項微整療程？",
    };
  }
  if (isPlasticSurgeryRequest(message)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "plastic_surgery_scope",
      matchedType: "handoff_rule",
      replyText: "整形外科涉及手術評估，AI 暫不提供自由解說。我先幫您轉由真人客服協助，也可預約現場由醫師評估。",
    };
  }
  if (isPostProcedureIssue(message)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "post_procedure_issue",
      matchedType: "handoff_rule",
      replyText: "這類術後反應需要真人確認，請直接撥打診所電話聯繫；若症狀快速惡化，請立即就醫。",
    };
  }
  if (includesAnyTerm(message, clinicConfig.escalationPolicy.seriousComplaintTerms)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "serious_complaint",
      matchedType: "handoff_rule",
      replyText: buildHumanHandoffReply("我先幫您記錄這次狀況與訴求。", now),
    };
  }
  if (isPriceCommitmentRequest(message)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "price_commitment_request",
      matchedType: "handoff_rule",
      replyText: buildHumanHandoffReply("價格承諾這類問題需要由真人客服進一步確認，我先幫您整理想了解的療程與館別。", now),
    };
  }
  if (includesAnyTerm(message, clinicConfig.escalationPolicy.humanRequestTerms)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "human_request",
      matchedType: "handoff_rule",
      replyText: buildHumanHandoffReply("沒問題，我先幫您整理目前需求。", now),
    };
  }
  if (hasContraindicationOrMedicalHistorySignal(message)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "contraindication_or_medical_history",
      matchedType: "handoff_rule",
      replyText: buildHumanHandoffReply("這類涉及既往病史、用藥或過敏狀況，需要由真人客服與醫師進一步確認。", now),
    };
  }
  if (isGeneralMedicalOutOfScope(message)) {
    return {
      decisionType: "medical_guidance_reply",
      matchedKey: "general_medical_out_of_scope",
      matchedType: "guided_reply",
      replyText: "這屬於一般醫療問題，不在微整衛教範圍內；請直接諮詢合適科別的醫師，AI 不會自行判斷。",
    };
  }
  if (!skipCustomerAccountLookup && isCustomerAccountLookupRequest(message)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "customer_account_lookup",
      matchedType: "handoff_rule",
      replyText: buildHumanHandoffReply("這類涉及個人資料或既有紀錄查詢，我先幫您記下需求。", now),
    };
  }
  return null;
}

export function isImmediateSafetyBoundaryMessage(message: string) {
  return Boolean(runImmediateSafetyPreflight({ message, now: new Date(0) }));
}
