import fs from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_TENANT_ID,
  isSupabaseConversationStoreEnabled,
  loadConversationRuntimeState,
  saveConversationRuntimeState,
} from "@/lib/conversation-store";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { PersistedDialogueStateV1 } from "@/lib/dialogue-state";

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
    kind: "area" | "branch" | "concern" | "priority" | "time";
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
    ["area", "branch", "concern", "priority", "time"].includes(focus.awaiting.kind) &&
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

function createEmptyBookingDraft(): BookingDraft {
  return {
    requestedTimeSlots: [],
    timeSlots: [],
  };
}

export function createEmptyConversationContext(userId: string): ConversationContext {
  return {
    bookingDraft: createEmptyBookingDraft(),
    introSent: false,
    recentTurns: [],
    userId,
  };
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
    const supabase = getSupabaseServerClient();
    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id")
      .eq("tenant_id", DEFAULT_TENANT_ID)
      .eq("line_user_id", userId)
      .maybeSingle<{ id: string }>();

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
      .maybeSingle<{ appointment_at: string | null }>();

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

      return applyConfirmedAppointmentAt({
        ...createEmptyConversationContext(userId),
        ...contextJson,
        activeFocus: normalizeConversationFocus(contextJson.activeFocus),
        bookingSession: normalizeBookingSession(contextJson.bookingSession),
        confirmedAppointment: normalizeConfirmedAppointment(
          contextJson.confirmedAppointment,
          bookingDraftJson.appointmentAt ?? contextJson.bookingDraft?.appointmentAt,
        ),
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
      });
    } catch {
      // Fallback to local file persistence until Supabase schema is ready.
    }
  }

  const filePath = buildContextFilePath(userId);

  try {
    const content = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as Partial<ConversationContext>;

    return applyConfirmedAppointmentAt({
      ...createEmptyConversationContext(userId),
      ...parsed,
      activeFocus: normalizeConversationFocus(parsed.activeFocus),
      bookingSession: normalizeBookingSession(parsed.bookingSession),
      confirmedAppointment: normalizeConfirmedAppointment(
        parsed.confirmedAppointment,
        parsed.bookingDraft?.appointmentAt,
      ),
      customerProfile: normalizeCustomerProfile(parsed.customerProfile),
      bookingDraft: {
        ...createEmptyBookingDraft(),
        ...(parsed.bookingDraft ?? {}),
        requestedTimeSlots: Array.isArray(parsed.bookingDraft?.requestedTimeSlots)
          ? parsed.bookingDraft.requestedTimeSlots
          : [],
        timeSlots: Array.isArray(parsed.bookingDraft?.timeSlots) ? parsed.bookingDraft.timeSlots : [],
      },
      recentTurns: normalizeRecentTurns(parsed.recentTurns),
      userId,
    });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return createEmptyConversationContext(userId);
    }
    throw error;
  }
}

export async function saveConversationContext(context: ConversationContext) {
  if (!context.userId) {
    return;
  }

  if (isSupabaseConversationStoreEnabled()) {
    try {
      await saveConversationRuntimeState(context.userId, {
        booking_draft_json: context.bookingDraft as unknown as Record<string, unknown>,
        context_json: context as unknown as Record<string, unknown>,
      });
      return;
    } catch {
      // Fallback to local file persistence until Supabase schema is ready.
    }
  }

  const directory = getConversationContextDir();
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(buildContextFilePath(context.userId), JSON.stringify(context, null, 2), "utf8");
}
