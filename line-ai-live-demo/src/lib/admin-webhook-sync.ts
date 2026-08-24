import { isGroupSourceResult, type ProcessedWebhookResult, type ReplySendResult } from "@/lib/line-webhook";
import { captureConversationV2ShadowRecord } from "@/lib/conversation-v2/runtime-shadow";
import { toReplyRendererPayloadJson } from "@/lib/reply-renderer";
import { notifyAdminHandoffCreated } from "@/lib/admin-handoff-notifications";
import { PREGNANCY_RISK_NOTE, PREGNANCY_RISK_REASON_SUFFIX } from "@/lib/admin-risk-flags";
import { storeRuleIntentLabel } from "@/lib/intent-label-store";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { isHandoffEscalation, selectHigherPriorityHandoffReason } from "@/lib/handoff-priority";
import { reportOperationalError } from "@/lib/monitoring";
import { captureNluShadowObservation } from "@/lib/nlu-shadow";
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

export function buildHandoffReason(result: ProcessedWebhookResult) {
  const confirmation = result.conversationV2FactConfirmation;
  const factReason = confirmation
    ? `fact_confirmation:${confirmation.domain}:${confirmation.reason}:${confirmation.keys
      .map((key) => key.trim())
      .filter(Boolean)
      .slice(0, 8)
      .join(",")}`.slice(0, 240)
    : "";
  const canonicalReason = result.handoffReason?.trim() || "";
  const baseReason = factReason && canonicalReason
    ? selectHigherPriorityHandoffReason(canonicalReason, factReason)
    : factReason || canonicalReason || result.decision.matchedKey || "unknown";
  return result.bookingDraft.pregnancyRiskFlag && !baseReason.endsWith(PREGNANCY_RISK_REASON_SUFFIX)
    ? `${baseReason}${PREGNANCY_RISK_REASON_SUFFIX}`
    : baseReason;
}

export function buildBookingLeadNotes(existingNotes: string | undefined, hasPregnancyRisk: boolean) {
  if (!hasPregnancyRisk || existingNotes?.includes(PREGNANCY_RISK_NOTE)) {
    return existingNotes ?? "";
  }
  return [existingNotes?.trim(), PREGNANCY_RISK_NOTE].filter(Boolean).join("\n");
}

type SyncAdminWebhookInput = {
  loggedAt: string;
  replyResults: ReplySendResult[];
  results: ProcessedWebhookResult[];
};

export type HandoffTaskUpdateClient = {
  from: (table: "handoff_tasks") => {
    update: (patch: { branch?: null | string; reason: string; updated_at: string }) => {
      eq: (column: string, value: string) => Promise<{ error: null | { message: string } }>;
    };
  };
};

export async function runAdminSyncInTwoPhases<TItem, TCandidate>(
  items: readonly TItem[],
  dependencies: {
    captureShadow: (candidate: TCandidate) => Promise<void>;
    persistCore: (item: TItem) => Promise<TCandidate | null>;
  },
) {
  const shadowCandidates: TCandidate[] = [];
  for (const item of items) {
    const candidate = await dependencies.persistCore(item);
    if (candidate !== null) shadowCandidates.push(candidate);
  }
  for (const candidate of shadowCandidates) {
    await dependencies.captureShadow(candidate);
  }
}

