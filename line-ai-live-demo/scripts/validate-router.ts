import type { ConversationContext } from "../src/lib/conversation-context";
import { routeCustomerMessage } from "../src/lib/router";

type TestCase = {
  conversationContext?: ConversationContext;
  expectedDecisionType: string;
  expectedMatchedKey: string;
  message: string;
  replyExcludes?: string[];
  replyIncludes?: string[];
};

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
    expectedDecisionType: "treatment_intro_reply",
    expectedMatchedKey: "treatment_carousel",
    message: "有哪些熱門療程",
    replyIncludes: ["熱門療程"],
  },
  {
    expectedDecisionType: "medical_guidance_reply",
    expectedMatchedKey: "pregnancy_caution",
    message: "孕婦適合皮秒嗎？",
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
    expectedMatchedKey: "pricing_followup",
    message: "皮秒多少錢？",
    replyIncludes: ["價格會依療程部位", "客服上班後再協助確認目前方案"],
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
    replyIncludes: ["改約需求", "7/8 下午或 7/9 晚上"],
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
];

async function main() {
  const results = [];

  for (const testCase of TEST_CASES) {
    const result = await routeCustomerMessage({
      conversationContext: testCase.conversationContext,
      includePending: false,
      message: testCase.message,
    });

    results.push({
      expectedDecisionType: testCase.expectedDecisionType,
      expectedMatchedKey: testCase.expectedMatchedKey,
      message: testCase.message,
      passed:
        result.decisionType === testCase.expectedDecisionType &&
        result.matchedKey === testCase.expectedMatchedKey &&
        (testCase.replyIncludes ? testCase.replyIncludes.every((fragment) => result.replyText.includes(fragment)) : true) &&
        (testCase.replyExcludes ? testCase.replyExcludes.every((fragment) => !result.replyText.includes(fragment)) : true),
      result,
    });
  }

  console.log(JSON.stringify(results, null, 2));

  if (results.some((result) => !result.passed)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
