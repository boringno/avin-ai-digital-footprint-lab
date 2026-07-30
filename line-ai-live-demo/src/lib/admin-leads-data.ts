import type { AdminStaffUser } from "@/lib/admin-auth";
import { writeAdminAuditLog } from "@/lib/admin-audit";
import { bookingStatusLabels, type BookingStatusKey } from "@/lib/admin-display-maps";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

export type AdminLeadCard = {
  bookingStatus: BookingStatusKey;
  conversationId: string;
  customerName: string | null;
  displayName: string;
  id: string;
  interestedTreatments: string[];
  lastSeenAt: string;
  lineUserId: string;
  notes: string;
  phone: string | null;
  preferredBranch: string | null;
  preferredTimeSlots: string[];
  staffOwnerId: string | null;
  staffOwnerName: string | null;
  updatedAt: string;
};

export type AdminLeadsData = {
  leads: AdminLeadCard[];
  staffOptions: Array<{
    displayName: string;
    id: string;
  }>;
};

type BookingLeadRow = {
  booking_status: BookingStatusKey;
  conversation_id: string;
  customer_name: string | null;
  id: string;
  interested_treatments: unknown;
  notes: string;
  phone: string | null;
  preferred_branch: string | null;
  preferred_time_slots: unknown;
  staff_owner: string | null;
  updated_at: string;
};

type ConversationRow = {
  display_name: string | null;
  id: string;
  last_seen_at: string;
  line_user_id: string;
};

type StaffRow = {
  display_name: string;
  id: string;
};

const bookingStatusKeys = Object.keys(bookingStatusLabels) as BookingStatusKey[];
const bookingStatusSet = new Set<string>(bookingStatusKeys);

export async function loadAdminLeadsData(staff: AdminStaffUser): Promise<AdminLeadsData> {
  if (!hasSupabaseServerConfig()) {
    return {
      leads: [],
      staffOptions: [],
    };
  }

  const supabase = getSupabaseServerClient();
  const [{ data: leadRows, error: leadsError }, { data: staffRows, error: staffError }] = await Promise.all([
    supabase
      .from("booking_leads_db")
      .select("id, conversation_id, booking_status, interested_treatments, preferred_branch, preferred_time_slots, customer_name, phone, staff_owner, notes, updated_at")
      .eq("tenant_id", staff.tenantId)
      .order("updated_at", { ascending: false })
      .limit(200),
    supabase
      .from("staff_users")
      .select("id, display_name")
      .eq("tenant_id", staff.tenantId)
      .eq("is_active", true)
      .order("display_name", { ascending: true }),
  ]);

  if (leadsError) {
    throw new Error(`Failed to load booking leads: ${leadsError.message}`);
  }
  if (staffError) {
    throw new Error(`Failed to load lead staff options: ${staffError.message}`);
  }

  const leads = (leadRows ?? []) as BookingLeadRow[];
  const conversationIds = leads.map((lead) => lead.conversation_id);
  const conversations = await loadConversations(staff, conversationIds);
  const staffMap = new Map(((staffRows ?? []) as StaffRow[]).map((row) => [row.id, row.display_name]));

  return {
    leads: leads.flatMap((lead): AdminLeadCard[] => {
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
          lastSeenAt: conversation.last_seen_at,
          lineUserId: conversation.line_user_id,
          notes: lead.notes ?? "",
          phone: lead.phone,
          preferredBranch: lead.preferred_branch,
          preferredTimeSlots: normalizeStringArray(lead.preferred_time_slots),
          staffOwnerId: lead.staff_owner,
          staffOwnerName: lead.staff_owner ? staffMap.get(lead.staff_owner) ?? null : null,
          updatedAt: lead.updated_at,
        },
      ];
    }),
    staffOptions: ((staffRows ?? []) as StaffRow[]).map((row) => ({
      displayName: row.display_name,
      id: row.id,
    })),
  };
}

export async function updateAdminLead(input: {
  assignToSelf?: boolean;
  bookingStatus?: string;
  leadId: string;
  notes?: string;
  staff: AdminStaffUser;
}) {
  if (!hasSupabaseServerConfig()) {
    throw new Error("Supabase server config is incomplete");
  }

  const patch: Record<string, string | null> = {};
  if (input.bookingStatus !== undefined) {
    if (!bookingStatusSet.has(input.bookingStatus)) {
      throw new Error(`Invalid booking_status: ${input.bookingStatus}`);
    }
    patch.booking_status = input.bookingStatus;
  }
  if (input.notes !== undefined) {
    patch.notes = input.notes;
  }
  if (input.assignToSelf) {
    patch.staff_owner = input.staff.id;
  }

  if (Object.keys(patch).length === 0) {
    return null;
  }

  const supabase = getSupabaseServerClient();
  const { data: before, error: beforeError } = await supabase
    .from("booking_leads_db")
    .select("id, booking_status, notes, staff_owner")
    .eq("tenant_id", input.staff.tenantId)
    .eq("id", input.leadId)
    .maybeSingle<Record<string, unknown>>();

  if (beforeError) {
    throw new Error(`Failed to load lead before update: ${beforeError.message}`);
  }
  if (!before) {
    throw new Error("Lead not found");
  }

  const { data: after, error: updateError } = await supabase
    .from("booking_leads_db")
    .update(patch)
    .eq("tenant_id", input.staff.tenantId)
    .eq("id", input.leadId)
    .select("id, booking_status, notes, staff_owner")
    .single<Record<string, unknown>>();

  if (updateError || !after) {
    throw new Error(`Failed to update lead: ${updateError?.message ?? "missing row"}`);
  }

  await writeAdminAuditLog({
    action: "booking_lead.update",
    after,
    before,
    staff: input.staff,
    targetId: input.leadId,
    targetTable: "booking_leads_db",
  });

  return after;
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
    throw new Error(`Failed to load lead conversations: ${error.message}`);
  }

  return new Map(((data ?? []) as ConversationRow[]).map((row) => [row.id, row]));
}

function normalizeBookingStatus(value: string) {
  return bookingStatusSet.has(value) ? (value as BookingStatusKey) : "new";
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function shortLineUserId(lineUserId: string) {
  return lineUserId.length > 8 ? `${lineUserId.slice(0, 6)}...${lineUserId.slice(-4)}` : lineUserId;
}
