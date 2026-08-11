import { getClinicOfferingTerms } from "@/lib/clinic-config";
import { formatReplyText } from "@/lib/reply-text-format";
import type { LineTextMessage } from "@/lib/treatment-carousel";

const SAFE_MEDICAL_FALLBACK =
  "這項微整可改善的方向會因成分、部位與個人狀況不同，建議預約免費諮詢，由醫師現場評估。";
const SAFE_GENERAL_FALLBACK = "我可以協助診所療程與預約相關問題，請告訴我想了解的項目。";

const PRICE_OR_CAMPAIGN_PATTERN =
  /(?:NT\$|TWD|新台幣|價格|價錢|費用|報價|市場行情|優惠|折扣|活動|體驗價|檔期|截至|即日起|[\p{Nd}０-９][\p{Nd}０-９,，.．]*\s*(?:元|塊)|[零〇一二兩三四五六七八九十百千萬億]+\s*(?:元|塊)|(?:大約|大概|差不多|需要).{0,4}[\p{Nd}０-９]{4,}|(?:大約|大概|差不多).{0,8}(?:萬|千)|(?:幾|數)(?:萬|千)|(?:月底|年底))/iu;
const OVERCLAIM_PATTERN =
  /(?:(?:保證|一定|必定|立即|馬上|立刻).{0,5}(?:有效|有感|改善|見效)|(?:效果|療效).{0,5}(?:很好|超好|明顯|都很好)|(?:每個人|人人).{0,8}(?:有效|有感|改善|效果)|永久|百分之百|100%)/iu;
const ABSOLUTE_SAFETY_PATTERN =
  /(?:(?:完全|絕對|百分之百|100%|零|無|沒有|幾乎沒有|不會).{0,4}(?:風險|副作用|疼痛|痛|恢復期|修復期)|(?:安全).{0,4}(?:無副作用|沒有副作用|零風險)|(?:無痛|免恢復期|無恢復期|無修復期))/iu;
const SAFETY_TOPIC_PATTERN = /(?:安全|風險|副作用|疼痛|會痛|恢復期|修復期)/iu;
const SAFETY_QUALIFIER_PATTERN = /(?:可能|通常|依.{0,6}(?:狀況|條件)|因人而異|每個人不同|仍需|醫師.{0,8}評估)/iu;
const SURGERY_CLAIM_PATTERN = /(?:開刀|削骨|正顎|隆乳|隆鼻手術|抽脂|腹部拉皮|眼袋手術|雙眼皮手術|手術治療|手術方式)/iu;
const INTERNAL_INFORMATION_PATTERN =
  /(?:系統提示|system\s*prompt|提示詞|內部規則|內部指令|開發者訊息|developer\s*message|我的指令)/iu;
const CLINIC_FACT_CLAIM_PATTERN =
  /(?:(?:本院|敝院|本診所|我們診所|院內|我們).{0,8}(?:有提供|提供|有做|引進|使用|採用|配備|醫師|院長|團隊)|[\p{Script=Han}]{1,8}館.{0,8}(?:提供|有做|使用|醫師)|[\p{Script=Han}]{1,4}醫師.{0,8}(?:擅長|提供|操作|施作|坐診)|(?:德國|韓國|美國|法國|瑞士|義大利|日本).{0,6}(?:原廠|儀器|設備|機器|品牌)|原廠.{0,8}(?:儀器|設備|機器|品牌))/iu;

function visibleLength(text: string) {
  return Array.from(text).length;
}

function normalizeGeneratedText(text: string) {
  return text
    .replace(/```[\s\S]*?```/gu, "")
    .replace(/^[#>*\-\s]+/gmu, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripApprovedTreatmentNames(text: string) {
  return getClinicOfferingTerms().reduce(
    (remaining, name) => remaining.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu"), ""),
    text,
  );
}

type AiReplyConstraintOptions = {
  groundedByApprovedKnowledge?: boolean;
  medical?: boolean;
};

export function constrainMedicalAiReply(text: string, _footer: string, options: AiReplyConstraintOptions = {}) {
  const medical = options.medical ?? true;
  const groundedByApprovedKnowledge = options.groundedByApprovedKnowledge ?? false;
  const normalized = normalizeGeneratedText(text);
  const contentWithoutApprovedTreatmentNames = stripApprovedTreatmentNames(normalized);
  const hasUnqualifiedSafetyClaim =
    SAFETY_TOPIC_PATTERN.test(normalized) && !SAFETY_QUALIFIER_PATTERN.test(normalized);
  if (
    !normalized ||
    (medical &&
      (PRICE_OR_CAMPAIGN_PATTERN.test(contentWithoutApprovedTreatmentNames) ||
        SURGERY_CLAIM_PATTERN.test(normalized) ||
        INTERNAL_INFORMATION_PATTERN.test(normalized) ||
        (!groundedByApprovedKnowledge &&
          (OVERCLAIM_PATTERN.test(normalized) ||
            ABSOLUTE_SAFETY_PATTERN.test(normalized) ||
            hasUnqualifiedSafetyClaim ||
            CLINIC_FACT_CLAIM_PATTERN.test(normalized)))))
  ) {
    return medical ? SAFE_MEDICAL_FALLBACK : SAFE_GENERAL_FALLBACK;
  }

  return normalized;
}

export function buildTextReplyMessages(text: string): LineTextMessage[] {
  const normalized = formatReplyText(text);
  if (!normalized) return [];
  return [{ type: "text", text: normalized }];
}

export function buildAiReplyMessages(
  text: string,
  footer: string,
  options: AiReplyConstraintOptions = {},
): LineTextMessage[] {
  const normalized = formatReplyText(constrainMedicalAiReply(text, footer, options));
  const separator = "\n\n";
  return [{ type: "text", text: `${normalized}${separator}${footer}` }];
}

export function getVisibleReplyLength(text: string) {
  return visibleLength(text);
}
