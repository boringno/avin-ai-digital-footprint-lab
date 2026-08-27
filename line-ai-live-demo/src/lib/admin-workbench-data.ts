import type { AdminStaffUser } from "@/lib/admin-auth";
import type { BookingStatusKey } from "@/lib/admin-display-maps";
import type { ConversationState } from "@/lib/conversation-state";
import { createEmptyConversationState } from "@/lib/conversation-state";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { reportOperationalError } from "@/lib/monitoring";
import { hasCurrentPregnancyRiskMarker, hasPregnancyRiskMarker } from "@/lib/admin-risk-flags";
import { findTreatmentByKey } from "@/lib/clinic-config";
import { parsePersistedConversationV2State } from "@/lib/conversation-v2/state";
import {
  getConversationDecisionTrace,
  type ConversationDecisionTrace,
} from "@/lib/admin-conversation-decision-trace";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

export type WorkbenchQueueItem = {
  conversationId: string;
  createdAt: string;
  customerName: string | null;
  displayName: string;
  handoffReason: string;
  interestedTreatments: string[];
  lastCustomerMessage: string;
  lastSeenAt: string;
  lineUserId: string;
  phoneTail: string | null;
  pregnancyRisk: boolean;
  preferredBranch: string | null;
  status: ConversationState["status"];
  taskAssignedTo: string | null;
  taskId: string;
  taskStatus: "open" | "resolved" | "taken";
};

export type WorkbenchLeadSummary = {
  bookingStatus: BookingStatusKey;
  conversationId: string;
  customerName: string | null;
  displayName: string;
  id: string;
  interestedTreatments: string[];
  lineUserId: string;
  phone: string | null;
  pregnancyRisk: boolean;
  preferredBranch: string | null;
  preferredTimeSlots: string[];
  updatedAt: string;
};

export type WorkbenchMessage = {
  content: string;
  createdAt: string;
  decisionTrace: ConversationDecisionTrace | null;
  direction: "ai" | "customer" | "staff" | "system";
  id: string;
  sendError: string | null;
  sendStatus: "failed" | "pending" | "sent" | "skipped";
  staffName: string | null;
};

export type WorkbenchConversationDetail = {
  bookingLead: null | {
    bookingStatus: string;
    customerName: string | null;
    interestedTreatments: string[];
    phone: string | null;
    pregnancyRisk: boolean;
    preferredBranch: string | null;
    preferredTimeSlots: string[];
  };
  consultedTreatments: string[];
  conversationId: string;
  displayName: string;
  leadStage: string;
  lineUserId: string;
  messages: WorkbenchMessage[];
  state: ConversationState;
};

type ConversationRow = {
  display_name: string | null;
  id: string;
  last_seen_at: string;
  lead_stage: string;
  line_user_id: string;
};

type HandoffTaskRow = {
  assigned_to: string | null;
  conversation_id: string;
  created_at: string;
  id: string;
  reason: string;
  status: "open" | "resolved" | "taken";
  updated_at: string;
};

type MessageRow = {
  content: string;
  created_at: string;
  direction: "ai" | "customer" | "staff" | "system";
  id: string;
  payload_json: unknown;
  send_error: string | null;
  send_status: "failed" | "pending" | "sent" | "skipped";
};

type RuntimeStateRow = {
  context_json?: Record<string, unknown>;
  line_user_id: string;
  state_json: Record<string, unknown>;
};

type BookingLeadRow = {
  booking_status: string;
  conversation_id: string;
  customer_name: string | null;
  id: string;
  interested_treatments: unknown;
  notes: string | null;
  phone: string | null;
  preferred_branch: string | null;
  preferred_time_slots: unknown;
  updated_at: string;
};

const bookingStatusSet = new Set<BookingStatusKey>(["new", "contacted", "booked", "arrived", "won", "lost"]);
export const ADMIN_CONVERSATION_MESSAGE_LIMIT = 80;

export function orderNewestMessagesChronologically<T>(newestFirstMessages: T[]) {
  return [...newestFirstMessages].reverse();
}

