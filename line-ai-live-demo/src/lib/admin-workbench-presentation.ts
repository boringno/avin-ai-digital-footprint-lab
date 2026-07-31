export type WorkbenchQueueMode = "active" | "pending";
export type WorkbenchRuntimeStatus = "ai_active" | "ai_paused" | "closed" | "handoff_pending" | "human_active";
export type WorkbenchQueueControlAction = "mark_human_active" | "resume_ai";

export function getWorkbenchQueueControlAction(
  mode: WorkbenchQueueMode,
  status: string,
): WorkbenchQueueControlAction {
  if (mode === "active" && status === "human_active") {
    return "resume_ai";
  }

  return "mark_human_active";
}

export function getWorkbenchQueueStatusLabel(mode: WorkbenchQueueMode, status: string) {
  if (mode === "pending" || status === "handoff_pending") {
    return "待接手";
  }
  if (status === "ai_active") {
    return "AI 協助";
  }
  if (status === "human_active") {
    return "服務中";
  }
  return "待確認";
}

export function getWorkbenchQueueStatusText(mode: WorkbenchQueueMode, status: string, waitMinutes: number) {
  if (mode === "pending") {
    return `等待 ${waitMinutes} 分鐘`;
  }
  if (status === "handoff_pending") {
    return "已指派，等待真人接手";
  }
  if (status === "ai_active") {
    return "AI 協助中，真人持續追蹤";
  }
  if (status === "human_active") {
    return "真人服務中";
  }
  return "狀態待確認";
}

export function getWorkbenchQueuePrimaryLabel(mode: WorkbenchQueueMode, status: string) {
  return getWorkbenchQueueControlAction(mode, status) === "resume_ai" ? "交由 AI 協助" : "接手回覆";
}
