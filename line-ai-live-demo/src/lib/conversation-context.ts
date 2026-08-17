import fs from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_TENANT_ID,
  isSupabaseConversationStoreEnabled,
  loadConversationRuntimeState,
  saveConversationRuntimeContextIfCurrent,
} from "@/lib/conversation-store";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { getLatencyCriticalSupabaseServerClient } from "@/lib/supabase-server";
import type { PersistedDialogueStateV1 } from "@/lib/dialogue-state";
import {
  parsePersistedConversationV2State,
} from "@/lib/conversation-v2/state";
import type { ConversationV2State } from "@/lib/conversation-v2/types";

export type BookingDraft = {
  appointmentAt?: string;
  branch?: string;
  campaignId?: string;
  campaignName?: string;
  isFirstVisit?: "no" | "unknown" | "yes";
  name?: string;
  phone?: string;
  pregnancyRiskFlag?: boolean;
  requestedTimeSlots?: string[];
  timeSlots: string[];
  treatment?: string;
};

export type ConversationFocusGoal =
  | "learn_treatment"
  | "compare_options"
  | "ask_price"
  | "book_consultation"
  | "manage_booking"
  | "ask_clinic_info"
  | "post_procedure_help"
  | "other";

export type ConversationFocus = {
  answeredTopics: string[];
  areaKeys: string[];
  awaiting?: {
    kind: "area" | "branch" | "combination" | "concern" | "priority" | "time";
    questionSummary: string;
  };
  bookingExplicit: boolean;
  concernKeys: string[];
  goal: ConversationFocusGoal;
  requestedInfo?: "benefits" | "comfort" | "comparison" | "mechanism" | "price";
  treatmentKey?: string;
};

export type RecentConversationTurn = {
  role: "assistant" | "user";
  text: string;
  /** Stable per-webhook identity used to remove only an unsent assistant turn. */
  turnId?: string;
};

export type ConversationContext = {
  activeFocus?: ConversationFocus;
  bookingSession?: {
    action?: "add" | "replace" | "use_current";
    lastActiveAt: string;
    status: "collecting" | "stale";
  };
  bookingDraft: BookingDraft;
  confirmedAppointment?: {
    appointmentAt: string;
  };
  customerProfile?: {
    name?: string;
    phone?: string;
  };
  /** Versioned canonical dialogue state. Legacy fields remain during migration. */
  dialogueState?: PersistedDialogueStateV1;
  /** Test-account V2 state; ignored by V1 and validated before every read. */
  conversationV2State?: ConversationV2State;
  /** Optimistic concurrency epoch for the whole dialogue context JSON. */
  contextRevision?: number;
  introSent: boolean;
  lastIntent?: string;
  lastReferencedBranch?: string;
  lastReferencedTreatment?: string;
  lastSeenAt?: string;
  locationPreference?: string;
  preferredBranch?: string;
  pregnancyRiskFlag?: boolean;
  recentTurns?: RecentConversationTurn[];
  treatmentConsultation?: {
    answeredAspectKeys?: string[];
    concernKeys: string[];
    primaryConcernKey?: string;
    stage?: "needs_discovery" | "priority_selected";
    treatmentKey: string;
  };
  userId: string;
};

const RECENT_TURN_LIMIT = 6;
const RECENT_TURN_TEXT_LIMIT = 500;

function sanitizeRecentTurnText(text: string) {
  return text
    .replace(/(?:\+?886[-\s]?)?0?9\d{2}[-\s]?\d{3}[-\s]?\d{3}/gu, "[電話已提供]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[Email 已提供]")
    .replace(/https?:\/\/\S+/giu, "[網址]")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, RECENT_TURN_TEXT_LIMIT);
}

function normalizeRecentTurns(value: unknown): RecentConversationTurn[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((turn): turn is RecentConversationTurn =>
      Boolean(
        turn &&
        typeof turn === "object" &&
        ((turn as RecentConversationTurn).role === "assistant" || (turn as RecentConversationTurn).role === "user") &&
        typeof (turn as RecentConversationTurn).text === "string",
      ),
    )
    .map((turn) => ({
      role: turn.role,
      text: sanitizeRecentTurnText(turn.text),
      ...(typeof turn.turnId === "string" && turn.turnId.trim()
        ? { turnId: turn.turnId.trim().slice(0, 200) }
        : {}),
    }))
    .filter((turn) => Boolean(turn.text))
    .slice(-RECENT_TURN_LIMIT);
}

