import { google, sheets_v4 } from "googleapis";

import { findBranchByMessage, findTreatmentByMessage } from "@/lib/clinic-config";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { filterDirectMessageResults, type ProcessedWebhookResult, type ReplySendResult } from "@/lib/line-webhook";
import { reportOperationalError } from "@/lib/monitoring";

const RAW_MESSAGES_SHEET = "raw_messages";
const HANDOFF_QUEUE_SHEET = "handoff_queue";
const CONVERSATION_SUMMARY_SHEET = "conversation_summary";
const BOOKING_SIGNAL_SHEET = "booking_signal_analysis";
const BOOKING_LEADS_SHEET = "booking_leads";
const DAILY_AGGREGATE_SHEET = "daily_aggregate";
const GOOGLE_SHEETS_RETRY_DELAYS_MS = [1000, 2000, 4000] as const;
const BOOKING_LEADS_SYSTEM_SEGMENTS = [
  { endColumn: "F", endIndex: 6, startColumn: "A", startIndex: 0 },
  { endColumn: "P", endIndex: 16, startColumn: "H", startIndex: 7 },
] as const;

const SHEET_HEADERS: Record<string, string[]> = {
  [RAW_MESSAGES_SHEET]: [
    "logged_at",
    "conversation_id",
    "line_user_id",
    "webhook_event_id",
    "conversation_turn_index",
    "message_role",
    "message_text",
    "intent_tag",
    "lead_stage",
    "trigger_keyword",
    "decision_type",
    "matched_type",
    "matched_key",
    "reply_status",
    "needs_handoff",
    "ai_used",
    "ai_humanized",
    "branch_tag",
    "treatment_tag",
  ],
  [HANDOFF_QUEUE_SHEET]: [
    "created_at",
    "status",
    "priority",
    "conversation_id",
    "line_user_id",
    "customer_last_message",
    "detected_topic",
    "treatment_tag",
    "branch_tag",
    "suggested_action",
    "owner",
    "resolved_at",
  ],
  [CONVERSATION_SUMMARY_SHEET]: [
    "conversation_id",
    "line_user_id",
    "first_seen_at",
    "last_seen_at",
    "customer_message_count",
    "latest_topic",
    "treatment_tag",
    "branch_tag",
    "lead_stage",
    "first_booking_turn",
    "first_booking_keyword",
    "first_booking_message",
    "needs_handoff",
    "last_reply_type",
    "latest_customer_message",
    "latest_ai_reply",
    "notes",
  ],
  [BOOKING_SIGNAL_SHEET]: [
    "logged_at",
    "conversation_id",
    "line_user_id",
    "conversation_turn_index",
    "trigger_keyword",
    "branch_tag",
    "treatment_tag",
    "intent_tag",
    "lead_stage",
    "became_booking_intent",
    "needs_handoff",
    "customer_message",
    "ai_reply_preview",
  ],
  [BOOKING_LEADS_SHEET]: [
    "conversation_id",
    "line_user_id",
    "first_seen_at",
    "last_seen_at",
    "customer_message_count",
    "lead_stage",
    "booking_status",
    "needs_handoff",
    "customer_name",
    "phone",
    "interested_treatment",
    "preferred_branch",
    "preferred_time_slots",
    "is_first_visit",
    "latest_customer_message",
    "latest_ai_reply",
    "notes",
  ],
  [DAILY_AGGREGATE_SHEET]: [
    "date",
    "conversation_caught_count",
    "night_conversation_count",
    "handoff_count",
    "booking_lead_count",
    "updated_at",
  ],
};

const AUTO_BOOKING_STATUSES = new Set(["", "新進線", "待客服確認"]);
const BOOKING_TRIGGER_TERMS = ["預約", "想約", "諮詢", "安排", "時間", "改約", "取消"];
const PRICE_TRIGGER_TERMS = ["價格", "價錢", "價位", "費用", "報價", "方案", "活動"];

let initializedSpreadsheetIds = new Set<string>();

export type GoogleSheetsSyncResult = {
  appendedBookingSignalRows: number;
  appendedHandoffRows: number;
  appendedRawRows: number;
  errorMessage?: string;
  ok: boolean;
  skipped: boolean;
  spreadsheetId?: string;
  updatedBookingLeads: number;
  updatedConversationSummaries: number;
  updatedDailyAggregates: number;
};

export type GoogleSheetsValidationResult = {
  errorMessage?: string;
  ok: boolean;
  sheetNames?: string[];
  skipped: boolean;
  spreadsheetId?: string;
};

