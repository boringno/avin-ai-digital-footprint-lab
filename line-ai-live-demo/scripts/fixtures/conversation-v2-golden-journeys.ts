import type {
  AwaitingOption,
  BookingField,
  BookingIntent,
  ControlMode,
  TurnSpeechAct,
} from "../../src/lib/conversation-v2/types";
import type {
  ConversationMove,
  DialogueReference,
  QuestionAspect,
} from "../../src/lib/dialogue-semantics";

/**
 * Human-labelled semantics for the V2 NLU contract.
 *
 * These four axes deliberately make
 * the missing semantics visible instead of hiding them in raw text or regexes.
 * They should eventually be first-class NLU output, because a policy/renderer
 * cannot reliably distinguish a first introduction from a follow-up, a
 * correction, or an objection from treatment names alone.
 */
export type GoldenTurnSemantics = {
  conversationMove: ConversationMove;
  dialogueReference: DialogueReference;
  questionAspect?: QuestionAspect;
};

export type GoldenBookingInput = {
  explicit: boolean;
  fields?: {
    appointmentReference?: string;
    branch?: string;
    changeRequest?: string;
    firstVisit?: boolean;
    name?: string;
    phone?: string;
    timeSlots?: string[];
    treatmentKeys?: string[];
  };
  intent: BookingIntent;
};

export type GoldenClarificationInput = {
  allowMultiple: boolean;
  options: AwaitingOption[];
  prompt: string;
  slot: "area" | "concern" | "treatment";
};

export type GoldenTurnInput = {
  areas?: string[];
  booking?: GoldenBookingInput;
  clarification?: GoldenClarificationInput;
  confidence?: number;
  concerns?: string[];
  negatedAreas?: string[];
  negatedConcerns?: string[];
  negatedTreatments?: string[];
  selection?:
    | { mode: "all" }
    | { indexes: number[]; mode: "indexes" }
    | { keys: string[]; mode: "keys" };
  semantics: GoldenTurnSemantics;
  speechAct: TurnSpeechAct;
  text: string;
  treatments?: string[];
  turnId?: string;
};

export type GoldenStepExpectation = {
  action: string | null;
  activeTaskKind?: string;
  activeSubjectKey?: string;
  booking?: {
    draftIncludes?: {
      appointmentReference?: string;
      branch?: string;
      changeRequest?: string;
      firstVisit?: boolean;
      name?: string;
      phone?: string;
      timeSlots?: string[];
      treatmentKeys?: string[];
    };
    expectedField?: BookingField | null;
    intent?: BookingIntent;
    status?: "inactive" | "collecting" | "suspended" | "completed";
  };
  controlMode?: ControlMode;
  clinicTopic?: "branches" | "address" | "hours" | "doctor_schedule" | "contact" | "booking_policy" | "unknown";
  dialogueAct?: string;
  duplicate?: boolean;
  knowledge?: {
    areaKeys?: string[];
    concernKeys?: string[];
    excludesTreatments?: string[];
    treatmentKeys?: string[];
  };
  preferenceExcludesTreatments?: string[];
  preferenceAllowsTreatments?: string[];
  pricingSubjectTreatmentKeys?: string[];
  replyKnowledgeTreatmentKeys?: string[];
  responseExcludesTreatments?: string[];
  treatmentApproach?: "single" | "unspecified";
  priceTreatmentKeys?: string[];
  priceKind?: "campaign" | "regular" | "unspecified";
  revisionDelta?: 0 | 1;
};

export type GoldenJourneyTurn = GoldenTurnInput & {
  expect: GoldenStepExpectation;
};

export type GoldenJourneySeed = {
  activeTask?: {
    kind: "idle" | "learn_treatment" | "compare_treatments" | "answer_concern" | "pricing" | "clinic_info" | "booking" | "safety";
    subjectKey?: string;
  };
  controlMode?: ControlMode;
  knowledge?: {
    areaKeys?: string[];
    concernKeys?: string[];
    treatmentKeys?: string[];
  };
};

export type GoldenJourney = {
  id: string;
  seed?: GoldenJourneySeed;
  title: string;
  turns: GoldenJourneyTurn[];
};

const treatmentOption = (id: string, label: string, value: string): AwaitingOption => ({
  entity: "treatment",
  id,
  label,
  value,
});

const concernOption = (id: string, label: string, value: string): AwaitingOption => ({
  entity: "concern",
  id,
  label,
  value,
});

