import type { ConversationContext } from "../src/lib/conversation-context";
import { resolvePublishedScheduleForValidation } from "../src/lib/doctor-schedule";
import { routeCustomerMessage } from "../src/lib/router";

type TestCase = {
  conversationContext?: ConversationContext;
  expectedDecisionType: string;
  expectedMatchedKey: string;
  expectedReplyMessageCount?: number;
  message: string;
  replyExcludes?: string[];
  replyIncludes?: string[];
};

// Pricing campaigns are date-bound; keep router regression tests deterministic.
const VALIDATION_NOW = new Date("2026-07-21T04:00:00.000Z");

const TEST_CASES: TestCase[] = [
  {
    expectedDecisionType: "clinic_info_reply",
    expectedMatchedKey: "branch_address:高雄館",
    message: "你們高雄館地址在哪？",
  },
  {
    expectedDecisionType: "clinic_info_reply",
    expectedMatchedKey: "nearest_branch:高雄館",
    message: "我住高雄，離我最近的診所是哪一間？",
  },
  {
    expectedDecisionType: "clinic_info_reply",
    expectedMatchedKey: "branch_list",
    message: "你們有幾間診所",
    replyIncludes: ["高雄館", "台中館", "桃園館", "林口館"],
  },
  {
    expectedDecisionType: "clinic_info_reply",
    expectedMatchedKey: "branch_list",
    message: "你們有哪些館別",
    replyIncludes: ["高雄館", "台中館", "桃園館", "林口館"],
  },
  {
    expectedDecisionType: "clinic_info_reply",
    expectedMatchedKey: "branch_list",
    message: "方便給我各館的地址嗎？我參考看看我哪裡比較近",
    replyIncludes: ["高雄館", "台中館", "桃園館", "林口館", "高雄市左營區博愛三路101號"],
    replyExcludes: ["台北", "新竹"],
  },
  {
    expectedDecisionType: "clinic_info_reply",
    expectedMatchedKey: "branch_focus:桃園館",
    message: "桃園？",
    replyIncludes: ["桃園館"],
  },
  {
    expectedDecisionType: "clinic_info_reply",
    expectedMatchedKey: "branch_address:桃園館",
    message: "桃園地址？",
    replyIncludes: ["桃園館地址是桃園市中正路1247號2樓。"],
    replyExcludes: ["您想了解地址、營業時間、交通方式"],
  },
  {
    expectedDecisionType: "clinic_info_reply",
    expectedMatchedKey: "branch_focus:桃園館",
    message: "桃園館！？",
    replyIncludes: ["桃園館地址是桃園市中正路1247號2樓。", "營業時間", "交通方式"],
  },
  {
    expectedDecisionType: "clinic_info_reply",
    expectedMatchedKey: "unsupported_branch_query:新竹館",
    message: "新竹館呢？",
    replyIncludes: ["高雄館", "台中館", "桃園館", "林口館", "新竹館 目前沒有開放接待"],
    replyExcludes: ["新竹館我們有的", "新竹館離桃園也滿近的"],
  },
  {
    expectedDecisionType: "clinic_info_reply",
    expectedMatchedKey: "unsupported_branch_query:信義館",
    message: "信義館有嗎？",
    replyIncludes: ["高雄館", "台中館", "桃園館", "林口館", "信義館 目前沒有開放接待"],
    replyExcludes: ["南京館", "板橋館", "新竹館我們有的"],
  },
  {
    expectedDecisionType: "clinic_info_reply",
    expectedMatchedKey: "unsupported_branch_query:新竹",
    message: "新竹地址",
    replyIncludes: ["高雄館", "台中館", "桃園館", "林口館", "新竹 目前沒有開放接待"],
    replyExcludes: ["順風診所新竹館", "新竹市東區"],
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_carousel",
    message: "有哪些熱門療程",
    replyIncludes: ["熱門療程"],
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_carousel",
    message: "我想了解有什麼療程",
    replyIncludes: ["熱門療程"],
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_carousel",
    message: "有什麼療程",
    replyIncludes: ["熱門療程"],
  },
  {
    expectedDecisionType: "medical_guidance_reply",
    expectedMatchedKey: "pregnancy_caution",
    message: "孕婦適合皮秒嗎？",
  },
  {
    expectedDecisionType: "medical_guidance_reply",
    expectedMatchedKey: "pregnancy_caution",
    message: "我懷孕了想預約肉毒",
    replyExcludes: ["方便時段", "聯絡電話"],
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_intro:onda_pro",
    message: "Onda 功效是什麼？",
    replyExcludes: ["保證", "一定有效"],
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_intro:botox",
    message: "我想了解肉毒",
    replyExcludes: ["海芙", "保證效果"],
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_brand:botox",
    message: "你們家是什麼肉毒？",
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_brand:botox",
    message: "有什麼肉毒可以選擇？",
  },
  {
    expectedDecisionType: "booking_intake_reply",
    expectedMatchedKey: "booking_intake",
    message: "我想預約皮秒",
  },
  {
    expectedDecisionType: "pricing_auto_reply",
    expectedMatchedKey: "皮秒雷射+日式光纖",
    expectedReplyMessageCount: 2,
    message: "皮秒多少錢？",
    replyIncludes: ["皮秒雷射+日式光纖", "2499"],
  },
  {
    expectedDecisionType: "pricing_auto_reply",
    expectedMatchedKey: "promotion_overview",
    expectedReplyMessageCount: 1,
    message: "現在活動有哪些",
    replyIncludes: ["目前可先參考的近期活動如下", "VIO私密除毛", "皮秒雷射+日式光纖", "十蓓電波200發"],
  },
  {
    expectedDecisionType: "pricing_auto_reply",
    expectedMatchedKey: "promotion_overview",
    expectedReplyMessageCount: 1,
    message: "優惠有哪些",
    replyIncludes: ["目前可先參考的近期活動如下", "VIO私密除毛", "皮秒雷射+日式光纖", "十蓓電波200發"],
  },
  {
    expectedDecisionType: "pricing_auto_reply",
    expectedMatchedKey: "promotion_overview",
    expectedReplyMessageCount: 1,
    message: "最近有什麼活動",
    replyIncludes: ["目前可先參考的近期活動如下", "VIO私密除毛", "皮秒雷射+日式光纖", "十蓓電波200發"],
  },
  {
    expectedDecisionType: "pricing_auto_reply",
    expectedMatchedKey: "十蓓電波200發",
    expectedReplyMessageCount: 2,
    message: "十蓓電波活動是什麼",
    replyIncludes: ["十蓓電波", "9999"],
  },
  {
    expectedDecisionType: "pricing_auto_reply",
    expectedMatchedKey: "promotion_overview",
    expectedReplyMessageCount: 1,
    message: "鳳凰電波活動是什麼",
    replyIncludes: ["目前可先參考的近期活動如下", "十蓓電波200發"],
  },
  {
    expectedDecisionType: "handoff_pending",
    expectedMatchedKey: "post_procedure_issue",
    message: "我打完很腫正常嗎？",
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_intro:butterfly_thermage",
    message: "蝴蝶電波是什麼",
    replyExcludes: ["Thermage", "臉部拉提"],
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_intro:counterclockwise",
    message: "逆時針是什麼",
    replyExcludes: ["童顏針", "洢蓮絲"],
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_intro:ellanse",
    message: "伊蓮思是什麼",
    replyExcludes: ["玻尿酸塑形", "保證維持"],
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_intro:pico_honeycomb_tip",
    message: "蜂巢探頭是什麼",
    replyExcludes: ["另一台機器", "獨立療程"],
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_intro:japanese_fiber",
    message: "日式光纖是什麼",
    replyIncludes: ["局部線條整理", "現場評估"],
    replyExcludes: ["抽脂手術", "保證瘦"],
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_intro:fisbo",
    message: "菲斯波是什麼",
    replyIncludes: ["台中館"],
    replyExcludes: ["每一館都有", "亂下定義"],
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_intro_branch_limit:fisbo",
    message: "高雄館有菲斯波嗎",
    replyIncludes: ["台中館", "整理需求"],
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_brand:tenthermage",
    message: "眼周電波有嗎？什麼牌子",
    replyIncludes: ["十蓓電波", "眼周探頭"],
    replyExcludes: ["Thermage", "美國電波"],
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_intro:tenthermage",
    message: "韓國十倍電波是什麼？",
    replyIncludes: ["十蓓電波"],
    replyExcludes: ["Thermage", "海芙"],
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_brand:tenthermage",
    message: "十蓓電波眼周是什麼探頭？",
    replyIncludes: ["十蓓電波", "眼周探頭"],
    replyExcludes: ["Thermage"],
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_intro:hair_removal",
    message: "除毛用什麼機器？",
    replyIncludes: ["亞歷山大", "海神"],
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_intro:skin_booster",
    message: "水光針是什麼？",
    replyExcludes: ["保證美白", "固定配方"],
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_intro:hydrafacial",
    message: "水飛梭是什麼？",
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_intro:hydrafacial_elite",
    message: "海菲秀是什麼？",
  },
  {
    expectedDecisionType: "handoff_pending",
    expectedMatchedKey: "unsupported_treatment_or_unapproved_content",
    message: "海芙是什麼？",
    replyIncludes: ["院內核准內容", "真人客服"],
  },
  {
    expectedDecisionType: "handoff_pending",
    expectedMatchedKey: "effect_guarantee_request",
    message: "十蓓電波可以保證有效嗎？",
  },
  {
    expectedDecisionType: "handoff_pending",
    expectedMatchedKey: "price_commitment_request",
    message: "皮秒可以先報死價嗎？",
  },
  {
    expectedDecisionType: "handoff_pending",
    expectedMatchedKey: "personalized_consult",
    message: "我適合做哪個療程？",
  },
  {
    expectedDecisionType: "handoff_pending",
    expectedMatchedKey: "customer_account_lookup",
    message: "我要查詢我的會員紀錄",
  },
  {
    conversationContext: {
      bookingDraft: {
        branch: "高雄館",
        timeSlots: ["7/5 13:30"],
        treatment: "十蓓電波",
      },
      introSent: false,
      lastIntent: "booking_intake",
      userId: "validate-booking-followup",
    },
    expectedDecisionType: "booking_intake_reply",
    expectedMatchedKey: "booking_intake",
    message: "我是初診，我叫 Ivan，電話 0912345678",
  },
  {
    conversationContext: {
      bookingDraft: {
        branch: "高雄館",
        timeSlots: ["7/5 13:30"],
        treatment: "十蓓電波",
      },
      introSent: false,
      lastIntent: "booking_intake",
      userId: "validate-booking-detour",
    },
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_brand:tenthermage",
    message: "眼周電波有嗎？什麼牌子",
    replyIncludes: ["十蓓電波", "眼周探頭"],
  },
  {
    conversationContext: {
      bookingDraft: {
        branch: "桃園館",
        timeSlots: ["這週五 13:00", "下周二 16:00", "下下禮拜 15:00"],
      },
      introSent: false,
      lastIntent: "booking_intake",
      userId: "validate-booking-treatment-followup",
    },
    expectedDecisionType: "booking_intake_reply",
    expectedMatchedKey: "booking_intake",
    message: "肉毒",
    replyIncludes: ["想了解的療程先記為 肉毒", "館別先記為 桃園館", "這週五 13:00", "聯絡電話"],
    replyExcludes: ["肉毒通常會拿來討論"],
  },
  {
    conversationContext: {
      bookingDraft: {
        branch: "高雄館",
        name: "Ivan",
        phone: "0912345678",
        timeSlots: ["7/5 13:30"],
        treatment: "十蓓電波",
      },
      introSent: false,
      lastIntent: "booking_intake",
      userId: "validate-booking-modify",
    },
    expectedDecisionType: "booking_intake_reply",
    expectedMatchedKey: "booking_modify_request",
    message: "我想改約",
    replyIncludes: ["改約需求", "高雄館", "十蓓電波"],
  },
  {
    conversationContext: {
      bookingDraft: {
        branch: "高雄館",
        name: "Ivan",
        phone: "0912345678",
        timeSlots: ["7/5 13:30"],
        treatment: "十蓓電波",
      },
      introSent: false,
      lastIntent: "booking_modify_request",
      userId: "validate-booking-modify-followup",
    },
    expectedDecisionType: "booking_intake_reply",
    expectedMatchedKey: "booking_modify_request",
    message: "改成 7/8 下午或 7/9 晚上",
    replyIncludes: ["更新目前的預約資訊", "希望改成的時段先記為 改成 7/8 下午或 7/9 晚上"],
  },
  {
    conversationContext: {
      bookingDraft: {
        branch: "高雄館",
        name: "Ivan",
        phone: "0912345678",
        timeSlots: ["7/5 13:30"],
        treatment: "十蓓電波",
      },
      introSent: false,
      lastIntent: "booking_intake",
      userId: "validate-booking-cancel",
    },
    expectedDecisionType: "booking_intake_reply",
    expectedMatchedKey: "booking_cancel_request",
    message: "我要取消預約",
    replyIncludes: ["取消預約需求", "高雄館", "Ivan"],
  },
  {
    expectedDecisionType: "clinic_info_reply",
    expectedMatchedKey: "branch_focus:桃園館",
    message: "桃園館呢",
    replyIncludes: ["桃園館", "1247"],
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "concern:jawline_looseness",
    message: "我想改善嘴邊肉",
    replyIncludes: ["嘴邊肉", "ONDA", "醫師評估"],
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "concern:dynamic_wrinkles",
    message: "我想解決魚尾紋",
    replyIncludes: ["魚尾紋", "肉毒", "動態紋路", "醫師現場評估"],
    replyExcludes: ["我可以先幫您整理館別資訊"],
  },
  {
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "concern:pores_texture",
    message: "我想改善膚質",
    replyIncludes: ["膚質", "醫師評估"],
  },
  {
    conversationContext: {
      bookingDraft: {
        branch: "桃園館",
        isFirstVisit: "yes",
        name: "Ivan",
        phone: "0912345678",
        timeSlots: ["這週五 13:00", "下周二 16:00", "下下禮拜 15:00"],
        treatment: "肉毒",
      },
      introSent: false,
      lastIntent: "booking_intake",
      userId: "validate-booking-branch-change",
    },
    expectedDecisionType: "booking_intake_reply",
    expectedMatchedKey: "booking_intake",
    message: "我想改高雄館",
    replyIncludes: ["高雄館", "0912345678"],
  },
  {
    conversationContext: {
      bookingDraft: {
        branch: "高雄館",
        isFirstVisit: "yes",
        name: "Ivan",
        phone: "0912345678",
        timeSlots: ["7/5 13:30"],
        treatment: "十蓓電波",
      },
      introSent: false,
      lastIntent: "booking_intake",
      userId: "validate-booking-add-treatment",
    },
    expectedDecisionType: "booking_intake_reply",
    expectedMatchedKey: "booking_intake",
    message: "那我還想打肉毒小臉",
    replyIncludes: ["十蓓電波", "肉毒"],
  },
];