type SyncInput = {
  duplicateEventIds: string[];
  loggedAt: string;
  replyResults: ReplySendResult[];
  requestError?: string;
  results: ProcessedWebhookResult[];
};

type GoogleSheetsSyncWithRetryResult = GoogleSheetsSyncResult & {
  attempts: number;
};

type ResultAnalytics = {
  becameBookingIntent: boolean;
  branchTag: string;
  conversationId: string;
  conversationTurnIndex: number;
  intentTag: string;
  isNightConversation: boolean;
  leadStage: string;
  localDate: string;
  treatmentTag: string;
  triggerKeyword: string;
};

function toBooleanText(value: boolean) {
  return value ? "true" : "false";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConversationId(result: ProcessedWebhookResult) {
  return result.sourceUserId || result.webhookEventId || "unknown_conversation";
}

function normalizeCellText(value: string | undefined) {
  if (!value) {
    return "";
  }

  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function formatTaipeiDate(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso.slice(0, 10);
  }

  return new Intl.DateTimeFormat("sv-SE", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Taipei",
    year: "numeric",
  }).format(parsed);
}

function getTaipeiHour(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return 0;
  }

  return Number.parseInt(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Asia/Taipei",
    }).format(parsed),
    10,
  );
}

function isNightConversation(iso: string) {
  const hour = getTaipeiHour(iso);
  return hour >= 21 || hour < 9;
}

function findBranchByName(name: string | undefined) {
  if (!name) {
    return null;
  }

  const matchedByMessage = findBranchByMessage(name);
  if (matchedByMessage) {
    return matchedByMessage;
  }

  return null;
}

function findTreatmentByName(name: string | undefined) {
  if (!name) {
    return null;
  }

  const matchedByMessage = findTreatmentByMessage(name);
  if (matchedByMessage) {
    return matchedByMessage;
  }

  return null;
}

function detectBranchTag(result: ProcessedWebhookResult) {
  const fromDraft = findBranchByName(result.bookingDraft.branch);
  if (fromDraft) {
    return fromDraft.name;
  }

  return (
    findBranchByMessage(result.messageText)?.name ||
    findBranchByMessage(result.decision.replyText)?.name ||
    ""
  );
}

function detectTreatmentTag(result: ProcessedWebhookResult) {
  const fromDraft = findTreatmentByName(result.bookingDraft.treatment);
  if (fromDraft) {
    return fromDraft.name;
  }

  return (
    findTreatmentByMessage(result.messageText)?.name ||
    findTreatmentByMessage(result.decision.replyText)?.name ||
    ""
  );
}

function inferIntentTag(result: ProcessedWebhookResult) {
  switch (result.decision.decisionType) {
    case "booking_intake_reply":
      if (result.decision.matchedKey === "booking_modify_request") {
        return "booking_modify";
      }
      if (result.decision.matchedKey === "booking_cancel_request") {
        return "booking_cancel";
      }
      return "booking_intake";
    case "clinic_info_reply":
      return "clinic_info";
    case "doctor_schedule_auto_reply":
      return "doctor_schedule";
    case "faq_auto_reply":
      return "faq";
    case "handoff_pending":
      return "handoff";
    case "medical_guidance_reply":
      return "medical_guidance";
    case "pricing_auto_reply":
      return "pricing";
    case "treatment_intro_reply":
      return "treatment_intro";
    default:
      break;
  }

  if (result.usedAiReplyGenerator) {
    return "general_ai";
  }

  return "general";
}

function needsHandoff(result: ProcessedWebhookResult) {
  return result.decision.decisionType === "handoff_pending" || result.conversationStatus === "handoff_pending";
}

function inferLeadStage(result: ProcessedWebhookResult) {
  if (needsHandoff(result)) {
    return "awaiting_human_followup";
  }
  if (result.decision.decisionType === "booking_intake_reply") {
    return "booking_interest";
  }
  if (result.decision.decisionType === "pricing_auto_reply") {
    return "price_interest";
  }
  if (result.usedAiReplyGenerator || result.decision.decisionType === "fallback_reply") {
    return "ai_engaged";
  }
  return "faq_or_info";
}