function normalizeConversationFocus(value: unknown): ConversationFocus | undefined {
  if (!value || typeof value !== "object") return undefined;
  const focus = value as Partial<ConversationFocus>;
  const allowedGoals: ConversationFocusGoal[] = [
    "learn_treatment",
    "compare_options",
    "ask_price",
    "book_consultation",
    "manage_booking",
    "ask_clinic_info",
    "post_procedure_help",
    "other",
  ];
  if (!focus.goal || !allowedGoals.includes(focus.goal)) return undefined;

  return {
    answeredTopics: Array.isArray(focus.answeredTopics)
      ? focus.answeredTopics.filter((item): item is string => typeof item === "string")
      : [],
    areaKeys: Array.isArray(focus.areaKeys)
      ? focus.areaKeys.filter((item): item is string => typeof item === "string")
      : [],
    ...(focus.awaiting &&
    ["area", "branch", "combination", "concern", "priority", "time"].includes(focus.awaiting.kind) &&
    typeof focus.awaiting.questionSummary === "string"
      ? { awaiting: focus.awaiting }
      : {}),
    bookingExplicit: focus.bookingExplicit === true,
    concernKeys: Array.isArray(focus.concernKeys)
      ? focus.concernKeys.filter((item): item is string => typeof item === "string")
      : [],
    goal: focus.goal,
    ...(focus.requestedInfo && ["benefits", "comfort", "comparison", "mechanism", "price"].includes(focus.requestedInfo)
      ? { requestedInfo: focus.requestedInfo }
      : {}),
    ...(typeof focus.treatmentKey === "string" && focus.treatmentKey ? { treatmentKey: focus.treatmentKey } : {}),
  };
}

function normalizeCustomerProfile(value: unknown): ConversationContext["customerProfile"] {
  if (!value || typeof value !== "object") return undefined;
  const profile = value as { name?: unknown; phone?: unknown };
  const name = typeof profile.name === "string" && profile.name.trim() ? profile.name.trim() : undefined;
  const phone = typeof profile.phone === "string" && profile.phone.trim() ? profile.phone.trim() : undefined;
  return name || phone ? { name, phone } : undefined;
}

function normalizeConfirmedAppointment(
  value: unknown,
  legacyAppointmentAt?: string,
): ConversationContext["confirmedAppointment"] {
  const appointmentAt =
    value && typeof value === "object" && typeof (value as { appointmentAt?: unknown }).appointmentAt === "string"
      ? (value as { appointmentAt: string }).appointmentAt
      : legacyAppointmentAt;
  return appointmentAt && Number.isFinite(new Date(appointmentAt).getTime()) ? { appointmentAt } : undefined;
}

function normalizeBookingSession(value: unknown): ConversationContext["bookingSession"] {
  if (!value || typeof value !== "object") return undefined;
  const session = value as { action?: unknown; lastActiveAt?: unknown; status?: unknown };
  if (typeof session.lastActiveAt !== "string" || !["collecting", "stale"].includes(String(session.status))) {
    return undefined;
  }
  return {
    ...(["add", "replace", "use_current"].includes(String(session.action))
      ? { action: session.action as "add" | "replace" | "use_current" }
      : {}),
    lastActiveAt: session.lastActiveAt,
    status: session.status as "collecting" | "stale",
  };
}

export function appendRecentConversationTurns(
  context: ConversationContext,
  turns: RecentConversationTurn[],
): ConversationContext {
  return {
    ...context,
    recentTurns: normalizeRecentTurns([...(context.recentTurns ?? []), ...turns]),
  };
}