export async function syncWebhookResultsToAdminDb(input: SyncAdminWebhookInput) {
  if (!hasSupabaseServerConfig() || input.results.length === 0) {
    return;
  }

  try {
    await runAdminSyncInTwoPhases(input.results, {
      persistCore: async (result) => {
        await captureLineGroupSource(result);

        // Groups and rooms are only captured as notification sources. Never
        // persist their messages as a customer conversation or create a handoff.
        if (isGroupSourceResult(result) || !result.sourceUserId) return null;

        const conversation = await upsertConversation(result);
        const replyResult = findReplyResult(result, input.replyResults);
        const customerMessageId = await insertCustomerMessage(conversation.id, result, replyResult);
        if (!customerMessageId) return null;

        await safelyStoreIntentLabel(customerMessageId, result, "customer");
        const aiMessageId = await insertAiMessage(conversation.id, result, input.replyResults);
        if (aiMessageId) {
          await safelyStoreIntentLabel(aiMessageId, result, "ai");
        }
        await maybeCreateHandoffTask(conversation.id, result);
        await maybeUpsertBookingLead(conversation.id, result);
        return { conversationId: conversation.id, customerMessageId, result };
      },
      // Finish every event's staff-facing persistence before any optional
      // model observation. A slow first shadow cannot delay the second event's
      // AI message, handoff task, or booking lead in a multi-event webhook.
      captureShadow: async ({ conversationId, customerMessageId, result }) => {
        const observation = await captureNluShadowObservation({
          decision: {
            conversationStatus: result.conversationStatus,
            decisionType: result.decision.decisionType,
            matchedKey: result.decision.matchedKey,
            matchedType: result.decision.matchedType,
          },
          message: result.messageText ?? "",
          messageId: customerMessageId,
          recentTurns: result.nluRecentTurns,
        });
        if (observation) {
          await captureConversationV2ShadowRecord({
            conversationId,
            episodeKey: result.dialogueEpisodeKey,
            lineTimestamp: result.eventTimestamp,
            observation,
            sourceUserId: result.sourceUserId,
          });
        }
      },
    });
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

async function insertCustomerMessage(
  conversationId: string,
  result: ProcessedWebhookResult,
  replyResult: ReplySendResult | undefined,
) {
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
        conversation_v2_fact_confirmation: result.conversationV2FactConfirmation ?? null,
        conversation_v2_nlu_confidence: result.conversationV2NluTelemetry?.confidence ?? null,
        conversation_v2_nlu_error_code: result.conversationV2NluTelemetry?.errorCode ?? null,
        conversation_v2_nlu_latency_ms: result.conversationV2NluTelemetry?.latencyMs ?? null,
        conversation_v2_nlu_prompt_version: result.conversationV2NluTelemetry?.promptVersion ?? null,
        conversation_v2_nlu_status: result.conversationV2NluTelemetry?.status ?? null,
        conversation_v2_policy_action: result.conversationV2PolicyAction ?? null,
        conversation_v2_snapshot_id: result.conversationV2SnapshotId ?? null,
        conversation_v2_tool_request_type: result.conversationV2ToolRequestType ?? null,
        decision_type: result.decision.decisionType,
        dialogue_episode_key: result.dialogueEpisodeKey ?? null,
        event_timestamp: result.eventTimestamp ?? null,
        event_type: result.eventType,
        matched_key: result.decision.matchedKey,
        matched_type: result.decision.matchedType,
        reply_delivery_attempts: replyResult?.attempts ?? null,
        reply_delivery_http_status: replyResult?.status ?? null,
        reply_delivery_status: deriveSendStatus(replyResult),
        reply_delivery_suppressed_reason: replyResult?.suppressedReason ?? null,
        route_version: result.routeVersion,
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

  const replyResult = findReplyResult(result, replyResults);
  if (!shouldStoreAiMessage(replyResult)) {
    return null;
  }

  const supabase = getSupabaseServerClient();
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
        ...toReplyRendererPayloadJson(result.rendererTelemetry),
        conversation_v2_nlu_confidence: result.conversationV2NluTelemetry?.confidence ?? null,
        conversation_v2_nlu_error_code: result.conversationV2NluTelemetry?.errorCode ?? null,
        conversation_v2_nlu_latency_ms: result.conversationV2NluTelemetry?.latencyMs ?? null,
        conversation_v2_nlu_prompt_version: result.conversationV2NluTelemetry?.promptVersion ?? null,
        conversation_v2_nlu_status: result.conversationV2NluTelemetry?.status ?? null,
        conversation_v2_policy_action: result.conversationV2PolicyAction ?? null,
        conversation_v2_snapshot_id: result.conversationV2SnapshotId ?? null,
        conversation_v2_tool_request_type: result.conversationV2ToolRequestType ?? null,
        decision_type: result.decision.decisionType,
        matched_key: result.decision.matchedKey,
        matched_type: result.decision.matchedType,
        message_count: result.replyPayload.messages.length,
        official_source_url: result.aiSourceUrl ?? null,
        reply_status: replyResult?.status ?? null,
        route_version: result.routeVersion,
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

export async function refreshExistingHandoffTask(
  supabase: HandoffTaskUpdateClient,
  taskId: string,
  input: { branch?: null | string; reason: string; refreshedAt?: string },
) {
  const { error } = await supabase.from("handoff_tasks").update({
    ...(input.branch !== undefined ? { branch: input.branch } : {}),
    reason: input.reason,
    updated_at: input.refreshedAt ?? new Date().toISOString(),
  }).eq("id", taskId);
  if (error) {
    throw new Error(`Failed to refresh handoff task: ${error.message}`);
  }
}

export async function refreshHandoffTaskWithPriority(
  input: {
    incomingReason: string;
    observedReason: null | string;
  },
  dependencies: {
    compareAndSetReason: (expectedReason: null | string, nextReason: string) => Promise<boolean>;
    loadCurrentReason: () => Promise<null | string | undefined>;
  },
  maxAttempts = 3,
) {
  let observedReason = input.observedReason;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const effectiveReason = selectHigherPriorityHandoffReason(observedReason, input.incomingReason);
    if (await dependencies.compareAndSetReason(observedReason, effectiveReason)) {
      return {
        escalated: isHandoffEscalation(observedReason, effectiveReason),
        reason: effectiveReason,
      };
    }
    const latestReason = await dependencies.loadCurrentReason();
    if (latestReason === undefined) {
      throw new Error("Handoff task disappeared during priority refresh");
    }
    observedReason = latestReason;
  }
  throw new Error(`Handoff task priority refresh conflicted after ${maxAttempts} attempts`);
}

async function maybeCreateHandoffTask(conversationId: string, result: ProcessedWebhookResult) {
  const shouldCreate = shouldCreateHandoffTask(result);
  const shouldRefresh = shouldRefreshHandoffTask(result);
  const shouldRecover = shouldRecoverMissingHandoffTask(result);
  const shouldResolveBookingIntake = shouldResolveBookingIntakeHandoffTask(result);
  if (!shouldCreate && !shouldRefresh && !shouldRecover && !shouldResolveBookingIntake) {
    return;
  }

  const supabase = getSupabaseServerClient();
  if (shouldResolveBookingIntake) {
    const resolvedAt = new Date().toISOString();
    const { error } = await supabase
      .from("handoff_tasks")
      .update({ resolved_at: resolvedAt, status: "resolved", updated_at: resolvedAt })
      .eq("tenant_id", TENANT_ID)
      .eq("conversation_id", conversationId)
      .eq("status", "open")
      .in("reason", ["booking_intake", "conversation_v2:booking_restarted"])
      .retry(false);
    if (error) {
      throw new Error(`Failed to resolve paused booking handoff task: ${error.message}`);
    }
    return;
  }

  const { data: existing, error: selectError } = await supabase
    .from("handoff_tasks")
    .select("id, reason")
    .eq("tenant_id", TENANT_ID)
    .eq("conversation_id", conversationId)
    .in("status", ["open", "taken"])
    .limit(1)
    .retry(false);

  if (selectError) {
    throw new Error(`Failed to load handoff task: ${selectError.message}`);
  }

  if (existing && existing.length > 0) {
    // The original customer message is already stored above. Refresh the active
    // task so a repeated safety escalation returns to the top of the workbench.
    const nextReason = buildHandoffReason(result);
    const previousReason = typeof existing[0].reason === "string" ? existing[0].reason : null;
    const refreshResult = await refreshHandoffTaskWithPriority({
      incomingReason: nextReason,
      observedReason: previousReason,
    }, {
      compareAndSetReason: async (expectedReason, effectiveReason) => {
        let updateQuery = supabase.from("handoff_tasks").update({
          ...(result.bookingDraft.branch ? { branch: result.bookingDraft.branch } : {}),
          reason: effectiveReason,
          updated_at: new Date().toISOString(),
        })
          .eq("id", existing[0].id)
          .in("status", ["open", "taken"]);
        updateQuery = expectedReason === null
          ? updateQuery.is("reason", null)
          : updateQuery.eq("reason", expectedReason);
        const { data, error } = await updateQuery.select("id").retry(false);
        if (error) {
          throw new Error(`Failed to conditionally refresh handoff task: ${error.message}`);
        }
        return Array.isArray(data) && data.length === 1;
      },
      loadCurrentReason: async () => {
        const { data, error } = await supabase
          .from("handoff_tasks")
          .select("reason")
          .eq("tenant_id", TENANT_ID)
          .eq("id", existing[0].id)
          .in("status", ["open", "taken"])
          .maybeSingle<{ reason: null | string }>()
          .retry(false);
        if (error) {
          throw new Error(`Failed to reload handoff task reason: ${error.message}`);
        }
        return data?.reason;
      },
    });
    if (refreshResult.escalated) {
      await notifyAdminHandoffCreated({ conversationId, reason: refreshResult.reason });
    }
    return;
  }

  // A normal AI answer while a task is already pending should refresh an
  // existing task, but must never invent a new task using the current route's
  // matched key (for example, branch_list).
  if (!shouldCreate && !shouldRecover) {
    return;
  }

  const { error } = await supabase.from("handoff_tasks").insert({
    branch: emptyToNull(result.bookingDraft.branch),
    conversation_id: conversationId,
    reason: buildHandoffReason(result),
    status: "open",
    tenant_id: TENANT_ID,
  }).retry(false);

  if (error) {
    throw new Error(`Failed to create handoff task: ${error.message}`);
  }

  await notifyAdminHandoffCreated({
    conversationId,
    reason: buildHandoffReason(result),
  });
}

export function shouldCreateHandoffTask(result: {
  conversationV2ToolRequestType?: ProcessedWebhookResult["conversationV2ToolRequestType"];
  decision: Pick<ProcessedWebhookResult["decision"], "decisionType">;
}) {
  return result.conversationV2ToolRequestType === "request_fact_confirmation" ||
    ["handoff_pending", "booking_intake_reply"].includes(result.decision.decisionType);
}

export function shouldResolveBookingIntakeHandoffTask(result: {
  decision: Pick<ProcessedWebhookResult["decision"], "matchedKey">;
}) {
  return result.decision.matchedKey === "conversation_v2:booking_declined";
}

export function shouldStoreAiMessage(replyResult: undefined | Pick<ReplySendResult, "suppressedReason">) {
  return !replyResult?.suppressedReason;
}

export function shouldRefreshHandoffTask(result: Pick<ProcessedWebhookResult, "conversationStatus">) {
  return result.conversationStatus === "handoff_pending";
}

export function shouldRecoverMissingHandoffTask(
  result: Pick<ProcessedWebhookResult, "conversationStatus" | "handoffReason">,
) {
  return result.conversationStatus === "handoff_pending" && Boolean(result.handoffReason?.trim());
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

  const bookingFields = resolveBookingLeadFields(existing, result);
  const contactFields = resolveBookingLeadContactFields(existing, result);
  const payload = {
    booking_status: existing?.booking_status ?? "new",
    conversation_id: conversationId,
    customer_name: contactFields.customerName,
    interested_treatments: bookingFields.interestedTreatments,
    phone: contactFields.phone,
    preferred_branch: bookingFields.preferredBranch,
    preferred_time_slots: bookingFields.preferredTimeSlots,
    notes: buildBookingLeadNotes(existing?.notes, result.bookingDraft.pregnancyRiskFlag === true),
    tenant_id: TENANT_ID,
  };

  const { error } = await supabase
    .from("booking_leads_db")
    .upsert(payload, { onConflict: "tenant_id,conversation_id" });

  if (error) {
    throw new Error(`Failed to upsert booking lead: ${error.message}`);
  }
}

export function resolveBookingLeadContactFields(
  existing: Pick<BookingLeadRow, "customer_name" | "phone"> | null,
  result: Pick<ProcessedWebhookResult, "bookingDraft" | "bookingTreatmentAction">,
) {
  const replacesActiveDraft = result.bookingTreatmentAction === "replace";
  return {
    customerName: replacesActiveDraft
      ? emptyToNull(result.bookingDraft.name)
      : emptyToNull(result.bookingDraft.name) ?? existing?.customer_name ?? null,
    phone: replacesActiveDraft
      ? emptyToNull(result.bookingDraft.phone)
      : emptyToNull(result.bookingDraft.phone) ?? existing?.phone ?? null,
  };
}

export function resolveBookingLeadFields(
  existing: Pick<BookingLeadRow, "interested_treatments" | "preferred_branch" | "preferred_time_slots"> | null,
  result: Pick<ProcessedWebhookResult, "bookingDraft" | "bookingTreatmentAction">,
) {
  const nextTreatments = splitTreatmentNames(result.bookingDraft.treatment);
  const nextTimeSlots = normalizeTimeSlots(result.bookingDraft);
  const replacesActiveDraft = result.bookingTreatmentAction === "replace";

  return {
    interestedTreatments: replacesActiveDraft
      ? nextTreatments
      : mergeStringArrays(existing?.interested_treatments, nextTreatments),
    preferredBranch: replacesActiveDraft
      ? emptyToNull(result.bookingDraft.branch)
      : emptyToNull(result.bookingDraft.branch) ?? existing?.preferred_branch ?? null,
    preferredTimeSlots: replacesActiveDraft
      ? nextTimeSlots
      : mergeStringArrays(existing?.preferred_time_slots, nextTimeSlots),
  };
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

  if (replyResult.suppressedReason) {
    return "skipped";
  }

  return replyResult.ok ? "sent" : "failed";
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}
