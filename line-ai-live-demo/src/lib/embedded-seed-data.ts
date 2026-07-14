import type { DoctorScheduleRow, SchedulePublishStatusRow } from "@/lib/doctor-schedule";
import type { FaqEntry, HandoffRule, PregnancyRule, PricingCampaign } from "@/lib/seed-loader";

export const EMBEDDED_FAQ_ENTRIES: FaqEntry[] = [
  {
    answer_text: "您好～現金或是線上轉帳服務唷 (sparkling heart) 消費滿3000可刷卡",
    approval_status: "approved",
    is_active: "true",
    notes: "stable_faq_candidate",
    question_pattern: "請問付款方式有哪幾種呢",
    reviewed_at: "2026-06-22",
    topic: "general",
  },
];

export const EMBEDDED_HANDOFF_RULES: HandoffRule[] = [
  {
    approval_status: "approved",
    handoff_message: "目前活動內容可能依日期或館別調整，實際價格與方案請由真人客服為您確認，我先幫您轉交。",
    is_active: "true",
    notes: "generic_runtime_rule",
    pattern: "價格|價位|費用|方案|活動|優惠|多少錢|刷卡",
    priority: "high",
    reviewed_at: "2026-06-22",
    trigger_type: "dynamic_pricing",
  },
  {
    approval_status: "approved",
    handoff_message: "預約時段與館別安排需要由真人客服協助確認，我先幫您轉交。",
    is_active: "true",
    notes: "generic_runtime_rule",
    pattern: "預約|時段|時間|今天|明天|下午|晚上|幾點",
    priority: "high",
    reviewed_at: "2026-06-22",
    trigger_type: "booking_or_schedule",
  },
  {
    approval_status: "approved",
    handoff_message: "醫師門診與現場安排需要由真人客服協助確認，我先幫您轉交。",
    is_active: "true",
    notes: "generic_runtime_rule",
    pattern: "醫師|門診|看診",
    priority: "high",
    reviewed_at: "2026-06-22",
    trigger_type: "doctor_schedule",
  },
  {
    approval_status: "approved",
    handoff_message: "此問題涉及個人狀況與療程評估，建議由診所真人客服協助您進一步確認，我先幫您轉交。",
    is_active: "true",
    notes: "generic_runtime_rule",
    pattern: "適合|效果|推薦|評估|可以做嗎|想做",
    priority: "high",
    reviewed_at: "2026-06-22",
    trigger_type: "personalized_consult",
  },
  {
    approval_status: "approved",
    handoff_message: "此問題涉及個人狀況與專業評估，建議由診所真人客服協助您進一步確認，我先幫您轉交。",
    is_active: "true",
    notes: "generic_runtime_rule",
    pattern: "懷孕|孕婦|月經|生理期|哺乳|過敏|藥物",
    priority: "high",
    reviewed_at: "2026-06-22",
    trigger_type: "medical_risk",
  },
  {
    approval_status: "approved",
    handoff_message: "此問題需要由真人客服協助查詢您的紀錄，我先幫您轉交。",
    is_active: "true",
    notes: "generic_runtime_rule",
    pattern: "姓名|電話|紀錄|會員|帳號|查詢",
    priority: "high",
    reviewed_at: "2026-06-22",
    trigger_type: "customer_account_lookup",
  },
];

export const EMBEDDED_PREGNANCY_RULES: PregnancyRule[] = [];

export const EMBEDDED_PRICING_CAMPAIGNS: PricingCampaign[] = [];

export const EMBEDDED_DOCTOR_SCHEDULE_ROWS: DoctorScheduleRow[] = [];

export const EMBEDDED_SCHEDULE_PUBLISH_STATUSES: SchedulePublishStatusRow[] = [
  {
    notes: "waiting_for_upload",
    published: "false",
    published_at: "",
    source_month: "2026-07",
  },
];