export function removeUnsentAssistantTurn(context: ConversationContext, replyText: string, turnId?: string) {
  const recentTurns = [...(context.recentTurns ?? [])];
  const sanitizedReply = sanitizeRecentTurnText(replyText);
  const matchingIndexes = recentTurns.flatMap((turn, index) => {
    if (turn.role !== "assistant") return [];
    if (turnId) return turn.turnId === turnId ? [index] : [];
    return turn.text === sanitizedReply ? [index] : [];
  });
  // A stable id is exact. The legacy text fallback is intentionally
  // conservative: duplicate prose cannot prove which turn was suppressed.
  const matchingIndex = turnId
    ? matchingIndexes.at(-1) ?? -1
    : matchingIndexes.length === 1 ? matchingIndexes[0] : -1;
  if (matchingIndex < 0) return context;
  recentTurns.splice(matchingIndex, 1);
  return { ...context, recentTurns };
}

function createEmptyBookingDraft(): BookingDraft {
  return {
    requestedTimeSlots: [],
    timeSlots: [],
  };
}

export function createEmptyConversationContext(userId: string): ConversationContext {
  return {
    bookingDraft: createEmptyBookingDraft(),
    contextRevision: 0,
    introSent: false,
    recentTurns: [],
    userId,
  };
}

function normalizeContextRevision(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function hydrateConversationContext(
  userId: string,
  contextJson: Partial<ConversationContext>,
  bookingDraftJson: Partial<BookingDraft> = {},
) {
  return {
    ...createEmptyConversationContext(userId),
    ...contextJson,
    activeFocus: normalizeConversationFocus(contextJson.activeFocus),
    bookingSession: normalizeBookingSession(contextJson.bookingSession),
    confirmedAppointment: normalizeConfirmedAppointment(
      contextJson.confirmedAppointment,
      bookingDraftJson.appointmentAt ?? contextJson.bookingDraft?.appointmentAt,
    ),
    contextRevision: normalizeContextRevision(contextJson.contextRevision),
    conversationV2State: parsePersistedConversationV2State(contextJson.conversationV2State) ?? undefined,
    customerProfile: normalizeCustomerProfile(contextJson.customerProfile),
    bookingDraft: {
      ...createEmptyBookingDraft(),
      ...(contextJson.bookingDraft ?? {}),
      ...bookingDraftJson,
      requestedTimeSlots: Array.isArray(bookingDraftJson.requestedTimeSlots)
        ? bookingDraftJson.requestedTimeSlots
        : Array.isArray(contextJson.bookingDraft?.requestedTimeSlots)
          ? contextJson.bookingDraft?.requestedTimeSlots ?? []
          : [],
      timeSlots: Array.isArray(bookingDraftJson.timeSlots)
        ? bookingDraftJson.timeSlots
        : Array.isArray(contextJson.bookingDraft?.timeSlots)
          ? contextJson.bookingDraft?.timeSlots ?? []
          : [],
    },
    recentTurns: normalizeRecentTurns(contextJson.recentTurns),
    userId,
  } satisfies ConversationContext;
}

function getConversationContextDir() {
  const config = getRuntimeConfig();
  return path.join(config.logDir, "conversation-context");
}

function buildContextFilePath(userId: string) {
  const safeFileName = encodeURIComponent(userId || "anonymous");
  return path.join(getConversationContextDir(), `${safeFileName}.json`);
}

async function loadConfirmedAppointmentAt(userId: string): Promise<string | null | undefined> {
  if (!userId || !isSupabaseConversationStoreEnabled()) {
    return undefined;
  }

  try {
    const supabase = getLatencyCriticalSupabaseServerClient();
    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id")
      .eq("tenant_id", DEFAULT_TENANT_ID)
      .eq("line_user_id", userId)
      .maybeSingle<{ id: string }>()
      .retry(false);

    if (conversationError) {
      return undefined;
    }
    if (!conversation) {
      return null;
    }

    const { data: lead, error: leadError } = await supabase
      .from("booking_leads_db")
      .select("appointment_at")
      .eq("tenant_id", DEFAULT_TENANT_ID)
      .eq("conversation_id", conversation.id)
      .maybeSingle<{ appointment_at: string | null }>()
      .retry(false);

    if (leadError) {
      // Keep existing behavior until the schema migration is applied.
      return undefined;
    }

    const appointmentAt = lead?.appointment_at;
    return appointmentAt && Number.isFinite(new Date(appointmentAt).getTime()) ? appointmentAt : null;
  } catch {
    return undefined;
  }
}

async function applyConfirmedAppointmentAt(context: ConversationContext) {
  const appointmentAt = await loadConfirmedAppointmentAt(context.userId);
  if (appointmentAt === undefined) {
    return context;
  }

  const bookingDraft = { ...context.bookingDraft };
  delete bookingDraft.appointmentAt;

  return {
    ...context,
    bookingDraft,
    confirmedAppointment: appointmentAt ? { appointmentAt } : undefined,
  };
}

export async function loadConversationContext(userId: string) {
  if (!userId) {
    return createEmptyConversationContext("");
  }

  if (isSupabaseConversationStoreEnabled()) {
    try {
      const row = await loadConversationRuntimeState(userId);
      const contextJson = (row?.context_json ?? {}) as Partial<ConversationContext>;
      const bookingDraftJson =
        ((row?.booking_draft_json ?? contextJson.bookingDraft ?? {}) as Partial<BookingDraft>) ?? {};

      return applyConfirmedAppointmentAt(hydrateConversationContext(userId, contextJson, bookingDraftJson));
    } catch {
      // Fallback to local file persistence until Supabase schema is ready.
    }
  }

  const filePath = buildContextFilePath(userId);

  try {
    const content = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as Partial<ConversationContext>;

    return applyConfirmedAppointmentAt(hydrateConversationContext(userId, parsed, parsed.bookingDraft));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return createEmptyConversationContext(userId);
    }
    throw error;
  }
}