TEST_CASES.push({
  conversationContext: {
    bookingDraft: {
      timeSlots: [],
      treatment: "肉毒",
    },
    introSent: false,
    lastIntent: "human_request",
    userId: "validate-human-handoff-booking-form",
  },
  expectedDecisionType: "booking_intake_reply",
  expectedMatchedKey: "booking_intake",
  message: "療程：肉毒\n館別：高雄館\n時段：07/18 15:00\n稱呼：IVAN\n電話：0981234567",
  replyExcludes: ["目前可先為您整理的館別有"],
  replyIncludes: ["想了解的療程先記為 肉毒", "館別先記為 高雄館", "姓名先記為 IVAN", "聯絡電話先記為 0981234567"],
});

TEST_CASES.push({
  conversationContext: {
    bookingDraft: {
      timeSlots: [],
    },
    introSent: false,
    lastIntent: "human_request",
    userId: "validate-human-handoff-freetext-booking",
  },
  expectedDecisionType: "booking_intake_reply",
  expectedMatchedKey: "booking_intake",
  message: "我想打肉毒，高雄館，IVAN，0981234567，07/18下午3点",
  replyExcludes: ["目前可先為您整理的館別有", "肉毒通常會拿來討論"],
  replyIncludes: ["想了解的療程先記為 肉毒", "館別先記為 高雄館", "聯絡電話先記為 0981234567"],
});

