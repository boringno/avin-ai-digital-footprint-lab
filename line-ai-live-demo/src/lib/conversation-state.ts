import fs from "node:fs/promises";
import path from "node:path";

import { clinicConfig } from "@/lib/clinic-config";
import {
  DEFAULT_TENANT_ID,
  isSupabaseConversationStoreEnabled,
  loadConversationRuntimeState,
  saveConversationRuntimeState,
} from "@/lib/conversation-store";
import { getRuntimeConfig } from "@/lib/live-demo-config";

export type ConversationStatus = "ai_active" | "handoff_pending" | "human_active" | "ai_paused" | "closed";

export type ConversationState = {
  aiPausedAt: null | string;
  aiResumeAt: null | string;
  assignedTo: null | string;
  autoResumeAfterMinutes: number;
  closedAt: null | string;
  handoffReason: null | string;
  hasNewCustomerMessage: boolean;
  humanTakeoverAt: null | string;
  lastCustomerMessageAt: null | string;
  lastHandoffPromptAt: null | string;
  lastStaffMessageAt: null | string;
  manualAiPause: boolean;
  status: ConversationStatus;
  updatedAt: string;
  userId: string;
};

type StaffMessageInput = {
  assignedTo?: string;
  autoResumeAfterMinutes?: number;
  sentAt?: string;
};

type UpdateConversationStatusInput =
  | { action: "close"; closedAt?: string }
  | { action: "complete"; completedAt?: string }
  | { action: "mark_human_active"; assignedTo?: string; autoResumeAfterMinutes?: number; sentAt?: string }
  | { action: "pause_ai"; pausedAt?: string }
  | { action: "resume_ai"; resumedAt?: string };

function getConversationStateDir() {
  const { logDir } = getRuntimeConfig();
  return path.join(logDir, "conversation-states");
}

function buildConversationStatePath(userId: string, tenantId: string) {
  const stateId = tenantId === DEFAULT_TENANT_ID
    ? userId || "anonymous"
    : `${tenantId}__${userId || "anonymous"}`;
  return path.join(getConversationStateDir(), `${encodeURIComponent(stateId)}.json`);
}

function nowIso() {
  return new Date().toISOString();
}

export function createEmptyConversationState(userId: string): ConversationState {
  return {
    aiPausedAt: null,
    aiResumeAt: null,
    assignedTo: null,
    autoResumeAfterMinutes: clinicConfig.escalationPolicy.autoResumeAfterMinutes,
    closedAt: null,
    handoffReason: null,
    hasNewCustomerMessage: false,
    humanTakeoverAt: null,
    lastCustomerMessageAt: null,
    lastHandoffPromptAt: null,
    lastStaffMessageAt: null,
    manualAiPause: false,
    status: "ai_active",
    updatedAt: nowIso(),
    userId,
  };
}

export async function loadConversationState(userId: string, tenantId: string = DEFAULT_TENANT_ID) {
  if (!userId) {
    return createEmptyConversationState("");
  }

  if (isSupabaseConversationStoreEnabled()) {
    try {
      const row = await loadConversationRuntimeState(userId, tenantId);
      const parsed = (row?.state_json ?? {}) as Partial<ConversationState>;
      return {
        ...createEmptyConversationState(userId),
        ...parsed,
        userId,
      };
    } catch {
      // Fallback to local file persistence until Supabase schema is ready.
    }
  }

  const filePath = buildConversationStatePath(userId, tenantId);

  try {
    const content = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as Partial<ConversationState>;
    return {
      ...createEmptyConversationState(userId),
      ...parsed,
      userId,
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return createEmptyConversationState(userId);
    }
    throw error;
  }
}

export async function saveConversationState(state: ConversationState, tenantId: string = DEFAULT_TENANT_ID) {
  if (!state.userId) {
    return;
  }

  if (isSupabaseConversationStoreEnabled()) {
    try {
      await saveConversationRuntimeState(state.userId, {
        state_json: state as unknown as Record<string, unknown>,
      }, tenantId);
      return;
    } catch {
      // Fallback to local file persistence until Supabase schema is ready.
    }
  }

  const directory = getConversationStateDir();
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(buildConversationStatePath(state.userId, tenantId), JSON.stringify(state, null, 2), "utf8");
}

