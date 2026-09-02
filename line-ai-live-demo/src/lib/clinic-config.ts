import type { TreatmentConversationBehavior } from "@/lib/conversation-behavior";
import type { ConversationMove, QuestionAspect } from "@/lib/dialogue-semantics";
import { APPROVED_NOTION_TREATMENTS } from "@/lib/approved-notion-treatments";

export type CustomerQuickReplyStage = "approach" | "consultation" | "followup" | "initial";

export type CustomerQuickReplySemantic =
  | {
      concernKey: string;
      type: "concern";
    }
  | {
      areaKey?: string;
      assetKey: string;
      assetKind: "detail" | "quick";
      concernKey?: string;
      conversationMove?: ConversationMove;
      questionAspect: QuestionAspect;
      type: "approved_asset";
    };

export type CustomerQuickReplyChoice = {
  concernKeys?: string[];
  label: string;
  nextStage?: CustomerQuickReplyStage | "consultation";
  semantic?: CustomerQuickReplySemantic;
  stage: CustomerQuickReplyStage;
  text: string;
};

export type BranchConfig = {
  address: string;
  aliases: string[];
  businessHours: string;
  city: string;
  hasCompleteAddress: boolean;
  hasCompleteBusinessHours: boolean;
  hasCompletePhone: boolean;
  isActive: boolean;
  name: string;
  phone: string;
  transportationNote: string;
};

export type TreatmentConversationPack = {
  approvedCombinationTreatmentKeys?: string[];
  concernReplies?: Array<{
    concernKey: string;
    discoveryLabel: string;
    followupPrompt: string;
    reply: string;
    selectionTerms?: string[];
    pricingCampaignId?: string;
  }>;
  discoveryFallbackOption?: {
    followupPrompt: string;
    label: string;
    selectionTerms?: string[];
  };
  detailReplies?: Array<{
    aspectKey: string;
    behaviors?: TreatmentConversationBehavior[];
    concernKey: string;
    followupPrompt: string;
    pricingCampaignId?: string;
    reply: string;
    terms: string[];
  }>;
  discoveryQuestion: string;
  featureSummary: string;
  followupPrompt: string;
  quickReplies?: Array<{
    followupPrompt: string;
    key: string;
    reply: string;
    terms: string[];
  }>;
  /**
   * Customer-facing LINE quick replies.  Unlike `quickReplies` above, these
   * are presentation choices, not terms the router has to guess from prose.
   */
  customerQuickReplies?: CustomerQuickReplyChoice[];
  relatedReplies?: Array<{
    followupPrompt: string;
    key: string;
    pricingCampaignId?: string;
    reply: string;
    terms: string[];
    treatmentKey?: string;
  }>;
};

export type TreatmentConfig = {
  aliases: string[];
  /** Recognition-only phrases such as approved package wording; never render these as public treatment names. */
  recognitionTerms?: string[];
  approvedContent: {
    brandReplies: string[];
    introReplies: string[];
    unsupportedReply: string;
  };
  availableBranchNames?: string[];
  availableBrands?: string[];
  /**
   * Clinic-approved brand identities. Aliases are recognition-only; `name` and
   * `customerReply` are the only values that may be rendered to customers.
   */
  brandOptions?: Array<{
    aliases: string[];
    customerReply: string;
    /**
     * This brand may resolve to the clinic's approved brand-neutral offer.
     * The customer copy must still omit the brand and dose unless separately
     * approved; this flag only controls internal price applicability.
     */
    genericPriceEligible?: boolean;
    key: string;
    name: string;
  }>;
  brandReply?: string;
  category: "energy" | "injectable" | "laser" | "skin_care" | "surgery";
  educationMode?: "general_education" | "human_only";
  /** Approved dose qualifiers that may resolve to brand-neutral customer copy. */
  genericPriceEligibleDoses?: string[];
  officialSourceDomains: string[];
  consultationGuide?: TreatmentConversationPack;
  evaluationNote: string;
  intro: string;
  key: string;
  name: string;
};

export type ConcernConfig = {
  areaKeys: TreatmentAreaKey[];
  key: string;
  keywords: string[];
  /** Clinic-approved customer-facing name. Search aliases must never be rendered. */
  label: string;
  informationalReply?: string;
  recommendedTreatmentKeys: string[];
  summary: string;
};

export type TreatmentAreaKey =
  | "face"
  | "jawline"
  | "skin"
  | "body"
  | "arm"
  | "abdomen"
  | "flank"
  | "thigh"
  | "buttock"
  | "shoulder"
  | "calf"
  | "armpit"
  | "hand";

export type TreatmentAreaConfig = {
  key: TreatmentAreaKey;
  keywords: string[];
  label: string;
};

export type ClinicConfig = {
  aiName: string;
  appointmentPolicy: {
    isAppointmentRequired: boolean;
    summary: string;
  };
  branches: BranchConfig[];
  clinicName: string;
  escalationPolicy: {
    autoResumeAfterMinutes: number;
    humanRequestTerms: string[];
    personalizedConsultTerms: string[];
    postProcedureAlertTerms: string[];
    seriousComplaintTerms: string[];
  };
  firstVisitPreparation: {
    summary: string;
  };
  humanSupportHours: {
    fallbackSummary: string;
    note: string;
    timezone: string;
    weekdayEnd: string;
    weekdayStart: string;
    weekdays: number[];
  };
  paymentMethods: {
    summary: string;
  };
  pricePolicy: {
    browseTerms: string[];
    fallbackSummary: string;
    overviewPrefix: string;
  };
  areaList: TreatmentAreaConfig[];
  concernList: ConcernConfig[];
  treatmentList: TreatmentConfig[];
};

type RawTreatmentConfig = Omit<TreatmentConfig, "approvedContent" | "officialSourceDomains"> & {
  officialSourceDomains?: string[];
  unsupportedReply?: string;
};

const OFFICIAL_MEDICAL_SOURCE_DOMAINS = ["fda.gov", "tfda.gov.tw", "pubmed.ncbi.nlm.nih.gov"];
const OFFICIAL_PRODUCT_SOURCE_DOMAINS: Record<string, string[]> = {
  coolsculpting: ["coolsculpting.com"],
  dermapen4: ["dermapenworld.com"],
  emface: ["btlaesthetics.com"],
  embody: ["btlaesthetics.com"],
  lumecca: ["inmodemd.com"],
  m22_ipl: ["lumenis.com"],
  miradry: ["miradry.com"],
  morpheus_rf: ["inmodemd.com"],
  mounjaro: ["lilly.com"],
};

function buildTreatmentUnsupportedReply(treatmentName: string, customReply?: string) {
  if (customReply?.trim()) {
    return customReply.trim();
  }

  return `目前系統只會依院內核准內容說明 ${treatmentName} 的基本資訊；如果您想問更細的個人適合度、術後反應、效果保證或價格安排，我先幫您整理需求，後續由真人客服協助。`;
}

function withApprovedContent(treatments: RawTreatmentConfig[]): TreatmentConfig[] {
  return treatments.map((treatment) => ({
    ...treatment,
    officialSourceDomains:
      treatment.category === "surgery" || treatment.educationMode === "human_only"
        ? []
        : Array.from(new Set([
            ...OFFICIAL_MEDICAL_SOURCE_DOMAINS,
            ...(OFFICIAL_PRODUCT_SOURCE_DOMAINS[treatment.key] ?? []),
            ...(treatment.officialSourceDomains ?? []),
          ])),
    approvedContent: {
      brandReplies: treatment.brandReply ? [treatment.brandReply] : [],
      introReplies: [treatment.intro],
      unsupportedReply: buildTreatmentUnsupportedReply(treatment.name, treatment.unsupportedReply),
    },
  }));
}

const CONSULTATION_NEXT_STEP_PROMPT =
  "😊 接下來您可以選擇：\n📅 預約免費諮詢\n👩‍💼 真人客服協助\n💬 繼續詢問";

