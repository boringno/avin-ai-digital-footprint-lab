import fs from "node:fs";
import path from "node:path";

import type { ResponseContractRuntimeMode } from "@/lib/response-contract";

export type RuntimeConfig = {
  adminNotifyTarget: string;
  aiReplyGenerationTimeoutMs: number;
  aiOfficialSearchTimeoutMs: number;
  aiProvider: "anthropic" | "openai";
  appBaseUrl: string;
  anthropicApiKey: string;
  bootstrapOwnerEmail: string;
  claudeHumanizerEnabled: boolean;
  anthropicMaxTokens: number;
  anthropicModel: string;
  claudeApiEnabled: boolean;
  conversationV2CanaryUserIds: string[];
  conversationV2Mode: "canary" | "demo_all" | "off" | "shadow";
  conversationV2ResponseContractMode: ResponseContractRuntimeMode;
  cronSecret: string;
  debugToken: string;
  handoffDigestFrom: string;
  handoffDigestKaohsiungTo: string;
  handoffDigestLinkouTo: string;
  handoffDigestTaichungTo: string;
  handoffDigestTaoyuanTo: string;
  googleSheetsEnabled: boolean;
  googleSheetsPrivateKey: string;
  googleSheetsServiceAccountEmail: string;
  googleSheetsSpreadsheetId: string;
  includePending: boolean;
  lineAccessToken: string;
  lineAlertUserId: string;
  lineChannelSecret: string;
  lineChannelStage: "demo" | "production" | "unconfigured";
  lineReplyRetryCount: number;
  lineReplyTimeoutMs: number;
  logDir: string;
  openAiApiKey: string;
  openAiIntentClassifierEnabled: boolean;
  openAiIntentClassifierMaxTokens: number;
  openAiIntentClassifierMinConfidence: number;
  openAiIntentClassifierTimeoutMs: number;
  openAiMaxTokens: number;
  openAiModel: string;
  openAiNluDecisionMode: "canary" | "off";
  openAiNluMode: "off" | "shadow";
  openAiNluSampleRate: number;
  openAiNluTimeoutMs: number;
  retentionSweepMode: string;
  resendApiKey: string;
  sentryAuthToken: string;
  sentryDsn: string;
  sentryEnvironment: string;
  sentryOrg: string;
  sentryProject: string;
  seedDir: string;
  sendReply: boolean;
  skipSignatureVerify: boolean;
  supabaseServiceRoleKey: string;
  supabaseUrl: string;
};

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === "") {
    return fallback;
  }
  return value.toLowerCase() === "true";
}

function parseNluMode(value: string | undefined): "off" | "shadow" {
  const normalized = (value ?? "off").trim().toLowerCase();
  if (normalized === "off" || normalized === "shadow") return normalized;
  throw new Error(`Unsupported OPENAI_NLU_MODE: ${normalized}`);
}

function parseNluDecisionMode(value: string | undefined): "canary" | "off" {
  const normalized = (value ?? "off").trim().toLowerCase();
  if (normalized === "off" || normalized === "canary") return normalized;
  throw new Error(`Unsupported OPENAI_NLU_DECISION_MODE: ${normalized}`);
}

function parseConversationV2Mode(value: string | undefined): "canary" | "demo_all" | "off" | "shadow" {
  const normalized = (value ?? "off").trim().toLowerCase();
  if (normalized === "off" || normalized === "shadow" || normalized === "canary" || normalized === "demo_all") return normalized;
  throw new Error(`Unsupported CONVERSATION_V2_MODE: ${normalized}`);
}

function parseConversationV2ResponseContractMode(
  value: string | undefined,
): ResponseContractRuntimeMode {
  const normalized = (value ?? "shadow").trim().toLowerCase();
  if (normalized === "shadow" || normalized === "enforce") return normalized;
  throw new Error(`Unsupported CONVERSATION_V2_RESPONSE_CONTRACT_MODE: ${normalized}`);
}

function parseLineChannelStage(value: string | undefined): "demo" | "production" | "unconfigured" {
  const normalized = (value ?? "unconfigured").trim().toLowerCase();
  if (normalized === "demo" || normalized === "production" || normalized === "unconfigured") return normalized;
  throw new Error(`Unsupported LINE_CHANNEL_STAGE: ${normalized}`);
}

