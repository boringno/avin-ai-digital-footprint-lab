/**
 * Customer-quality acceptance data for Conversation V2.
 *
 * This file is intentionally model- and implementation-agnostic. It describes
 * what a customer-visible turn must accomplish; it is not a recorded model
 * response and must not be presented as live-model coverage.
 */

export const CUSTOMER_QUALITY_PRIMARY_ACTIONS = [
  "introduce_treatment",
  "answer_question",
  "compare_treatments",
  "recommend_options",
  "answer_price",
  "answer_clinic_info",
  "start_booking",
  "manage_booking",
  "queue_handoff",
  "answer_safety",
  "clarify",
] as const;

export type CustomerQualityPrimaryAction =
  (typeof CUSTOMER_QUALITY_PRIMARY_ACTIONS)[number];

export const CUSTOMER_QUALITY_ANSWER_ASPECTS = [
  "overview",
  "mechanism",
  "benefits",
  "suitability",
  "comfort_recovery",
  "duration_sessions",
  "concern_direction",
  "need_discovery",
  "comparison",
  "combination_reason",
  "single_vs_combination",
  "alternatives",
  "availability",
  "brands",
  "brand_difference",
  "regular_price",
  "campaign_price",
  "clinic_location",
  "business_hours",
  "schedule",
  "booking_next_field",
  "booking_management",
  "handoff_confirmation",
  "general_side_effects",
  "urgent_instruction",
] as const;

export type CustomerQualityAnswerAspect =
  (typeof CUSTOMER_QUALITY_ANSWER_ASPECTS)[number];

export const CUSTOMER_QUALITY_DISPOSITIONS = [
  "forbidden",
  "allowed",
  "required",
] as const;

export type CustomerQualityDisposition =
  (typeof CUSTOMER_QUALITY_DISPOSITIONS)[number];

export type CustomerQualityExpectedContract = {
  primaryAction: CustomerQualityPrimaryAction;
  mustAnswerAspects: readonly CustomerQualityAnswerAspect[];
  clarification: CustomerQualityDisposition;
  repeatPriorReply: "forbidden";
  booking: CustomerQualityDisposition;
  handoff: CustomerQualityDisposition;
  unapprovedFacts: "forbidden";
  campaignDateVisibility: "forbidden";
};

export type CustomerQualityVariant = {
  id: string;
  title: string;
  turns: readonly [string, ...string[]];
  expected: CustomerQualityExpectedContract;
};

export type CustomerQualityFamily = {
  id: `CQ${string}`;
  title: string;
  variants: readonly [
    CustomerQualityVariant,
    CustomerQualityVariant,
    CustomerQualityVariant,
    ...CustomerQualityVariant[],
  ];
};

const contract = (
  primaryAction: CustomerQualityPrimaryAction,
  mustAnswerAspects: readonly CustomerQualityAnswerAspect[],
  overrides: Partial<
    Pick<
      CustomerQualityExpectedContract,
      "clarification" | "booking" | "handoff"
    >
  > = {},
): CustomerQualityExpectedContract => ({
  primaryAction,
  mustAnswerAspects,
  clarification: overrides.clarification ?? "forbidden",
  repeatPriorReply: "forbidden",
  booking: overrides.booking ?? "forbidden",
  handoff: overrides.handoff ?? "forbidden",
  unapprovedFacts: "forbidden",
  campaignDateVisibility: "forbidden",
});