function extractTriggerKeyword(result: ProcessedWebhookResult, branchTag: string, treatmentTag: string) {
  if (treatmentTag) {
    return treatmentTag;
  }
  if (branchTag) {
    return branchTag;
  }

  const normalizedMessage = result.messageText.trim();
  const matchedBookingTerm = BOOKING_TRIGGER_TERMS.find((term) => normalizedMessage.includes(term));
  if (matchedBookingTerm) {
    return matchedBookingTerm;
  }

  const matchedPriceTerm = PRICE_TRIGGER_TERMS.find((term) => normalizedMessage.includes(term));
  if (matchedPriceTerm) {
    return matchedPriceTerm;
  }

  return normalizedMessage.slice(0, 24);
}

function hasBookingDraftValue(result: ProcessedWebhookResult) {
  return Boolean(
    result.bookingDraft.branch ||
      result.bookingDraft.treatment ||
      result.bookingDraft.name ||
      result.bookingDraft.phone ||
      result.bookingDraft.isFirstVisit ||
      result.bookingDraft.timeSlots.length > 0 ||
      (result.bookingDraft.requestedTimeSlots?.length ?? 0) > 0,
  );
}

function shouldTrackBookingLead(result: ProcessedWebhookResult, leadStage: string) {
  return (
    leadStage === "booking_interest" ||
    leadStage === "price_interest" ||
    leadStage === "awaiting_human_followup" ||
    hasBookingDraftValue(result)
  );
}

function buildPriority(result: ProcessedWebhookResult) {
  if (result.decision.matchedKey === "post_procedure_issue") {
    return "high";
  }
  if (needsHandoff(result)) {
    return "medium";
  }
  return "low";
}

function formatFirstVisit(value: "no" | "unknown" | "yes" | undefined) {
  if (value === "yes") {
    return "是";
  }
  if (value === "no") {
    return "否";
  }
  return "";
}

function getReplyStatusText(replyResult: ReplySendResult | undefined, result: ProcessedWebhookResult) {
  if (!result.replyPayload) {
    return "not_sent";
  }
  if (!replyResult) {
    return "pending";
  }
  if (replyResult.ok) {
    if (replyResult.suppressedReason) {
      return "skipped";
    }
    return "sent";
  }
  if (replyResult.responseBody === "No reply payload generated") {
    return "skipped";
  }
  return `failed:${replyResult.status || 0}`;
}

async function getSheetsClient() {
  const config = getRuntimeConfig();
  const auth = new google.auth.JWT({
    email: config.googleSheetsServiceAccountEmail,
    key: config.googleSheetsPrivateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  await auth.authorize();
  return google.sheets({ auth, version: "v4" });
}

async function ensureSpreadsheetSetup(sheets: sheets_v4.Sheets, spreadsheetId: string) {
  if (initializedSpreadsheetIds.has(spreadsheetId)) {
    return;
  }

  const metadata = await sheets.spreadsheets.get({ spreadsheetId });
  const existingTitles = new Set(
    (metadata.data.sheets ?? []).map((sheet) => sheet.properties?.title).filter((title): title is string => Boolean(title)),
  );

  const missingTitles = Object.keys(SHEET_HEADERS).filter((title) => !existingTitles.has(title));
  if (missingTitles.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: missingTitles.map((title) => ({
          addSheet: {
            properties: {
              title,
            },
          },
        })),
      },
    });
  }

  for (const [sheetName, headers] of Object.entries(SHEET_HEADERS)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [headers],
      },
    });
  }

  initializedSpreadsheetIds.add(spreadsheetId);
}

async function getSheetRows(sheets: sheets_v4.Sheets, spreadsheetId: string, range: string) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return response.data.values ?? [];
}

async function appendRows(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetName: string, rows: string[][]) {
  if (rows.length === 0) {
    return 0;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: rows,
    },
  });

  return rows.length;
}

async function updateRowSegment(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
  rowIndex: number,
  startColumn: string,
  endColumn: string,
  values: string[],
) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${startColumn}${rowIndex}:${endColumn}${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [values],
    },
  });
}

async function getExistingConversationTurnCounts(sheets: sheets_v4.Sheets, spreadsheetId: string) {
  const rows = await getSheetRows(sheets, spreadsheetId, `${RAW_MESSAGES_SHEET}!A2:S`);
  const turnCounts = new Map<string, number>();

  for (const row of rows) {
    const conversationId = row[1] ?? "";
    const messageRole = row[5] ?? "";
    if (!conversationId || messageRole !== "customer") {
      continue;
    }

    turnCounts.set(conversationId, (turnCounts.get(conversationId) ?? 0) + 1);
  }

  return turnCounts;
}

