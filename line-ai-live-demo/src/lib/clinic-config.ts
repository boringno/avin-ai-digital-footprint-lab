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
  concernReplies?: Array<{
    bookingTreatmentKeys?: string[];
    campaignId?: string;
    concernKey: string;
    followupPrompt: string;
    reply: string;
    selectionTerms?: string[];
    startsBookingIntake?: boolean;
  }>;
  detailReplies?: Array<{
    aspectKey: string;
    bookingTreatmentKeys?: string[];
    campaignId?: string;
    concernKey: string;
    followupPrompt: string;
    reply: string;
    startsBookingIntake?: boolean;
    terms: string[];
  }>;
  discoveryPrompt: string;
  featureSummary: string;
  followupPrompt: string;
  quickReplies?: Array<{
    followupPrompt: string;
    key: string;
    reply: string;
    terms: string[];
  }>;
  relatedReplies?: Array<{
    bookingTreatmentKeys?: string[];
    campaignId?: string;
    followupPrompt: string;
    key: string;
    reply: string;
    startsBookingIntake?: boolean;
    terms: string[];
  }>;
};

export type TreatmentConfig = {
  aliases: string[];
  approvedContent: {
    brandReplies: string[];
    introReplies: string[];
    unsupportedReply: string;
  };
  availableBranchNames?: string[];
  availableBrands?: string[];
  brandReply?: string;
  category: "energy" | "injectable" | "laser" | "skin_care" | "surgery";
  consultationGuide?: TreatmentConversationPack;
  evaluationNote: string;
  intro: string;
  key: string;
  name: string;
};

export type ConcernConfig = {
  key: string;
  keywords: string[];
  informationalReply?: string;
  recommendedTreatmentKeys: string[];
  summary: string;
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
  concernList: ConcernConfig[];
  treatmentList: TreatmentConfig[];
};

