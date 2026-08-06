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

export type BookingDraft = {
  appointmentAt?: string;
  branch?: string;
  isFirstVisit?: "no" | "unknown" | "yes";
  name?: string;
  phone?: string;
  pregnancyRiskFlag?: boolean;
  requestedTimeSlots?: string[];
  timeSlots: string[];
  treatment?: string;
};

export type ConversationContext = {
  bookingSession?: {
    lastActiveAt: string;
    status: "collecting" | "stale";
  };
  bookingDraft: BookingDraft;
  introSent: boolean;
  lastIntent?: string;
  lastReferencedBranch?: string;
  lastReferencedTreatment?: string;
  lastSeenAt?: string;
  locationPreference?: string;
  preferredBranch?: string;
  pregnancyRiskFlag?: boolean;
  treatmentConsultation?: {
    concernKeys: string[];
    primaryConcernKey?: string;
    stage?: "needs_discovery" | "priority_selected";
    treatmentKey: string;
  };
  userId: string;
};

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
  if (appointmentAt) {
    bookingDraft.appointmentAt = appointmentAt;
  } else {
    delete bookingDraft.appointmentAt;
  }

  return {
    ...context,
    bookingDraft,
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
      bookingDraft: {
        ...createEmptyBookingDraft(),
        ...(parsed.bookingDraft ?? {}),
        requestedTimeSlots: Array.isArray(parsed.bookingDraft?.requestedTimeSlots)
          ? parsed.bookingDraft.requestedTimeSlots
          : [],
        timeSlots: Array.isArray(parsed.bookingDraft?.timeSlots) ? parsed.bookingDraft.timeSlots : [],
      },
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
