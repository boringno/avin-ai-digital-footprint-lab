import type { QuestionAspect } from "@/lib/dialogue-semantics";

export type ConversationV2MultiIntentAcceptanceCase = {
  aspects: readonly [QuestionAspect, ...QuestionAspect[]];
  id: string;
  text: string;
  treatmentKey: "onda_pro" | "botox";
};

/**
 * Customer-like price questions that contain a second or third answer duty.
 *
 * These are deliberately same-subject cases. Cross-treatment obligations need
 * an `{ aspect, subjectKey }` contract shape before they can be enforced, so
 * they must not be represented as if the flat V2 contract already supports
 * them.
 */
export const CONVERSATION_V2_MULTI_INTENT_ACCEPTANCE_CASES: readonly ConversationV2MultiIntentAcceptanceCase[] = [
  { id: "MI-ONDA-01", treatmentKey: "onda_pro", text: "我雙下巴肉很多，ONDA 適合嗎？最近有活動嗎？", aspects: ["suitability", "price_campaign"] },
  { id: "MI-ONDA-02", treatmentKey: "onda_pro", text: "ONDA 過程感受跟活動價可以一起說嗎？", aspects: ["comfort_recovery", "price_campaign"] },
  { id: "MI-ONDA-03", treatmentKey: "onda_pro", text: "ONDA 主要改善什麼？現在怎麼收費？", aspects: ["benefits", "price_unspecified"] },
  { id: "MI-ONDA-04", treatmentKey: "onda_pro", text: "ONDA 原理是什麼，原價多少？", aspects: ["mechanism", "price_regular"] },
  { id: "MI-ONDA-05", treatmentKey: "onda_pro", text: "ONDA 一次大概多久，活動價呢？", aspects: ["duration", "price_campaign"] },
  { id: "MI-ONDA-06", treatmentKey: "onda_pro", text: "ONDA 通常要評估幾次？費用怎麼算？", aspects: ["sessions", "price_unspecified"] },
  { id: "MI-ONDA-07", treatmentKey: "onda_pro", text: "我想先單做 ONDA，單做跟組合差在哪，價格呢？", aspects: ["single_vs_combination", "price_campaign"] },
  { id: "MI-ONDA-08", treatmentKey: "onda_pro", text: "ONDA 為什麼有人會評估搭配療程？最近活動多少？", aspects: ["combination_reason", "price_campaign"] },
  { id: "MI-ONDA-09", treatmentKey: "onda_pro", text: "如果我不想做 ONDA，還有其他方向嗎？ONDA 活動價多少？", aspects: ["alternatives", "price_campaign"] },
  { id: "MI-ONDA-10", treatmentKey: "onda_pro", text: "ONDA 是什麼療程？體驗價多少？", aspects: ["overview", "price_campaign"] },
  { id: "MI-ONDA-11", treatmentKey: "onda_pro", text: "臉頰偏瘦但雙下巴明顯，ONDA 適合嗎？怎麼收費？", aspects: ["suitability", "price_unspecified"] },
  { id: "MI-ONDA-12", treatmentKey: "onda_pro", text: "ONDA 效果跟恢復狀況我都想知道，活動價格呢？", aspects: ["benefits", "comfort_recovery", "price_campaign"] },
  { id: "MI-ONDA-13", treatmentKey: "onda_pro", text: "ONDA 的作用方式和適合條件是什麼？目前優惠多少？", aspects: ["mechanism", "suitability", "price_campaign"] },
  { id: "MI-ONDA-14", treatmentKey: "onda_pro", text: "ONDA 療程時間跟感受怎麼樣？收費可以說嗎？", aspects: ["duration", "comfort_recovery", "price_unspecified"] },
  { id: "MI-ONDA-15", treatmentKey: "onda_pro", text: "我想改善雙下巴，ONDA 可以評估什麼方向？活動價呢？", aspects: ["benefits", "suitability", "price_campaign"] },
  { id: "MI-ONDA-16", treatmentKey: "onda_pro", text: "ONDA 原價多少？", aspects: ["price_regular"] },

  { id: "MI-BOTOX-01", treatmentKey: "botox", text: "肉毒有哪些品牌？目前活動價格多少？", aspects: ["brands", "price_campaign"] },
  { id: "MI-BOTOX-02", treatmentKey: "botox", text: "奇蹟肉毒跟其他品牌差在哪？費用呢？", aspects: ["brand_difference", "price_unspecified"] },
  { id: "MI-BOTOX-03", treatmentKey: "botox", text: "肉毒可以改善什麼？體驗價多少？", aspects: ["benefits", "price_campaign"] },
  { id: "MI-BOTOX-04", treatmentKey: "botox", text: "我皺眉紋很明顯，肉毒適合嗎？現在怎麼收費？", aspects: ["suitability", "price_unspecified"] },
  { id: "MI-BOTOX-05", treatmentKey: "botox", text: "肉毒施作感受和活動價可以一起說嗎？", aspects: ["comfort_recovery", "price_campaign"] },
  { id: "MI-BOTOX-06", treatmentKey: "botox", text: "肉毒一次評估時間多久？目前優惠多少？", aspects: ["duration", "price_campaign"] },
  { id: "MI-BOTOX-07", treatmentKey: "botox", text: "肉毒通常多久需要再評估？價格怎麼算？", aspects: ["sessions", "price_unspecified"] },
  { id: "MI-BOTOX-08", treatmentKey: "botox", text: "肉毒常見副作用是什麼？活動價多少？", aspects: ["side_effects", "price_campaign"] },
  { id: "MI-BOTOX-09", treatmentKey: "botox", text: "肉毒是做什麼的？原價多少？", aspects: ["overview", "price_regular"] },
  { id: "MI-BOTOX-10", treatmentKey: "botox", text: "肉毒原理是什麼，體驗價多少？", aspects: ["mechanism", "price_campaign"] },
  { id: "MI-BOTOX-11", treatmentKey: "botox", text: "臉型偏寬又會咬緊，肉毒可怎麼評估？費用呢？", aspects: ["benefits", "suitability", "price_unspecified"] },
  { id: "MI-BOTOX-12", treatmentKey: "botox", text: "肉毒品牌、效果和活動價都想了解。", aspects: ["brands", "benefits", "price_campaign"] },
  { id: "MI-BOTOX-13", treatmentKey: "botox", text: "經典肉毒做完感受怎麼樣？目前價格多少？", aspects: ["comfort_recovery", "price_campaign"] },
  { id: "MI-BOTOX-14", treatmentKey: "botox", text: "皇家肉毒和其他方向差在哪？現在優惠多少？", aspects: ["brand_difference", "price_campaign"] },
  { id: "MI-BOTOX-15", treatmentKey: "botox", text: "我想改善動態紋，肉毒適合條件和價格都想知道。", aspects: ["suitability", "price_campaign"] },
  { id: "MI-BOTOX-16", treatmentKey: "botox", text: "奇蹟肉毒多少錢？", aspects: ["price_unspecified"] },
] as const;