type RawTreatmentConfig = Omit<TreatmentConfig, "approvedContent"> & {
  unsupportedReply?: string;
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
    approvedContent: {
      brandReplies: treatment.brandReply ? [treatment.brandReply] : [],
      introReplies: [treatment.intro],
      unsupportedReply: buildTreatmentUnsupportedReply(treatment.name, treatment.unsupportedReply),
    },
  }));
}

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
    personalizedConsultTerms: ["我適合", "我適不適合", "推薦哪個", "哪個適合我", "幫我判斷", "效果一定", "保證效果"],
    postProcedureAlertTerms: ["很腫", "發炎", "疼痛", "發燒", "流膿", "冒血", "紅腫", "不舒服", "異常", "副作用"],
    seriousComplaintTerms: ["客訴", "投訴", "申訴", "不爽", "生氣", "退費", "退款", "求償", "服務很差"],
  },
  firstVisitPreparation: {
    summary:
      "如果是第一次到診，通常會先由現場協助基本資料與需求確認。建議您到診前先想好想了解的療程、在意的部位，以及方便的時段；若有既往治療紀錄或特殊狀況，也可以到現場一併說明。",
  },
  humanSupportHours: {
    fallbackSummary: "真人客服服務時間為週一至週五 09:00-18:00；週末與國定假日暫不保證即時回覆。",
    note: "如遇客服請假或非服務時間，AI 仍會先整理需求，待客服上班後接續協助。",
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
  concernList: [
    {
      key: "dynamic_wrinkles",
      keywords: ["魚尾紋", "動態紋", "表情紋"],
      informationalReply:
      "魚尾紋常見和表情活動形成的動態紋路有關。肉毒常見用於動態紋路的改善與評估，包含魚尾紋這類表情紋；實際施作部位、劑量與是否適合，仍要由醫師現場評估。",
      recommendedTreatmentKeys: ["botox"],
      summary: "這類通常會先從表情肌活動與動態紋路方向了解。",
    },
    {
      key: "jawline_looseness",
      keywords: ["嘴邊肉", "下顎線", "輪廓", "輪廓線", "雙下巴", "雙下八", "下巴肉", "肉肉下巴", "下巴線條", "臉部鬆弛"],
      recommendedTreatmentKeys: ["onda_pro", "tenthermage", "ultherapy", "qplus"],
      summary: "這類通常會先往輪廓緊實、下顎線整理與局部脂肪管理方向評估。",
    },
    {
      key: "local_contour",
      keywords: ["局部脂肪", "脂肪感", "小腹", "腹部", "肚子", "肚皮", "腰腹", "手臂", "蝴蝶袖", "掰掰袖", "大腿", "腰側", "側腰", "橘皮", "體態", "身體線條", "贅肉"],
      recommendedTreatmentKeys: ["onda_pro"],
      summary: "這類可先從局部線條、脂肪型困擾與緊實需求整理諮詢方向。",
    },
    {
      key: "nasolabial_fold",
      keywords: ["法令紋", "木偶紋", "嘴角紋"],
      recommendedTreatmentKeys: ["filler", "counterclockwise", "tenthermage"],
      summary: "這類通常會先看是凹陷支撐不足、整體鬆弛，還是兩者一起影響。",
    },
    {
      key: "pores_texture",
      keywords: ["毛孔", "膚質", "粗糙", "粉刺", "出油", "皮膚粗糙"],
      recommendedTreatmentKeys: ["pico", "hydrafacial", "hydrafacial_elite", "skin_booster", "fisbo"],
      summary: "這類通常會先往膚質整理、清潔保養與整體細緻度方向評估。",
    },
    {
      key: "acne_scar",
      keywords: ["痘疤", "痘坑", "凹疤"],
      recommendedTreatmentKeys: ["pico", "pico_honeycomb_tip", "skin_booster"],
      summary: "這類通常會先看痘疤深淺、膚況穩定度與是否需要搭配分段治療。",
    },
    {
      key: "dullness_brightening",
      keywords: ["暗沉", "提亮", "膚色不均", "氣色差", "美白"],
      recommendedTreatmentKeys: ["pico", "skin_booster", "hydrafacial", "hydrafacial_elite"],
      summary: "這類通常會先往亮白、膚色均勻與整體膚況整理方向評估。",
    },
    {
      key: "general_looseness",
      keywords: ["鬆弛", "下垂", "拉提", "緊實", "老化"],
      recommendedTreatmentKeys: ["tenthermage", "ultherapy", "qplus", "onda_pro"],
      summary: "這類通常會先往拉提、緊實與輪廓支撐方向評估。",
    },
  ],
  treatmentList: withApprovedContent([
    {
      aliases: ["onda", "onda pro", "超微波"],
      category: "energy",
      consultationGuide: {
        concernReplies: [
          {
            bookingTreatmentKeys: ["onda_pro", "botox"],
            campaignId: "promo-2026-08-face-contour-combo",
            concernKey: "jawline_looseness",
            reply: "①雙下巴／嘴邊肉（輪廓線提升）\n\n🟥 目前很推薦 ONDA Pro 搭配肉毒小臉，很多在意下顎線的客人都會選擇這個組合\n\n🟢【ONDA Pro 超微波6分鐘】\n\n✅ 幫助減少局部脂肪\n✅ 改善雙下巴線條\n✅ 讓下顎輪廓更俐落",
            followupPrompt: "😊 預約諮詢是免費的，可以先來了解看看適不適合自己～請問您平日還是假日比較方便呢？",
            selectionTerms: ["①", "選1", "第一個", "臉部", "臉部輪廓"],
            startsBookingIntake: true,
          },
          {
            bookingTreatmentKeys: ["onda_pro"],
            campaignId: "promo-2026-08-05-onda-pro",
            concernKey: "local_contour",
            reply: "②身體局部脂肪堆積（手臂／肚子／橘皮）\n\n🟥 很多在意身體局部脂肪堆積、產後腹部鬆弛等等困擾都可以由醫師評估是否適合\n\n🔥 破壞頑固脂肪／減少脂肪厚度\n\n🔥 改善橘皮組織／凹凸不平\n👉 減少橘皮紋路，皮膚更平滑\n\n❄️ 超舒適、無傷口\n❄️ 無需敷麻、幾乎無修復期\n❄️ 療程快速、立即有感\n❄️ 安全無副作用\n\n😊 由於每個人的脂肪分布、厚度及鬆弛狀況不同，建議您預約現場諮詢，由醫師親自評估後，才能為您規劃較適合的施作部位與療程次數唷🤍",
            followupPrompt: "😊 預約諮詢是免費的，可以先來了解看看適不適合自己～請問您平日還是假日比較方便呢？",
            selectionTerms: ["②", "選2", "第二個", "身體", "身體局部", "手臂", "蝴蝶袖", "掰掰袖", "腹部", "小腹", "肚子", "肚皮", "腰腹", "腰側", "側腰", "大腿", "橘皮"],
            startsBookingIntake: true,
          },
        ],
        detailReplies: [
          {
            aspectKey: "jawline_expectation",
            bookingTreatmentKeys: ["onda_pro", "botox"],
            campaignId: "promo-2026-08-face-contour-combo",
            concernKey: "jawline_looseness",
            terms: ["厚度", "消除", "可以消", "能消", "改善嗎", "有效嗎"],
            reply:
              "🌿 了解😊 如果您主要在意雙下巴的肉感／厚度，ONDA Pro 可作為局部脂肪與輪廓管理的評估方向。",
            followupPrompt: "😊 預約諮詢是免費的，可以先來了解看看適不適合自己～請問您平日還是假日比較方便呢？",
            startsBookingIntake: true,
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
        ],
        discoveryPrompt:
          "😊 請問您最想改善哪個部位呢\n①雙下巴／嘴邊肉（輪廓線提升）\n②身體局部脂肪堆積（手臂／肚子／橘皮）",
        featureSummary:
          "✨ 療程諮詢會依您在意的部位、脂肪型困擾與緊實需求來安排。",
        followupPrompt: "如果有偏好的館別，也可以一併告訴我😊",
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
            followupPrompt: "您想改善哪個部位？我可協助安排免費諮詢😊",
          },
        ],
        relatedReplies: [
          {
            bookingTreatmentKeys: ["onda_pro", "botox"],
            campaignId: "promo-2026-08-face-contour-combo",
            followupPrompt: "😊 預約諮詢是免費的，可以先來了解看看適不適合自己～請問您平日還是假日比較方便呢？",
            key: "botox_small_face",
            reply: "💎【肉毒小臉】\n\n🔹 放鬆長期咀嚼造成的肌肉肥厚\n🔹 韓國原廠 Neuronox 肉毒桿菌\n🔹 放鬆咀嚼肌、改善國字臉\n🔹 約2～4週效果逐漸明顯\n🔹 打造更自然的小臉輪廓\n\n😊 諮詢皆為免費，由醫師依您的臉型與脂肪分布評估是否適合此療程，再提供最適合的建議",
            startsBookingIntake: true,
            terms: ["肉毒功效", "肉毒效果", "肉毒小臉", "咀嚼肌", "國字臉"],
          },
        ],
      },
      evaluationNote: "實際是否適合仍需依部位狀況與現場評估為主。",
      intro: "🟢 ONDA Pro超微波是目前醫美界非常熱門的新一代高頻能量 Coolwaves® 技術\n\n🟢 透過超高頻微波的頻率，透過專利科技精準加熱🔥「脂肪層」幫助脂肪細胞自然代謝，同時也有緊緻拉提肌膚的效果～屬於非侵入式療程，不需要動刀😊\n\n🔷 搭配內建冷卻控溫系統，全程無痛、舒適體驗❄️",
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
            reply: "🌿 如果您在意毛孔、膚質粗糙或粉刺，探索皮秒可作為色素、膚質與整體膚況管理的評估方向；實際安排仍需醫師現場評估。",
            followupPrompt: "您較在意毛孔粗大、膚色不均，還是痘疤／凹疤呢？😊",
          },
          {
            concernKey: "acne_scar",
            reply: "🌿 若主要困擾是痘疤、痘坑或凹疤，探索皮秒可先從膚況與痘疤深淺的評估方向了解。",
            followupPrompt: "您是較在意凹疤、痘印，還是整體膚質不平整呢？😊",
          },
          {
            concernKey: "dullness_brightening",
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
        discoveryPrompt: "😊 您想先改善哪個方向呢？\n① 毛孔／膚質\n② 痘疤／凹疤\n③ 暗沉／膚色不均",
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
      aliases: ["蝴蝶電波"],
      category: "energy",
      evaluationNote: "實際是否適合、施作部位與安排方式仍需依現場評估為主。",
      intro: "蝴蝶電波主要可先理解為私密處緊實與保養評估方向之一，通常會依個人需求與現場狀況做進一步規劃。",
      key: "butterfly_thermage",
      name: "蝴蝶電波",
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
      aliases: ["肉毒", "肉毒桿菌", "botox", "neuronox", "dysport"],
      availableBrands: ["BOTOX", "Neuronox 優力柔", "Dysport 儷緻"],
      brandReply:
        "目前院內常見可評估的肉毒品牌包含 BOTOX、Neuronox 優力柔，以及 Dysport 儷緻；實際會依部位需求、醫師評估與現場安排為主。",
      category: "injectable",
      consultationGuide: {
        concernReplies: [
          {
            concernKey: "dynamic_wrinkles",
            reply: "🌿 魚尾紋、表情紋等動態紋路常會先從表情肌活動方向了解；肉毒可作為動態紋路改善與評估的選項之一，實際是否適合仍需醫師現場評估。",
            followupPrompt: "您較在意魚尾紋、抬頭紋，還是咀嚼肌／臉部輪廓呢？😊",
          },
        ],
        detailReplies: [
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
            reply: "🌿 是否適合肉毒會依紋路、肌肉活動與個人需求評估；可先讓醫師確認後再安排較適合的方向。",
            followupPrompt: "您想先了解體驗方案，還是安排免費諮詢呢？😊",
          },
        ],
        discoveryPrompt: "😊 您想先改善哪個方向呢？\n① 魚尾紋／表情紋\n② 咀嚼肌／臉部輪廓\n③ 其他想改善的部位",
        featureSummary: "肉毒可作為動態紋路、咀嚼肌、輪廓線條或局部肌肉放鬆等方向的評估選項。",
        followupPrompt: "您可以告訴我最在意的部位，我先幫您整理諮詢方向😊",
        quickReplies: [
          {
            key: "features",
            terms: ["特色", "原理", "怎麼做", "功效"],
            reply: "🟢 肉毒常會依部位需求討論動態紋路、咀嚼肌、輪廓線條或局部肌肉放鬆等方向；實際規劃仍需醫師評估。",
            followupPrompt: "您最在意的是表情紋，還是咀嚼肌／臉部輪廓呢？😊",
          },
          {
            key: "comfort_and_recovery",
            terms: ["會痛", "痛嗎", "修復期", "恢復期", "術後"],
            reply: "🌿 實際施作感受與術後照護會依部位及個人狀況不同，現場會先由醫師評估並說明。",
            followupPrompt: "您想先了解哪個部位？我可以協助安排免費諮詢😊",
          },
        ],
      },
      evaluationNote: "實際品項與劑量仍需依部位需求與醫師評估為主。",
      intro: "肉毒通常會拿來討論動態紋路、咀嚼肌、輪廓線條或局部肌肉放鬆等方向，實際安排會依部位與需求評估。",
      key: "botox",
      name: "肉毒",
    },
    {
      aliases: ["玻尿酸", "喬雅登", "緹奧希", "瑞斯朗", "restylane", "雙美膠原蛋白", "再生針"],
      availableBrands: [
        "喬雅登",
        "緹奧希 1-3 號",
        "緹奧希 4 號",
        "瑞斯朗 Restylane",
        "瑞斯朗 Vital Light",
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
      aliases: ["海菲秀"],
      category: "skin_care",
      evaluationNote: "實際安排仍需依膚況與現場評估為主。",
      intro: "海菲秀可先理解為膚況清潔、保濕與整體膚質整理方向之一，通常會依膚況需求做評估。",
      key: "hydrafacial_elite",
      name: "海菲秀",
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
  ]),
};

export function normalizeClinicText(text: string) {
  return text.replace(/[\s\p{P}\p{S}]+/gu, "").trim().toLowerCase();
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

export function findTreatmentByMessage(message: string) {
  const normalizedMessage = normalizeClinicText(message);
  const candidates = clinicConfig.treatmentList.flatMap((treatment) =>
    [treatment.name, ...treatment.aliases].map((alias) => ({
      alias,
      aliasLength: normalizeClinicText(alias).length,
      treatment,
    })),
  );

  return candidates
    .filter(({ alias }) => normalizedMessage.includes(normalizeClinicText(alias)))
    .sort((left, right) => {
      if (right.aliasLength !== left.aliasLength) {
        return right.aliasLength - left.aliasLength;
      }
      return right.treatment.name.length - left.treatment.name.length;
    })[0]?.treatment;
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
