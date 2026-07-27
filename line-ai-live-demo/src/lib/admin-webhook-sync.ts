import type { ProcessedWebhookResult, ReplySendResult } from "@/lib/line-webhook";
import { notifyAdminHandoffCreated } from "@/lib/admin-handoff-notifications";
import { storeRuleIntentLabel } from "@/lib/intent-label-store";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { reportOperationalError } from "@/lib/monitoring";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

const TENANT_ID = "tenant_001";

type LeadStage = "booking_intent" | "closed" | "handoff_pending" | "human_followup" | "interested" | "new_inquiry";
type MessageType = "flex" | "image" | "postback" | "template" | "text" | "unknown";
type SendStatus = "failed" | "pending" | "sent" | "skipped";

type ConversationRow = {
  display_name: string | null;
  id: string;
  lead_stage: LeadStage;
};

type BookingLeadRow = {
  booking_status: string;
  customer_name: string | null;
  interested_treatments: unknown;
  notes: string;
  phone: string | null;
  preferred_branch: string | null;
  preferred_time_slots: unknown;
  staff_owner: string | null;
};

type SyncAdminWebhookInput = {
  loggedAt: string;
  replyResults: ReplySendResult[];
  results: ProcessedWebhookResult[];
};

export async function syncWebhookResultsToAdminDb(input: SyncAdminWebhookInput) {
  if (!hasSupabaseServerConfig() || input.results.length === 0) {
    return;
  }

  try {
    for (const result of input.results) {
      await captureLineGroupSource(result);

      if (!result.sourceUserId) {
        continue;
      }

      const conversation = await upsertConversation(result);
      const customerMessageId = await insertCustomerMessage(conversation.id, result);

      if (!customerMessageId) {
        continue;
      }

      await safelyStoreIntentLabel(customerMessageId, result, "customer");
      const aiMessageId = await insertAiMessage(conversation.id, result, input.replyResults);
      if (aiMessageId) {
        await safelyStoreIntentLabel(aiMessageId, result, "ai");
      }
      await maybeCreateHandoffTask(conversation.id, result);
      await maybeUpsertBookingLead(conversation.id, result);
    }
  } catch (error) {
    await reportOperationalError({
      alert: false,
      error,
      extra: {
        result_count: input.results.length,
      },
      source: "admin_webhook_sync",
    });
  }
}

async function captureLineGroupSource(result: ProcessedWebhookResult) {
  if (result.sourceType !== "group" || !result.sourceGroupId) {
    return;
  }

  try {
    const supabase = getSupabaseServerClient();
    const groupName = await fetchLineGroupName(result.sourceGroupId);
    const { error } = await supabase
      .from("line_group_sources")
      .upsert(
        {
          group_id: result.sourceGroupId,
          group_name: groupName,
          last_event_id: emptyToNull(result.webhookEventId),
          last_seen_at: new Date().toISOString(),
          tenant_id: TENANT_ID,
        },
        { onConflict: "tenant_id,group_id" },
      );

    if (error) {
      throw new Error(`Failed to capture LINE group source: ${error.message}`);
    }
  } catch (error) {
    await reportOperationalError({
      alert: false,
      error,
      extra: {
        group_id: result.sourceGroupId,
        webhook_event_id: result.webhookEventId,
      },
      source: "line_group_source_capture",
    });
  }
}

