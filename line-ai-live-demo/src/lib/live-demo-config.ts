import fs from "node:fs";
import path from "node:path";

export type RuntimeConfig = {
  adminNotifyTarget: string;
  aiProvider: "anthropic" | "openai";
  appBaseUrl: string;
  anthropicApiKey: string;
  bootstrapOwnerEmail: string;
  claudeHumanizerEnabled: boolean;
  anthropicMaxTokens: number;
  anthropicModel: string;
  claudeApiEnabled: boolean;
  cronSecret: string;
  debugToken: string;
  googleSheetsEnabled: boolean;
  googleSheetsPrivateKey: string;
  googleSheetsServiceAccountEmail: string;
  googleSheetsSpreadsheetId: string;
  includePending: boolean;
  lineAccessToken: string;
  lineAlertUserId: string;
  lineChannelSecret: string;
  lineReplyRetryCount: number;
  lineReplyTimeoutMs: number;
  logDir: string;
  openAiApiKey: string;
  openAiMaxTokens: number;
  openAiModel: string;
  retentionSweepMode: string;
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

function parseInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

  return {
    adminNotifyTarget: process.env.ADMIN_NOTIFY_TARGET ?? process.env.LIVE_DEMO_ALERT_LINE_USER_ID ?? "",
    aiProvider: (process.env.AI_PROVIDER ?? "anthropic").toLowerCase() === "openai" ? "openai" : "anthropic",
    appBaseUrl: process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_BASE_URL ?? (vercelHost ? `https://${vercelHost}` : "https://line-ai-live-demo.vercel.app"),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    bootstrapOwnerEmail: process.env.BOOTSTRAP_OWNER_EMAIL ?? "",
    claudeHumanizerEnabled: parseBoolean(process.env.CLAUDE_HUMANIZER_ENABLED, false),
    anthropicMaxTokens: parseInteger(process.env.CLAUDE_MAX_TOKENS, 300),
    anthropicModel: process.env.CLAUDE_MODEL ?? "claude-haiku-4-5",
    claudeApiEnabled: parseBoolean(process.env.CLAUDE_API_ENABLED, false),
    cronSecret: process.env.CRON_SECRET ?? "",
    debugToken: process.env.LIVE_DEMO_DEBUG_TOKEN ?? "",
    googleSheetsEnabled: parseBoolean(process.env.GOOGLE_SHEETS_ENABLED, false),
    googleSheetsPrivateKey: (process.env.GOOGLE_SHEETS_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    googleSheetsServiceAccountEmail: process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL ?? "",
    googleSheetsSpreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "",
    includePending: parseBoolean(process.env.LIVE_DEMO_INCLUDE_PENDING, false),
    lineAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
    lineAlertUserId: process.env.LIVE_DEMO_ALERT_LINE_USER_ID ?? "",
    lineChannelSecret: process.env.LINE_CHANNEL_SECRET ?? "",
    lineReplyRetryCount: parseInteger(process.env.LINE_REPLY_RETRY_COUNT, 1),
    lineReplyTimeoutMs: parseInteger(process.env.LINE_REPLY_TIMEOUT_MS, 8000),
    logDir: process.env.LIVE_DEMO_LOG_DIR
      ? path.resolve(appRoot, process.env.LIVE_DEMO_LOG_DIR)
      : getDefaultLogDir(appRoot),
    openAiApiKey: process.env.OPENAI_API_KEY ?? "",
    openAiMaxTokens: parseInteger(process.env.OPENAI_MAX_TOKENS, 300),
    openAiModel: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
    retentionSweepMode: process.env.RETENTION_SWEEP_MODE ?? "",
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