export const clinicConfig: ClinicConfig = {
  aiName: "順順",
  appointmentPolicy: {
    isAppointmentRequired: true,
    summary:
      "目前以預約安排為主。若您想預約，我可以先幫您整理療程、館別、方便時段與是否初診，客服會在服務時間內接續確認實際可約時段。",
  },
  branches: [
    {
      address: "高雄市左營區博愛三路101號",
      aliases: ["高雄", "高雄館"],
      businessHours: "目前系統先記錄客服服務時間為週一至週五 09:00-18:00；館內現場時段仍以實際預約安排為主。",
      city: "高雄",
      hasCompleteAddress: true,
      hasCompleteBusinessHours: false,
      hasCompletePhone: false,
      isActive: true,
      name: "高雄館",
      phone: "",
      transportationNote: "可先以左營區、博愛路周邊為主要導航方向；更完整交通資訊可再由客服補充。",
    },
    {
      address: "台中市南屯區益昌一街101號",
      aliases: ["台中", "台中館"],
      businessHours: "目前系統先記錄客服服務時間為週一至週五 09:00-18:00；館內現場時段仍以實際預約安排為主。",
      city: "台中",
      hasCompleteAddress: true,
      hasCompleteBusinessHours: false,
      hasCompletePhone: false,
      isActive: true,
      name: "台中館",
      phone: "",
      transportationNote: "可先以南屯區益昌一街周邊為主要導航方向；更完整交通資訊可再由客服補充。",
    },
    {
      address: "桃園市中正路1247號2樓",
      aliases: ["桃園", "桃園館"],
      businessHours: "目前系統先記錄客服服務時間為週一至週五 09:00-18:00；館內現場時段仍以實際預約安排為主。",
      city: "桃園",
      hasCompleteAddress: true,
      hasCompleteBusinessHours: false,
      hasCompletePhone: false,
      isActive: true,
      name: "桃園館",
      phone: "",
      transportationNote: "可先以桃園市中正路周邊為主要導航方向；更完整交通資訊可再由客服補充。",
    },
    {
      address: "桃園市龜山區復興一路146巷1號3樓",
      aliases: ["林口", "林口館", "龜山"],
      businessHours: "目前系統先記錄客服服務時間為週一至週五 09:00-18:00；館內現場時段仍以實際預約安排為主。",
      city: "林口",
      hasCompleteAddress: true,
      hasCompleteBusinessHours: false,
      hasCompletePhone: false,
      isActive: true,
      name: "林口館",
      phone: "",
      transportationNote: "可先以龜山區復興一路周邊為主要導航方向；更完整交通資訊可再由客服補充。",
    },
  ],
  clinicName: "順風醫美診所",
  escalationPolicy: {
    autoResumeAfterMinutes: 120,
    humanRequestTerms: ["真人", "真人客服", "人工", "專人", "客服本人"],
    personalizedConsultTerms: [],
    postProcedureAlertTerms: ["很腫", "發炎", "疼痛", "發燒", "流膿", "冒血", "紅腫", "不舒服", "異常", "副作用"],
    seriousComplaintTerms: ["客訴", "投訴", "申訴", "不爽", "生氣", "退費", "退款", "求償", "服務很差"],
  },
  firstVisitPreparation: {
    summary:
      "如果是第一次到診，通常會先由現場協助基本資料與需求確認。建議您到診前先想好想了解的療程、在意的部位，以及方便的時段；若有既往治療紀錄或特殊狀況，也可以到現場一併說明。",
  },
  humanSupportHours: {
    fallbackSummary: "真人客服服務時間為週一至週五 09:00-18:00，國定假日休息。",
    note: "非服務時間 AI 仍會先整理需求，待真人客服上班後接續協助。",
    timezone: "Asia/Taipei",
    weekdayEnd: "18:00",
    weekdayStart: "09:00",
    weekdays: [1, 2, 3, 4, 5],
  },
  paymentMethods: {
    summary: "目前可提供現金或線上轉帳；若單筆消費滿 3000 元，也可刷卡。",
  },
  pricePolicy: {
    browseTerms: [
      "現在活動",
      "現在活動有哪些",
      "目前活動",
      "目前活動有哪些",
      "近期活動",
      "最近活動",
      "優惠有哪些",
      "有什麼優惠",
      "現在有什麼優惠",
      "最近有什麼活動",
      "現在有什麼活動",
    ],
    fallbackSummary:
      "價格會依療程部位、劑量、活動期間與醫師評估而不同。\n我可以先幫您整理想了解的療程與館別\n客服上班後再協助確認目前方案。",
    overviewPrefix: "目前可先參考的近期活動如下",
  },
  areaList: [
    { key: "face", keywords: ["臉", "臉部", "全臉", "側臉"], label: "臉部" },
    { key: "jawline", keywords: ["雙下巴", "雙下八", "下巴", "下顎線", "嘴邊肉", "輪廓線"], label: "下顎輪廓" },
    { key: "skin", keywords: ["皮膚", "膚質", "毛孔", "痘疤", "暗沉"], label: "肌膚" },
    { key: "body", keywords: ["身體", "體態", "局部脂肪", "贅肉"], label: "身體" },
    { key: "arm", keywords: ["手臂", "蝴蝶袖", "掰掰袖", "掰掰肉"], label: "手臂" },
    { key: "abdomen", keywords: ["腹部", "小腹", "小肚肚", "肚子", "肚皮", "腰腹"], label: "腹部" },
    { key: "flank", keywords: ["腰側", "側腰"], label: "腰側" },
    { key: "thigh", keywords: ["大腿", "腿部"], label: "大腿" },
    { key: "buttock", keywords: ["臀部", "屁股", "臀腿"], label: "臀部" },
    { key: "shoulder", keywords: ["肩頸", "肩膀", "斜方肌"], label: "肩頸／斜方肌" },
    { key: "calf", keywords: ["小腿", "蘿蔔腿", "小腿肌"], label: "小腿" },
    { key: "armpit", keywords: ["腋下", "腋窩"], label: "腋下" },
    { key: "hand", keywords: ["手掌", "手汗"], label: "手掌" },
  ],
  concernList: [
    {
      areaKeys: ["face"],
      key: "dynamic_wrinkles",
      keywords: ["魚尾紋", "抬頭紋", "額頭紋", "皺眉紋", "皺眉", "眉間紋", "眉間那條", "眉心紋", "川字紋", "動態紋", "表情紋"],
      label: "魚尾紋／抬頭紋／皺眉紋（動態紋）",
      informationalReply:
      "魚尾紋常見和表情活動形成的動態紋路有關。肉毒常見用於動態紋路的改善與評估，包含魚尾紋這類表情紋；實際施作部位、劑量與是否適合，仍要由醫師現場評估。",
      recommendedTreatmentKeys: ["botox"],
      summary: "這類通常會先從表情肌活動與動態紋路方向了解。",
    },
    {
      areaKeys: ["face", "jawline"],
      key: "masseter_contour",
      keywords: [
        "咀嚼肌",
        "國字臉",
        "肉毒小臉",
        "肉毒瘦小臉",
        "瘦小臉",
        "小臉肉毒",
        "咬肌",
        "臉型偏寬",
        "臉比較寬",
        "下半臉寬",
        "咬緊",
        "容易咬牙",
        "咬肌緊繃",
      ],
      label: "咀嚼肌／臉部輪廓",
      recommendedTreatmentKeys: ["botox"],
      summary: "這類通常會先從咀嚼肌活動與臉部輪廓方向了解。",
    },
    {
      areaKeys: ["shoulder", "calf"],
      key: "muscle_contour",
      keywords: ["肩頸線條", "斜方肌", "小腿線條", "小腿肌", "蘿蔔腿", "肌肉線條"],
      label: "肩頸／小腿肌肉線條",
      recommendedTreatmentKeys: ["botox"],
      summary: "這類通常會先了解在意的是肌肉線條，還是伴隨明顯緊繃或疼痛。",
    },
    {
      areaKeys: ["armpit", "hand"],
      key: "localized_sweating",
      keywords: ["腋下多汗", "腋下流汗", "手汗", "手掌多汗", "多汗問題"],
      label: "腋下／手掌多汗",
      recommendedTreatmentKeys: ["botox"],
      summary: "這類通常會先了解出汗部位與對衣物、工作或日常活動的影響。",
    },
    {
      areaKeys: ["jawline", "face"],
      key: "jawline_looseness",
      keywords: ["嘴邊肉", "下顎線", "輪廓", "輪廓線", "雙下巴", "雙下八", "下巴肉", "肉肉下巴", "肉肉臉", "下巴線條", "臉部鬆弛"],
      label: "雙下巴／嘴邊肉等臉部輪廓",
      recommendedTreatmentKeys: ["onda_pro", "tenthermage", "ultherapy", "qplus"],
      summary: "這類通常會先往輪廓緊實、下顎線整理與局部脂肪管理方向評估。",
    },
    {
      areaKeys: ["body", "arm", "abdomen", "flank", "thigh", "buttock"],
      key: "local_contour",
      keywords: ["局部脂肪", "脂肪感", "小腹", "腹部", "肚子", "肚皮", "腰腹", "手臂", "蝴蝶袖", "掰掰袖", "大腿", "臀部", "屁股", "臀腿", "腰側", "側腰", "橘皮", "體態", "身體線條", "贅肉"],
      label: "手臂、腹部、腰側、大腿或臀部等身體局部",
      recommendedTreatmentKeys: ["onda_pro"],
      summary: "這類可先從局部線條、脂肪型困擾與緊實需求整理諮詢方向。",
    },
    {
      areaKeys: ["face"],
      key: "nasolabial_fold",
      keywords: ["法令紋", "木偶紋", "嘴角紋"],
      label: "法令紋／木偶紋等紋路",
      recommendedTreatmentKeys: ["filler", "counterclockwise", "tenthermage"],
      summary: "這類通常會先看是凹陷支撐不足、整體鬆弛，還是兩者一起影響。",
    },
    {
      areaKeys: ["skin", "face"],
      key: "pores_texture",
      keywords: ["毛孔", "膚質", "粗糙", "粉刺", "出油", "皮膚粗糙"],
      label: "毛孔／膚質",
      recommendedTreatmentKeys: ["pico", "hydrafacial", "skin_booster", "fisbo"],
      summary: "這類通常會先往膚質整理、清潔保養與整體細緻度方向評估。",
    },
    {
      areaKeys: ["skin", "face"],
      key: "acne_scar",
      keywords: ["痘疤", "痘坑", "凹疤"],
      label: "痘疤／痘坑",
      recommendedTreatmentKeys: ["pico", "pico_honeycomb_tip", "skin_booster"],
      summary: "這類通常會先看痘疤深淺、膚況穩定度與是否需要搭配分段治療。",
    },
    {
      areaKeys: ["skin", "face"],
      key: "dullness_brightening",
      keywords: ["暗沉", "提亮", "膚色不均", "氣色差", "美白"],
      label: "暗沉／提亮",
      recommendedTreatmentKeys: ["pico", "skin_booster", "hydrafacial"],
      summary: "這類通常會先往亮白、膚色均勻與整體膚況整理方向評估。",
    },
    {
      areaKeys: ["face", "body"],
      key: "general_looseness",
      keywords: ["鬆弛", "下垂", "拉提", "緊實", "老化"],
      label: "鬆弛／下垂／拉提",
      recommendedTreatmentKeys: ["tenthermage", "ultherapy", "qplus", "onda_pro"],
      summary: "這類通常會先往拉提、緊實與輪廓支撐方向評估。",
    },
  ],
  treatmentList: withApprovedContent([
    {
      aliases: ["onda", "onda pro", "超微波"],
      category: "energy",
      consultationGuide: {
        approvedCombinationTreatmentKeys: ["botox"],
        concernReplies: [
          {
            concernKey: "jawline_looseness",
            discoveryLabel: "雙下巴／嘴邊肉（輪廓線提升）",
            reply: "🌿 如果雙下巴或嘴邊肉主要是脂肪肉感，ONDA Pro 可以從局部脂肪與輪廓緊實方向評估。\n若同時在意咀嚼肌造成的臉寬，才會一起比較肉毒小臉的搭配方向。",
            followupPrompt: "😊 您比較像脂肪肉感、下顎線鬆弛，還是咀嚼肌造成的臉寬呢？",
            selectionTerms: ["①", "選1", "第一個", "臉部", "臉部輪廓"],
            pricingCampaignId: "promo-2026-08-face-contour-combo",
          },
          {
            concernKey: "local_contour",
            discoveryLabel: "身體局部脂肪（手臂／腹部／腰側／大腿／臀部）",
            reply: "🔥 如果主要在意身體局部脂肪或線條，ONDA Pro 可以從脂肪厚度與緊實需求方向評估。\n實際部位、療程次數與改善程度會依脂肪分布及個人狀況不同。",
            followupPrompt: "😊 您主要在意手臂、腹部、腰側、大腿，還是臀部呢？",
            selectionTerms: ["②", "選2", "第二個", "身體", "身體局部", "手臂", "蝴蝶袖", "掰掰袖", "腹部", "小腹", "肚子", "肚皮", "腰腹", "腰側", "側腰", "大腿", "臀部", "屁股", "臀腿", "橘皮"],
            pricingCampaignId: "promo-2026-08-face-contour-combo",
          },
        ],
        detailReplies: [
          {
            aspectKey: "jawline_expectation",
            concernKey: "jawline_looseness",
            pricingCampaignId: "promo-2026-08-face-contour-combo",
            terms: ["脂肪", "脂肪型", "厚度", "消除", "可以消", "能消", "改善嗎", "有效嗎"],
            reply:
              "🌿 了解😊 目前先記下是雙下巴的脂肪型困擾（肉感／厚度）。ONDA Pro 可從局部脂肪厚度與下顎線條方向評估。",
            followupPrompt: "😊 您想先了解單做 ONDA Pro，還是 ONDA＋肉毒小臉組合呢？",
          },
          {
            aspectKey: "jawline_intro",
            concernKey: "jawline_looseness",
            terms: ["介紹", "怎麼做", "原理", "特色"],
            reply:
              "🟢 針對雙下巴／嘴邊肉，ONDA Pro 會從局部脂肪感、下顎線與緊實需求做整體評估；療程規劃會依臉型與脂肪分布安排。",
            followupPrompt:
              "😊 您想先了解體驗價，還是直接安排免費諮詢讓醫師評估呢？",
          },
          {
            aspectKey: "jawline_combination_difference",
            behaviors: ["combination_comparison", "combination_declined", "single_treatment_preference"],
            concernKey: "jawline_looseness",
            pricingCampaignId: "promo-2026-08-face-contour-combo",
            terms: [],
            reply:
              "🟢 ONDA Pro 主要從雙下巴的局部脂肪與緊實方向評估；肉毒小臉則著重放鬆肥厚的咀嚼肌。若同時有脂肪感與肌肉型臉寬，才會一起比較搭配方向。",
            followupPrompt: CONSULTATION_NEXT_STEP_PROMPT,
          },
          {
            aspectKey: "jawline_looseness_focus",
            concernKey: "jawline_looseness",
            terms: ["下顎線鬆弛"],
            reply:
              "🌿 如果主要在意下顎線鬆弛，ONDA Pro 會從輪廓緊實與局部脂肪分布一起評估；若鬆弛來源不只脂肪，醫師也會依現場狀況整理其他方向。",
            followupPrompt: "😊 您想先比較單做 ONDA Pro 與搭配方案，還是直接了解目前價格呢？",
          },
          {
            aspectKey: "jawline_single_treatment",
            concernKey: "jawline_looseness",
            terms: ["只做ONDA", "單做ONDA", "先做ONDA", "只要ONDA"],
            reply:
              "🟢 可以先以 ONDA Pro 作為諮詢方向，重點會放在雙下巴的局部脂肪感、下顎線與緊實需求；是否需要搭配肉毒，仍依咀嚼肌狀況評估，不會強制搭配。",
            followupPrompt: CONSULTATION_NEXT_STEP_PROMPT,
          },
          {
            aspectKey: "body_area_direction",
            concernKey: "local_contour",
            terms: ["手臂", "腹部", "小腹", "肚子", "腰側", "側腰", "大腿", "臀部", "屁股"],
            reply:
              "🔥 已記下您在意的身體部位。ONDA Pro 會依局部脂肪厚度、線條與緊實需求評估；實際規劃仍會看脂肪分布及部位狀況。",
            followupPrompt: CONSULTATION_NEXT_STEP_PROMPT,
          },
        ],
        discoveryQuestion: "😊 您比較想改善哪個部位呢？",
        featureSummary:
          "✨ 療程諮詢會依您在意的部位、脂肪型困擾與緊實需求來安排。",
        followupPrompt: "😊 您比較想改善雙下巴／嘴邊肉，還是身體局部脂肪呢？",
        quickReplies: [
          {
            key: "benefits",
            terms: ["功效", "改善什麼", "可以改善", "適合什麼"],
            reply: "🔥 ONDA Pro 可作為局部脂肪感、輪廓線與緊實需求的評估方向；實際規劃仍需依個人狀況由醫師判斷。",
            followupPrompt: "您較在意臉部輪廓，還是手臂、腹部等身體局部呢？😊",
          },
          {
            key: "features",
            terms: ["特色", "原理", "怎麼做", "儀器"],
            reply: "🟢 ONDA Pro 採用 Coolwaves® 高頻能量技術，會依局部脂肪與肌膚緊實需求規劃。\n❄️ 搭配內建冷卻控溫設計，實際施作仍由醫師依個人狀況評估。",
            followupPrompt: "您想先了解雙下巴／嘴邊肉，還是身體局部呢？😊",
          },
          {
            key: "comfort_and_recovery",
            terms: ["會痛", "痛嗎", "敷麻", "修復期", "恢復期", "瘀青"],
            reply: "❄️ ONDA Pro 搭配冷卻控溫設計；施作感受與術後照護仍會依部位及個人狀況不同，現場會先由醫師評估並說明。",
            followupPrompt: "😊 您比較在意疼痛感，還是術後恢復呢？",
          },
          {
            key: "cooling_control",
            terms: ["冷卻", "控溫", "冷卻系統", "為什麼需要冷卻", "為什麼要冷卻"],
            reply: "❄️ ONDA Pro 的內建冷卻控溫設計，是在能量作用時協助保護肌膚表面並提升施作舒適度；實際能量與感受仍會依部位及個人狀況調整。",
            followupPrompt: "您想了解施作感受，還是術後照護呢？😊",
          },
          {
            key: "continue_question",
            terms: ["繼續詢問", "繼續問", "還想問", "其他問題"],
            reply: "😊 可以，您想繼續了解 ONDA Pro 的改善方向、施作感受，還是價格呢？",
            followupPrompt: "直接告訴我最想問的重點就可以。",
          },
        ],
        customerQuickReplies: [
          { label: "雙下巴／嘴邊肉", nextStage: "followup", semantic: { concernKey: "jawline_looseness", type: "concern" }, text: "我想改善雙下巴／嘴邊肉", stage: "initial" },
          { label: "身體局部脂肪", nextStage: "followup", semantic: { concernKey: "local_contour", type: "concern" }, text: "我想改善身體局部脂肪", stage: "initial" },
          { label: "療程特色", nextStage: "initial", semantic: { assetKey: "features", assetKind: "quick", questionAspect: "mechanism", type: "approved_asset" }, text: "ONDA 療程特色", stage: "initial" },
          { label: "價格／活動", text: "ONDA 體驗價多少", stage: "initial" },
          { label: "脂肪堆積", nextStage: "approach", semantic: { assetKey: "jawline_expectation", assetKind: "detail", concernKey: "jawline_looseness", questionAspect: "benefits", type: "approved_asset" }, text: "脂肪堆積", stage: "followup", concernKeys: ["jawline_looseness"] },
          { label: "下顎線鬆弛", nextStage: "approach", semantic: { assetKey: "jawline_looseness_focus", assetKind: "detail", concernKey: "jawline_looseness", questionAspect: "benefits", type: "approved_asset" }, text: "下顎線鬆弛", stage: "followup", concernKeys: ["jawline_looseness"] },
          { label: "ONDA＋肉毒組合", nextStage: "consultation", semantic: { assetKey: "jawline_combination_difference", assetKind: "detail", concernKey: "jawline_looseness", questionAspect: "single_vs_combination", type: "approved_asset" }, text: "ONDA＋肉毒小臉組合", stage: "followup", concernKeys: ["jawline_looseness"] },
          { label: "預約免費諮詢", text: "我要預約免費諮詢", stage: "followup", concernKeys: ["jawline_looseness"] },
          { label: "手臂", nextStage: "approach", semantic: { areaKey: "arm", assetKey: "body_area_direction", assetKind: "detail", concernKey: "local_contour", questionAspect: "benefits", type: "approved_asset" }, text: "我在意手臂脂肪", stage: "followup", concernKeys: ["local_contour"] },
          { label: "腹部／腰側", nextStage: "approach", semantic: { areaKey: "abdomen", assetKey: "body_area_direction", assetKind: "detail", concernKey: "local_contour", questionAspect: "benefits", type: "approved_asset" }, text: "我在意腹部／腰側脂肪", stage: "followup", concernKeys: ["local_contour"] },
          { label: "大腿／臀部", nextStage: "approach", semantic: { areaKey: "thigh", assetKey: "body_area_direction", assetKind: "detail", concernKey: "local_contour", questionAspect: "benefits", type: "approved_asset" }, text: "我在意大腿／臀部脂肪", stage: "followup", concernKeys: ["local_contour"] },
          { label: "預約免費諮詢", text: "我要預約免費諮詢", stage: "followup", concernKeys: ["local_contour"] },
          { label: "預約免費諮詢", text: "我要預約免費諮詢", stage: "followup" },
          { label: "單做 ONDA", nextStage: "consultation", semantic: { assetKey: "jawline_single_treatment", assetKind: "detail", concernKey: "jawline_looseness", conversationMove: "prefer_single", questionAspect: "single_vs_combination", type: "approved_asset" }, text: "我想先單做 ONDA", stage: "approach", concernKeys: ["jawline_looseness"] },
          { label: "ONDA＋肉毒組合", nextStage: "consultation", semantic: { assetKey: "jawline_combination_difference", assetKind: "detail", concernKey: "jawline_looseness", questionAspect: "single_vs_combination", type: "approved_asset" }, text: "ONDA＋肉毒小臉組合", stage: "approach", concernKeys: ["jawline_looseness"] },
          { label: "價格／活動", text: "ONDA 體驗價多少", stage: "approach", concernKeys: ["jawline_looseness"] },
          { label: "預約免費諮詢", text: "我要預約免費諮詢", stage: "approach", concernKeys: ["jawline_looseness"] },
          { label: "價格／活動", text: "ONDA 體驗價多少", stage: "approach", concernKeys: ["local_contour"] },
          { label: "預約免費諮詢", text: "我要預約免費諮詢", stage: "approach", concernKeys: ["local_contour"] },
          { label: "真人客服協助", text: "我要找真人客服", stage: "approach", concernKeys: ["local_contour"] },
          { label: "繼續詢問", text: "繼續詢問", stage: "approach", concernKeys: ["local_contour"] },
          { label: "ONDA價格", text: "ONDA 體驗價多少", stage: "consultation", concernKeys: ["jawline_looseness"] },
        ],
        relatedReplies: [
          {
            followupPrompt: "您比較在意咀嚼肌造成的臉寬，還是雙下巴與下顎線呢？😊",
            key: "botox_small_face",
            pricingCampaignId: "promo-2026-anniv-onda-face-online",
            reply: "✨ ONDA Pro 主要從局部脂肪與輪廓緊實方向評估；肉毒小臉則著重咀嚼肌與臉型線條。\n只有同時在意脂肪肉感與咀嚼肌型臉寬時，才會一起比較搭配方向。",
            terms: ["肉毒功效", "肉毒效果", "肉毒小臉", "咀嚼肌", "國字臉"],
            treatmentKey: "botox",
          },
        ],
      },
      evaluationNote: "實際是否適合仍需依部位狀況與現場評估為主。",
      intro: "🌿 ONDA Pro 是非侵入式的 Coolwaves® 高頻能量療程，主要從局部脂肪與輪廓緊實方向評估。\n\n🔥 能量作用於脂肪層，協助改善雙下巴、嘴邊肉及身體局部脂肪困擾。\n❄️ 搭配冷卻控溫設計，提升施作舒適度。",
      key: "onda_pro",
      name: "ONDA PRO",
    },
    {
      aliases: ["蜂巢探頭", "蜂巢皮秒"],
      category: "laser",
      evaluationNote: "是否要搭配蜂巢探頭，仍需依膚況與現場評估為主。",
      intro:
        "蜂巢探頭可先理解為探索皮秒可搭配的探頭模式之一，通常會和皮秒雷射一起評估，不是獨立的另一台儀器。",
      key: "pico_honeycomb_tip",
      name: "蜂巢探頭",
    },
    {
      aliases: ["探索皮秒", "皮秒", "蜂巢", "蜂巢皮秒"],
      category: "laser",
      consultationGuide: {
        concernReplies: [
          {
            concernKey: "pores_texture",
            discoveryLabel: "毛孔／膚質",
            reply: "🌿 如果您在意毛孔、膚質粗糙或粉刺，探索皮秒可作為色素、膚質與整體膚況管理的評估方向；實際安排仍需醫師現場評估。",
            followupPrompt: "您較在意毛孔粗大、膚色不均，還是痘疤／凹疤呢？😊",
          },
          {
            concernKey: "acne_scar",
            discoveryLabel: "痘疤／凹疤",
            reply: "🌿 若主要困擾是痘疤、痘坑或凹疤，探索皮秒可先從膚況與痘疤深淺的評估方向了解。",
            followupPrompt: "您是較在意凹疤、痘印，還是整體膚質不平整呢？😊",
          },
          {
            concernKey: "dullness_brightening",
            discoveryLabel: "暗沉／膚色不均",
            reply: "✨ 如果在意暗沉、膚色不均或想讓氣色更均勻，探索皮秒可作為整體膚況管理的評估方向。",
            followupPrompt: "您比較在意暗沉、斑點，還是膚色不均呢？😊",
          },
        ],
        detailReplies: [
          {
            aspectKey: "skin_intro",
            concernKey: "pores_texture",
            terms: ["介紹", "怎麼做", "原理", "特色"],
            reply: "🟢 探索皮秒會依色素、膚質與整體膚況需求規劃；是否搭配蜂巢等安排，仍會由醫師依現場膚況判斷。",
            followupPrompt: "您想先從毛孔／膚質，還是痘疤／色素問題開始了解呢？😊",
          },
          {
            aspectKey: "scar_evaluation",
            concernKey: "acne_scar",
            terms: ["效果", "改善嗎", "適合", "可以做"],
            reply: "🌿 痘疤的深淺、膚況穩定度與是否需要分段規劃，都會影響實際安排；可先由醫師評估後再說明適合的方向。",
            followupPrompt: "您想先了解探索皮秒，還是直接安排免費諮詢評估呢？😊",
          },
        ],
        discoveryQuestion: "😊 您想先改善哪個方向呢？",
        featureSummary: "探索皮秒可作為色素、膚質與整體膚況管理的評估方向。",
        followupPrompt: "您可以告訴我最在意的膚況，我先幫您整理諮詢方向😊",
        quickReplies: [
          {
            key: "features",
            terms: ["特色", "原理", "怎麼做", "探頭"],
            reply: "🟢 探索皮秒會依色素、膚質與整體膚況需求評估；蜂巢探頭是可搭配的模式之一，是否需要會依現場膚況判斷。",
            followupPrompt: "您目前較在意毛孔／膚質，還是痘疤／凹疤呢？😊",
          },
          {
            key: "comfort_and_recovery",
            terms: ["會痛", "痛嗎", "修復期", "恢復期", "術後"],
            reply: "🌿 實際施作感受與術後照護會依膚況及規劃不同，現場會先由醫師評估並說明。",
            followupPrompt: "您想先了解哪個膚況方向？我可以協助安排免費諮詢😊",
          },
        ],
      },
      evaluationNote: "實際是否適合仍需依膚況與醫師評估為主。",
      intro: "探索皮秒可先理解為色素、膚質與整體膚況管理的評估方向之一；是否搭配蜂巢等規劃，通常會依膚況現場判斷。",
      key: "pico",
      name: "探索皮秒",
    },
    {
      aliases: ["十蓓電波", "十倍電波", "眼周電波", "眼周探頭", "韓國十倍電波", "韓國十蓓電波"],
      brandReply:
        "目前院內眼周電波也是十蓓電波的眼周探頭；如果您想了解眼周細紋、緊實或整體眼周評估方向，我也可以先幫您整理需求。",
      category: "energy",
      evaluationNote: "實際是否適合仍需依部位狀況與現場評估為主。",
      intro: "十蓓電波可先理解為緊實與輪廓管理的評估方向之一，常見會用在鬆弛、下顎線、嘴邊肉等整體規劃；眼周也可搭配十蓓電波的眼周探頭做進一步評估。",
      key: "tenthermage",
      name: "十蓓電波",
    },
    {
      aliases: ["鳳凰電波", "鳳凰"],
      category: "energy",
      evaluationNote: "實際是否適合仍需依部位狀況與醫師現場評估為主。",
      intro: "鳳凰電波是院內提供的電波療程之一；若您想了解，可以先告訴我在意的部位或困擾，我幫您整理諮詢方向，實際仍需由醫師現場評估。",
      key: "phoenix_thermage",
      name: "鳳凰電波",
    },
    {
      aliases: ["美國音波", "美國音波2.0", "音波拉提"],
      category: "energy",
      evaluationNote: "實際是否適合仍需依部位狀況與現場評估為主。",
      intro: "美國音波 2.0 可先理解為拉提與輪廓線條管理的評估方向之一，常見會討論鬆弛、下垂與整體拉提需求。",
      key: "ultherapy",
      name: "美國音波 2.0",
    },
    {
      aliases: ["q+音波", "q音波"],
      category: "energy",
      evaluationNote: "實際是否適合仍需依部位狀況與現場評估為主。",
      intro: "Q+音波可先理解為緊實、拉提與輪廓管理的評估方向之一，通常會依老化鬆弛與線條需求做整體討論。",
      key: "qplus",
      name: "Q+音波",
    },
    {
      aliases: [
        "肉毒",
        "肉毒桿菌",
        "botox",
        "neuronox",
        "dysport",
        "經典肉毒",
        "经典肉毒",
        "奇蹟肉毒",
        "奇迹肉毒",
        "奇績肉毒",
        "皇家肉毒",
        "優力柔",
        "优力柔",
        "儷緻",
        "儷致",
        "麗緻",
        "麗致",
        "neruonox",
        "neuronx",
        "dyspot",
        "dysprot",
      ],
      availableBrands: ["BOTOX", "Neuronox 優力柔", "Dysport 儷緻"],
      brandOptions: [
        {
          aliases: ["BOTOX", "經典肉毒", "经典肉毒"],
          customerReply: "🌿 經典肉毒是院內對 BOTOX 的稱呼。實際施打部位與劑量由醫師評估，價格則由真人客服於上班時間協助確認。",
          key: "botox",
          name: "BOTOX（經典肉毒）",
        },
        {
          aliases: ["Neuronox", "優力柔", "优力柔", "奇蹟肉毒", "奇迹肉毒", "奇績肉毒", "neruonox", "neuronx"],
          customerReply: "🌿 奇蹟肉毒是院內對 Neuronox 優力柔的稱呼。院內另有肉毒體驗價 999 元，全館適用；品牌與施打細節由真人客服依活動內容協助確認。",
          genericPriceEligible: true,
          key: "neuronox",
          name: "Neuronox 優力柔（奇蹟肉毒）",
        },
        {
          aliases: ["Dysport", "儷緻", "儷致", "麗緻", "麗致", "皇家肉毒", "dyspot", "dysprot"],
          customerReply: "🌿 皇家肉毒是院內對 Dysport 儷緻的稱呼。實際施打部位與劑量由醫師評估，價格則由真人客服於上班時間協助確認。",
          key: "dysport",
          name: "Dysport 儷緻（皇家肉毒）",
        },
      ],
      brandReply:
        "🌿 奇蹟肉毒、經典肉毒及皇家肉毒都是院內可評估的品牌。\n適合哪一款，會依施打部位、肌肉狀況與需求建議。",
      category: "injectable",
      consultationGuide: {
        concernReplies: [
          {
            concernKey: "dynamic_wrinkles",
            discoveryLabel: "魚尾紋／抬頭紋／皺眉紋（動態紋）",
            reply: "✨ 如果主要困擾是抬頭紋、皺眉紋或魚尾紋，肉毒通常會從表情肌活動與動態紋路方向評估。\n實際施打位置與劑量仍會由醫師依表情活動判斷。",
            followupPrompt: "😊 您是做表情時比較明顯，還是平時也看得到呢？",
            selectionTerms: ["魚尾紋", "抬頭紋", "額頭紋", "皺眉紋", "眉間紋", "眉間那條", "眉心紋", "川字紋", "動態紋", "表情紋"],
            pricingCampaignId: "promo-2026-anniv-botox-10u",
          },
          {
            concernKey: "masseter_contour",
            discoveryLabel: "咀嚼肌／臉部輪廓",
            reply: "✨ 如果主要在意咀嚼肌或臉型偏寬，可以從肉毒小臉方向評估，協助調整下半臉線條。\n實際位置與劑量仍由醫師依肌肉狀況判斷。",
            followupPrompt: "😊 您主要在意臉型偏寬，還是咬肌緊繃呢？",
            selectionTerms: ["咀嚼肌", "國字臉", "肉毒小臉", "肉毒瘦小臉", "瘦小臉", "小臉肉毒", "咬肌", "臉部輪廓"],
          },
          {
            concernKey: "muscle_contour",
            discoveryLabel: "肩頸／小腿肌肉線條",
            reply: "✨ 如果主要在意肩頸或小腿肌肉線條，可以由醫師評估肉毒放鬆肌肉後的修飾方向。\n若伴隨明顯疼痛或功能問題，則需要先由醫師了解原因。",
            followupPrompt: "😊 您主要想改善肩頸，還是小腿線條呢？",
            selectionTerms: ["肩頸", "肩膀", "斜方肌", "小腿", "小腿肌", "蘿蔔腿", "肌肉線條"],
          },
          {
            concernKey: "localized_sweating",
            discoveryLabel: "腋下／手掌多汗",
            reply: "🌿 肉毒也可以從局部多汗方向評估，通常會先了解出汗部位及對日常生活的影響程度。",
            followupPrompt: "😊 您主要是腋下、手掌，還是其他部位呢？平常是否會影響衣物、工作或日常活動？",
            selectionTerms: ["腋下", "腋窩", "手汗", "手掌", "多汗", "流汗"],
          },
        ],
        detailReplies: [
          {
            aspectKey: "dynamic_wrinkles_crows_feet",
            concernKey: "dynamic_wrinkles",
            pricingCampaignId: "promo-2026-anniv-botox-10u",
            terms: ["魚尾紋"],
            reply: "🌿 已記下您主要在意魚尾紋這類動態紋路。肉毒通常會依眼周表情肌活動與紋路狀況評估，實際施作部位與劑量仍由醫師現場評估。",
            followupPrompt: "😊 魚尾紋是做表情時較明顯，還是平時也看得到呢？",
          },
          {
            aspectKey: "dynamic_wrinkles_forehead",
            concernKey: "dynamic_wrinkles",
            pricingCampaignId: "promo-2026-anniv-botox-10u",
            terms: ["抬頭紋", "額頭紋"],
            reply: "🌿 已記下您主要在意抬頭紋（額頭動態紋）這類動態紋路。肉毒通常會依額頭表情肌活動與紋路狀況評估，實際施作部位與劑量仍由醫師現場評估。",
            followupPrompt: "😊 抬頭紋是做表情時較明顯，還是平時也看得到呢？",
          },
          {
            aspectKey: "dynamic_wrinkles_frown_lines",
            concernKey: "dynamic_wrinkles",
            pricingCampaignId: "promo-2026-anniv-botox-10u",
            terms: ["皺眉紋", "皺眉", "眉間紋", "眉間那條", "眉心紋", "川字紋"],
            reply: "🌿 已記下您主要在意皺眉紋（眉間動態紋）這類動態紋路。肉毒通常會依眉間表情肌活動與紋路狀況評估，實際施作部位與劑量仍由醫師現場評估。",
            followupPrompt: "😊 皺眉紋是做表情時較明顯，還是平時也看得到呢？",
          },
          {
            aspectKey: "dynamic_wrinkles_intro",
            concernKey: "dynamic_wrinkles",
            terms: ["介紹", "怎麼做", "原理", "特色"],
            reply: "🟢 肉毒通常會依表情肌活動、紋路位置與部位需求進行評估；實際施作部位與劑量仍由醫師現場判斷。",
            followupPrompt: "您想先了解哪個部位的困擾呢？😊",
          },
          {
            aspectKey: "dynamic_wrinkles_evaluation",
            concernKey: "dynamic_wrinkles",
            terms: ["效果", "改善嗎", "適合", "可以做"],
            reply: "✨ 肉毒常用於動態紋與肌肉線條評估，例如皺眉紋、魚尾紋或咀嚼肌明顯等困擾。\n效果與適合的劑量會依部位及肌肉狀況判斷。",
            followupPrompt: "😊 您主要在意紋路，還是小臉線條呢？",
          },
          {
            aspectKey: "dynamic_wrinkles_expression_only",
            concernKey: "dynamic_wrinkles",
            terms: [
              "做表情時比較明顯",
              "做表情比較明顯",
              "表情時比較明顯",
              "做表情",
              "表情時",
              "笑的時候",
              "皺眉時",
              "抬眉時",
            ],
            reply:
              "✨ 如果主要在做表情時才明顯，通常會著重評估表情肌活動與動態紋位置；實際施打範圍仍由醫師依表情狀況判斷。",
            followupPrompt: CONSULTATION_NEXT_STEP_PROMPT,
          },
          {
            aspectKey: "dynamic_wrinkles_at_rest",
            concernKey: "dynamic_wrinkles",
            terms: ["平時也有", "平常也有", "平時看得到", "平常看得到", "不做表情也有", "靜態也有"],
            reply:
              "🌿 如果平時不做表情也看得到，除了肌肉活動，也需要由醫師一起評估紋路深度與皮膚狀況，再決定適合的處理方向。",
            followupPrompt: CONSULTATION_NEXT_STEP_PROMPT,
          },
          {
            aspectKey: "masseter_face_width",
            concernKey: "masseter_contour",
            terms: ["臉型偏寬", "臉比較寬", "國字臉", "下半臉寬", "想瘦小臉"],
            reply:
              "✨ 若主要是咀嚼肌造成的下半臉偏寬，肉毒小臉會從肌肉厚度與左右狀況評估，協助整理臉型線條。",
            followupPrompt: CONSULTATION_NEXT_STEP_PROMPT,
          },
          {
            aspectKey: "masseter_tightness",
            concernKey: "masseter_contour",
            terms: ["咬肌緊繃", "咬緊", "咀嚼肌緊", "容易咬牙", "緊繃感"],
            reply:
              "🌿 若主要在意咀嚼肌緊繃，醫師會先了解肌肉活動與日常困擾；若伴隨疼痛或功能問題，則需要進一步評估原因。",
            followupPrompt: CONSULTATION_NEXT_STEP_PROMPT,
          },
          {
            aspectKey: "muscle_contour_lines",
            concernKey: "muscle_contour",
            terms: ["肌肉線條", "肩膀線條", "小腿線條", "斜方肌明顯", "蘿蔔腿"],
            reply:
              "✨ 如果主要在意肩頸或小腿的肌肉線條，醫師會依肌肉厚度、左右狀況與希望改善的方向評估。",
            followupPrompt: CONSULTATION_NEXT_STEP_PROMPT,
          },
          {
            aspectKey: "muscle_contour_tightness",
            concernKey: "muscle_contour",
            terms: ["緊繃感", "肩頸緊繃", "小腿緊繃", "肌肉緊繃"],
            reply:
              "🌿 如果主要在意肩頸或小腿的緊繃感，醫師會先了解肌肉活動與日常困擾；若伴隨明顯疼痛或功能問題，也會一起評估原因。",
            followupPrompt: CONSULTATION_NEXT_STEP_PROMPT,
          },
          {
            aspectKey: "localized_sweating_armpit",
            concernKey: "localized_sweating",
            terms: ["腋下多汗", "腋下流汗"],
            reply:
              "🌿 已記下主要困擾是腋下多汗。醫師會依出汗範圍、頻率及對衣物與日常活動的影響，評估適合的處理方向。",
            followupPrompt: CONSULTATION_NEXT_STEP_PROMPT,
          },
          {
            aspectKey: "localized_sweating_hand",
            concernKey: "localized_sweating",
            terms: ["手汗", "手掌多汗"],
            reply:
              "🌿 已記下主要困擾是手汗。醫師會依出汗範圍、頻率及對工作與日常活動的影響，評估適合的處理方向。",
            followupPrompt: CONSULTATION_NEXT_STEP_PROMPT,
          },
          {
            aspectKey: "localized_sweating_impact",
            concernKey: "localized_sweating",
            terms: ["影響衣物", "衣服濕", "影響工作", "影響生活", "很困擾", "出汗很多"],
            reply:
              "🌿 若腋下或手掌出汗已影響衣物、工作或日常活動，可以由醫師評估局部多汗的處理方向與適合部位。",
            followupPrompt: CONSULTATION_NEXT_STEP_PROMPT,
          },
        ],
        discoveryFallbackOption: {
          followupPrompt: "可以告訴我最在意的部位或困擾，我先幫您整理肉毒的諮詢方向😊",
          label: "其他想改善的部位",
          selectionTerms: ["其他", "其他部位"],
        },
        discoveryQuestion: "😊 您主要想改善哪個方向呢？",
        featureSummary: "🌿 肉毒主要從肌肉活動與動態紋路方向評估，也能依部位協助調整肌肉線條。",
        followupPrompt: "😊 您主要在意臉部動態紋、咀嚼肌／小臉、肩頸／小腿，還是多汗問題呢？",
        quickReplies: [
          {
            key: "brands",
            terms: ["品牌差異", "有哪些品牌", "肉毒品牌"],
            reply: "🌿 奇蹟肉毒、經典肉毒及皇家肉毒都是院內可評估的品牌，醫師會依施打部位、肌肉狀況與需求建議。",
            followupPrompt: "😊 您主要想改善動態紋、咀嚼肌／小臉，還是其他部位呢？",
          },
          {
            key: "features",
            terms: ["特色", "原理", "怎麼做", "功效"],
            reply: "🌿 肉毒主要從肌肉活動與動態紋路方向評估，也能依部位協助調整肌肉線條。\n✨ 常見會評估抬頭紋、皺眉紋、魚尾紋、咀嚼肌、小腿、肩頸及多汗問題。",
            followupPrompt: "😊 您主要想改善臉部動態紋、咀嚼肌／小臉、肩頸／小腿，還是多汗問題呢？",
          },
          {
            key: "comfort_and_recovery",
            terms: ["會痛", "痛嗎", "修復期", "恢復期", "術後"],
            reply: "🌿 實際施作感受與術後照護會依部位及個人狀況不同，現場會先由醫師評估並說明。",
            followupPrompt: "您想先了解哪個部位？我可以協助安排免費諮詢😊",
          },
          {
            key: "continue_question",
            terms: ["繼續詢問", "繼續問", "還想問", "其他問題"],
            reply: "😊 可以，您想繼續了解肉毒的改善方向、品牌差異，還是價格呢？",
            followupPrompt: "直接告訴我最想問的重點就可以。",
          },
        ],
        customerQuickReplies: [
          { label: "動態紋", nextStage: "followup", semantic: { concernKey: "dynamic_wrinkles", type: "concern" }, text: "我想改善動態紋", stage: "initial" },
          { label: "咀嚼肌／小臉", nextStage: "followup", semantic: { concernKey: "masseter_contour", type: "concern" }, text: "我想改善咀嚼肌／小臉", stage: "initial" },
          { label: "肩頸／小腿", nextStage: "followup", semantic: { concernKey: "muscle_contour", type: "concern" }, text: "我想改善肩頸／小腿", stage: "initial" },
          { label: "腋下／手汗", nextStage: "followup", semantic: { concernKey: "localized_sweating", type: "concern" }, text: "我想改善腋下／手汗", stage: "initial" },
          { label: "做表情時明顯", nextStage: "consultation", semantic: { assetKey: "dynamic_wrinkles_expression_only", assetKind: "detail", concernKey: "dynamic_wrinkles", questionAspect: "benefits", type: "approved_asset" }, text: "做表情時比較明顯", stage: "followup", concernKeys: ["dynamic_wrinkles"] },
          { label: "平時也看得到", nextStage: "consultation", semantic: { assetKey: "dynamic_wrinkles_at_rest", assetKind: "detail", concernKey: "dynamic_wrinkles", questionAspect: "benefits", type: "approved_asset" }, text: "平時也看得到", stage: "followup", concernKeys: ["dynamic_wrinkles"] },
          { label: "價格／活動", text: "肉毒體驗價多少", stage: "followup", concernKeys: ["dynamic_wrinkles"] },
          { label: "預約免費諮詢", text: "我要預約免費諮詢", stage: "followup", concernKeys: ["dynamic_wrinkles"] },
          { label: "臉型偏寬", nextStage: "consultation", semantic: { assetKey: "masseter_face_width", assetKind: "detail", concernKey: "masseter_contour", questionAspect: "benefits", type: "approved_asset" }, text: "臉型偏寬", stage: "followup", concernKeys: ["masseter_contour"] },
          { label: "咬肌緊繃", nextStage: "consultation", semantic: { assetKey: "masseter_tightness", assetKind: "detail", concernKey: "masseter_contour", questionAspect: "benefits", type: "approved_asset" }, text: "咬肌緊繃", stage: "followup", concernKeys: ["masseter_contour"] },
          { label: "價格／活動", text: "肉毒體驗價多少", stage: "followup", concernKeys: ["masseter_contour"] },
          { label: "預約免費諮詢", text: "我要預約免費諮詢", stage: "followup", concernKeys: ["masseter_contour"] },
          { label: "肌肉線條", nextStage: "consultation", semantic: { assetKey: "muscle_contour_lines", assetKind: "detail", concernKey: "muscle_contour", questionAspect: "benefits", type: "approved_asset" }, text: "我在意肌肉線條", stage: "followup", concernKeys: ["muscle_contour"] },
          { label: "緊繃感", nextStage: "consultation", semantic: { assetKey: "muscle_contour_tightness", assetKind: "detail", concernKey: "muscle_contour", questionAspect: "benefits", type: "approved_asset" }, text: "我在意緊繃感", stage: "followup", concernKeys: ["muscle_contour"] },
          { label: "價格／活動", text: "肉毒體驗價多少", stage: "followup", concernKeys: ["muscle_contour"] },
          { label: "預約免費諮詢", text: "我要預約免費諮詢", stage: "followup", concernKeys: ["muscle_contour"] },
          { label: "腋下多汗", nextStage: "consultation", semantic: { areaKey: "armpit", assetKey: "localized_sweating_armpit", assetKind: "detail", concernKey: "localized_sweating", questionAspect: "benefits", type: "approved_asset" }, text: "我在意腋下多汗", stage: "followup", concernKeys: ["localized_sweating"] },
          { label: "手汗", nextStage: "consultation", semantic: { areaKey: "hand", assetKey: "localized_sweating_hand", assetKind: "detail", concernKey: "localized_sweating", questionAspect: "benefits", type: "approved_asset" }, text: "我在意手汗", stage: "followup", concernKeys: ["localized_sweating"] },
          { label: "價格／活動", text: "肉毒體驗價多少", stage: "followup", concernKeys: ["localized_sweating"] },
          { label: "預約免費諮詢", text: "我要預約免費諮詢", stage: "followup", concernKeys: ["localized_sweating"] },
          { label: "品牌差異", nextStage: "followup", semantic: { assetKey: "brands", assetKind: "quick", questionAspect: "brands", type: "approved_asset" }, text: "肉毒有哪些品牌", stage: "followup" },
          { label: "價格／活動", text: "肉毒體驗價多少", stage: "followup" },
          { label: "預約免費諮詢", text: "我要預約免費諮詢", stage: "followup" },
          { label: "真人客服協助", text: "我要找真人客服", stage: "followup" },
        ],
      },
      evaluationNote: "實際品項與劑量仍需依部位需求與醫師評估為主。",
      genericPriceEligibleDoses: ["12U"],
      intro: "🌿 肉毒主要從肌肉活動與動態紋路方向評估，也能依部位協助調整肌肉線條。\n\n✨ 常見會評估抬頭紋、皺眉紋、魚尾紋、咀嚼肌、小腿、肩頸及多汗問題。",
      key: "botox",
      name: "肉毒",
    },
    {
      aliases: ["玻尿酸", "喬雅登", "緹奧希", "瑞斯朗", "restylane", "雙美膠原蛋白", "再生針"],
      availableBrands: [
        "Cutegel 珂芮緹玻尿酸",
        "喬雅登",
        "緹奧希 1-3 號",
        "緹奧希 4 號",
        "TEOXANE RHA",
        "瑞斯朗 Restylane",
        "瑞斯朗 Vital Light",
        "瑞斯朗 Volyme",
        "瑞斯朗 Defyne",
        "瑞斯朗 Kysse",
        "貝恩希",
        "金色仙女",
        "再生針",
        "雙美膠原蛋白",
      ],
      brandReply:
        "目前院內常見可評估的填充方向包含喬雅登、緹奧希 1 到 4 號、瑞斯朗 Restylane、瑞斯朗 Vital Light、貝恩希、金色仙女、再生針，以及雙美膠原蛋白；實際安排仍會依部位需求與醫師評估為主。",
      category: "injectable",
      evaluationNote: "實際品項與施作方向仍需依部位需求與醫師評估為主。",
      intro: "玻尿酸與填充類療程通常會拿來討論凹陷、輪廓修飾、支撐與精緻度調整，實際安排仍會依部位與需求評估。",
      key: "filler",
      name: "玻尿酸",
    },
    {
      aliases: ["伊蓮絲", "伊蓮思", "ellanse"],
      category: "injectable",
      evaluationNote: "實際是否適合、施作部位與劑量仍需依醫師評估為主。",
      intro: "伊蓮絲可先理解為填充與支撐類的評估方向之一，常見會依部位凹陷、輪廓與整體支撐需求做討論。",
      key: "ellanse",
      name: "伊蓮絲",
    },
    {
      aliases: ["熊貓針"],
      category: "injectable",
      evaluationNote: "實際是否適合、施作部位與搭配方式仍需依眼周狀況與醫師評估為主。",
      intro: "熊貓針通常會拿來討論眼周暗沉、細紋、淚溝與整體眼周修飾方向，實際安排仍會依眼周條件與現場評估做調整。",
      key: "panda_needle",
      name: "熊貓針",
    },
    {
      aliases: ["逆時針", "profhilo", "普羅菲洛"],
      category: "injectable",
      evaluationNote: "它比較偏向膚質、保水與彈性支撐的整體評估方向，實際是否適合、施作部位與次數仍需依醫師評估為主。",
      intro:
        "逆時針可先理解為 PROFHILO 類型的保養針劑方向，核心是高低分子玻尿酸的搭配，常見會拿來討論肌膚保水、彈性、細紋與整體緊實感；它不是傳統以塑形為主的填充型玻尿酸。",
      key: "counterclockwise",
      name: "逆時針",
    },
    {
      aliases: ["plt", "plt生長因子", "生長因子凍晶", "自體生長因子"],
      category: "skin_care",
      educationMode: "general_education",
      evaluationNote: "實際採用方式、療程安排與是否適合仍需由醫師現場評估。",
      intro: "PLT 生長因子療程可先從膚況修護、保養需求與想改善的部位進行了解；實際採用方式與安排仍需由醫師現場評估。",
      key: "plt_growth_factor",
      name: "PLT 生長因子",
    },
    {
      aliases: ["消脂瘦瘦針", "消脂針", "溶脂針", "ronkyla", "消脂瘦瘦"],
      category: "injectable",
      educationMode: "general_education",
      evaluationNote: "實際是否適合、施作部位與劑量仍需由醫師現場評估。",
      intro: "消脂針屬於局部輪廓管理的評估方向之一，會依脂肪分布、部位與個人條件討論；實際是否適合與施作方式仍需由醫師現場評估。",
      key: "fat_dissolving_injection",
      name: "消脂針",
    },
    {
      aliases: ["prp", "prp自體血小板", "自體血小板"],
      category: "skin_care",
      educationMode: "general_education",
      evaluationNote: "實際採用方式、療程安排與是否適合仍需由醫師現場評估。",
      intro: "PRP 可先從自體血小板相關的修護與膚況管理方向了解，實際採用方式、部位與療程安排仍需由醫師現場評估。",
      key: "prp",
      name: "PRP",
    },
    {
      aliases: ["vivabella", "薇貝拉", "薇貝拉童顏針"],
      category: "injectable",
      educationMode: "general_education",
      evaluationNote: "實際是否適合、施作部位與劑量仍需由醫師現場評估。",
      intro: "薇貝拉可先從輪廓、凹陷與膠原支撐等評估方向了解；實際施作部位與安排仍需由醫師現場評估。",
      key: "vivabella",
      name: "薇貝拉",
    },
    {
      aliases: ["4d舒顏萃", "舒顏萃", "sculptra"],
      category: "injectable",
      educationMode: "general_education",
      evaluationNote: "實際是否適合、施作部位與劑量仍需由醫師現場評估。",
      intro: "4D 舒顏萃可先從輪廓、凹陷與膠原支撐等評估方向了解；實際是否適合與施作安排仍需由醫師現場評估。",
      key: "sculptra",
      name: "4D 舒顏萃",
    },
    {
      aliases: ["晶亮瓷", "radiesse"],
      category: "injectable",
      educationMode: "general_education",
      evaluationNote: "實際是否適合、施作部位與劑量仍需由醫師現場評估。",
      intro: "晶亮瓷可先從輪廓修飾、支撐與凹陷等評估方向了解；實際是否適合與施作安排仍需由醫師現場評估。",
      key: "radiesse",
      name: "晶亮瓷",
    },
    {
      aliases: ["mounjaro", "猛健樂"],
      category: "injectable",
      educationMode: "general_education",
      evaluationNote: "這屬於需要醫師完整評估與處方管理的項目，不可自行判斷適合度或用法。",
      intro: "猛健樂屬於需由醫師評估與處方管理的項目；如果您想了解，可以先說明目前需求，實際適應症、是否適合、用法與追蹤方式都需由醫師判斷。",
      key: "mounjaro",
      name: "猛健樂 Mounjaro",
    },
    {
      aliases: ["ha35", "ha35活膚", "幹細胞活膚"],
      category: "skin_care",
      educationMode: "general_education",
      evaluationNote: "實際成分、採用方式與療程安排仍需由醫師現場確認。",
      intro: "HA35 活膚可先從保水、膚質與整體肌膚管理方向了解；實際成分、採用方式與療程安排仍需由醫師現場確認。",
      key: "ha35_skin_rejuvenation",
      name: "HA35 活膚",
    },
    {
      aliases: ["dermapen4", "dermapen", "微針", "微針療程"],
      category: "skin_care",
      educationMode: "general_education",
      evaluationNote: "實際是否適合、搭配內容與術後照護仍需依膚況由醫師現場評估。",
      intro: "DERMAPEN 4 微針可先從毛孔、痘疤與膚質管理方向了解；實際是否適合、搭配內容與術後照護仍需依膚況評估。",
      key: "dermapen4",
      name: "DERMAPEN 4 微針",
    },
    {
      aliases: ["m22", "m22彩衝光", "彩衝光"],
      category: "laser",
      educationMode: "general_education",
      evaluationNote: "實際模式與療程安排仍需依膚況由醫師現場評估。",
      intro: "M22 彩衝光可先從膚色不均、泛紅、斑點與整體膚況管理方向了解；實際模式與療程安排仍需依膚況評估。",
      key: "m22_ipl",
      name: "M22 彩衝光",
    },
    {
      aliases: ["lumecca", "lumecca三倍光", "三倍光"],
      category: "laser",
      educationMode: "general_education",
      evaluationNote: "實際模式與療程安排仍需依膚況由醫師現場評估。",
      intro: "LUMECCA 三倍光可先從斑點、泛紅、膚色不均與整體膚況管理方向了解；實際模式與療程安排仍需依膚況評估。",
      key: "lumecca",
      name: "LUMECCA 三倍光",
    },
    {
      aliases: ["淨膚雷射", "淨膚"],
      category: "laser",
      educationMode: "general_education",
      evaluationNote: "實際是否適合與療程安排仍需依膚況由醫師現場評估。",
      intro: "淨膚雷射可先從暗沉、膚色不均與整體膚況整理方向了解；實際是否適合與療程安排仍需依膚況評估。",
      key: "laser_toning",
      name: "淨膚雷射",
    },
    {
      aliases: ["光梭雷射", "光梭"],
      category: "laser",
      educationMode: "general_education",
      evaluationNote: "實際是否適合與療程安排仍需依膚況由醫師現場評估。",
      intro: "光梭雷射可先從膚況、毛孔與色素等需求方向了解；實際是否適合與療程安排仍需依膚況評估。",
      key: "clear_silk_laser",
      name: "光梭雷射",
    },
    {
      aliases: ["飛梭雷射", "飛梭"],
      category: "laser",
      educationMode: "general_education",
      evaluationNote: "實際是否適合、施作範圍與術後照護仍需依膚況由醫師現場評估。",
      intro: "飛梭雷射可先從毛孔、痘疤與膚質不平整等方向了解；實際是否適合、施作範圍與術後照護仍需依膚況評估。",
      key: "fractional_laser",
      name: "飛梭雷射",
    },
    {
      aliases: ["維密g緊雷射", "g緊雷射", "維密雷射"],
      category: "laser",
      educationMode: "general_education",
      evaluationNote: "私密療程需由醫師了解個人需求與健康狀況後評估。",
      intro: "維密 G 緊雷射屬私密保養與緊實相關的評估項目；實際是否適合與療程安排需由醫師了解個人需求後判斷。",
      key: "g_tightening_laser",
      name: "維密 G 緊雷射",
    },
    {
      aliases: ["miradry", "清新微波", "腋下微波"],
      category: "energy",
      educationMode: "general_education",
      evaluationNote: "實際是否適合與療程安排仍需依個人狀況由醫師現場評估。",
      intro: "miraDry 清新微波可先從腋下汗量、異味與相關困擾方向了解；實際是否適合與療程安排仍需由醫師現場評估。",
      key: "miradry",
      name: "miraDry 清新微波",
    },
    {
      aliases: ["emfemme", "蝴蝶電波", "emfemme蝴蝶電波", "蝴蝶電波forma", "forma私密電波"],
      category: "energy",
      educationMode: "general_education",
      evaluationNote: "私密療程需由醫師了解個人需求與健康狀況後評估。",
      intro: "EMFEMME 蝴蝶電波屬私密保養與緊實相關的評估項目；實際是否適合與療程安排需由醫師了解個人需求後判斷。",
      key: "emfemme",
      name: "EMFEMME 蝴蝶電波",
    },
    {
      aliases: ["立體電波", "立體電波拉提"],
      category: "energy",
      educationMode: "general_education",
      evaluationNote: "實際是否適合、部位與療程安排仍需由醫師現場評估。",
      intro: "立體電波可先從緊實、輪廓與拉提需求方向了解；實際是否適合、部位與療程安排仍需由醫師現場評估。",
      key: "volumetric_rf",
      name: "立體電波",
    },
    {
      aliases: ["魔塑電波", "魔塑"],
      category: "energy",
      educationMode: "general_education",
      evaluationNote: "實際是否適合、部位與療程安排仍需由醫師現場評估。",
      intro: "魔塑電波可先從緊實、輪廓與局部線條管理方向了解；實際是否適合、部位與療程安排仍需由醫師現場評估。",
      key: "morpheus_rf",
      name: "魔塑電波",
    },
    {
      aliases: ["emface"],
      category: "energy",
      educationMode: "general_education",
      evaluationNote: "實際是否適合、部位與療程安排仍需由醫師現場評估。",
      intro: "EMFACE 可先從臉部肌肉、緊實與輪廓管理方向了解；實際是否適合與療程安排仍需由醫師現場評估。",
      key: "emface",
      name: "EMFACE",
    },
    {
      aliases: ["embody"],
      category: "energy",
      educationMode: "general_education",
      evaluationNote: "實際是否適合、部位與療程安排仍需由醫師現場評估。",
      intro: "EMBODY 可先從身體肌肉與線條管理方向了解；實際是否適合、部位與療程安排仍需由醫師現場評估。",
      key: "embody",
      name: "EMBODY",
    },
    {
      aliases: ["g動幸福椅", "幸福椅", "g動椅"],
      category: "energy",
      educationMode: "general_education",
      evaluationNote: "實際是否適合與療程安排需由醫師了解個人需求與健康狀況後評估。",
      intro: "G 動幸福椅可先從骨盆底肌相關的保養與訓練需求方向了解；實際是否適合與療程安排需由醫師評估。",
      key: "pelvic_floor_chair",
      name: "G 動幸福椅",
    },
    {
      aliases: ["ilib", "ilib靜脈雷射", "靜脈雷射"],
      category: "laser",
      educationMode: "general_education",
      evaluationNote: "這屬於需要醫師評估健康狀況與療程適應性的項目。",
      intro: "ILIB 靜脈雷射屬需要醫師評估健康狀況與療程適應性的項目；可以先整理想了解的方向，後續由醫師進一步說明。",
      key: "ilib",
      name: "ILIB 靜脈雷射",
    },
    {
      aliases: ["酷立塑", "coolsculpting", "冷凍減脂"],
      category: "energy",
      educationMode: "general_education",
      evaluationNote: "實際是否適合、施作部位與療程安排仍需由醫師現場評估。",
      intro: "酷立塑可先從局部脂肪與身體線條管理方向了解；實際是否適合、施作部位與療程安排仍需由醫師現場評估。",
      key: "coolsculpting",
      name: "酷立塑",
    },
    {
      aliases: ["魔滴", "motiva", "曼陀", "mentor", "隆乳假體"],
      category: "surgery",
      educationMode: "human_only",
      evaluationNote: "整形外科與植入物相關問題不由 AI 自由說明，需轉由真人客服與醫師接續。",
      intro: "診所有提供隆乳植入物相關諮詢；這屬於整形外科項目，AI 不代替醫師說明手術內容，先幫您整理需求並由真人客服接續安排。",
      key: "breast_implant_consultation",
      name: "隆乳植入物諮詢",
    },
    {
      aliases: ["除毛", "亞歷山大", "海神"],
      category: "laser",
      evaluationNote: "實際安排仍需依部位、毛髮狀況與現場評估為主。",
      intro: "除毛療程通常會依部位、毛髮粗細與膚況做評估；目前常見可討論的機型方向包含亞歷山大與海神。",
      key: "hair_removal",
      name: "除毛",
    },
    {
      aliases: ["水光針", "水光"],
      category: "skin_care",
      evaluationNote: "實際配方與施作方式仍需依膚況與現場評估為主。",
      intro: "水光針通常會拿來討論保濕、細緻度與整體膚質管理方向，實際配方與安排會依膚況做調整。",
      key: "skin_booster",
      name: "水光針",
    },
    {
      aliases: ["水飛梭"],
      category: "skin_care",
      evaluationNote: "實際安排仍需依膚況與現場評估為主。",
      intro: "水飛梭可先理解為基礎清潔與膚質保養方向之一，常見會討論粉刺、出油與整體膚況整理。",
      key: "hydrafacial",
      name: "水飛梭",
    },
    {
      aliases: ["日式光纖"],
      category: "laser",
      evaluationNote: "實際是否適合、施作部位與安排方式，仍需依部位條件與現場評估為主。",
      intro:
        "日式光纖可先理解為局部線條整理與緊實評估方向之一，通常會依想改善的部位、鬆弛程度與整體條件做規劃，不會每個人都使用同一種安排方式。",
      key: "japanese_fiber",
      name: "日式光纖",
    },
    {
      aliases: ["菲斯波"],
      availableBranchNames: ["台中館"],
      category: "skin_care",
      evaluationNote: "實際是否適合、施作部位與安排方式，仍需依膚況與現場評估為主。",
      intro:
        "菲斯波可先理解為膚質管理與保養型療程的評估方向之一，常見會拿來討論肌膚細緻度、整體質感與日常保養需求；實際規劃仍會依膚況與想改善的重點調整。",
      key: "fisbo",
      name: "菲斯波",
    },
    ...APPROVED_NOTION_TREATMENTS,
  ]),
};