function buildResultAnalytics(input: SyncInput, existingTurnCounts: Map<string, number>) {
  const resultAnalyticsByEventId = new Map<string, ResultAnalytics>();
  const turnCounts = new Map(existingTurnCounts);

  for (const result of input.results) {
    const conversationId = getConversationId(result);
    const nextTurn = (turnCounts.get(conversationId) ?? 0) + 1;
    turnCounts.set(conversationId, nextTurn);

    const branchTag = detectBranchTag(result);
    const treatmentTag = detectTreatmentTag(result);
    const intentTag = inferIntentTag(result);
    const leadStage = inferLeadStage(result);
    const triggerKeyword = extractTriggerKeyword(result, branchTag, treatmentTag);

    resultAnalyticsByEventId.set(result.webhookEventId, {
      becameBookingIntent: result.decision.decisionType === "booking_intake_reply",
      branchTag,
      conversationId,
      conversationTurnIndex: nextTurn,
      intentTag,
      isNightConversation: isNightConversation(input.loggedAt),
      leadStage,
      localDate: formatTaipeiDate(input.loggedAt),
      treatmentTag,
      triggerKeyword,
    });
  }

  return resultAnalyticsByEventId;
}

function buildRawMessageRows(
  input: SyncInput,
  analyticsByEventId: Map<string, ResultAnalytics>,
  replyResultsByEventId: Map<string, ReplySendResult>,
) {
  const rows: string[][] = [];

  for (const result of input.results) {
    const analytics = analyticsByEventId.get(result.webhookEventId);
    const aiUsed = result.usedAiReplyGenerator || result.usedAiHumanizer;
    const replyStatus = getReplyStatusText(replyResultsByEventId.get(result.webhookEventId), result);

    rows.push([
      input.loggedAt,
      analytics?.conversationId ?? getConversationId(result),
      result.sourceUserId,
      result.webhookEventId,
      (analytics?.conversationTurnIndex ?? "").toString(),
      "customer",
      normalizeCellText(result.messageText),
      analytics?.intentTag ?? inferIntentTag(result),
      analytics?.leadStage ?? inferLeadStage(result),
      analytics?.triggerKeyword ?? "",
      result.decision.decisionType,
      result.decision.matchedType,
      result.decision.matchedKey,
      replyStatus,
      toBooleanText(needsHandoff(result)),
      toBooleanText(aiUsed),
      toBooleanText(result.usedAiHumanizer),
      analytics?.branchTag ?? "",
      analytics?.treatmentTag ?? "",
    ]);

    if (result.decision.replyText) {
      rows.push([
        input.loggedAt,
        analytics?.conversationId ?? getConversationId(result),
        result.sourceUserId,
        result.webhookEventId,
        (analytics?.conversationTurnIndex ?? "").toString(),
        "assistant",
        normalizeCellText(result.decision.replyText),
        analytics?.intentTag ?? inferIntentTag(result),
        analytics?.leadStage ?? inferLeadStage(result),
        analytics?.triggerKeyword ?? "",
        result.decision.decisionType,
        result.decision.matchedType,
        result.decision.matchedKey,
        replyStatus,
        toBooleanText(needsHandoff(result)),
        toBooleanText(aiUsed),
        toBooleanText(result.usedAiHumanizer),
        analytics?.branchTag ?? "",
        analytics?.treatmentTag ?? "",
      ]);
    }
  }

  return rows;
}

function buildHandoffRows(input: SyncInput, analyticsByEventId: Map<string, ResultAnalytics>) {
  return input.results
    .filter(needsHandoff)
    .map((result) => {
      const analytics = analyticsByEventId.get(result.webhookEventId);
      return [
        input.loggedAt,
        "open",
        buildPriority(result),
        analytics?.conversationId ?? getConversationId(result),
        result.sourceUserId,
        normalizeCellText(result.messageText),
        result.decision.matchedKey,
        analytics?.treatmentTag ?? "",
        analytics?.branchTag ?? "",
        "請真人客服接續確認與回覆",
        "",
        "",
      ];
    });
}