TEST_CASES.push({
  conversationContext: {
    bookingDraft: {
      timeSlots: [],
    },
    introSent: false,
    lastIntent: "human_request",
    userId: "validate-human-handoff-freetext-partial",
  },
  expectedDecisionType: "booking_intake_reply",
  expectedMatchedKey: "booking_intake",
  message: "高雄館 肉毒",
  replyExcludes: ["目前可先為您整理的館別有", "肉毒通常會拿來討論"],
  replyIncludes: ["想了解的療程先記為 肉毒", "館別先記為 高雄館", "聯絡電話"],
});

TEST_CASES.push({
  conversationContext: {
    bookingDraft: {
      timeSlots: [],
    },
    introSent: false,
    lastIntent: "human_request",
    userId: "validate-human-handoff-price-question",
  },
  expectedDecisionType: "pricing_auto_reply",
  expectedMatchedKey: "肉毒除皺",
  message: "肉毒多少錢？",
  replyExcludes: ["聯絡電話", "想了解的療程先記為"],
  replyIncludes: ["肉毒除皺", "999"],
});

TEST_CASES.push({
  conversationContext: {
    bookingDraft: {
      timeSlots: [],
    },
    introSent: false,
    lastIntent: "human_request",
    userId: "validate-human-handoff-complaint-priority",
  },
  expectedDecisionType: "handoff_pending",
  expectedMatchedKey: "serious_complaint",
  message: "肉毒服務很差我要求退款",
  replyExcludes: ["方便時段", "聯絡電話"],
  replyIncludes: ["真人客服"],
});