function contextTimestamp(context: ConversationContext) {
  const timestamp = new Date(context.lastSeenAt ?? 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sameTurn(left: RecentConversationTurn, right: RecentConversationTurn) {
  if (left.turnId && right.turnId) {
    return left.turnId === right.turnId;
  }
  return left.role === right.role && left.text === right.text;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const ABSENT = Symbol("absent");
const ACCUMULATING_STRING_ARRAY_PATHS = new Set([
  "activeFocus.answeredTopics",
  "activeFocus.areaKeys",
  "activeFocus.concernKeys",
  "bookingDraft.requestedTimeSlots",
  "bookingDraft.timeSlots",
  "dialogueState.answeredTopics",
  "dialogueState.areaKeys",
  "dialogueState.concernKeys",
  "dialogueState.knownNeeds",
  "treatmentConsultation.answeredAspectKeys",
  "treatmentConsultation.concernKeys",
]);
const ATOMIC_CONTEXT_PATHS = new Set(["conversationV2State"]);

function valuesEqual(left: unknown | typeof ABSENT, right: unknown | typeof ABSENT): boolean {
  if (left === ABSENT || right === ABSENT) return left === right;
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => valuesEqual(item, right[index]));
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].every((key) => valuesEqual(
      Object.prototype.hasOwnProperty.call(left, key) ? left[key] : ABSENT,
      Object.prototype.hasOwnProperty.call(right, key) ? right[key] : ABSENT,
    ));
  }
  return false;
}

function rebaseContextValue(
  base: unknown | typeof ABSENT,
  incoming: unknown | typeof ABSENT,
  latest: unknown | typeof ABSENT,
  incomingIsLater: boolean,
  path = "",
): unknown | typeof ABSENT {
  if (valuesEqual(incoming, base)) return latest;
  if (valuesEqual(latest, base)) return incoming;
  if (ATOMIC_CONTEXT_PATHS.has(path)) {
    return incomingIsLater ? incoming : latest;
  }
  if (
    ACCUMULATING_STRING_ARRAY_PATHS.has(path) &&
    (base === ABSENT || (Array.isArray(base) && base.every((item) => typeof item === "string"))) &&
    Array.isArray(incoming) && incoming.every((item) => typeof item === "string") &&
    Array.isArray(latest) && latest.every((item) => typeof item === "string")
  ) {
    const baseItems = base === ABSENT ? [] : base;
    const incomingRemovedBaseItem = baseItems.some((item) => !incoming.includes(item));
    const latestRemovedBaseItem = baseItems.some((item) => !latest.includes(item));
    if (!incomingRemovedBaseItem && !latestRemovedBaseItem) {
      const ordered = incomingIsLater ? [...latest, ...incoming] : [...incoming, ...latest];
      return [...new Set(ordered)];
    }
    // Removing a prior value represents a correction/replacement rather than
    // accumulation, so conflicting corrections remain last-event-wins.
    return incomingIsLater ? incoming : latest;
  }
  if (
    (base === ABSENT || isPlainObject(base)) &&
    isPlainObject(incoming) &&
    isPlainObject(latest)
  ) {
    const merged: Record<string, unknown> = {};
    const baseRecord = base === ABSENT ? {} : base;
    const keys = new Set([...Object.keys(baseRecord), ...Object.keys(incoming), ...Object.keys(latest)]);
    for (const key of keys) {
      const value = rebaseContextValue(
        Object.prototype.hasOwnProperty.call(baseRecord, key) ? baseRecord[key] : ABSENT,
        Object.prototype.hasOwnProperty.call(incoming, key) ? incoming[key] : ABSENT,
        Object.prototype.hasOwnProperty.call(latest, key) ? latest[key] : ABSENT,
        incomingIsLater,
        path ? `${path}.${key}` : key,
      );
      if (value !== ABSENT) merged[key] = value;
    }
    return merged;
  }
  return incomingIsLater ? incoming : latest;
}