function buildBookingSignalRows(input: SyncInput, analyticsByEventId: Map<string, ResultAnalytics>) {
  return input.results.map((result) => {
    const analytics = analyticsByEventId.get(result.webhookEventId);
    return [
      input.loggedAt,
      analytics?.conversationId ?? getConversationId(result),
      result.sourceUserId,
      (analytics?.conversationTurnIndex ?? "").toString(),
      analytics?.triggerKeyword ?? "",
      analytics?.branchTag ?? "",
      analytics?.treatmentTag ?? "",
      analytics?.intentTag ?? inferIntentTag(result),
      analytics?.leadStage ?? inferLeadStage(result),
      toBooleanText(analytics?.becameBookingIntent ?? false),
      toBooleanText(needsHandoff(result)),
      normalizeCellText(result.messageText),
      normalizeCellText(result.decision.replyText),
    ];
  });
}

function padRow(row: string[], length: number) {
  const nextRow = [...row];
  while (nextRow.length < length) {
    nextRow.push("");
  }
  return nextRow;
}

async function upsertConversationSummaries(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  input: SyncInput,
  analyticsByEventId: Map<string, ResultAnalytics>,
) {
  if (input.results.length === 0) {
    return 0;
  }

  const rows = await getSheetRows(sheets, spreadsheetId, `${CONVERSATION_SUMMARY_SHEET}!A2:Q`);
  const rowIndexByConversationId = new Map<string, number>();
  rows.forEach((row, index) => {
    if (row[0]) {
      rowIndexByConversationId.set(row[0], index + 2);
    }
  });

  const rawTurnCounts = await getExistingConversationTurnCounts(sheets, spreadsheetId);
  const latestByConversation = new Map<string, string[]>();

  for (const result of input.results) {
    const analytics = analyticsByEventId.get(result.webhookEventId);
    const conversationId = analytics?.conversationId ?? getConversationId(result);
    const existingRowIndex = rowIndexByConversationId.get(conversationId);
    const existingRow = padRow(existingRowIndex ? rows[existingRowIndex - 2] ?? [] : [], 17);
    const currentRow = padRow(latestByConversation.get(conversationId) ?? existingRow, 17);
    const bookingSignal = analytics?.becameBookingIntent ?? false;

    latestByConversation.set(conversationId, [
      conversationId,
      result.sourceUserId,
      currentRow[2] || input.loggedAt,
      input.loggedAt,
      String(analytics?.conversationTurnIndex ?? (rawTurnCounts.get(conversationId) ?? 0) + 1),
      analytics?.intentTag ?? inferIntentTag(result),
      analytics?.treatmentTag ?? "",
      analytics?.branchTag ?? "",
      analytics?.leadStage ?? inferLeadStage(result),
      currentRow[9] || (bookingSignal ? String(analytics?.conversationTurnIndex ?? "") : ""),
      currentRow[10] || (bookingSignal ? analytics?.triggerKeyword ?? "" : ""),
      currentRow[11] || (bookingSignal ? normalizeCellText(result.messageText) : ""),
      toBooleanText(needsHandoff(result)),
      result.decision.decisionType,
      normalizeCellText(result.messageText),
      normalizeCellText(result.decision.replyText),
      input.requestError ? `latest_request_error=${input.requestError}` : currentRow[16] || "",
    ]);
  }

  let updatedCount = 0;
  for (const [conversationId, rowValues] of latestByConversation.entries()) {
    const existingRowIndex = rowIndexByConversationId.get(conversationId);
    if (existingRowIndex) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${CONVERSATION_SUMMARY_SHEET}!A${existingRowIndex}:Q${existingRowIndex}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [rowValues],
        },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${CONVERSATION_SUMMARY_SHEET}!A1`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [rowValues],
        },
      });
    }
    updatedCount += 1;
  }

  return updatedCount;
}

function inferAutoBookingStatus(result: ProcessedWebhookResult, leadStage: string) {
  if (leadStage === "booking_interest" || leadStage === "awaiting_human_followup" || leadStage === "price_interest") {
    return "待客服確認";
  }
  return "新進線";
}

async function upsertBookingLeads(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  input: SyncInput,
  analyticsByEventId: Map<string, ResultAnalytics>,
) {
  const leadResults = input.results.filter((result) => {
    const analytics = analyticsByEventId.get(result.webhookEventId);
    return shouldTrackBookingLead(result, analytics?.leadStage ?? inferLeadStage(result));
  });

  if (leadResults.length === 0) {
    return 0;
  }

  const rows = await getSheetRows(sheets, spreadsheetId, `${BOOKING_LEADS_SHEET}!A2:Q`);
  const rowIndexByConversationId = new Map<string, number>();
  rows.forEach((row, index) => {
    if (row[0]) {
      rowIndexByConversationId.set(row[0], index + 2);
    }
  });

  const latestByConversation = new Map<string, string[]>();

  for (const result of leadResults) {
    const analytics = analyticsByEventId.get(result.webhookEventId);
    const conversationId = analytics?.conversationId ?? getConversationId(result);
    const existingRowIndex = rowIndexByConversationId.get(conversationId);
    const existingRow = padRow(existingRowIndex ? rows[existingRowIndex - 2] ?? [] : [], 17);
    const currentRow = padRow(latestByConversation.get(conversationId) ?? existingRow, 17);
    const preferredTimeSlots =
      (result.bookingDraft.requestedTimeSlots?.length ?? 0) > 0
        ? result.bookingDraft.requestedTimeSlots?.join(" | ") ?? ""
        : result.bookingDraft.timeSlots.join(" | ");
    const leadStage = analytics?.leadStage ?? inferLeadStage(result);
    const existingBookingStatus = currentRow[6];
    const nextBookingStatus = AUTO_BOOKING_STATUSES.has(existingBookingStatus)
      ? inferAutoBookingStatus(result, leadStage)
      : existingBookingStatus;
    const leadFields = resolveBookingLeadSheetFields({
      action: result.bookingTreatmentAction,
      currentBranch: currentRow[11] || "",
      currentTimeSlots: currentRow[12] || "",
      currentTreatment: currentRow[10] || "",
      nextBranch: result.bookingDraft.branch || analytics?.branchTag || "",
      nextTimeSlots: preferredTimeSlots,
      nextTreatment: result.bookingDraft.treatment || analytics?.treatmentTag || "",
    });

    latestByConversation.set(conversationId, [
      conversationId,
      result.sourceUserId,
      currentRow[2] || input.loggedAt,
      input.loggedAt,
      String(analytics?.conversationTurnIndex ?? currentRow[4] ?? "1"),
      leadStage,
      existingRowIndex ? existingBookingStatus : "",
      toBooleanText(needsHandoff(result)),
      result.bookingDraft.name || currentRow[8] || "",
      result.bookingDraft.phone || currentRow[9] || "",
      leadFields.treatment,
      leadFields.branch,
      leadFields.timeSlots,
      formatFirstVisit(result.bookingDraft.isFirstVisit) || currentRow[13] || "",
      normalizeCellText(result.messageText),
      normalizeCellText(result.decision.replyText),
      existingRowIndex ? currentRow[16] || "" : "",
    ]);
  }

  let updatedCount = 0;
  for (const [conversationId, rowValues] of latestByConversation.entries()) {
    const existingRowIndex = rowIndexByConversationId.get(conversationId);
    if (existingRowIndex) {
      for (const segment of BOOKING_LEADS_SYSTEM_SEGMENTS) {
        await updateRowSegment(
          sheets,
          spreadsheetId,
          BOOKING_LEADS_SHEET,
          existingRowIndex,
          segment.startColumn,
          segment.endColumn,
          rowValues.slice(segment.startIndex, segment.endIndex),
        );
      }
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${BOOKING_LEADS_SHEET}!A1`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [rowValues],
        },
      });
    }
    updatedCount += 1;
  }

  return updatedCount;
}