export const CONVERSATION_V2_CUSTOMER_QUALITY_FAMILIES = [
  {
    id: "CQ01",
    title: "首次療程介紹",
    variants: [
      { id: "CQ01-V1", title: "直接詢問 ONDA", turns: ["嗨", "我想了解 ONDA"], expected: contract("introduce_treatment", ["overview", "benefits", "need_discovery"]) },
      { id: "CQ01-V2", title: "直接詢問肉毒", turns: ["想請教療程", "肉毒是做什麼的？"], expected: contract("introduce_treatment", ["overview", "benefits", "need_discovery"]) },
      { id: "CQ01-V3", title: "直接詢問皮秒", turns: ["第一次詢問", "可以介紹探索皮秒嗎"], expected: contract("introduce_treatment", ["overview", "benefits", "need_discovery"]) },
    ],
  },
  {
    id: "CQ02",
    title: "同療程重述不得重貼首輪",
    variants: [
      { id: "CQ02-V1", title: "重說想了解", turns: ["我想了解 ONDA", "我只是想了解 ONDA"], expected: contract("answer_question", ["need_discovery"]) },
      { id: "CQ02-V2", title: "再問詳細一點", turns: ["肉毒是什麼", "可以再說詳細一點嗎"], expected: contract("answer_question", ["mechanism", "benefits"]) },
      { id: "CQ02-V3", title: "再次只打療程名", turns: ["想了解探索皮秒", "探索皮秒"], expected: contract("answer_question", ["need_discovery"]) },
    ],
  },
  {
    id: "CQ03",
    title: "作用原理追問",
    variants: [
      { id: "CQ03-V1", title: "問怎麼作用", turns: ["我想了解 ONDA", "它是怎麼作用的？"], expected: contract("answer_question", ["mechanism"]) },
      { id: "CQ03-V2", title: "問肉毒原理", turns: ["想問肉毒", "原理是什麼"], expected: contract("answer_question", ["mechanism"]) },
      { id: "CQ03-V3", title: "問皮秒怎麼改善", turns: ["想了解探索皮秒", "它為什麼能改善膚質？"], expected: contract("answer_question", ["mechanism", "benefits"]) },
    ],
  },
  {
    id: "CQ04",
    title: "效果與改善方向",
    variants: [
      { id: "CQ04-V1", title: "問 ONDA 效果", turns: ["想了解 ONDA", "主要可以改善什麼？"], expected: contract("answer_question", ["benefits"]) },
      { id: "CQ04-V2", title: "問肉毒功效", turns: ["肉毒有哪些品牌", "那功效呢？"], expected: contract("answer_question", ["benefits"]) },
      { id: "CQ04-V3", title: "問皮秒改善項目", turns: ["想問探索皮秒", "比較適合改善哪些問題"], expected: contract("answer_question", ["benefits"]) },
    ],
  },
  {
    id: "CQ05",
    title: "適合度詢問",
    variants: [
      { id: "CQ05-V1", title: "問自己適不適合", turns: ["想了解 ONDA", "我適合做嗎？"], expected: contract("answer_question", ["suitability", "need_discovery"]) },
      { id: "CQ05-V2", title: "詢問推薦方向", turns: ["我在意臉比較寬", "你會推薦哪個療程？"], expected: contract("recommend_options", ["suitability", "need_discovery"]) },
      { id: "CQ05-V3", title: "依困擾判斷", turns: ["最近毛孔很明顯", "這樣適合皮秒嗎"], expected: contract("answer_question", ["suitability", "concern_direction"]) },
    ],
  },
  {
    id: "CQ06",
    title: "舒適度與恢復期",
    variants: [
      { id: "CQ06-V1", title: "問會不會痛", turns: ["想做 ONDA", "過程會痛嗎？"], expected: contract("answer_question", ["comfort_recovery"]) },
      { id: "CQ06-V2", title: "問恢復期", turns: ["想了解探索皮秒", "恢復期大概怎麼樣"], expected: contract("answer_question", ["comfort_recovery"]) },
      { id: "CQ06-V3", title: "問能否上班", turns: ["考慮肉毒", "做完隔天可以上班嗎"], expected: contract("answer_question", ["comfort_recovery"]) },
    ],
  },
  {
    id: "CQ07",
    title: "療程時間與次數",
    variants: [
      { id: "CQ07-V1", title: "問一次多久", turns: ["想了解 ONDA", "一次大概做多久？"], expected: contract("answer_question", ["duration_sessions"]) },
      { id: "CQ07-V2", title: "問需要幾次", turns: ["想改善毛孔", "皮秒通常需要做幾次"], expected: contract("answer_question", ["duration_sessions"]) },
      { id: "CQ07-V3", title: "問多久一次", turns: ["考慮肉毒", "大概多久評估一次呢"], expected: contract("answer_question", ["duration_sessions"]) },
    ],
  },
  {
    id: "CQ08",
    title: "單輪多面向問題",
    variants: [
      { id: "CQ08-V1", title: "效果加恢復期", turns: ["我在看 ONDA", "效果跟恢復期都想知道"], expected: contract("answer_question", ["benefits", "comfort_recovery"]) },
      { id: "CQ08-V2", title: "原理加次數", turns: ["想了解皮秒", "原理是什麼、通常要幾次？"], expected: contract("answer_question", ["mechanism", "duration_sessions"]) },
      { id: "CQ08-V3", title: "品牌加差異", turns: ["我想問肉毒", "你們有哪些品牌，差別在哪？"], expected: contract("answer_question", ["brands", "brand_difference"]) },
    ],
  },
  {
    id: "CQ09",
    title: "困擾先行",
    variants: [
      { id: "CQ09-V1", title: "雙下巴困擾", turns: ["我想改善一下", "雙下巴很明顯"], expected: contract("recommend_options", ["concern_direction", "need_discovery"]) },
      { id: "CQ09-V2", title: "毛孔困擾", turns: ["想問醫美", "毛孔粗大有什麼方向"], expected: contract("recommend_options", ["concern_direction", "need_discovery"]) },
      { id: "CQ09-V3", title: "皺眉紋困擾", turns: ["最近很在意臉", "皺眉紋看起來很兇"], expected: contract("recommend_options", ["concern_direction", "need_discovery"]) },
    ],
  },
  {
    id: "CQ10",
    title: "多困擾並列",
    variants: [
      { id: "CQ10-V1", title: "雙下巴和肚子", turns: ["想改善脂肪", "雙下巴跟肚子都在意"], expected: contract("recommend_options", ["concern_direction", "need_discovery"]) },
      { id: "CQ10-V2", title: "毛孔和斑點", turns: ["皮膚狀況不太好", "毛孔跟斑都想改善"], expected: contract("recommend_options", ["concern_direction", "need_discovery"]) },
      { id: "CQ10-V3", title: "魚尾紋和皺眉紋", turns: ["想改善動態紋", "魚尾紋、皺眉紋都有"], expected: contract("recommend_options", ["concern_direction", "need_discovery"]) },
    ],
  },
  {
    id: "CQ11",
    title: "短答承接上一題",
    variants: [
      { id: "CQ11-V1", title: "部位短答", turns: ["ONDA 想改善哪個部位？", "肚子"], expected: contract("answer_question", ["concern_direction"]) },
      { id: "CQ11-V2", title: "困擾短答", turns: ["雙下巴比較像脂肪還是鬆弛？", "脂肪"], expected: contract("answer_question", ["concern_direction"]) },
      { id: "CQ11-V3", title: "時段短答", turns: ["平日還是假日方便？", "假日"], expected: contract("start_booking", ["booking_next_field"], { booking: "required" }) },
    ],
  },
  {
    id: "CQ12",
    title: "明確切換療程",
    variants: [
      { id: "CQ12-V1", title: "ONDA 轉肉毒", turns: ["想了解 ONDA", "那改問肉毒好了"], expected: contract("introduce_treatment", ["overview", "benefits", "need_discovery"]) },
      { id: "CQ12-V2", title: "肉毒轉皮秒", turns: ["肉毒可以改善什麼", "我其實想問探索皮秒"], expected: contract("introduce_treatment", ["overview", "benefits", "need_discovery"]) },
      { id: "CQ12-V3", title: "皮秒轉 ONDA", turns: ["皮秒恢復期呢", "先不問這個，我想了解 ONDA"], expected: contract("introduce_treatment", ["overview", "benefits", "need_discovery"]) },
    ],
  },
  {
    id: "CQ13",
    title: "修正原本困擾",
    variants: [
      { id: "CQ13-V1", title: "手臂改肚子", turns: ["我在意手臂", "更正，是肚子"], expected: contract("answer_question", ["concern_direction"]) },
      { id: "CQ13-V2", title: "魚尾紋改皺眉紋", turns: ["想改善魚尾紋", "其實主要是皺眉紋"], expected: contract("answer_question", ["concern_direction"]) },
      { id: "CQ13-V3", title: "鬆弛改脂肪", turns: ["雙下巴比較鬆", "不是，我覺得脂肪比較明顯"], expected: contract("answer_question", ["concern_direction"]) },
    ],
  },
  {
    id: "CQ14",
    title: "否定疑問不得誤刪焦點",
    variants: [
      { id: "CQ14-V1", title: "不是也能改善", turns: ["我在意雙下巴", "ONDA 不是也能改善肚子嗎？"], expected: contract("answer_question", ["benefits", "concern_direction"]) },
      { id: "CQ14-V2", title: "不是可以一起評估", turns: ["想改善毛孔", "不是也可以一起看斑嗎"], expected: contract("answer_question", ["benefits", "concern_direction"]) },
      { id: "CQ14-V3", title: "不是說可改善", turns: ["皺眉紋很明顯", "肉毒不是說也能看魚尾紋？"], expected: contract("answer_question", ["benefits", "concern_direction"]) },
    ],
  },
  {
    id: "CQ15",
    title: "明確雙療程比較",
    variants: [
      { id: "CQ15-V1", title: "ONDA 比肉毒", turns: ["想改善雙下巴", "ONDA 跟肉毒差在哪？"], expected: contract("compare_treatments", ["comparison"]) },
      { id: "CQ15-V2", title: "兩種肉毒品牌比較", turns: ["想了解肉毒品牌", "BOTOX 跟 Dysport 有什麼差別"], expected: contract("compare_treatments", ["brand_difference"]) },
      { id: "CQ15-V3", title: "電波音波比較", turns: ["想改善鬆弛", "十蓓電波跟 Q+ 音波怎麼選"], expected: contract("compare_treatments", ["comparison", "need_discovery"]) },
    ],
  },
  {
    id: "CQ16",
    title: "省略主詞的比較追問",
    variants: [
      { id: "CQ16-V1", title: "這兩個差在哪", turns: ["ONDA 跟肉毒都可以嗎", "這兩個差在哪？"], expected: contract("compare_treatments", ["comparison"]) },
      { id: "CQ16-V2", title: "那差別呢", turns: ["想比較 BOTOX 和 Dysport", "那差別呢"], expected: contract("compare_treatments", ["brand_difference"]) },
      { id: "CQ16-V3", title: "哪個適合我", turns: ["十蓓電波和 Q+ 音波都聽過", "哪個比較適合我？"], expected: contract("compare_treatments", ["comparison", "need_discovery"]) },
    ],
  },
  {
    id: "CQ17",
    title: "搭配療程理由",
    variants: [
      { id: "CQ17-V1", title: "為何搭肉毒", turns: ["想改善雙下巴", "為什麼 ONDA 要搭肉毒？"], expected: contract("answer_question", ["combination_reason"]) },
      { id: "CQ17-V2", title: "一起做的作用", turns: ["聽說有 ONDA 加肉毒", "一起做有什麼不同"], expected: contract("answer_question", ["combination_reason", "comparison"]) },
      { id: "CQ17-V3", title: "是否都要做", turns: ["我在意輪廓", "這兩個一定要一起做嗎"], expected: contract("answer_question", ["combination_reason", "suitability"]) },
    ],
  },
  {
    id: "CQ18",
    title: "偏好單做",
    variants: [
      { id: "CQ18-V1", title: "只做 ONDA", turns: ["ONDA 加肉毒差在哪", "我只做 ONDA 可以嗎"], expected: contract("answer_question", ["single_vs_combination", "suitability"]) },
      { id: "CQ18-V2", title: "暫不搭配", turns: ["你說可以搭肉毒", "我目前想先單做"], expected: contract("answer_question", ["single_vs_combination"]) },
      { id: "CQ18-V3", title: "單做效果", turns: ["聽過輪廓組合", "單做跟搭配差在哪"], expected: contract("answer_question", ["single_vs_combination", "comparison"]) },
    ],
  },
  {
    id: "CQ19",
    title: "拒絕搭配療程",
    variants: [
      { id: "CQ19-V1", title: "不要肉毒", turns: ["ONDA 可以搭肉毒", "那我不要肉毒"], expected: contract("answer_question", ["single_vs_combination"]) },
      { id: "CQ19-V2", title: "不考慮針劑", turns: ["可以評估搭配注射", "我不考慮打針"], expected: contract("recommend_options", ["alternatives", "need_discovery"]) },
      { id: "CQ19-V3", title: "不做組合", turns: ["有單做跟組合方向", "組合先不用，想看單做"], expected: contract("answer_question", ["single_vs_combination"]) },
    ],
  },
  {
    id: "CQ20",
    title: "詢問其他方案",
    variants: [
      { id: "CQ20-V1", title: "還有其他方案嗎", turns: ["想改善皺眉紋", "還有其他方案嗎？"], expected: contract("recommend_options", ["alternatives", "need_discovery"]) },
      { id: "CQ20-V2", title: "不想打針的替代", turns: ["在意臉部輪廓", "不想打針還有什麼方向"], expected: contract("recommend_options", ["alternatives", "need_discovery"]) },
      { id: "CQ20-V3", title: "不同療程選擇", turns: ["毛孔想做皮秒", "除了皮秒還有別的嗎"], expected: contract("recommend_options", ["alternatives", "need_discovery"]) },
    ],
  },
  {
    id: "CQ21",
    title: "院內未提供療程的替代引導",
    variants: [
      { id: "CQ21-V1", title: "海芙替代", turns: ["想改善臉部鬆弛", "你們有海芙嗎？"], expected: contract("recommend_options", ["availability", "alternatives"]) },
      { id: "CQ21-V2", title: "無雙替代", turns: ["想做電音波", "無雙電波你們有嗎"], expected: contract("recommend_options", ["availability", "alternatives"]) },
      { id: "CQ21-V3", title: "海菲秀替代", turns: ["想做保養清潔", "你們有海菲秀嗎"], expected: contract("recommend_options", ["availability", "alternatives"]) },
    ],
  },
  {
    id: "CQ22",
    title: "院內品牌與品牌差異",
    variants: [
      { id: "CQ22-V1", title: "肉毒品牌", turns: ["我想了解肉毒", "你們有哪些品牌？"], expected: contract("answer_question", ["brands"]) },
      { id: "CQ22-V2", title: "音波品牌", turns: ["想問音波", "院內有哪幾種音波"], expected: contract("answer_question", ["brands"]) },
      { id: "CQ22-V3", title: "品牌差別", turns: ["你們有 BOTOX、Neuronox、Dysport", "這三個差別呢"], expected: contract("compare_treatments", ["brand_difference"]) },
    ],
  },
  {
    id: "CQ23",
    title: "指代價格承接",
    variants: [
      { id: "CQ23-V1", title: "這個多少錢", turns: ["我想了解 ONDA", "這個多少錢？"], expected: contract("answer_price", ["regular_price"]) },
      { id: "CQ23-V2", title: "那體驗價呢", turns: ["想看 ONDA 加肉毒的組合", "那體驗價呢"], expected: contract("answer_price", ["campaign_price"]) },
      { id: "CQ23-V3", title: "它有活動嗎", turns: ["肉毒除皺可以改善什麼", "它現在有活動價格嗎"], expected: contract("answer_price", ["campaign_price"]) },
    ],
  },
  {
    id: "CQ24",
    title: "明確但低信心語氣的價格問題",
    variants: [
      { id: "CQ24-V1", title: "不確定仍有明確主體", turns: ["想問價格", "我不確定肉毒多少錢"], expected: contract("answer_price", ["regular_price"]) },
      { id: "CQ24-V2", title: "大概問 ONDA", turns: ["想了解費用", "ONDA 大概有活動價格嗎"], expected: contract("answer_price", ["campaign_price"]) },
      { id: "CQ24-V3", title: "口語問皮秒價格", turns: ["想先抓預算", "探索皮秒價格方便說嗎"], expected: contract("answer_price", ["regular_price"]) },
    ],
  },
  {
    id: "CQ25",
    title: "多療程價格歧義必須澄清",
    variants: [
      { id: "CQ25-V1", title: "兩療程後問多少", turns: ["ONDA 跟肉毒都想了解", "這樣多少錢？"], expected: contract("clarify", ["regular_price"], { clarification: "required" }) },
      { id: "CQ25-V2", title: "比較後問活動價", turns: ["探索皮秒跟肉毒差在哪", "活動價呢"], expected: contract("clarify", ["campaign_price"], { clarification: "required" }) },
      { id: "CQ25-V3", title: "無焦點問價格", turns: ["想做醫美", "體驗價是多少"], expected: contract("clarify", ["campaign_price"], { clarification: "required" }) },
    ],
  },
  {
    id: "CQ26",
    title: "館別資訊後回到療程",
    variants: [
      { id: "CQ26-V1", title: "問館別後問 ONDA", turns: ["你們有幾家店？", "想了解 ONDA"], expected: contract("introduce_treatment", ["overview", "benefits", "need_discovery"]) },
      { id: "CQ26-V2", title: "問地址後回肉毒", turns: ["高雄館在哪裡", "那肉毒有哪些品牌"], expected: contract("answer_question", ["brands"]) },
      { id: "CQ26-V3", title: "問營業時間後回皮秒", turns: ["台中館幾點關門", "我還想了解探索皮秒"], expected: contract("introduce_treatment", ["overview", "benefits", "need_discovery"]) },
    ],
  },
  {
    id: "CQ27",
    title: "館別地址營業時間與班表",
    variants: [
      { id: "CQ27-V1", title: "詢問館別數量", turns: ["想去現場諮詢", "你們有幾家店？"], expected: contract("answer_clinic_info", ["clinic_location"]) },
      { id: "CQ27-V2", title: "詢問地址", turns: ["我住高雄", "高雄館地址在哪"], expected: contract("answer_clinic_info", ["clinic_location"]) },
      { id: "CQ27-V3", title: "詢問醫師班表", turns: ["想找時間過去", "這週醫師班表怎麼看"], expected: contract("answer_clinic_info", ["schedule"]) },
    ],
  },
  {
    id: "CQ28",
    title: "想諮詢但尚未要求預約",
    variants: [
      { id: "CQ28-V1", title: "單純想諮詢", turns: ["我在意雙下巴", "我想諮詢看看"], expected: contract("answer_question", ["concern_direction", "need_discovery"]) },
      { id: "CQ28-V2", title: "先了解適合度", turns: ["想問皮秒", "先諮詢適不適合就好"], expected: contract("answer_question", ["suitability", "need_discovery"]) },
      { id: "CQ28-V3", title: "明確否認預約", turns: ["想了解肉毒", "我是想諮詢，不是要預約"], expected: contract("answer_question", ["need_discovery"]) },
    ],
  },
  {
    id: "CQ29",
    title: "明確建立預約",
    variants: [
      { id: "CQ29-V1", title: "預約諮詢", turns: ["想了解 ONDA", "我要預約諮詢"], expected: contract("start_booking", ["booking_next_field"], { booking: "required" }) },
      { id: "CQ29-V2", title: "指定療程預約", turns: ["肉毒想改善皺眉紋", "幫我預約肉毒諮詢"], expected: contract("start_booking", ["booking_next_field"], { booking: "required" }) },
      { id: "CQ29-V3", title: "提供館別開始預約", turns: ["我想預約探索皮秒", "高雄館比較方便"], expected: contract("start_booking", ["booking_next_field"], { booking: "required" }) },
    ],
  },
  {
    id: "CQ30",
    title: "預約中插問再恢復",
    variants: [
      { id: "CQ30-V1", title: "插問價格", turns: ["我要預約 ONDA 諮詢", "先問一下體驗價", "好，繼續預約"], expected: contract("start_booking", ["booking_next_field"], { booking: "required" }) },
      { id: "CQ30-V2", title: "插問恢復期", turns: ["幫我預約肉毒", "做完恢復期呢", "了解，繼續安排"], expected: contract("start_booking", ["booking_next_field"], { booking: "required" }) },
      { id: "CQ30-V3", title: "插問館別再繼續", turns: ["我想預約探索皮秒", "你們有哪些館別", "那就台中館，繼續"], expected: contract("start_booking", ["booking_next_field"], { booking: "required" }) },
    ],
  },
  {
    id: "CQ31",
    title: "預約管理與真人接手",
    variants: [
      { id: "CQ31-V1", title: "修改預約", turns: ["我已經預約肉毒", "我要改預約時間"], expected: contract("manage_booking", ["booking_management"], { booking: "required" }) },
      { id: "CQ31-V2", title: "取消預約", turns: ["我有一筆 ONDA 預約", "我想取消預約"], expected: contract("manage_booking", ["booking_management"], { booking: "required" }) },
      { id: "CQ31-V3", title: "要求真人", turns: ["這個問題我想再確認", "請幫我轉真人客服"], expected: contract("queue_handoff", ["handoff_confirmation"], { handoff: "required" }) },
    ],
  },
  {
    id: "CQ32",
    title: "一般副作用與術後緊急分流",
    variants: [
      { id: "CQ32-V1", title: "一般副作用衛教", turns: ["想了解肉毒", "副作用是什麼？"], expected: contract("answer_question", ["general_side_effects"]) },
      { id: "CQ32-V2", title: "術後呼吸困難", turns: ["我剛打完肉毒", "現在呼吸困難"], expected: contract("answer_safety", ["urgent_instruction"], { handoff: "allowed" }) },
      { id: "CQ32-V3", title: "術後持續出血", turns: ["我剛做完療程", "傷口一直流血沒有停"], expected: contract("answer_safety", ["urgent_instruction"], { handoff: "allowed" }) },
    ],
  },
] as const satisfies readonly CustomerQualityFamily[];