export function normalizeClinicText(text: string) {
  return text.replace(/[\s\p{P}\p{S}]+/gu, "").trim().toLocaleLowerCase("en-US");
}

function matchBranchByMessage(message: string, includeInactive: boolean) {
  const normalizedMessage = normalizeClinicText(message);
  return clinicConfig.branches.find((branch) =>
    (includeInactive || branch.isActive) &&
    [branch.name, branch.city, ...branch.aliases].some((alias) =>
      normalizedMessage.includes(normalizeClinicText(alias)),
    ),
  );
}

export function findBranchByMessage(message: string) {
  return matchBranchByMessage(message, false);
}

export function findAnyBranchByMessage(message: string) {
  return matchBranchByMessage(message, true);
}

export function findAllTreatmentsByMessage(message: string) {
  const normalizedMessage = normalizeClinicText(message);
  const candidates = clinicConfig.treatmentList.flatMap((treatment) =>
    [
      { alias: treatment.name, sourcePriority: 2 },
      ...treatment.aliases.map((alias) => ({ alias, sourcePriority: 2 })),
      ...(treatment.recognitionTerms ?? []).map((alias) => ({ alias, sourcePriority: 2 })),
      ...(treatment.availableBrands ?? []).map((alias) => ({ alias, sourcePriority: 1 })),
    ].map(({ alias, sourcePriority }) => ({
      alias,
      aliasLength: normalizeClinicText(alias).length,
      messageIndex: normalizedMessage.indexOf(normalizeClinicText(alias)),
      sourcePriority,
      treatment,
    })),
  );

  const matches = candidates
    .filter(({ messageIndex }) => messageIndex >= 0)
    .sort((left, right) => {
      if (left.messageIndex !== right.messageIndex) {
        return left.messageIndex - right.messageIndex;
      }
      if (right.aliasLength !== left.aliasLength) {
        return right.aliasLength - left.aliasLength;
      }
      if (right.sourcePriority !== left.sourcePriority) {
        return right.sourcePriority - left.sourcePriority;
      }
      return right.treatment.name.length - left.treatment.name.length;
    });

  const seen = new Set<string>();
  const uniqueMatches = matches
    .filter(({ treatment }) => {
      if (seen.has(treatment.key)) return false;
      seen.add(treatment.key);
      return true;
    });

  // A shared/nested alias such as "蜂巢皮秒" describes one configured
  // treatment phrase, not two independently requested treatments. Only retain
  // the longest alias at a given message position; distinct phrases elsewhere
  // in the message (for example ONDA + 肉毒) remain separate matches.
  return uniqueMatches
    .filter((match, index, all) => !all.some((other, otherIndex) =>
      otherIndex !== index &&
      other.messageIndex === match.messageIndex &&
      (other.aliasLength > match.aliasLength ||
        (other.aliasLength === match.aliasLength && other.sourcePriority > match.sourcePriority) ||
        (other.aliasLength === match.aliasLength &&
          other.sourcePriority === match.sourcePriority &&
          otherIndex < index)),
    ))
    .map(({ treatment }) => treatment);
}