function extractRecentTurnDelta(baseTurns: RecentConversationTurn[], candidateTurns: RecentConversationTurn[]) {
  const maximumOverlap = Math.min(baseTurns.length, candidateTurns.length);
  for (let overlap = maximumOverlap; overlap >= 0; overlap -= 1) {
    const baseOffset = baseTurns.length - overlap;
    if (candidateTurns.slice(0, overlap).every((turn, index) => sameTurn(turn, baseTurns[baseOffset + index]))) {
      return candidateTurns.slice(overlap);
    }
  }
  return candidateTurns;
}

function isTurnSubsequence(candidate: RecentConversationTurn[], source: RecentConversationTurn[]) {
  let candidateIndex = 0;
  for (const turn of source) {
    if (candidateIndex < candidate.length && sameTurn(candidate[candidateIndex], turn)) {
      candidateIndex += 1;
    }
  }
  return candidateIndex === candidate.length;
}

function applyTurnDeletions(
  baseTurns: RecentConversationTurn[],
  incomingTurns: RecentConversationTurn[],
  latestTurns: RecentConversationTurn[],
) {
  const remainingIncoming = [...incomingTurns];
  const removed: RecentConversationTurn[] = [];
  for (const baseTurn of baseTurns) {
    const index = remainingIncoming.findIndex((turn) => sameTurn(turn, baseTurn));
    if (index >= 0) remainingIncoming.splice(index, 1);
    else removed.push(baseTurn);
  }
  const merged = [...latestTurns];
  for (const removedTurn of removed) {
    for (let index = merged.length - 1; index >= 0; index -= 1) {
      if (sameTurn(merged[index], removedTurn)) {
        merged.splice(index, 1);
        break;
      }
    }
  }
  return normalizeRecentTurns(merged);
}

function mergeConcurrentRecentTurns(
  latest: ConversationContext,
  incoming: ConversationContext,
  incomingIsLater: boolean,
  base?: ConversationContext,
) {
  const latestTurns = normalizeRecentTurns(latest.recentTurns);
  const incomingTurns = normalizeRecentTurns(incoming.recentTurns);
  if (base) {
    const baseTurns = normalizeRecentTurns(base.recentTurns);
    if (incomingTurns.length < baseTurns.length && isTurnSubsequence(incomingTurns, baseTurns)) {
      return applyTurnDeletions(baseTurns, incomingTurns, latestTurns);
    }
    const latestDelta = extractRecentTurnDelta(baseTurns, latestTurns);
    const incomingDelta = extractRecentTurnDelta(baseTurns, incomingTurns);
    return normalizeRecentTurns([
      ...baseTurns,
      ...(incomingIsLater ? latestDelta : incomingDelta),
      ...(incomingIsLater ? incomingDelta : latestDelta),
    ]);
  }

  let commonPrefixLength = 0;
  while (
    commonPrefixLength < latestTurns.length &&
    commonPrefixLength < incomingTurns.length &&
    sameTurn(latestTurns[commonPrefixLength], incomingTurns[commonPrefixLength])
  ) {
    commonPrefixLength += 1;
  }

  const prefix = latestTurns.slice(0, commonPrefixLength);
  const latestSuffix = latestTurns.slice(commonPrefixLength);
  const incomingSuffix = incomingTurns.slice(commonPrefixLength);
  return normalizeRecentTurns([
    ...prefix,
    ...(incomingIsLater ? latestSuffix : incomingSuffix),
    ...(incomingIsLater ? incomingSuffix : latestSuffix),
  ]);
}