function addMinutes(iso: string, minutes: number) {
  const date = new Date(iso);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

export function markCustomerMessageReceived(state: ConversationState, receivedAt = nowIso()) {
  return {
    ...state,
    hasNewCustomerMessage:
      state.status === "human_active" || state.status === "ai_paused" || state.status === "closed"
        ? true
        : state.hasNewCustomerMessage,
    lastCustomerMessageAt: receivedAt,
    updatedAt: receivedAt,
  };
}

export function recordHandoffPending(state: ConversationState, handoffReason: string, recordedAt = nowIso()) {
  if (state.status === "human_active" || state.status === "ai_paused" || state.status === "closed") {
    return {
      ...state,
      handoffReason,
      updatedAt: recordedAt,
    } satisfies ConversationState;
  }

  return {
    ...state,
    handoffReason,
    lastHandoffPromptAt: state.lastHandoffPromptAt ?? recordedAt,
    status: "handoff_pending",
    updatedAt: recordedAt,
  } satisfies ConversationState;
}

export function markHumanTakeover(state: ConversationState, input: StaffMessageInput = {}) {
  const sentAt = input.sentAt ?? nowIso();
  const autoResumeAfterMinutes = input.autoResumeAfterMinutes ?? state.autoResumeAfterMinutes;

  return {
    ...state,
    aiPausedAt: sentAt,
    aiResumeAt: addMinutes(sentAt, autoResumeAfterMinutes),
    assignedTo: input.assignedTo ?? state.assignedTo,
    autoResumeAfterMinutes,
    hasNewCustomerMessage: false,
    humanTakeoverAt: state.humanTakeoverAt ?? sentAt,
    lastStaffMessageAt: sentAt,
    manualAiPause: false,
    status: "human_active" as const,
    updatedAt: sentAt,
  };
}

export function resumeConversationAi(state: ConversationState, resumedAt = nowIso()) {
  return {
    ...state,
    aiPausedAt: null,
    aiResumeAt: null,
    hasNewCustomerMessage: false,
    handoffReason: null,
    lastHandoffPromptAt: null,
    manualAiPause: false,
    status: "ai_active" as const,
    updatedAt: resumedAt,
  };
}

export function pauseConversationAi(state: ConversationState, pausedAt = nowIso()) {
  return {
    ...state,
    aiPausedAt: pausedAt,
    aiResumeAt: null,
    manualAiPause: true,
    status: "ai_paused" as const,
    updatedAt: pausedAt,
  };
}

export function closeConversation(state: ConversationState, closedAt = nowIso()) {
  return {
    ...state,
    aiResumeAt: null,
    closedAt,
    hasNewCustomerMessage: false,
    status: "closed" as const,
    updatedAt: closedAt,
  };
}

export function shouldBlockAiReply(status: ConversationStatus) {
  return status === "human_active" || status === "ai_paused" || status === "closed";
}

export function applyAutoResumeIfDue(state: ConversationState, now = new Date()) {
  if (state.status !== "human_active" || state.manualAiPause || !state.aiResumeAt) {
    return state;
  }

  const resumeAt = new Date(state.aiResumeAt);
  if (Number.isNaN(resumeAt.getTime()) || resumeAt.getTime() > now.getTime()) {
    return state;
  }

  return resumeConversationAi(state, now.toISOString());
}

export function shouldSuppressRepeatedHandoff(state: ConversationState, nextReason: string) {
  return state.status === "handoff_pending" && Boolean(state.lastHandoffPromptAt) && state.handoffReason === nextReason;
}

export function updateConversationStatus(state: ConversationState, input: UpdateConversationStatusInput) {
  switch (input.action) {
    case "mark_human_active":
      return markHumanTakeover(state, {
        assignedTo: input.assignedTo,
        autoResumeAfterMinutes: input.autoResumeAfterMinutes,
        sentAt: input.sentAt,
      });
    case "pause_ai":
      return pauseConversationAi(state, input.pausedAt);
    case "resume_ai":
      return resumeConversationAi(state, input.resumedAt);
    case "close":
      return closeConversation(state, input.closedAt);
    case "complete":
      return closeConversation(state, input.completedAt);
    default:
      return state;
  }
}