async function upsertConversation(result: ProcessedWebhookResult) {
  const supabase = getSupabaseServerClient();
  const now = new Date().toISOString();

  const { data: existing, error: selectError } = await supabase
    .from("conversations")
    .select("id, lead_stage, display_name")
    .eq("tenant_id", TENANT_ID)
    .eq("line_user_id", result.sourceUserId)
    .maybeSingle<ConversationRow>();

  if (selectError) {
    throw new Error(`Failed to load admin conversation: ${selectError.message}`);
  }

  const leadStage = mergeLeadStage(existing?.lead_stage, deriveLeadStage(result));
  // LINE webhook events provide a stable user ID but not the customer's profile name.
  // Fetch it after the customer has already received their reply, then retain it locally.
  const displayName = existing?.display_name || (await fetchLineDisplayName(result.sourceUserId));
  const { data, error } = await supabase
    .from("conversations")
    .upsert(
      {
        ...(displayName ? { display_name: displayName } : {}),
        last_seen_at: now,
        lead_stage: leadStage,
        line_user_id: result.sourceUserId,
        tenant_id: TENANT_ID,
      },
      { onConflict: "tenant_id,line_user_id" },
    )
    .select("id, lead_stage, display_name")
    .single<ConversationRow>();

  if (error || !data) {
    throw new Error(`Failed to upsert admin conversation: ${error?.message ?? "missing row"}`);
  }

  return data;
}

async function fetchLineDisplayName(lineUserId: string) {
  const accessToken = getRuntimeConfig().lineAccessToken;
  if (!lineUserId || !accessToken) {
    return null;
  }

  try {
    const response = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const profile = (await response.json()) as { displayName?: unknown };
    return typeof profile.displayName === "string" && profile.displayName.trim() ? profile.displayName.trim() : null;
  } catch {
    // A profile lookup must never interrupt conversation, booking, or handoff persistence.
    return null;
  }
}

async function fetchLineGroupName(groupId: string) {
  const accessToken = getRuntimeConfig().lineAccessToken;
  if (!groupId || !accessToken) {
    return null;
  }

  try {
    const response = await fetch(`https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/summary`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { groupName?: unknown };
    return typeof payload.groupName === "string" && payload.groupName.trim() ? payload.groupName.trim() : null;
  } catch {
    return null;
  }
}

async function insertCustomerMessage(conversationId: string, result: ProcessedWebhookResult) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("conversation_messages")
    .insert({
      content: result.messageText ?? "",
      conversation_id: conversationId,
      direction: "customer",
      intent: result.decision.matchedKey || result.decision.decisionType,
      line_message_id: emptyToNull(result.messageId),
      message_type: normalizeMessageType(result.eventType === "message" ? "text" : result.eventType),
      payload_json: {
        conversation_status: result.conversationStatus,
        decision_type: result.decision.decisionType,
        event_type: result.eventType,
        matched_key: result.decision.matchedKey,
        matched_type: result.decision.matchedType,
      },
      send_status: "sent",
      source_event_id: emptyToNull(result.webhookEventId),
      tenant_id: TENANT_ID,
    })
    .select("id")
    .single<{ id: string }>();

  if (isUniqueViolation(error)) {
    return null;
  }

  if (error) {
    throw new Error(`Failed to insert customer message: ${error.message}`);
  }

  return data?.id ?? null;
}