export function getConsultedTreatmentNames(
  contextJson: Record<string, unknown> | undefined,
) {
  const state = parsePersistedConversationV2State(contextJson?.conversationV2State);
  if (!state) return [];
  return Array.from(new Set(state.knowledge.consultedTreatmentKeys.map((key) =>
    findTreatmentByKey(key)?.name ?? key,
  )));
}

export async function loadWorkbenchData(staff: AdminStaffUser, selectedConversationId?: string) {
  if (!hasSupabaseServerConfig()) {
    return {
      detail: null,
      leadSummaries: [],
      queue: [],
    };
  }

  const [queue, leadSummaries] = await Promise.all([loadWorkbenchQueue(staff), loadWorkbenchLeadSummaries(staff)]);
  const selectedId = selectedConversationId || queue[0]?.conversationId || "";
  const detail = selectedId ? await loadConversationDetail(staff, selectedId) : null;

  return {
    detail,
    leadSummaries,
    queue,
  };
}

export async function loadConversationDetail(staff: AdminStaffUser, conversationId: string): Promise<WorkbenchConversationDetail | null> {
  const supabase = getSupabaseServerClient();
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, line_user_id, display_name, lead_stage, last_seen_at")
    .eq("tenant_id", staff.tenantId)
    .eq("id", conversationId)
    .maybeSingle<ConversationRow>();

  if (conversationError) {
    throw new Error(`Failed to load workbench conversation: ${conversationError.message}`);
  }

  if (!conversation) {
    return null;
  }

  const [{ data: messages, error: messagesError }, { data: runtimeState }, { data: bookingLead }] = await Promise.all([
    supabase
      .from("conversation_messages")
      .select("id, direction, content, payload_json, send_status, send_error, created_at")
      .eq("tenant_id", staff.tenantId)
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(ADMIN_CONVERSATION_MESSAGE_LIMIT),
    supabase
      .from("conversation_runtime_state")
      .select("line_user_id, state_json, context_json")
      .eq("tenant_id", staff.tenantId)
      .eq("line_user_id", conversation.line_user_id)
      .maybeSingle<RuntimeStateRow>(),
    supabase
      .from("booking_leads_db")
      .select("booking_status, interested_treatments, preferred_branch, preferred_time_slots, customer_name, phone, notes")
      .eq("tenant_id", staff.tenantId)
      .eq("conversation_id", conversation.id)
      .maybeSingle<BookingLeadRow>(),
  ]);

  if (messagesError) {
    throw new Error(`Failed to load workbench messages: ${messagesError.message}`);
  }

  return {
    bookingLead: bookingLead
      ? {
          bookingStatus: bookingLead.booking_status,
          customerName: bookingLead.customer_name,
          interestedTreatments: normalizeStringArray(bookingLead.interested_treatments),
          phone: bookingLead.phone,
          pregnancyRisk: hasCurrentPregnancyRiskMarker({
            bookingStatus: bookingLead.booking_status,
            contextJson: runtimeState?.context_json,
            notes: bookingLead.notes,
          }),
          preferredBranch: bookingLead.preferred_branch,
          preferredTimeSlots: normalizeStringArray(bookingLead.preferred_time_slots),
        }
      : null,
    consultedTreatments: getConsultedTreatmentNames(runtimeState?.context_json),
    conversationId: conversation.id,
    displayName: conversation.display_name || shortLineUserId(conversation.line_user_id),
    leadStage: conversation.lead_stage,
    lineUserId: conversation.line_user_id,
    messages: orderNewestMessagesChronologically((messages ?? []) as MessageRow[]).map((message) => ({
      content: message.content,
      createdAt: message.created_at,
      decisionTrace: getConversationDecisionTrace(message.payload_json),
      direction: message.direction,
      id: message.id,
      sendError: message.send_error,
      sendStatus: message.send_status,
      staffName: getStaffMessageName(message.payload_json),
    })),
    state: normalizeConversationState(conversation.line_user_id, runtimeState?.state_json),
  };
}

export async function markHandoffTaskTaken(staff: AdminStaffUser, lineUserId: string) {
  await updateHandoffTaskForLineUser(staff, lineUserId, "taken");
}

