import type { AdminStaffUser } from "@/lib/admin-auth";
import type { ConversationState } from "@/lib/conversation-state";
import { createEmptyConversationState } from "@/lib/conversation-state";
import { hasCurrentPregnancyRiskMarker } from "@/lib/admin-risk-flags";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

import { loadConversationDetail, type WorkbenchConversationDetail } from "./admin-workbench-data";

export type ConversationInboxItem = {
  conversationId: string;
  customerName: string | null;
  displayName: string;
  lastMessage: string;
  lastSeenAt: string;
  lineUserId: string;
  pregnancyRisk: boolean;
  status: ConversationState["status"];
};

export type ConversationInboxData = {
  detail: WorkbenchConversationDetail | null;
  items: ConversationInboxItem[];
};

type ConversationRow = {
  display_name: string | null;
  id: string;
  last_seen_at: string;
  line_user_id: string;
};

type LeadRow = {
  booking_status: string;
  conversation_id: string;
  customer_name: string | null;
  notes: string | null;
};

type MessageRow = {
  content: string;
  conversation_id: string;
};

type RuntimeStateRow = {
  context_json?: Record<string, unknown>;
  line_user_id: string;
  state_json: Record<string, unknown>;
};

export async function loadConversationInboxData(staff: AdminStaffUser, search = "", selectedConversationId?: string): Promise<ConversationInboxData> {
  if (!hasSupabaseServerConfig()) {
    return { detail: null, items: [] };
  }

  const supabase = getSupabaseServerClient();
  const { data: conversationRows, error: conversationsError } = await supabase
    .from("conversations")
    .select("id, line_user_id, display_name, last_seen_at")
    .eq("tenant_id", staff.tenantId)
    .order("last_seen_at", { ascending: false })
    .limit(100);

  if (conversationsError) {
    throw new Error(`Failed to load conversation inbox: ${conversationsError.message}`);
  }

  const conversations = (conversationRows ?? []) as ConversationRow[];
  const conversationIds = conversations.map((conversation) => conversation.id);
  const lineUserIds = conversations.map((conversation) => conversation.line_user_id);
  const [{ data: leads }, { data: messages }, { data: runtimeStates }] = await Promise.all([
    conversationIds.length
      ? supabase
          .from("booking_leads_db")
          .select("conversation_id, customer_name, notes, booking_status")
          .eq("tenant_id", staff.tenantId)
          .in("conversation_id", conversationIds)
      : Promise.resolve({ data: [] as LeadRow[] }),
    conversationIds.length
      ? supabase
          .from("conversation_messages")
          .select("conversation_id, content")
          .eq("tenant_id", staff.tenantId)
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: false })
          .limit(400)
      : Promise.resolve({ data: [] as MessageRow[] }),
    lineUserIds.length
      ? supabase
          .from("conversation_runtime_state")
          .select("line_user_id, state_json, context_json")
          .eq("tenant_id", staff.tenantId)
          .in("line_user_id", lineUserIds)
      : Promise.resolve({ data: [] as RuntimeStateRow[] }),
  ]);

  const leadByConversation = new Map(((leads ?? []) as LeadRow[]).map((lead) => [lead.conversation_id, lead]));
  const lastMessageByConversation = new Map<string, string>();
  for (const message of (messages ?? []) as MessageRow[]) {
    if (!lastMessageByConversation.has(message.conversation_id)) {
      lastMessageByConversation.set(message.conversation_id, message.content);
    }
  }
  const runtimeRows = (runtimeStates ?? []) as RuntimeStateRow[];
  const runtimeByLineUser = new Map(runtimeRows.map((state) => [state.line_user_id, state.state_json]));
  const contextByLineUser = new Map(runtimeRows.map((state) => [state.line_user_id, state.context_json]));

  const items = conversations
    .map((conversation) => {
      const displayName = conversation.display_name || shortLineUserId(conversation.line_user_id);
      const lead = leadByConversation.get(conversation.id);
      const customerName = lead?.customer_name ?? null;
      return {
        conversationId: conversation.id,
        customerName,
        displayName,
        lastMessage: lastMessageByConversation.get(conversation.id) ?? "尚未擷取到訊息",
        lastSeenAt: conversation.last_seen_at,
        lineUserId: conversation.line_user_id,
        pregnancyRisk: hasCurrentPregnancyRiskMarker({
          bookingStatus: lead?.booking_status,
          contextJson: contextByLineUser.get(conversation.line_user_id),
          notes: lead?.notes,
        }),
        status: normalizeState(conversation.line_user_id, runtimeByLineUser.get(conversation.line_user_id)).status,
      } satisfies ConversationInboxItem;
    })
    .filter((item) => matchesConversationSearch(item, search));

  const selectedId = selectedConversationId || items[0]?.conversationId;
  return {
    detail: selectedId ? await loadConversationDetail(staff, selectedId) : null,
    items,
  };
}

export function matchesConversationSearch(item: ConversationInboxItem, search: string) {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  return [item.customerName, item.displayName, item.lastMessage, item.lineUserId]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase().includes(normalizedSearch));
}

function normalizeState(lineUserId: string, state: Record<string, unknown> | undefined) {
  return {
    ...createEmptyConversationState(lineUserId),
    ...(state ?? {}),
    userId: lineUserId,
  } as ConversationState;
}

function shortLineUserId(lineUserId: string) {
  return lineUserId.length > 8 ? `${lineUserId.slice(0, 6)}...${lineUserId.slice(-4)}` : lineUserId;
}
