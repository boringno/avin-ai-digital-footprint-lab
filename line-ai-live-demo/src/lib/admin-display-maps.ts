import type { StaffRole } from "@/lib/admin-auth";

export const staffRoleLabels: Record<StaffRole, string> = {
  agent: "第一線客服",
  analyst: "報表分析員",
  maintainer: "系統維護人員",
  manager: "客服主管",
  owner: "診所管理者",
};

export const bookingStatusLabels = {
  new: "新進線",
  contacted: "已聯繫",
  booked: "已預約",
  arrived: "已到店",
  won: "成交",
  lost: "流失",
} as const;

export const leadStageLabels = {
  new_inquiry: "新進線",
  interested: "有興趣",
  booking_intent: "想預約",
  handoff_pending: "待接手",
  human_followup: "真人追蹤",
  closed: "已結案",
} as const;

export const handoffTaskStatusLabels = {
  open: "待接手",
  taken: "處理中",
  resolved: "已完成",
} as const;

export type BookingStatusKey = keyof typeof bookingStatusLabels;
export type LeadStageKey = keyof typeof leadStageLabels;
export type HandoffTaskStatusKey = keyof typeof handoffTaskStatusLabels;