export const CONVERSATION_V2_GOLDEN_JOURNEYS: GoldenJourney[] = [
  {
    id: "G01",
    title: "首次了解後承接療程細節，不重啟首輪介紹",
    turns: [
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "想了解 ONDA",
        treatments: ["onda_pro"],
        expect: {
          action: "learn_treatment",
          activeTaskKind: "learn_treatment",
          activeSubjectKey: "treatment:onda_pro",
          dialogueAct: "introduce_treatment",
          knowledge: { treatmentKeys: ["onda_pro"] },
        },
      },
      {
        semantics: { questionAspect: "mechanism", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_treatment_detail",
        text: "它是怎麼作用的？",
        expect: {
          action: "learn_treatment",
          activeTaskKind: "learn_treatment",
          activeSubjectKey: "treatment:onda_pro",
          dialogueAct: "answer_followup",
          knowledge: { treatmentKeys: ["onda_pro"] },
        },
      },
    ],
  },
  {
    id: "G02",
    title: "困擾優先探索後承接改善方向",
    turns: [
      {
        areas: ["jawline"],
        concerns: ["jawline_looseness"],
        semantics: { conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "ask_concern",
        text: "我在意雙下巴",
        expect: {
          action: "learn_treatment",
          activeTaskKind: "answer_concern",
          dialogueAct: "recommend_direction",
          knowledge: { areaKeys: ["jawline"], concernKeys: ["jawline_looseness"] },
        },
      },
      {
        semantics: { questionAspect: "suitability", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_treatment_detail",
        text: "那我適合哪個方向？",
        expect: {
          action: "learn_treatment",
          activeTaskKind: "answer_concern",
          dialogueAct: "answer_followup",
          knowledge: { areaKeys: ["jawline"], concernKeys: ["jawline_looseness"] },
        },
      },
    ],
  },
  {
    id: "G03",
    title: "明確改口時替換療程主題",
    turns: [
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "想了解 ONDA",
        treatments: ["onda_pro"],
        expect: { action: "learn_treatment", knowledge: { treatmentKeys: ["onda_pro"] } },
      },
      {
        semantics: { questionAspect: "overview", conversationMove: "replace", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "我改問肉毒",
        treatments: ["botox"],
        expect: {
          action: "learn_treatment",
          activeSubjectKey: "treatment:botox",
          knowledge: { excludesTreatments: ["onda_pro"], treatmentKeys: ["botox"] },
        },
      },
      {
        semantics: { questionAspect: "benefits", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_treatment_detail",
        text: "皺眉紋呢？",
        areas: ["face"],
        concerns: ["dynamic_wrinkles"],
        expect: {
          action: "learn_treatment",
          dialogueAct: "answer_followup",
          knowledge: { concernKeys: ["dynamic_wrinkles"], treatmentKeys: ["botox"] },
        },
      },
    ],
  },
  {
    id: "G04",
    title: "兩個明確療程直接比較",
    turns: [
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "想了解 ONDA",
        treatments: ["onda_pro"],
        expect: { action: "learn_treatment", knowledge: { treatmentKeys: ["onda_pro"] } },
      },
      {
        semantics: { questionAspect: "single_vs_combination", conversationMove: "compare", dialogueReference: "explicit" },
        speechAct: "compare_treatments",
        text: "ONDA 跟肉毒差在哪？",
        treatments: ["onda_pro", "botox"],
        expect: {
          action: "learn_treatment",
          activeTaskKind: "compare_treatments",
          activeSubjectKey: "comparison:botox+onda_pro",
          dialogueAct: "compare_options",
          knowledge: { treatmentKeys: ["onda_pro", "botox"] },
        },
      },
      {
        semantics: { questionAspect: "single_vs_combination", conversationMove: "reject", dialogueReference: "active_comparison" },
        speechAct: "ask_treatment_detail",
        text: "不要這個",
        expect: {
          action: "fallback_clarify",
          dialogueAct: "clarify",
          knowledge: { treatmentKeys: ["onda_pro", "botox"] },
        },
      },
    ],
  },
  {
    id: "G05",
    title: "比較新療程與目前主題",
    turns: [
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "想了解 ONDA",
        treatments: ["onda_pro"],
        expect: { action: "learn_treatment", knowledge: { treatmentKeys: ["onda_pro"] } },
      },
      {
        semantics: { questionAspect: "single_vs_combination", conversationMove: "compare", dialogueReference: "active_subject" },
        speechAct: "compare_treatments",
        text: "那跟肉毒有什麼不同？",
        treatments: ["botox"],
        expect: {
          action: "learn_treatment",
          activeTaskKind: "compare_treatments",
          dialogueAct: "compare_options",
          knowledge: { treatmentKeys: ["onda_pro", "botox"] },
        },
      },
    ],
  },
  {
    id: "G06",
    title: "詢問搭配理由時直接回答差異",
    turns: [
      {
        semantics: { questionAspect: "general_difference", conversationMove: "compare", dialogueReference: "explicit" },
        speechAct: "compare_treatments",
        text: "想了解 ONDA 加肉毒",
        treatments: ["onda_pro", "botox"],
        expect: {
          action: "learn_treatment",
          activeTaskKind: "compare_treatments",
          dialogueAct: "compare_options",
          knowledge: { treatmentKeys: ["onda_pro", "botox"] },
        },
      },
      {
        semantics: { questionAspect: "combination_reason", conversationMove: "continue", dialogueReference: "active_comparison" },
        speechAct: "ask_treatment_detail",
        text: "為什麼要一起做？",
        expect: {
          action: "learn_treatment",
          activeTaskKind: "compare_treatments",
          dialogueAct: "compare_options",
          knowledge: { treatmentKeys: ["onda_pro", "botox"] },
        },
      },
    ],
  },
  {
    id: "G07",
    title: "偏好單做時保留主療程且不再推搭配",
    turns: [
      {
        semantics: { questionAspect: "single_vs_combination", conversationMove: "compare", dialogueReference: "explicit" },
        speechAct: "compare_treatments",
        text: "ONDA 搭肉毒呢？",
        treatments: ["onda_pro", "botox"],
        expect: { action: "learn_treatment", knowledge: { treatmentKeys: ["onda_pro", "botox"] } },
      },
      {
        negatedTreatments: ["botox"],
        semantics: { questionAspect: "single_vs_combination", conversationMove: "prefer_single", dialogueReference: "explicit" },
        speechAct: "ask_treatment_detail",
        text: "我只想做 ONDA",
        treatments: ["onda_pro"],
        expect: {
          action: "learn_treatment",
          activeSubjectKey: "treatment:onda_pro",
          dialogueAct: "address_objection",
          knowledge: { excludesTreatments: ["botox"], treatmentKeys: ["onda_pro"] },
          preferenceExcludesTreatments: ["botox"],
          replyKnowledgeTreatmentKeys: ["onda_pro", "botox"],
        },
      },
      {
        semantics: { questionAspect: "benefits", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_treatment_detail",
        text: "那單做的效果方向呢？",
        expect: {
          action: "learn_treatment",
          dialogueAct: "answer_followup",
          knowledge: { excludesTreatments: ["botox"], treatmentKeys: ["onda_pro"] },
          preferenceExcludesTreatments: ["botox"],
          responseExcludesTreatments: ["botox"],
          treatmentApproach: "single",
        },
      },
    ],
  },
  {
    id: "G08",
    title: "拒絕搭配選項不等於拒絕整段諮詢",
    turns: [
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "想了解 ONDA",
        treatments: ["onda_pro"],
        expect: { action: "learn_treatment", knowledge: { treatmentKeys: ["onda_pro"] } },
      },
      {
        negatedTreatments: ["botox"],
        semantics: { conversationMove: "reject", dialogueReference: "active_subject" },
        speechAct: "ask_treatment_detail",
        text: "那我不要肉毒",
        expect: {
          action: "learn_treatment",
          dialogueAct: "address_objection",
          knowledge: { excludesTreatments: ["botox"], treatmentKeys: ["onda_pro"] },
          preferenceExcludesTreatments: ["botox"],
        },
      },
      {
        semantics: { questionAspect: "overview", conversationMove: "replace", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "改成想了解肉毒",
        treatments: ["botox"],
        expect: {
          action: "learn_treatment",
          knowledge: { treatmentKeys: ["botox"] },
          preferenceAllowsTreatments: ["botox"],
        },
      },
      {
        semantics: { questionAspect: "overview", conversationMove: "reject", dialogueReference: "active_subject" },
        speechAct: "ask_treatment_detail",
        text: "不要這個",
        expect: {
          action: "learn_treatment",
          dialogueAct: "address_objection",
          knowledge: { excludesTreatments: ["botox"], treatmentKeys: [] },
          preferenceExcludesTreatments: ["botox"],
          replyKnowledgeTreatmentKeys: ["botox"],
        },
      },
    ],
  },
  {
    id: "G09",
    title: "指代價格沿用目前療程",
    turns: [
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "想了解肉毒",
        treatments: ["botox"],
        expect: { action: "learn_treatment", knowledge: { treatmentKeys: ["botox"] } },
      },
      {
        semantics: { questionAspect: "price_unspecified", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_price",
        text: "那價格呢？",
        expect: {
          action: "answer_price",
          dialogueAct: "answer_price",
          priceTreatmentKeys: ["botox"],
          pricingSubjectTreatmentKeys: ["botox"],
          knowledge: { treatmentKeys: ["botox"] },
        },
      },
      {
        semantics: { questionAspect: "price_unspecified", conversationMove: "continue", dialogueReference: "unresolved" },
        speechAct: "ask_price",
        text: "那個多少錢？",
        expect: {
          action: "fallback_clarify",
          dialogueAct: "clarify",
          pricingSubjectTreatmentKeys: ["botox"],
        },
      },
    ],
  },
  {
    id: "G10",
    title: "明確價格主詞優先於舊療程",
    turns: [
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "想了解 ONDA",
        treatments: ["onda_pro"],
        expect: { action: "learn_treatment", knowledge: { treatmentKeys: ["onda_pro"] } },
      },
      {
        semantics: { questionAspect: "price_unspecified", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "ask_price",
        text: "肉毒價錢呢？",
        treatments: ["botox"],
        expect: {
          action: "answer_price",
          priceKind: "unspecified",
          priceTreatmentKeys: ["botox"],
          pricingSubjectTreatmentKeys: ["botox"],
        },
      },
      {
        semantics: { questionAspect: "benefits", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_treatment_detail",
        text: "那效果呢？",
        expect: {
          action: "learn_treatment",
          activeSubjectKey: "treatment:botox",
          dialogueAct: "answer_followup",
          knowledge: { treatmentKeys: ["botox"] },
          replyKnowledgeTreatmentKeys: ["botox"],
        },
      },
      {
        semantics: { questionAspect: "general_difference", conversationMove: "compare", dialogueReference: "active_subject" },
        speechAct: "compare_treatments",
        text: "那跟皮秒差在哪？",
        treatments: ["pico"],
        expect: {
          action: "learn_treatment",
          activeSubjectKey: "comparison:botox+pico",
          dialogueAct: "compare_options",
          knowledge: { treatmentKeys: ["botox", "pico"] },
          replyKnowledgeTreatmentKeys: ["botox", "pico"],
        },
      },
      {
        negatedTreatments: ["botox"],
        semantics: { questionAspect: "price_unspecified", conversationMove: "reject", dialogueReference: "explicit" },
        speechAct: "ask_price",
        text: "不要肉毒，ONDA 價格呢？",
        treatments: ["onda_pro"],
        expect: {
          action: "answer_price",
          knowledge: { excludesTreatments: ["botox"] },
          preferenceExcludesTreatments: ["botox"],
          priceTreatmentKeys: ["onda_pro"],
          pricingSubjectTreatmentKeys: ["onda_pro"],
        },
      },
    ],
  },
  {
    id: "G11",
    title: "多困擾不能先到先贏而遺失另一項",
    turns: [
      {
        areas: ["jawline", "abdomen"],
        concerns: ["jawline_looseness", "local_contour"],
        semantics: { conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "ask_concern",
        text: "肚子跟雙下巴都在意",
        expect: {
          action: "learn_treatment",
          activeTaskKind: "answer_concern",
          knowledge: {
            areaKeys: ["jawline", "abdomen"],
            concernKeys: ["jawline_looseness", "local_contour"],
          },
        },
      },
      {
        semantics: { questionAspect: "suitability", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_treatment_detail",
        text: "這兩個可以一起評估嗎？",
        expect: {
          action: "learn_treatment",
          dialogueAct: "answer_followup",
          knowledge: { concernKeys: ["jawline_looseness", "local_contour"] },
        },
      },
    ],
  },
  {
    id: "G12",
    title: "改變困擾時替換舊主題而非累加污染",
    turns: [
      {
        areas: ["jawline"],
        concerns: ["jawline_looseness"],
        semantics: { conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "ask_concern",
        text: "我在意雙下巴",
        expect: { action: "learn_treatment", knowledge: { concernKeys: ["jawline_looseness"] } },
      },
      {
        areas: ["abdomen"],
        concerns: ["local_contour"],
        semantics: { conversationMove: "replace", dialogueReference: "explicit" },
        speechAct: "ask_concern",
        text: "其實主要是肚子",
        expect: {
          action: "learn_treatment",
          activeSubjectKey: "concern:abdomen+local_contour",
          knowledge: { areaKeys: ["abdomen"], concernKeys: ["local_contour"] },
        },
      },
    ],
  },
  {
    id: "G13",
    title: "否定疑問不是否定需求",
    turns: [
      {
        areas: ["jawline"],
        concerns: ["jawline_looseness"],
        semantics: { conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "ask_concern",
        text: "我在意雙下巴",
        expect: { action: "learn_treatment", knowledge: { concernKeys: ["jawline_looseness"] } },
      },
      {
        areas: ["abdomen"],
        concerns: ["local_contour"],
        semantics: { conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_concern",
        text: "ONDA 不是也可以改善肚子嗎？",
        treatments: ["onda_pro"],
        expect: {
          action: "learn_treatment",
          knowledge: { concernKeys: ["jawline_looseness", "local_contour"], treatmentKeys: ["onda_pro"] },
        },
      },
    ],
  },
  {
    id: "G14",
    title: "模糊療程先澄清再承接選項",
    turns: [
      {
        clarification: {
          allowMultiple: false,
          options: [
            treatmentOption("onda", "ONDA Pro", "onda_pro"),
            treatmentOption("botox", "肉毒", "botox"),
          ],
          prompt: "想了解 ONDA Pro 還是肉毒呢？",
          slot: "treatment",
        },
        semantics: { conversationMove: "none", dialogueReference: "none" },
        speechAct: "unknown",
        text: "想改善輪廓",
        expect: { action: "clarify", dialogueAct: "clarify" },
      },
      {
        selection: { indexes: [1], mode: "indexes" },
        semantics: { conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "select_options",
        text: "1",
        expect: {
          action: "answer_selection",
          dialogueAct: "answer_followup",
          knowledge: { treatmentKeys: ["onda_pro"] },
        },
      },
    ],
  },
  {
    id: "G15",
    title: "多選困擾完整保留",
    turns: [
      {
        clarification: {
          allowMultiple: true,
          options: [
            concernOption("jawline", "雙下巴／輪廓", "jawline_looseness"),
            concernOption("contour", "局部脂肪", "local_contour"),
          ],
          prompt: "比較在意哪幾項？",
          slot: "concern",
        },
        semantics: { conversationMove: "none", dialogueReference: "none" },
        speechAct: "unknown",
        text: "我有幾個問題",
        expect: { action: "clarify" },
      },
      {
        selection: { mode: "all" },
        semantics: { conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "select_options",
        text: "都想了解",
        expect: {
          action: "answer_selection",
          knowledge: { concernKeys: ["jawline_looseness", "local_contour"] },
        },
      },
    ],
  },
  {
    id: "G16",
    title: "明確預約才啟動收集且沿用當前療程",
    turns: [
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "想了解 ONDA",
        treatments: ["onda_pro"],
        expect: { action: "learn_treatment", booking: { status: "inactive" }, knowledge: { treatmentKeys: ["onda_pro"] } },
      },
      {
        booking: { explicit: true, intent: "create" },
        semantics: { questionAspect: "booking_policy", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "book_consultation",
        text: "好，我要預約諮詢",
        expect: {
          action: "start_booking",
          activeTaskKind: "booking",
          booking: {
            draftIncludes: { treatmentKeys: ["onda_pro"] },
            expectedField: "branch",
            intent: "create",
            status: "collecting",
          },
        },
      },
      {
        semantics: { questionAspect: "overview", conversationMove: "reject", dialogueReference: "active_subject" },
        speechAct: "ask_treatment_detail",
        text: "不要這個",
        expect: {
          action: "learn_treatment",
          booking: {
            draftIncludes: { treatmentKeys: [] },
            expectedField: "treatment",
            status: "suspended",
          },
          dialogueAct: "address_objection",
          preferenceExcludesTreatments: ["onda_pro"],
        },
      },
      {
        booking: { explicit: false, fields: { branch: "高雄館" }, intent: "none" },
        semantics: { questionAspect: "booking_policy", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "provide_booking_field",
        text: "高雄館",
        expect: {
          action: "fallback_clarify",
          booking: {
            draftIncludes: { treatmentKeys: [] },
            expectedField: "treatment",
            status: "suspended",
          },
        },
      },
    ],
  },
  {
    id: "G17",
    title: "新預約依固定欄位順序完整收集",
    turns: [
      {
        booking: { explicit: true, fields: { treatmentKeys: ["botox"] }, intent: "create" },
        semantics: { questionAspect: "booking_policy", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "book_consultation",
        text: "我要預約肉毒",
        treatments: ["botox"],
        expect: { action: "start_booking", booking: { expectedField: "branch", intent: "create", status: "collecting" } },
      },
      {
        booking: { explicit: false, fields: { branch: "高雄館" }, intent: "none" },
        semantics: { questionAspect: "booking_policy", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "provide_booking_field",
        text: "高雄館",
        expect: { action: "capture_booking_fields", booking: { draftIncludes: { branch: "高雄館" }, expectedField: "time_slots" } },
      },
      {
        booking: { explicit: false, fields: { timeSlots: ["平日下午", "假日上午", "週三晚上"] }, intent: "none" },
        semantics: { questionAspect: "booking_policy", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "provide_booking_field",
        text: "平日下午、假日上午、週三晚上",
        expect: { action: "capture_booking_fields", booking: { expectedField: "first_visit" } },
      },
      {
        booking: { explicit: false, fields: { firstVisit: true }, intent: "none" },
        semantics: { questionAspect: "booking_policy", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "provide_booking_field",
        text: "初診",
        expect: { action: "capture_booking_fields", booking: { expectedField: "name" } },
      },
      {
        booking: { explicit: false, fields: { name: "王小美" }, intent: "none" },
        semantics: { questionAspect: "booking_policy", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "provide_booking_field",
        text: "王小美",
        expect: { action: "capture_booking_fields", booking: { expectedField: "phone" } },
      },
      {
        booking: { explicit: false, fields: { phone: "0912345678" }, intent: "none" },
        semantics: { questionAspect: "booking_policy", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "provide_booking_field",
        text: "0912345678",
        expect: { action: "capture_booking_fields", booking: { expectedField: null, status: "completed" } },
      },
    ],
  },
  {
    id: "G18",
    title: "只想諮詢不啟動個資收集",
    turns: [
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "我想諮詢 ONDA",
        treatments: ["onda_pro"],
        expect: { action: "learn_treatment", booking: { intent: "none", status: "inactive" } },
      },
      {
        semantics: { questionAspect: "suitability", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_treatment_detail",
        text: "先了解適不適合，不是要預約",
        expect: {
          action: "learn_treatment",
          booking: { intent: "none", status: "inactive" },
          dialogueAct: "answer_followup",
        },
      },
    ],
  },
  {
    id: "G19",
    title: "修改預約使用獨立管理狀態",
    turns: [
      {
        booking: { explicit: true, intent: "modify" },
        semantics: { questionAspect: "booking_policy", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "manage_booking",
        text: "我要改預約",
        expect: { action: "start_booking", booking: { expectedField: "appointment_reference", intent: "modify", status: "collecting" } },
      },
      {
        booking: { explicit: false, fields: { appointmentReference: "王小美 0912345678" }, intent: "none" },
        semantics: { questionAspect: "booking_policy", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "provide_booking_field",
        text: "王小美 0912345678",
        expect: { action: "capture_booking_fields", booking: { expectedField: "change_request" } },
      },
      {
        booking: { explicit: false, fields: { changeRequest: "改成週五下午" }, intent: "none" },
        semantics: { questionAspect: "booking_policy", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "provide_booking_field",
        text: "改成週五下午",
        expect: { action: "capture_booking_fields", booking: { expectedField: null, intent: "modify", status: "completed" } },
      },
    ],
  },
  {
    id: "G20",
    title: "取消預約只收辨識原預約所需資料",
    turns: [
      {
        booking: { explicit: true, intent: "cancel" },
        semantics: { questionAspect: "booking_policy", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "manage_booking",
        text: "我要取消預約",
        expect: { action: "start_booking", booking: { expectedField: "appointment_reference", intent: "cancel", status: "collecting" } },
      },
      {
        booking: { explicit: false, fields: { appointmentReference: "0912345678" }, intent: "none" },
        semantics: { questionAspect: "booking_policy", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "provide_booking_field",
        text: "電話 0912345678",
        expect: { action: "capture_booking_fields", booking: { expectedField: null, intent: "cancel", status: "completed" } },
      },
    ],
  },
  {
    id: "G21",
    title: "預約中問館別不誤收成預約欄位",
    turns: [
      {
        booking: { explicit: true, fields: { treatmentKeys: ["botox"] }, intent: "create" },
        semantics: { questionAspect: "booking_policy", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "book_consultation",
        text: "我要預約肉毒",
        treatments: ["botox"],
        expect: { action: "start_booking", booking: { expectedField: "branch", status: "collecting" } },
      },
      {
        semantics: { questionAspect: "branch_list", conversationMove: "none", dialogueReference: "none" },
        speechAct: "ask_clinic_info",
        text: "你們有幾家店？",
        expect: { action: "answer_clinic_info", booking: { status: "suspended" }, dialogueAct: "answer_clinic_info" },
      },
      {
        booking: { explicit: false, fields: { branch: "高雄館" }, intent: "none" },
        semantics: { questionAspect: "booking_policy", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "provide_booking_field",
        text: "高雄館",
        expect: { action: "capture_booking_fields", booking: { expectedField: "time_slots", status: "collecting" } },
      },
    ],
  },
  {
    id: "G22",
    title: "預約中問價不把價格當成預約資料",
    turns: [
      {
        booking: { explicit: true, fields: { treatmentKeys: ["botox"] }, intent: "create" },
        semantics: { questionAspect: "booking_policy", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "book_consultation",
        text: "我要預約肉毒",
        treatments: ["botox"],
        expect: { action: "start_booking", booking: { status: "collecting" } },
      },
      {
        semantics: { questionAspect: "price_unspecified", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_price",
        text: "這個多少錢？",
        expect: {
          action: "answer_price",
          booking: { status: "collecting" },
          priceTreatmentKeys: ["botox"],
          pricingSubjectTreatmentKeys: ["botox"],
        },
      },
      {
        booking: { explicit: false, fields: { branch: "高雄館" }, intent: "none" },
        semantics: { questionAspect: "booking_policy", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "provide_booking_field",
        text: "高雄館",
        expect: { action: "capture_booking_fields", booking: { expectedField: "time_slots", status: "collecting" } },
      },
    ],
  },
  {
    id: "G23",
    title: "明確真人需求建立單一接手任務",
    turns: [
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "想了解 ONDA",
        treatments: ["onda_pro"],
        expect: { action: "learn_treatment" },
      },
      {
        semantics: { conversationMove: "none", dialogueReference: "none" },
        speechAct: "request_handoff",
        text: "我要找真人客服",
        expect: { action: "queue_handoff", controlMode: "handoff_pending", dialogueAct: "handoff" },
      },
    ],
  },
  {
    id: "G24",
    seed: { controlMode: "human_active" },
    title: "真人接手後 AI 對後續訊息保持沉默",
    turns: [
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "想了解 ONDA",
        treatments: ["onda_pro"],
        expect: { action: "do_not_reply", controlMode: "human_active", dialogueAct: undefined },
      },
      {
        semantics: { questionAspect: "price_unspecified", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "ask_price",
        text: "肉毒多少錢？",
        treatments: ["botox"],
        expect: { action: "do_not_reply", controlMode: "human_active" },
      },
    ],
  },
  {
    id: "G25",
    title: "實際術後緊急症狀立即覆蓋一般諮詢",
    turns: [
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "想了解肉毒",
        treatments: ["botox"],
        expect: { action: "learn_treatment" },
      },
      {
        semantics: { questionAspect: "side_effects", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "urgent_safety",
        text: "我剛打完，現在呼吸困難",
        expect: { action: "answer_safety", activeTaskKind: "safety", dialogueAct: "answer_safety" },
      },
    ],
  },
  {
    id: "G26",
    title: "孕哺資訊不交給自由推薦而轉真人評估",
    turns: [
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "想了解肉毒",
        treatments: ["botox"],
        expect: { action: "learn_treatment" },
      },
      {
        semantics: { questionAspect: "side_effects", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "request_handoff",
        text: "我正在哺乳，可以做嗎？",
        expect: { action: "queue_handoff", controlMode: "handoff_pending" },
      },
    ],
  },
  {
    id: "G27",
    title: "LINE 重送同一 turn 最多處理一次",
    turns: [
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "想了解 ONDA",
        treatments: ["onda_pro"],
        turnId: "G27-retry",
        expect: { action: "learn_treatment", revisionDelta: 1 },
      },
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "想了解 ONDA",
        treatments: ["onda_pro"],
        turnId: "G27-retry",
        expect: { action: null, duplicate: true, revisionDelta: 0 },
      },
    ],
  },
  {
    id: "G28",
    title: "快速連發仍依 turn 順序持續收斂主題",
    turns: [
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "想了解 ONDA",
        treatments: ["onda_pro"],
        expect: { action: "learn_treatment", knowledge: { treatmentKeys: ["onda_pro"] } },
      },
      {
        areas: ["jawline"],
        concerns: ["jawline_looseness"],
        semantics: { conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_concern",
        text: "雙下巴",
        treatments: ["onda_pro"],
        expect: { action: "learn_treatment", knowledge: { concernKeys: ["jawline_looseness"], treatmentKeys: ["onda_pro"] } },
      },
      {
        semantics: { questionAspect: "overview", conversationMove: "replace", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "肉毒呢",
        treatments: ["botox"],
        expect: { action: "learn_treatment", activeTaskKind: "learn_treatment", knowledge: { treatmentKeys: ["botox"] } },
      },
      {
        semantics: { questionAspect: "price_unspecified", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_price",
        text: "那價格呢",
        expect: { action: "answer_price", priceTreatmentKeys: ["botox"] },
      },
    ],
  },
  {
    id: "G29",
    title: "低信心候選先澄清再進入已選療程",
    turns: [
      {
        clarification: {
          allowMultiple: false,
          options: [
            treatmentOption("pico", "探索皮秒", "pico"),
            treatmentOption("m22", "M22 彩衝光", "m22"),
          ],
          prompt: "想了解探索皮秒還是 M22 彩衝光呢？",
          slot: "treatment",
        },
        confidence: 0.55,
        semantics: { conversationMove: "none", dialogueReference: "none" },
        speechAct: "unknown",
        text: "想問那個雷射",
        expect: { action: "clarify" },
      },
      {
        selection: { keys: ["pico"], mode: "keys" },
        semantics: { conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "select_options",
        text: "探索皮秒",
        expect: { action: "answer_selection", knowledge: { treatmentKeys: ["pico"] } },
      },
    ],
  },
  {
    id: "G30",
    title: "完全無法判斷時只問一個澄清問題",
    turns: [
      {
        semantics: { conversationMove: "none", dialogueReference: "none" },
        speechAct: "unknown",
        text: "我想變好看",
        expect: { action: "fallback_clarify", dialogueAct: "clarify" },
      },
      {
        areas: ["skin"],
        concerns: ["pores_texture"],
        semantics: { conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "ask_concern",
        text: "主要是毛孔粗大",
        expect: { action: "learn_treatment", activeTaskKind: "answer_concern", knowledge: { areaKeys: ["skin"], concernKeys: ["pores_texture"] } },
      },
    ],
  },
  {
    id: "G31",
    title: "重述同一需求也必須推進而非完整重貼",
    turns: [
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "我想了解 ONDA",
        treatments: ["onda_pro"],
        expect: { action: "learn_treatment", dialogueAct: "introduce_treatment" },
      },
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "我是想了解 ONDA",
        treatments: ["onda_pro"],
        expect: { action: "learn_treatment", dialogueAct: "answer_followup", knowledge: { treatmentKeys: ["onda_pro"] } },
      },
      {
        semantics: { questionAspect: "price_unspecified", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_price",
        text: "那價格呢？",
        expect: { action: "answer_price", priceTreatmentKeys: ["onda_pro"] },
      },
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "我還是想了解 ONDA",
        treatments: ["onda_pro"],
        expect: { action: "learn_treatment", dialogueAct: "answer_followup", knowledge: { treatmentKeys: ["onda_pro"] } },
      },
      {
        semantics: { questionAspect: "branch_list", conversationMove: "none", dialogueReference: "none" },
        speechAct: "ask_clinic_info",
        text: "你們有幾家店？",
        expect: { action: "answer_clinic_info", clinicTopic: "branches" },
      },
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "想了解 ONDA",
        treatments: ["onda_pro"],
        expect: { action: "learn_treatment", dialogueAct: "answer_followup", knowledge: { treatmentKeys: ["onda_pro"] } },
      },
    ],
  },
  {
    id: "G32",
    title: "正常價格與活動價格由結構化 priceKind 區分",
    turns: [
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "想了解 ONDA",
        treatments: ["onda_pro"],
        expect: { action: "learn_treatment", knowledge: { treatmentKeys: ["onda_pro"] } },
      },
      {
        semantics: { questionAspect: "price_regular", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_price",
        text: "那正常價格呢？",
        expect: {
          action: "answer_price",
          priceKind: "regular",
          priceTreatmentKeys: ["onda_pro"],
        },
      },
    ],
  },
  {
    id: "G33",
    title: "館別與醫師班表問題不再共用模糊 general topic",
    turns: [
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "先想了解肉毒",
        treatments: ["botox"],
        expect: { action: "learn_treatment", knowledge: { treatmentKeys: ["botox"] } },
      },
      {
        areas: ["abdomen"],
        concerns: ["local_contour"],
        semantics: { questionAspect: "branch_list", conversationMove: "none", dialogueReference: "none" },
        speechAct: "ask_clinic_info",
        text: "我想改善肚子，ONDA 高雄有嗎？",
        treatments: ["onda_pro"],
        expect: {
          action: "answer_clinic_info",
          activeSubjectKey: "treatment:onda_pro",
          clinicTopic: "branches",
          dialogueAct: "answer_clinic_info",
          knowledge: {
            areaKeys: ["abdomen"],
            concernKeys: ["local_contour"],
            treatmentKeys: ["onda_pro"],
          },
        },
      },
      {
        semantics: { questionAspect: "doctor_schedule", conversationMove: "none", dialogueReference: "none" },
        speechAct: "ask_clinic_info",
        text: "高雄館醫師班表呢？",
        expect: { action: "answer_clinic_info", clinicTopic: "doctor_schedule", dialogueAct: "answer_clinic_info" },
      },
      {
        semantics: { questionAspect: "benefits", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_treatment_detail",
        text: "那適合什麼？",
        expect: {
          action: "learn_treatment",
          activeTaskKind: "learn_treatment",
          dialogueAct: "answer_followup",
          knowledge: {
            areaKeys: ["abdomen"],
            concernKeys: ["local_contour"],
            treatmentKeys: ["onda_pro"],
          },
        },
      },
    ],
  },
  {
    id: "G34",
    title: "一般副作用詢問留在衛教，實際術後異常才緊急分流",
    turns: [
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "想了解肉毒",
        treatments: ["botox"],
        expect: { action: "learn_treatment", knowledge: { treatmentKeys: ["botox"] } },
      },
      {
        semantics: { questionAspect: "side_effects", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_treatment_detail",
        text: "肉毒副作用是什麼？",
        treatments: ["botox"],
        expect: {
          action: "learn_treatment",
          activeTaskKind: "learn_treatment",
          dialogueAct: "answer_followup",
          knowledge: { treatmentKeys: ["botox"] },
        },
      },
    ],
  },
  {
    id: "G35",
    title: "品牌與品牌差異都承接目前療程",
    turns: [
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "想了解肉毒",
        treatments: ["botox"],
        expect: { action: "learn_treatment", knowledge: { treatmentKeys: ["botox"] } },
      },
      {
        semantics: { questionAspect: "brands", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_treatment_detail",
        text: "肉毒有哪些品牌？",
        expect: { action: "learn_treatment", dialogueAct: "answer_followup", knowledge: { treatmentKeys: ["botox"] } },
      },
      {
        semantics: { questionAspect: "brand_difference", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_treatment_detail",
        text: "這些品牌差在哪？",
        expect: { action: "learn_treatment", dialogueAct: "answer_followup", knowledge: { treatmentKeys: ["botox"] } },
      },
    ],
  },
  {
    id: "G36",
    title: "舒適度恢復期時間與次數是不同追問面向",
    turns: [
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "想了解探索皮秒",
        treatments: ["pico"],
        expect: { action: "learn_treatment", knowledge: { treatmentKeys: ["pico"] } },
      },
      {
        semantics: { questionAspect: "comfort_recovery", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_treatment_detail",
        text: "會痛嗎？恢復期多久？",
        expect: { action: "learn_treatment", dialogueAct: "answer_followup", knowledge: { treatmentKeys: ["pico"] } },
      },
      {
        semantics: { questionAspect: "duration", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_treatment_detail",
        text: "一次療程要多久？",
        expect: { action: "learn_treatment", dialogueAct: "answer_followup", knowledge: { treatmentKeys: ["pico"] } },
      },
      {
        semantics: { questionAspect: "sessions", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_treatment_detail",
        text: "通常要做幾次？",
        expect: { action: "learn_treatment", dialogueAct: "answer_followup", knowledge: { treatmentKeys: ["pico"] } },
      },
    ],
  },
  {
    id: "G37",
    title: "詢問其他方案時不重貼目前療程",
    turns: [
      {
        semantics: { questionAspect: "overview", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "learn_treatment",
        text: "想改善雙下巴，先了解 ONDA",
        treatments: ["onda_pro"],
        expect: { action: "learn_treatment", knowledge: { treatmentKeys: ["onda_pro"] } },
      },
      {
        semantics: { questionAspect: "alternatives", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_treatment_detail",
        text: "還有其他方案嗎？",
        expect: { action: "learn_treatment", dialogueAct: "answer_followup", knowledge: { treatmentKeys: ["onda_pro"] } },
      },
    ],
  },
  {
    id: "G38",
    title: "地址營業時間與聯絡方式各自有明確 topic",
    turns: [
      {
        semantics: { questionAspect: "branch_address", conversationMove: "none", dialogueReference: "none" },
        speechAct: "ask_clinic_info",
        text: "高雄館地址在哪？",
        expect: { action: "answer_clinic_info", clinicTopic: "address", dialogueAct: "answer_clinic_info" },
      },
      {
        semantics: { questionAspect: "branch_hours", conversationMove: "none", dialogueReference: "none" },
        speechAct: "ask_clinic_info",
        text: "幾點營業？",
        expect: { action: "answer_clinic_info", clinicTopic: "hours", dialogueAct: "answer_clinic_info" },
      },
      {
        semantics: { questionAspect: "clinic_contact", conversationMove: "none", dialogueReference: "none" },
        speechAct: "ask_clinic_info",
        text: "診所電話是多少？",
        expect: { action: "answer_clinic_info", clinicTopic: "contact", dialogueAct: "answer_clinic_info" },
      },
    ],
  },
  {
    id: "G39",
    title: "預約政策詢問不收個資且預約中可改回只了解",
    turns: [
      {
        semantics: { questionAspect: "booking_policy", conversationMove: "none", dialogueReference: "none" },
        speechAct: "ask_clinic_info",
        text: "我要預約才能去嗎？",
        expect: { action: "answer_clinic_info", booking: { intent: "none", status: "inactive" }, clinicTopic: "booking_policy" },
      },
      {
        booking: { explicit: true, fields: { treatmentKeys: ["botox"] }, intent: "create" },
        semantics: { questionAspect: "booking_policy", conversationMove: "start", dialogueReference: "explicit" },
        speechAct: "book_consultation",
        text: "那我想預約肉毒",
        treatments: ["botox"],
        expect: { action: "start_booking", booking: { expectedField: "branch", status: "collecting" } },
      },
      {
        semantics: { questionAspect: "overview", conversationMove: "continue", dialogueReference: "active_subject" },
        speechAct: "ask_treatment_detail",
        text: "我先了解，不是要預約",
        treatments: ["botox"],
        expect: { action: "learn_treatment", booking: { status: "suspended" }, dialogueAct: "answer_followup" },
      },
    ],
  },
  {
    id: "G40",
    title: "缺少第二個比較主詞時先澄清而不產生單項比較",
    turns: [
      {
        semantics: { questionAspect: "general_difference", conversationMove: "compare", dialogueReference: "active_subject" },
        speechAct: "compare_treatments",
        text: "探索皮秒跟這個差在哪？",
        treatments: ["pico"],
        expect: { action: "fallback_clarify", dialogueAct: "clarify", knowledge: { treatmentKeys: [] } },
      },
      {
        semantics: { questionAspect: "general_difference", conversationMove: "compare", dialogueReference: "explicit" },
        speechAct: "compare_treatments",
        text: "探索皮秒跟肉毒差在哪？",
        treatments: ["pico", "botox"],
        expect: {
          action: "learn_treatment",
          activeTaskKind: "compare_treatments",
          dialogueAct: "compare_options",
          knowledge: { treatmentKeys: ["pico", "botox"] },
          replyKnowledgeTreatmentKeys: ["pico", "botox"],
        },
      },
    ],
  },
];
