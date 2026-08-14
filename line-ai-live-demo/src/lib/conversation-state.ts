import fs from "node:fs/promises";
import path from "node:path";

import { clinicConfig } from "@/lib/clinic-config";
import {
  DEFAULT_TENANT_ID,
  isSupabaseConversationStoreEnabled,
  loadConversationRuntimeState,
  saveConversationRuntimeState,
  saveConversationRuntimeStateIfCurrent,
  type ConversationStoreMode,
} from "@/lib/conversation-store";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { selectHigherPriorityHandoffReason } from "@/lib/handoff-priority";

export type ConversationStatus = "ai_active" | "handoff_pending" | "human_active" | "ai_paused" | "closed";

export type ConversationState = {
  aiPausedAt: null | string;
  aiResumeAt: null | string;
  assignedTo: null | string;
  autoResumeAfterMinutes: number;
  closedAt: null | string;
  /** Monotonic epoch for staff ownership changes; customer messages never increment it. */
  controlRevision: number;
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

const localStateWriteQueues = new Map<string, Promise<void>>();

async function withLocalStateWriteLock<T>(key: string, operation: () => Promise<T>) {
  const previous = localStateWriteQueues.get(key) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  localStateWriteQueues.set(key, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (localStateWriteQueues.get(key) === queued) {
      localStateWriteQueues.delete(key);
    }
  }
}

export function createEmptyConversationState(userId: string): ConversationState {
  return {
    aiPausedAt: null,
    aiResumeAt: null,
    assignedTo: null,
    autoResumeAfterMinutes: clinicConfig.escalationPolicy.autoResumeAfterMinutes,
    closedAt: null,
    controlRevision: 0,
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

function hydrateConversationState(userId: string, parsed: Partial<ConversationState>) {
  return {
    ...createEmptyConversationState(userId),
    ...parsed,
    controlRevision:
      Number.isSafeInteger(parsed.controlRevision) && Number(parsed.controlRevision) >= 0
        ? Number(parsed.controlRevision)
        : 0,
    userId,
  } satisfies ConversationState;
}

function nextStateVersion(previousUpdatedAt: string, eventAt = nowIso()) {
  const previousMs = new Date(previousUpdatedAt).getTime();
  const eventMs = new Date(eventAt).getTime();
  if (!Number.isFinite(previousMs)) return Number.isFinite(eventMs) ? eventAt : nowIso();
  if (Number.isFinite(eventMs) && eventMs > previousMs) return eventAt;
  return new Date(previousMs + 1).toISOString();
}

export async function loadAuthoritativeConversationState(
  userId: string,
  tenantId: string = DEFAULT_TENANT_ID,
  mode: ConversationStoreMode = "latency_critical",
) {
  if (!userId) {
    return createEmptyConversationState("");
  }

  if (isSupabaseConversationStoreEnabled()) {
    const row = await loadConversationRuntimeState(userId, tenantId, mode);
    return hydrateConversationState(userId, (row?.state_json ?? {}) as Partial<ConversationState>);
  }

  return loadConversationState(userId, tenantId);
}

export async function loadConversationState(userId: string, tenantId: string = DEFAULT_TENANT_ID) {
  if (!userId) {
    return createEmptyConversationState("");
  }

  if (isSupabaseConversationStoreEnabled()) {
    try {
      const row = await loadConversationRuntimeState(userId, tenantId);
      const parsed = (row?.state_json ?? {}) as Partial<ConversationState>;
      return hydrateConversationState(userId, parsed);
    } catch {
      // Fallback to local file persistence until Supabase schema is ready.
    }
  }

  const filePath = buildConversationStatePath(userId, tenantId);

  try {
    const content = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as Partial<ConversationState>;
    return hydrateConversationState(userId, parsed);
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

  const key = `${tenantId}:${state.userId}`;
  await withLocalStateWriteLock(key, async () => {
    const directory = getConversationStateDir();
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(buildConversationStatePath(state.userId, tenantId), JSON.stringify(state, null, 2), "utf8");
  });
}

export async function saveConversationStateIfCurrent(
  state: ConversationState,
  expectedUpdatedAt: string,
  expectedControlRevision: number,
  tenantId: string = DEFAULT_TENANT_ID,
  mode: ConversationStoreMode = "latency_critical",
) {
  if (!state.userId) {
    return true;
  }

  if (isSupabaseConversationStoreEnabled()) {
    return saveConversationRuntimeStateIfCurrent(
      state.userId,
      state as unknown as Record<string, unknown>,
      expectedUpdatedAt,
      expectedControlRevision,
      tenantId,
      mode,
    );
  }

  const key = `${tenantId}:${state.userId}`;
  return withLocalStateWriteLock(key, async () => {
    const filePath = buildConversationStatePath(state.userId, tenantId);
    try {
      const content = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(content) as Partial<ConversationState>;
      // Legacy local rows predate lifecycle versioning. Under the local lock,
      // a missing raw version is an unclaimed slot and may be initialized once.
      if (typeof parsed.updatedAt === "string" && parsed.updatedAt !== expectedUpdatedAt) {
        return false;
      }
      const currentControlRevision = Number.isSafeInteger(parsed.controlRevision) && Number(parsed.controlRevision) >= 0
        ? Number(parsed.controlRevision)
        : 0;
      if (currentControlRevision !== expectedControlRevision) {
        return false;
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== "ENOENT") {
        throw error;
      }
    }
    const directory = getConversationStateDir();
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
    return true;
  });
}

export async function applyAuthoritativeConversationTransition(
  userId: string,
  transition: (state: ConversationState) => ConversationState,
  tenantId: string = DEFAULT_TENANT_ID,
  maxAttempts = 3,
) {
  if (!userId) {
    const before = createEmptyConversationState("");
    return { after: transition(before), before };
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // Staff control must remain available even when the customer reply-path
    // breaker is open. It gets its own bounded durable database attempt.
    const before = await loadAuthoritativeConversationState(userId, tenantId, "durable");
    const after = transition(before);
    if (after.controlRevision <= before.controlRevision) {
      throw new Error("Authoritative conversation control transition must advance controlRevision");
    }
    if (await saveConversationStateIfCurrent(after, before.updatedAt, before.controlRevision, tenantId, "durable")) {
      return { after, before };
    }
  }

  throw new Error(`Conversation control transition conflicted after ${maxAttempts} attempts`);
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
      state.status === "handoff_pending" || state.status === "human_active" || state.status === "ai_paused" || state.status === "closed"
        ? true
        : state.hasNewCustomerMessage,
    lastCustomerMessageAt: receivedAt,
    updatedAt: receivedAt,
  };
}

export function recordHandoffPending(state: ConversationState, handoffReason: string, recordedAt = nowIso()) {
  const selectedReason = state.status === "handoff_pending"
    ? selectHigherPriorityHandoffReason(state.handoffReason, handoffReason)
    : handoffReason;
  if (state.status === "human_active" || state.status === "ai_paused" || state.status === "closed") {
    return state;
  }

  return {
    ...state,
    handoffReason: selectedReason,
    lastHandoffPromptAt: state.lastHandoffPromptAt ?? recordedAt,
    status: "handoff_pending",
    updatedAt: recordedAt,
  } satisfies ConversationState;
}

export function markHumanTakeover(state: ConversationState, input: StaffMessageInput = {}) {
  const sentAt = input.sentAt ?? nowIso();
  const controlAt = nowIso();
  const autoResumeAfterMinutes = input.autoResumeAfterMinutes ?? state.autoResumeAfterMinutes;

  return {
    ...state,
    aiPausedAt: controlAt,
    aiResumeAt: addMinutes(controlAt, autoResumeAfterMinutes),
    assignedTo: input.assignedTo ?? state.assignedTo,
    autoResumeAfterMinutes,
    controlRevision: state.controlRevision + 1,
    hasNewCustomerMessage: false,
    humanTakeoverAt: state.humanTakeoverAt ?? controlAt,
    lastStaffMessageAt: sentAt,
    manualAiPause: false,
    status: "human_active" as const,
    updatedAt: nextStateVersion(state.updatedAt, controlAt),
  };
}

export function resumeConversationAi(state: ConversationState, resumedAt = nowIso()) {
  return {
    ...state,
    aiPausedAt: null,
    aiResumeAt: null,
    controlRevision: state.controlRevision + 1,
    hasNewCustomerMessage: false,
    handoffReason: null,
    lastHandoffPromptAt: null,
    manualAiPause: false,
    status: "ai_active" as const,
    updatedAt: nextStateVersion(state.updatedAt),
  };
}

export function pauseConversationAi(state: ConversationState, pausedAt = nowIso()) {
  return {
    ...state,
    aiPausedAt: pausedAt,
    aiResumeAt: null,
    controlRevision: state.controlRevision + 1,
    manualAiPause: true,
    status: "ai_paused" as const,
    updatedAt: nextStateVersion(state.updatedAt),
  };
}

export function closeConversation(state: ConversationState, closedAt = nowIso()) {
  return {
    ...state,
    aiResumeAt: null,
    closedAt,
    controlRevision: state.controlRevision + 1,
    hasNewCustomerMessage: false,
    status: "closed" as const,
    updatedAt: nextStateVersion(state.updatedAt),
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
  // This only identifies a repeated reason. Do not use it as a reply decision:
  // callers must use shouldSuppressHandoffReply so high-risk handoffs are never silenced.
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