TEST_CASES.push({
  conversationContext: {
    bookingDraft: {
      timeSlots: [],
    },
    introSent: false,
    lastIntent: "human_request",
    userId: "validate-human-handoff-safety-priority",
  },
  expectedDecisionType: "handoff_pending",
  expectedMatchedKey: "human_request",
  message: "肉毒出了問題，我要真人客服",
  replyExcludes: ["方便時段", "聯絡電話"],
  replyIncludes: ["真人客服"],
});

TEST_CASES.push({
  expectedDecisionType: "clinic_info_reply",
  expectedMatchedKey: "branch_address:高雄館",
  message: "高雄館在哪",
});

TEST_CASES.push({
  expectedDecisionType: "booking_intake_reply",
  expectedMatchedKey: "booking_intake",
  message: "我想預約謝醫師",
  replyExcludes: ["門診時間如下"],
  replyIncludes: ["方便時段"],
});

TEST_CASES.push({
  expectedDecisionType: "medical_guidance_reply",
  expectedMatchedKey: "pregnancy_caution",
  message: "我懷孕了，想知道王醫師本週看診時間",
  replyExcludes: ["門診時間如下", "以下為目前公告的"],
});

TEST_CASES.push({
  conversationContext: {
    bookingDraft: {
      timeSlots: [],
    },
    introSent: false,
    lastIntent: "human_request",
    userId: "validate-human-handoff-freetext-clinic-info",
  },
  expectedDecisionType: "clinic_info_reply",
  expectedMatchedKey: "branch_address:高雄館",
  message: "高雄館在哪",
});