/**
 * Resolve a concurrent context write without dropping either visible turn.
 * With a base snapshot, independent field changes are rebased onto the latest
 * state; conflicting writes to the same value follow event time.
 */
export function mergeConcurrentConversationContexts(
  latest: ConversationContext,
  incoming: ConversationContext,
  base?: ConversationContext,
) {
  const incomingIsLater = contextTimestamp(incoming) >= contextTimestamp(latest);
  const rebased = base
    ? rebaseContextValue(base, incoming, latest, incomingIsLater)
    : incomingIsLater ? incoming : latest;
  const canonical = isPlainObject(rebased) ? rebased as unknown as ConversationContext : incoming;
  return {
    ...canonical,
    contextRevision: normalizeContextRevision(latest.contextRevision),
    recentTurns: mergeConcurrentRecentTurns(latest, incoming, incomingIsLater, base),
    userId: canonical.userId || latest.userId || incoming.userId,
  } satisfies ConversationContext;
}

async function loadAuthoritativeConversationContext(userId: string) {
  const row = await loadConversationRuntimeState(userId);
  const contextJson = (row?.context_json ?? {}) as Partial<ConversationContext>;
  const bookingDraftJson =
    ((row?.booking_draft_json ?? contextJson.bookingDraft ?? {}) as Partial<BookingDraft>) ?? {};
  return hydrateConversationContext(userId, contextJson, bookingDraftJson);
}

const localContextWriteQueues = new Map<string, Promise<void>>();

async function withLocalContextWriteLock<T>(userId: string, operation: () => Promise<T>) {
  const previous = localContextWriteQueues.get(userId) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  localContextWriteQueues.set(userId, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (localContextWriteQueues.get(userId) === queued) {
      localContextWriteQueues.delete(userId);
    }
  }
}

export async function saveConversationContext(context: ConversationContext, baseContext?: ConversationContext) {
  if (!context.userId) {
    return;
  }

  if (isSupabaseConversationStoreEnabled()) {
    try {
      let expectedRevision = normalizeContextRevision(context.contextRevision);
      let candidate = {
        ...context,
        contextRevision: expectedRevision + 1,
      } satisfies ConversationContext;

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        if (await saveConversationRuntimeContextIfCurrent(
          context.userId,
          candidate as unknown as Record<string, unknown>,
          candidate.bookingDraft as unknown as Record<string, unknown>,
          expectedRevision,
        )) {
          return;
        }

        const latest = await loadAuthoritativeConversationContext(context.userId);
        expectedRevision = normalizeContextRevision(latest.contextRevision);
        candidate = {
          ...mergeConcurrentConversationContexts(latest, context, baseContext),
          contextRevision: expectedRevision + 1,
        };
      }

      throw new Error("Conversation context compare-and-swap exhausted");
    } catch {
      // Fallback to local file persistence until Supabase schema is ready.
    }
  }

  await withLocalContextWriteLock(context.userId, async () => {
    const filePath = buildContextFilePath(context.userId);
    let latest = createEmptyConversationContext(context.userId);
    try {
      const content = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(content) as Partial<ConversationContext>;
      latest = hydrateConversationContext(context.userId, parsed, parsed.bookingDraft);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== "ENOENT") throw error;
    }

    const latestRevision = normalizeContextRevision(latest.contextRevision);
    const contextRevision = normalizeContextRevision(context.contextRevision);
    const candidate = latestRevision === contextRevision
      ? context
      : mergeConcurrentConversationContexts(latest, context, baseContext);
    const persisted = {
      ...candidate,
      contextRevision: latestRevision + 1,
    } satisfies ConversationContext;
    const directory = getConversationContextDir();
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(persisted, null, 2), "utf8");
  });
}