async function insertAiMessage(conversationId: string, result: ProcessedWebhookResult, replyResults: ReplySendResult[]) {
  if (!result.replyPayload) {
    return null;
  }

  const supabase = getSupabaseServerClient();
  const replyResult = findReplyResult(result, replyResults);
  const { data, error } = await supabase
    .from("conversation_messages")
    .insert({
      content: extractReplyContent(result),
      ai_model: result.aiModel ?? null,
      ai_tokens_in: result.aiTokensIn ?? null,
      ai_tokens_out: result.aiTokensOut ?? null,
      conversation_id: conversationId,
      direction: "ai",
      intent: result.decision.matchedKey || result.decision.decisionType,
      line_message_id: null,
      message_type: getReplyMessageType(result),
      payload_json: {
        decision_type: result.decision.decisionType,
        matched_key: result.decision.matchedKey,
        matched_type: result.decision.matchedType,
        message_count: result.replyPayload.messages.length,
        reply_status: replyResult?.status ?? null,
        used_ai_humanizer: result.usedAiHumanizer,
        used_ai_reply_generator: result.usedAiReplyGenerator,
      },
      send_error: replyResult && !replyResult.ok ? replyResult.errorMessage ?? replyResult.responseBody : null,
      send_status: deriveSendStatus(replyResult),
      source_event_id: null,
      tenant_id: TENANT_ID,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw new Error(`Failed to insert AI message: ${error.message}`);
  }

  return data?.id ?? null;
}

async function safelyStoreIntentLabel(messageId: string, result: ProcessedWebhookResult, direction: "ai" | "customer") {
  try {
    await storeRuleIntentLabel({
      decisionType: result.decision.decisionType,
      direction,
      matchedKey: result.decision.matchedKey,
      matchedType: result.decision.matchedType,
      messageId,
      tenantId: TENANT_ID,
    });
  } catch (error) {
    await reportOperationalError({
      alert: false,
      error,
      extra: { direction, message_id: messageId },
      source: "intent_label_sync",
    });
  }
}

async function maybeCreateHandoffTask(conversationId: string, result: ProcessedWebhookResult) {
  if (!shouldCreateHandoffTask(result)) {
    return;
  }

  const supabase = getSupabaseServerClient();
  const { data: existing, error: selectError } = await supabase
    .from("handoff_tasks")
    .select("id")
    .eq("tenant_id", TENANT_ID)
    .eq("conversation_id", conversationId)
    .in("status", ["open", "taken"])
    .limit(1);

  if (selectError) {
    throw new Error(`Failed to load handoff task: ${selectError.message}`);
  }

  if (existing && existing.length > 0) {
    return;
  }

  const { error } = await supabase.from("handoff_tasks").insert({
    branch: emptyToNull(result.bookingDraft.branch),
    conversation_id: conversationId,
    reason: result.decision.matchedKey || "unknown",
    status: "open",
    tenant_id: TENANT_ID,
  });

  if (error) {
    throw new Error(`Failed to create handoff task: ${error.message}`);
  }

  await notifyAdminHandoffCreated({
    conversationId,
    reason: result.decision.matchedKey || "unknown",
  });
}

export function shouldCreateHandoffTask(result: { decision: Pick<ProcessedWebhookResult["decision"], "decisionType"> }) {
  return ["handoff_pending", "booking_intake_reply"].includes(result.decision.decisionType);
}

async function maybeUpsertBookingLead(conversationId: string, result: ProcessedWebhookResult) {
  if (!hasBookingLeadSignal(result)) {
    return;
  }

  const supabase = getSupabaseServerClient();
  const { data: existing, error: selectError } = await supabase
    .from("booking_leads_db")
    .select("booking_status, customer_name, interested_treatments, notes, phone, preferred_branch, preferred_time_slots, staff_owner")
    .eq("tenant_id", TENANT_ID)
    .eq("conversation_id", conversationId)
    .maybeSingle<BookingLeadRow>();

  if (selectError) {
    throw new Error(`Failed to load booking lead: ${selectError.message}`);
  }

  const payload = {
    booking_status: existing?.booking_status ?? "new",
    conversation_id: conversationId,
    customer_name: emptyToNull(result.bookingDraft.name) ?? existing?.customer_name ?? null,
    interested_treatments: mergeStringArrays(existing?.interested_treatments, splitTreatmentNames(result.bookingDraft.treatment)),
    phone: emptyToNull(result.bookingDraft.phone) ?? existing?.phone ?? null,
    preferred_branch: emptyToNull(result.bookingDraft.branch) ?? existing?.preferred_branch ?? null,
    preferred_time_slots: mergeStringArrays(existing?.preferred_time_slots, normalizeTimeSlots(result.bookingDraft)),
    tenant_id: TENANT_ID,
  };

  const { error } = await supabase
    .from("booking_leads_db")
    .upsert(payload, { onConflict: "tenant_id,conversation_id" });

  if (error) {
    throw new Error(`Failed to upsert booking lead: ${error.message}`);
  }
}

function deriveLeadStage(result: ProcessedWebhookResult): LeadStage {
  if (result.conversationStatus === "closed") {
    return "closed";
  }

  if (result.conversationStatus === "human_active" || result.conversationStatus === "ai_paused") {
    return "human_followup";
  }

  if (result.decision.decisionType === "handoff_pending" || result.conversationStatus === "handoff_pending") {
    return "handoff_pending";
  }

  if (result.decision.decisionType === "booking_intake_reply" || hasBookingLeadSignal(result)) {
    return "booking_intent";
  }

  if (
    ["ai_auto_reply", "clinic_info_reply", "faq_auto_reply", "medical_guidance_reply", "pricing_auto_reply", "treatment_intro_reply"].includes(
      result.decision.decisionType,
    )
  ) {
    return "interested";
  }

  return "new_inquiry";
}

function mergeLeadStage(existing: LeadStage | undefined, next: LeadStage) {
  if (!existing) {
    return next;
  }

  const rank: Record<LeadStage, number> = {
    new_inquiry: 0,
    interested: 1,
    booking_intent: 2,
    handoff_pending: 3,
    human_followup: 4,
    closed: 5,
  };

  return rank[next] >= rank[existing] ? next : existing;
}

function hasBookingLeadSignal(result: ProcessedWebhookResult) {
  return Boolean(
    result.bookingDraft.branch ||
      result.bookingDraft.treatment ||
      result.bookingDraft.name ||
      result.bookingDraft.phone ||
      result.bookingDraft.timeSlots.length > 0 ||
      (result.bookingDraft.requestedTimeSlots?.length ?? 0) > 0 ||
      (result.bookingDraft.isFirstVisit && result.bookingDraft.isFirstVisit !== "unknown"),
  );
}

function splitTreatmentNames(treatment: string | undefined) {
  if (!treatment) {
    return [];
  }

  return treatment
    .split(/[、,，+＋]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeTimeSlots(bookingDraft: ProcessedWebhookResult["bookingDraft"]) {
  return Array.from(new Set([...(bookingDraft.timeSlots ?? []), ...(bookingDraft.requestedTimeSlots ?? [])])).filter(Boolean);
}

function mergeStringArrays(existing: unknown, next: string[]) {
  const existingValues = Array.isArray(existing) ? existing.filter((value): value is string => typeof value === "string") : [];
  return Array.from(new Set([...existingValues, ...next])).filter(Boolean);
}

function emptyToNull(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeMessageType(type: string | undefined): MessageType {
  if (type === "image" || type === "postback" || type === "text") {
    return type;
  }

  return "unknown";
}

function getReplyMessageType(result: ProcessedWebhookResult): MessageType {
  const firstMessageType = result.replyPayload?.messages[0]?.type;
  if (firstMessageType === "flex" || firstMessageType === "image" || firstMessageType === "template" || firstMessageType === "text") {
    return firstMessageType;
  }

  return "unknown";
}

function extractReplyContent(result: ProcessedWebhookResult) {
  const messages = result.replyPayload?.messages ?? [];
  const content = messages
    .map((message) => {
      if (message.type === "text") {
        return message.text;
      }

      if (message.type === "flex" || message.type === "template") {
        return message.altText;
      }

      if (message.type === "image") {
        return message.originalContentUrl;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n\n");

  return content || result.decision.replyText || "";
}

function findReplyResult(result: ProcessedWebhookResult, replyResults: ReplySendResult[]) {
  return replyResults.find((replyResult) => {
    if (result.webhookEventId && replyResult.webhookEventId === result.webhookEventId) {
      return true;
    }

    return Boolean(result.messageId && replyResult.messageId === result.messageId);
  });
}

function deriveSendStatus(replyResult: ReplySendResult | undefined): SendStatus {
  if (!replyResult) {
    return "pending";
  }

  if (replyResult.responseBody === "No reply payload generated") {
    return "skipped";
  }

  return replyResult.ok ? "sent" : "failed";
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}