TEST_CASES.push({
  expectedDecisionType: "treatment_intro_reply",
  expectedMatchedKey: "treatment_intro:botox",
  message: "肉毒是什麼",
  replyExcludes: ["聯絡電話先記為"],
});

TEST_CASES.push({
  conversationContext: {
    bookingDraft: {
      timeSlots: [],
    },
    introSent: false,
    lastIntent: "human_request",
    userId: "validate-human-handoff-freetext-treatment-info",
  },
  expectedDecisionType: "treatment_intro_reply",
  expectedMatchedKey: "treatment_intro:botox",
  message: "肉毒是什麼",
  replyExcludes: ["聯絡電話先記為"],
});

function validateScheduleMonthReplies() {
  const assets = ["高雄館", "台中館", "桃園館", "林口館"].map((branch) => ({
    branch,
    original_content_url: `https://example.com/${encodeURIComponent(branch)}-original.jpg`,
    preview_image_url: `https://example.com/${encodeURIComponent(branch)}-preview.jpg`,
  }));
  const rows = [
    { branch: "高雄館", doctor_name: "陳醫師", schedule_date: "2026-07-18", status: "available", time_slot: "13:00-18:00" },
    { branch: "台中館", doctor_name: "王醫師", schedule_date: "2026-07-18", status: "available", time_slot: "13:00-18:00" },
    { branch: "桃園館", doctor_name: "林醫師", schedule_date: "2026-07-18", status: "available", time_slot: "13:00-18:00" },
    { branch: "林口館", doctor_name: "謝醫師", schedule_date: "2026-07-18", status: "available", time_slot: "13:00-18:00" },
  ];
  const cases = [
    { expectedKey: "doctor_schedule_image:高雄館:2026-07", message: "請傳高雄館本月門診表", sendsImage: true },
    { expectedKey: "doctor_schedule_image:台中館:2026-07", message: "台中館醫師班表", sendsImage: true },
    { expectedKey: "doctor_schedule_image:桃園館:2026-07", message: "桃園館診次表", sendsImage: true },
    { expectedKey: "doctor_schedule_found:謝醫師:2026-07", message: "林口館謝醫師哪天看診", sendsImage: false },
  ];
  return cases.flatMap((testCase) => [true, false].map((published) => {
    const result = resolvePublishedScheduleForValidation({ assets, message: testCase.message, published, rows, sourceMonth: "2026-07" });
    return {
      expectedKey: published ? testCase.expectedKey : "doctor_schedule_unpublished:2026-07",
      kind: published ? "schedule-published" : "schedule-unpublished",
      message: testCase.message,
      passed: result.matchedKey === (published ? testCase.expectedKey : "doctor_schedule_unpublished:2026-07") && (result.replyMessages?.length ?? 0) === (published && testCase.sendsImage ? 1 : 0),
      result,
    };
  }));
}