export function resolveBookingLeadSheetFields(input: {
  action?: ProcessedWebhookResult["bookingTreatmentAction"];
  currentBranch: string;
  currentTimeSlots: string;
  currentTreatment: string;
  nextBranch: string;
  nextTimeSlots: string;
  nextTreatment: string;
}) {
  const replacesActiveDraft = input.action === "replace";
  return {
    branch: replacesActiveDraft ? input.nextBranch : input.nextBranch || input.currentBranch,
    timeSlots: replacesActiveDraft ? input.nextTimeSlots : input.nextTimeSlots || input.currentTimeSlots,
    treatment: replacesActiveDraft ? input.nextTreatment : input.nextTreatment || input.currentTreatment,
  };
}

function toUniqueConversationSet(rows: string[][], predicate: (row: string[]) => boolean) {
  const ids = new Set<string>();

  for (const row of rows) {
    if (predicate(row) && row[1]) {
      ids.add(row[1]);
    }
  }

  return ids;
}

async function upsertDailyAggregates(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  datesToRefresh: string[],
) {
  if (datesToRefresh.length === 0) {
    return 0;
  }

  const rawRows = await getSheetRows(sheets, spreadsheetId, `${RAW_MESSAGES_SHEET}!A2:S`);
  const bookingSignalRows = await getSheetRows(sheets, spreadsheetId, `${BOOKING_SIGNAL_SHEET}!A2:M`);
  const dailyRows = await getSheetRows(sheets, spreadsheetId, `${DAILY_AGGREGATE_SHEET}!A2:F`);
  const rowIndexByDate = new Map<string, number>();

  dailyRows.forEach((row, index) => {
    if (row[0]) {
      rowIndexByDate.set(row[0], index + 2);
    }
  });

  let updatedCount = 0;
  for (const dateKey of datesToRefresh) {
    const customerRawRowsForDate = rawRows.filter(
      (row) => row[5] === "customer" && formatTaipeiDate(row[0] ?? "") === dateKey,
    );
    const bookingSignalRowsForDate = bookingSignalRows.filter((row) => formatTaipeiDate(row[0] ?? "") === dateKey);

    const conversationCaughtCount = toUniqueConversationSet(customerRawRowsForDate, () => true).size;
    const nightConversationCount = toUniqueConversationSet(
      customerRawRowsForDate,
      (row) => isNightConversation(row[0] ?? ""),
    ).size;
    const handoffCount = toUniqueConversationSet(customerRawRowsForDate, (row) => row[14] === "true").size;
    const bookingLeadCount = toUniqueConversationSet(
      bookingSignalRowsForDate,
      (row) => row[9] === "true",
    ).size;

    const rowValues = [
      dateKey,
      String(conversationCaughtCount),
      String(nightConversationCount),
      String(handoffCount),
      String(bookingLeadCount),
      new Date().toISOString(),
    ];

    const existingRowIndex = rowIndexByDate.get(dateKey);
    if (existingRowIndex) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${DAILY_AGGREGATE_SHEET}!A${existingRowIndex}:F${existingRowIndex}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [rowValues],
        },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${DAILY_AGGREGATE_SHEET}!A1`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [rowValues],
        },
      });
    }

    updatedCount += 1;
  }

  return updatedCount;
}

export async function validateGoogleSheetsConnection(): Promise<GoogleSheetsValidationResult> {
  const config = getRuntimeConfig();
  if (!config.googleSheetsEnabled) {
    return {
      ok: true,
      skipped: true,
    };
  }

  if (!config.googleSheetsSpreadsheetId || !config.googleSheetsServiceAccountEmail || !config.googleSheetsPrivateKey) {
    return {
      errorMessage: "Google Sheets env vars are incomplete",
      ok: false,
      skipped: true,
      spreadsheetId: config.googleSheetsSpreadsheetId || undefined,
    };
  }

  try {
    const sheets = await getSheetsClient();
    await ensureSpreadsheetSetup(sheets, config.googleSheetsSpreadsheetId);
    const metadata = await sheets.spreadsheets.get({ spreadsheetId: config.googleSheetsSpreadsheetId });
    const sheetNames = (metadata.data.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter((title): title is string => Boolean(title));

    return {
      ok: true,
      sheetNames,
      skipped: false,
      spreadsheetId: config.googleSheetsSpreadsheetId,
    };
  } catch (error) {
    return {
      errorMessage: error instanceof Error ? error.message : "Unknown Google Sheets validation error",
      ok: false,
      skipped: false,
      spreadsheetId: config.googleSheetsSpreadsheetId,
    };
  }
}

export async function syncWebhookResultsToGoogleSheets(input: SyncInput): Promise<GoogleSheetsSyncResult> {
  // Group and room messages are not customer conversations and must never be
  // exported to the operational Google Sheets workbook.
  input = { ...input, results: filterDirectMessageResults(input.results) };
  const config = getRuntimeConfig();
  if (!config.googleSheetsEnabled) {
    return {
      appendedBookingSignalRows: 0,
      appendedHandoffRows: 0,
      appendedRawRows: 0,
      ok: true,
      skipped: true,
      updatedBookingLeads: 0,
      updatedConversationSummaries: 0,
      updatedDailyAggregates: 0,
    };
  }

  if (!config.googleSheetsSpreadsheetId || !config.googleSheetsServiceAccountEmail || !config.googleSheetsPrivateKey) {
    return {
      appendedBookingSignalRows: 0,
      appendedHandoffRows: 0,
      appendedRawRows: 0,
      errorMessage: "Google Sheets env vars are incomplete",
      ok: false,
      skipped: true,
      updatedBookingLeads: 0,
      updatedConversationSummaries: 0,
      updatedDailyAggregates: 0,
    };
  }

  try {
    const sheets = await getSheetsClient();
    await ensureSpreadsheetSetup(sheets, config.googleSheetsSpreadsheetId);
    const existingTurnCounts = await getExistingConversationTurnCounts(sheets, config.googleSheetsSpreadsheetId);
    const analyticsByEventId = buildResultAnalytics(input, existingTurnCounts);
    const replyResultsByEventId = new Map(input.replyResults.map((replyResult) => [replyResult.webhookEventId, replyResult]));

    const appendedRawRows = await appendRows(
      sheets,
      config.googleSheetsSpreadsheetId,
      RAW_MESSAGES_SHEET,
      buildRawMessageRows(input, analyticsByEventId, replyResultsByEventId),
    );
    const appendedHandoffRows = await appendRows(
      sheets,
      config.googleSheetsSpreadsheetId,
      HANDOFF_QUEUE_SHEET,
      buildHandoffRows(input, analyticsByEventId),
    );
    const appendedBookingSignalRows = await appendRows(
      sheets,
      config.googleSheetsSpreadsheetId,
      BOOKING_SIGNAL_SHEET,
      buildBookingSignalRows(input, analyticsByEventId),
    );
    const updatedConversationSummaries = await upsertConversationSummaries(
      sheets,
      config.googleSheetsSpreadsheetId,
      input,
      analyticsByEventId,
    );
    const updatedBookingLeads = await upsertBookingLeads(
      sheets,
      config.googleSheetsSpreadsheetId,
      input,
      analyticsByEventId,
    );
    const datesToRefresh = Array.from(
      new Set(Array.from(analyticsByEventId.values()).map((analytics) => analytics.localDate)),
    );
    const updatedDailyAggregates = await upsertDailyAggregates(
      sheets,
      config.googleSheetsSpreadsheetId,
      datesToRefresh,
    );

    return {
      appendedBookingSignalRows,
      appendedHandoffRows,
      appendedRawRows,
      ok: true,
      skipped: false,
      spreadsheetId: config.googleSheetsSpreadsheetId,
      updatedBookingLeads,
      updatedConversationSummaries,
      updatedDailyAggregates,
    };
  } catch (error) {
    return {
      appendedBookingSignalRows: 0,
      appendedHandoffRows: 0,
      appendedRawRows: 0,
      errorMessage: error instanceof Error ? error.message : "Unknown Google Sheets sync error",
      ok: false,
      skipped: false,
      spreadsheetId: config.googleSheetsSpreadsheetId,
      updatedBookingLeads: 0,
      updatedConversationSummaries: 0,
      updatedDailyAggregates: 0,
    };
  }
}

function buildGoogleSheetsFailureExtra(input: SyncInput, attempts: number, finalResult: GoogleSheetsSyncResult) {
  return {
    attempts,
    conversation_ids: input.results.map((result) => result.sourceUserId || result.webhookEventId),
    duplicate_event_ids: input.duplicateEventIds,
    error_message: finalResult.errorMessage || "Unknown Google Sheets sync error",
    logged_at: input.loggedAt,
    payload_summary: input.results.map((result) => ({
      conversation_status: result.conversationStatus,
      decision_type: result.decision.decisionType,
      line_user_id: result.sourceUserId,
      matched_key: result.decision.matchedKey,
      message_id: result.messageId,
      webhook_event_id: result.webhookEventId,
    })),
  };
}

export async function syncWebhookResultsToGoogleSheetsWithRetry(
  input: SyncInput,
): Promise<GoogleSheetsSyncWithRetryResult> {
  input = { ...input, results: filterDirectMessageResults(input.results) };
  let finalResult = await syncWebhookResultsToGoogleSheets(input);
  let attempts = 1;

  if (finalResult.ok || finalResult.skipped) {
    return {
      ...finalResult,
      attempts,
    };
  }

  for (const delayMs of GOOGLE_SHEETS_RETRY_DELAYS_MS) {
    await sleep(delayMs);
    attempts += 1;
    finalResult = await syncWebhookResultsToGoogleSheets(input);

    if (finalResult.ok || finalResult.skipped) {
      return {
        ...finalResult,
        attempts,
      };
    }
  }

  await reportOperationalError({
    error: new Error(finalResult.errorMessage || "Google Sheets sync failed after retries"),
    extra: buildGoogleSheetsFailureExtra(input, attempts, finalResult),
    source: "google_sheets_sync",
  });

  return {
    ...finalResult,
    attempts,
  };
}