export function findTreatmentByMessage(message: string) {
  return findAllTreatmentsByMessage(message)[0];
}

export function findTreatmentBrandInClinic(
  clinic: Pick<ClinicConfig, "treatmentList">,
  message: string,
  treatmentKey?: string,
) {
  const normalizedMessage = normalizeClinicText(message);
  if (!normalizedMessage) return null;
  const candidates = clinic.treatmentList
    .filter((treatment) => !treatmentKey || treatment.key === treatmentKey)
    .flatMap((treatment) =>
      (treatment.brandOptions ?? []).flatMap((brand) =>
        [brand.name, ...brand.aliases].map((alias) => ({
          aliasLength: normalizeClinicText(alias).length,
          brand,
          matched: normalizedMessage.includes(normalizeClinicText(alias)),
          treatmentKey: treatment.key,
        })),
      ),
    )
    .filter((candidate) => candidate.matched && candidate.aliasLength > 0)
    .sort((left, right) => right.aliasLength - left.aliasLength);
  const first = candidates[0];
  return first
    ? { ...first.brand, treatmentKey: first.treatmentKey }
    : null;
}

export function findTreatmentBrandByMessage(
  message: string,
  treatmentKey?: string,
) {
  return findTreatmentBrandInClinic(clinicConfig, message, treatmentKey);
}

export function getClinicOfferingNames() {
  return Array.from(
    new Set(
      clinicConfig.treatmentList.flatMap((treatment) => [
        treatment.name,
        ...(treatment.availableBrands ?? []),
      ]),
    ),
  );
}

export function getClinicOfferingTerms() {
  return Array.from(
    new Set(
      clinicConfig.treatmentList.flatMap((treatment) => [
        treatment.name,
        ...treatment.aliases,
        ...(treatment.availableBrands ?? []),
      ]),
    ),
  );
}

export function findTreatmentByKey(key: string) {
  return clinicConfig.treatmentList.find((treatment) => treatment.key === key) ?? null;
}

export function findConcernByMessage(message: string) {
  const normalizedMessage = normalizeClinicText(message);

  return clinicConfig.concernList.find((concern) =>
    concern.keywords.some((keyword) => normalizedMessage.includes(normalizeClinicText(keyword))),
  );
}

export function listActiveBranches() {
  return clinicConfig.branches.filter((branch) => branch.isActive);
}