async function main() {
  const results = [];

  for (const testCase of TEST_CASES) {
    const result = await routeCustomerMessage({
      conversationContext: testCase.conversationContext,
      includePending: false,
      message: testCase.message,
      now: VALIDATION_NOW,
    });

    results.push({
      expectedDecisionType: testCase.expectedDecisionType,
      expectedMatchedKey: testCase.expectedMatchedKey,
      message: testCase.message,
      passed:
        result.decisionType === testCase.expectedDecisionType &&
        result.matchedKey === testCase.expectedMatchedKey &&
        (typeof testCase.expectedReplyMessageCount === "number"
          ? (result.replyMessages?.length ?? 0) === testCase.expectedReplyMessageCount
          : true) &&
        (testCase.replyIncludes ? testCase.replyIncludes.every((fragment) => result.replyText.includes(fragment)) : true) &&
        (testCase.replyExcludes ? testCase.replyExcludes.every((fragment) => !result.replyText.includes(fragment)) : true),
      result,
    });
  }

  const schedulePhraseResult = await routeCustomerMessage({
    includePending: false,
    message: "我是要看高雄的本月診表",
    now: VALIDATION_NOW,
  });
  results.push({
    expectedDecisionType: "doctor_schedule_auto_reply",
    expectedMatchedType: "doctor_schedule",
    message: "我是要看高雄的本月診表",
    passed: schedulePhraseResult.decisionType === "doctor_schedule_auto_reply" && schedulePhraseResult.matchedType === "doctor_schedule",
    result: schedulePhraseResult,
  });

  const bookingScheduleQuestionResult = await routeCustomerMessage({
    conversationContext: {
      bookingDraft: {
        branch: "\u9ad8\u96c4\u9928",
        name: "Ivan",
        phone: "0912345678",
        timeSlots: ["7/5 13:30"],
        treatment: "\u8089\u6bd2",
      },
      introSent: false,
      lastIntent: "booking_intake",
      userId: "validate-booking-schedule-question",
    },
    includePending: false,
    message: "\u6211\u60f3\u4e86\u89e3\u9ad8\u96c4\u9928\u8a3a\u6b21",
    now: VALIDATION_NOW,
  });
  results.push({
    expectedDecisionType: "doctor_schedule_auto_reply",
    expectedMatchedType: "doctor_schedule",
    message: "booking-context schedule question",
    passed:
      bookingScheduleQuestionResult.decisionType === "doctor_schedule_auto_reply" &&
      bookingScheduleQuestionResult.matchedType === "doctor_schedule",
    result: bookingScheduleQuestionResult,
  });

  const scheduleResults = validateScheduleMonthReplies();

  console.log(JSON.stringify({ router: results, scheduleMonth: scheduleResults }, null, 2));

  if (results.some((result) => !result.passed) || scheduleResults.some((result) => !result.passed)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