export async function markHandoffTaskResolved(staff: AdminStaffUser, lineUserId: string) {
  await updateHandoffTaskForLineUser(staff, lineUserId, "resolved");
}

export async function insertStaffMessageRecord(input: {
  content: string;
  lineUserId: string;
  staff: AdminStaffUser;
}) {
  const supabase = getSupabaseServerClient();
  const conversation = await findConversationByLineUserId(input.staff, input.lineUserId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const { data, error } = await supabase
    .from("conversation_messages")
    .insert({
      content: input.content,
      conversation_id: conversation.id,
      direction: "staff",
      intent: "staff_reply",
      message_type: "text",
      payload_json: {
        staff_id: input.staff.id,
        staff_name: input.staff.displayName,
      },
      send_status: "pending",
      tenant_id: input.staff.tenantId,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    throw new Error(`Failed to insert staff message: ${error?.message ?? "missing row"}`);
  }

  return data.id;
}

export async function updateStaffMessageSendStatus(input: {
  errorMessage?: string;
  messageId: string;
  sendStatus: "failed" | "sent";
  staff: AdminStaffUser;
}) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("conversation_messages")
    .update({
      send_error: input.errorMessage ?? null,
      send_status: input.sendStatus,
    })
    .eq("tenant_id", input.staff.tenantId)
    .eq("id", input.messageId);

  if (error) {
    await reportOperationalError({
      alert: false,
      error: new Error(`Failed to update staff message status: ${error.message}`),
      source: "admin_workbench_message_status",
    });
  }
}

export async function sendLinePushText(input: { text: string; to: string }) {
  const config = getRuntimeConfig();
  if (!config.lineAccessToken) {
    return {
      body: "LINE_CHANNEL_ACCESS_TOKEN is missing",
      ok: false,
      status: 0,
    };
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    body: JSON.stringify({
      messages: [
        {
          text: input.text,
          type: "text",
        },
      ],
      to: input.to,
    }),
    headers: {
      Authorization: `Bearer ${config.lineAccessToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  return {
    body: await response.text(),
    ok: response.ok,
    status: response.status,
  };
}

async function loadWorkbenchQueue(staff: AdminStaffUser) {
  const supabase = getSupabaseServerClient();
  const { data: tasks, error: tasksError } = await supabase
    .from("handoff_tasks")
    .select("id, conversation_id, reason, status, assigned_to, created_at, updated_at")
    .eq("tenant_id", staff.tenantId)
    .in("status", ["open", "taken"])
    .order("updated_at", { ascending: false })
    .limit(50);

  if (tasksError) {
    throw new Error(`Failed to load handoff queue: ${tasksError.message}`);
  }

  const taskRows = (tasks ?? []) as HandoffTaskRow[];
  if (taskRows.length === 0) {
    return [];
  }

  const conversationIds = taskRows.map((task) => task.conversation_id);
  const { data: conversations, error: conversationsError } = await supabase
    .from("conversations")
    .select("id, line_user_id, display_name, lead_stage, last_seen_at")
    .eq("tenant_id", staff.tenantId)
    .in("id", conversationIds);

  if (conversationsError) {
    throw new Error(`Failed to load queue conversations: ${conversationsError.message}`);
  }

  const conversationMap = new Map(((conversations ?? []) as ConversationRow[]).map((conversation) => [conversation.id, conversation]));
  const runtimeRows = await loadRuntimeStates(staff, (conversations ?? []).map((conversation) => conversation.line_user_id));
  const [latestMessages, queueLeadInfo] = await Promise.all([
    loadLatestCustomerMessages(staff, conversationIds),
    loadQueueLeadInfo(staff, conversationIds),
  ]);

  return taskRows.flatMap((task): WorkbenchQueueItem[] => {
    const conversation = conversationMap.get(task.conversation_id);
    if (!conversation) {
      return [];
    }

    const state = normalizeConversationState(conversation.line_user_id, runtimeRows.get(conversation.line_user_id));
    return [
      {
        conversationId: conversation.id,
        createdAt: task.created_at,
        customerName: queueLeadInfo.get(conversation.id)?.customerName ?? null,
        displayName: conversation.display_name || shortLineUserId(conversation.line_user_id),
        handoffReason: task.reason,
        interestedTreatments: queueLeadInfo.get(conversation.id)?.interestedTreatments ?? [],
        lastCustomerMessage: latestMessages.get(conversation.id) ?? "",
        lastSeenAt: conversation.last_seen_at,
        lineUserId: conversation.line_user_id,
        phoneTail: queueLeadInfo.get(conversation.id)?.phoneTail ?? null,
        pregnancyRisk: hasPregnancyRiskMarker({ handoffReason: task.reason }),
        preferredBranch: queueLeadInfo.get(conversation.id)?.preferredBranch ?? null,
        status: state.status,
        taskAssignedTo: task.assigned_to,
        taskId: task.id,
        taskStatus: task.status,
      },
    ];
  });
}

async function loadWorkbenchLeadSummaries(staff: AdminStaffUser) {
  const supabase = getSupabaseServerClient();
  const { data: leadRows, error: leadsError } = await supabase
    .from("booking_leads_db")
    .select("id, conversation_id, booking_status, interested_treatments, preferred_branch, preferred_time_slots, customer_name, phone, notes, updated_at")
    .eq("tenant_id", staff.tenantId)
    .in("booking_status", ["new", "contacted"])
    .order("updated_at", { ascending: false })
    .limit(3);

  if (leadsError) {
    throw new Error(`Failed to load workbench leads: ${leadsError.message}`);
  }

  const leads = (leadRows ?? []) as BookingLeadRow[];
  const conversations = await loadConversations(staff, leads.map((lead) => lead.conversation_id));

  return leads.flatMap((lead): WorkbenchLeadSummary[] => {
    const conversation = conversations.get(lead.conversation_id);
    if (!conversation) {
      return [];
    }

    return [
      {
        bookingStatus: normalizeBookingStatus(lead.booking_status),
        conversationId: lead.conversation_id,
        customerName: lead.customer_name,
        displayName: conversation.display_name || shortLineUserId(conversation.line_user_id),
        id: lead.id,
        interestedTreatments: normalizeStringArray(lead.interested_treatments),
        lineUserId: conversation.line_user_id,
        phone: lead.phone,
        pregnancyRisk: hasPregnancyRiskMarker({ notes: lead.notes }),
        preferredBranch: lead.preferred_branch,
        preferredTimeSlots: normalizeStringArray(lead.preferred_time_slots),
        updatedAt: lead.updated_at,
      },
    ];
  });
}

async function loadRuntimeStates(staff: AdminStaffUser, lineUserIds: string[]) {
  if (lineUserIds.length === 0) {
    return new Map<string, Record<string, unknown>>();
  }

  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("conversation_runtime_state")
    .select("line_user_id, state_json")
    .eq("tenant_id", staff.tenantId)
    .in("line_user_id", lineUserIds);

  return new Map(((data ?? []) as RuntimeStateRow[]).map((row) => [row.line_user_id, row.state_json]));
}

async function loadLatestCustomerMessages(staff: AdminStaffUser, conversationIds: string[]) {
  if (conversationIds.length === 0) {
    return new Map<string, string>();
  }

  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("conversation_messages")
    .select("conversation_id, content, created_at")
    .eq("tenant_id", staff.tenantId)
    .eq("direction", "customer")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false })
    .limit(200);

  const latest = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ content: string; conversation_id: string }>) {
    if (!latest.has(row.conversation_id)) {
      latest.set(row.conversation_id, row.content);
    }
  }

  return latest;
}

async function loadQueueLeadInfo(staff: AdminStaffUser, conversationIds: string[]) {
  if (conversationIds.length === 0) {
    return new Map<string, { customerName: string | null; interestedTreatments: string[]; notes: string | null; phoneTail: string | null; preferredBranch: string | null }>();
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("booking_leads_db")
    .select("conversation_id, customer_name, interested_treatments, preferred_branch, phone, notes")
    .eq("tenant_id", staff.tenantId)
    .in("conversation_id", conversationIds);

  if (error) {
    throw new Error(`Failed to load queue lead info: ${error.message}`);
  }

  return new Map(
    ((data ?? []) as Array<{ conversation_id: string; customer_name: string | null; interested_treatments: unknown; notes: string | null; phone: string | null; preferred_branch: string | null }>).map((row) => [
      row.conversation_id,
      {
        customerName: row.customer_name,
        interestedTreatments: normalizeStringArray(row.interested_treatments),
        notes: row.notes,
        phoneTail: lastPhoneDigits(row.phone),
        preferredBranch: row.preferred_branch,
      },
    ]),
  );
}

async function loadConversations(staff: AdminStaffUser, conversationIds: string[]) {
  if (conversationIds.length === 0) {
    return new Map<string, ConversationRow>();
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, line_user_id, display_name, last_seen_at")
    .eq("tenant_id", staff.tenantId)
    .in("id", conversationIds);

  if (error) {
    throw new Error(`Failed to load workbench conversations: ${error.message}`);
  }

  return new Map(((data ?? []) as ConversationRow[]).map((row) => [row.id, row]));
}

async function findConversationByLineUserId(staff: AdminStaffUser, lineUserId: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, line_user_id, display_name, lead_stage, last_seen_at")
    .eq("tenant_id", staff.tenantId)
    .eq("line_user_id", lineUserId)
    .maybeSingle<ConversationRow>();

  if (error) {
    throw new Error(`Failed to find conversation: ${error.message}`);
  }

  return data;
}

async function updateHandoffTaskForLineUser(staff: AdminStaffUser, lineUserId: string, status: "resolved" | "taken") {
  if (!hasSupabaseServerConfig()) {
    return;
  }

  const supabase = getSupabaseServerClient();
  const conversation = await findConversationByLineUserId(staff, lineUserId);
  if (!conversation) {
    return;
  }

  const patch =
    status === "taken"
      ? {
          assigned_to: staff.id,
          resolved_at: null,
          status,
        }
      : {
          resolved_at: new Date().toISOString(),
          status,
        };

  const { data: updatedTasks, error } = await supabase
    .from("handoff_tasks")
    .update(patch)
    .eq("tenant_id", staff.tenantId)
    .eq("conversation_id", conversation.id)
    .in("status", ["open", "taken"])
    .select("id");

  if (error) {
    await reportOperationalError({
      alert: false,
      error: new Error(`Failed to update handoff task: ${error.message}`),
      extra: {
        line_user_id: lineUserId,
        status,
      },
      source: "admin_workbench_handoff_task",
    });
    return;
  }

  // A staff member may open an ordinary historical conversation from the inbox.
  // Preserve that manual takeover in the same queue instead of requiring a new
  // customer safety handoff first.
  if (status === "taken" && (updatedTasks ?? []).length === 0) {
    const { error: insertError } = await supabase.from("handoff_tasks").insert({
      assigned_to: staff.id,
      conversation_id: conversation.id,
      reason: "manual_followup",
      status: "taken",
      tenant_id: staff.tenantId,
    });

    if (insertError) {
      await reportOperationalError({
        alert: true,
        error: new Error(`Failed to create manual follow-up task: ${insertError.message}`),
        extra: {
          line_user_id: lineUserId,
        },
        source: "admin_workbench_manual_followup",
      });
    }
  }
}

function normalizeConversationState(lineUserId: string, value: Record<string, unknown> | undefined) {
  return {
    ...createEmptyConversationState(lineUserId),
    ...(value ?? {}),
    userId: lineUserId,
  } as ConversationState;
}

function getStaffMessageName(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const staffName = (payload as Record<string, unknown>).staff_name;
  return typeof staffName === "string" && staffName.trim() ? staffName.trim() : null;
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function shortLineUserId(lineUserId: string) {
  return lineUserId.length > 8 ? `${lineUserId.slice(0, 6)}...${lineUserId.slice(-4)}` : lineUserId;
}

function lastPhoneDigits(phone: string | null) {
  if (!phone) {
    return null;
  }

  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : digits || null;
}

function normalizeBookingStatus(value: string) {
  return bookingStatusSet.has(value as BookingStatusKey) ? (value as BookingStatusKey) : "new";
}