function parseIdentifierList(value: string | undefined) {
  return Array.from(new Set(
    (value ?? "")
      .split(/[,;\n\r]+/u)
      .map((item) => item.trim())
      .filter(Boolean),
  ));
}

function parseInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseConfidence(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

function getDefaultLogDir(appRoot: string) {
  if (process.env.VERCEL) {
    return "/tmp/line-ai-live-demo";
  }

  return path.resolve(appRoot, "./runtime-logs");
}

function getDefaultSeedDir(appRoot: string) {
  const appSeedDir = path.resolve(appRoot, "./data/live-demo-seed");
  if (fs.existsSync(appSeedDir)) {
    return appSeedDir;
  }

  const workspaceSeedDir = path.resolve(appRoot, "../data/live-demo-seed");
  if (fs.existsSync(workspaceSeedDir)) {
    return workspaceSeedDir;
  }

  return appSeedDir;
}

export function getRuntimeConfig(): RuntimeConfig {
  const appRoot = process.cwd();
  const configuredSeedDir = process.env.LIVE_DEMO_SEED_DIR
    ? path.resolve(appRoot, process.env.LIVE_DEMO_SEED_DIR)
    : getDefaultSeedDir(appRoot);
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;

  const openAiNluMode = parseNluMode(process.env.OPENAI_NLU_MODE);
  const openAiNluDecisionMode = parseNluDecisionMode(process.env.OPENAI_NLU_DECISION_MODE);
  const conversationV2Mode = parseConversationV2Mode(process.env.CONVERSATION_V2_MODE);
  const conversationV2ResponseContractMode = parseConversationV2ResponseContractMode(
    process.env.CONVERSATION_V2_RESPONSE_CONTRACT_MODE,
  );
  const lineChannelStage = parseLineChannelStage(process.env.LINE_CHANNEL_STAGE);
  if (conversationV2Mode === "shadow"
    && openAiNluMode === "shadow"
    && openAiNluDecisionMode === "canary") {
    throw new Error("OPENAI_NLU_MODE=shadow cannot run with OPENAI_NLU_DECISION_MODE=canary; one message must make at most one NLU request");
  }
  if (
    (conversationV2Mode === "canary" || conversationV2Mode === "demo_all") &&
    (openAiNluMode !== "off" || openAiNluDecisionMode !== "off")
  ) {
    throw new Error("Customer-visible Conversation V2 modes require the legacy NLU shadow and decision modes to remain off; one message must make at most one NLU request");
  }
  if (conversationV2Mode === "demo_all" && lineChannelStage !== "demo") {
    throw new Error("CONVERSATION_V2_MODE=demo_all requires LINE_CHANNEL_STAGE=demo; broad V2 routing is forbidden on an unlabelled or production LINE channel");
  }
  if (
    conversationV2ResponseContractMode === "enforce" &&
    conversationV2Mode !== "canary" &&
    !(conversationV2Mode === "demo_all" && lineChannelStage === "demo")
  ) {
    throw new Error("CONVERSATION_V2_RESPONSE_CONTRACT_MODE=enforce requires Conversation V2 canary or demo_all on a demo LINE channel");
  }

  return {
    adminNotifyTarget: process.env.ADMIN_NOTIFY_TARGET ?? "",
    aiReplyGenerationTimeoutMs: parseInteger(process.env.AI_REPLY_GENERATION_TIMEOUT_MS, 2500),
    aiOfficialSearchTimeoutMs: parseInteger(process.env.AI_OFFICIAL_SEARCH_TIMEOUT_MS, 5500),
    aiProvider: (process.env.AI_PROVIDER ?? "anthropic").toLowerCase() === "openai" ? "openai" : "anthropic",
    appBaseUrl: process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_BASE_URL ?? (vercelHost ? `https://${vercelHost}` : "https://line-ai-live-demo.vercel.app"),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    bootstrapOwnerEmail: process.env.BOOTSTRAP_OWNER_EMAIL ?? "",
    claudeHumanizerEnabled: parseBoolean(process.env.CLAUDE_HUMANIZER_ENABLED, false),
    anthropicMaxTokens: parseInteger(process.env.CLAUDE_MAX_TOKENS, 300),
    anthropicModel: process.env.CLAUDE_MODEL ?? "claude-haiku-4-5",
    claudeApiEnabled: parseBoolean(process.env.CLAUDE_API_ENABLED, false),
    conversationV2CanaryUserIds: parseIdentifierList(process.env.CONVERSATION_V2_CANARY_USER_IDS),
    conversationV2Mode,
    conversationV2ResponseContractMode,
    cronSecret: process.env.CRON_SECRET ?? "",
    debugToken: process.env.LIVE_DEMO_DEBUG_TOKEN ?? "",
    handoffDigestFrom: process.env.HANDOFF_DIGEST_FROM ?? "",
    handoffDigestKaohsiungTo: process.env.HANDOFF_DIGEST_KAOHSIUNG_TO ?? "",
    handoffDigestLinkouTo: process.env.HANDOFF_DIGEST_LINKOU_TO ?? "",
    handoffDigestTaichungTo: process.env.HANDOFF_DIGEST_TAICHUNG_TO ?? "",
    handoffDigestTaoyuanTo: process.env.HANDOFF_DIGEST_TAOYUAN_TO ?? "",
    googleSheetsEnabled: parseBoolean(process.env.GOOGLE_SHEETS_ENABLED, false),
    googleSheetsPrivateKey: (process.env.GOOGLE_SHEETS_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    googleSheetsServiceAccountEmail: process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL ?? "",
    googleSheetsSpreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "",
    includePending: parseBoolean(process.env.LIVE_DEMO_INCLUDE_PENDING, false),
    lineAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
    lineAlertUserId: process.env.LIVE_DEMO_ALERT_LINE_USER_ID ?? "",
    lineChannelSecret: process.env.LINE_CHANNEL_SECRET ?? "",
    lineChannelStage,
    lineReplyRetryCount: parseInteger(process.env.LINE_REPLY_RETRY_COUNT, 1),
    lineReplyTimeoutMs: parseInteger(process.env.LINE_REPLY_TIMEOUT_MS, 8000),
    logDir: process.env.LIVE_DEMO_LOG_DIR
      ? path.resolve(appRoot, process.env.LIVE_DEMO_LOG_DIR)
      : getDefaultLogDir(appRoot),
    openAiApiKey: process.env.OPENAI_API_KEY ?? "",
    openAiIntentClassifierEnabled: parseBoolean(process.env.OPENAI_INTENT_CLASSIFIER_ENABLED, true),
    openAiIntentClassifierMaxTokens: parseInteger(process.env.OPENAI_INTENT_CLASSIFIER_MAX_TOKENS, 96),
    openAiIntentClassifierMinConfidence: parseConfidence(process.env.OPENAI_INTENT_CLASSIFIER_MIN_CONFIDENCE, 0.85),
    openAiIntentClassifierTimeoutMs: parseInteger(process.env.OPENAI_INTENT_CLASSIFIER_TIMEOUT_MS, 800),
    openAiMaxTokens: parseInteger(process.env.OPENAI_MAX_TOKENS, 300),
    openAiModel: process.env.OPENAI_MODEL ?? "gpt-5.6-luna",
    openAiNluDecisionMode,
    openAiNluMode,
    openAiNluSampleRate: parseConfidence(process.env.OPENAI_NLU_SAMPLE_RATE, 0),
    openAiNluTimeoutMs: parseInteger(process.env.OPENAI_NLU_TIMEOUT_MS, 700),
    retentionSweepMode: process.env.RETENTION_SWEEP_MODE ?? "",
    resendApiKey: process.env.RESEND_API_KEY ?? "",
    sentryAuthToken: process.env.SENTRY_AUTH_TOKEN ?? "",
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
    sentryEnvironment: process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    sentryOrg: process.env.SENTRY_ORG ?? "",
    sentryProject: process.env.SENTRY_PROJECT ?? "",
    seedDir: configuredSeedDir,
    sendReply: parseBoolean(process.env.LIVE_DEMO_SEND_REPLY, false),
    skipSignatureVerify: parseBoolean(process.env.LIVE_DEMO_SKIP_SIGNATURE_VERIFY, false),
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    supabaseUrl: process.env.SUPABASE_URL ?? "",
  };
}
