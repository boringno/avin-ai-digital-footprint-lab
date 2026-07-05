import fs from "node:fs";
import path from "node:path";

export type RuntimeConfig = {
  anthropicApiKey: string;
  claudeHumanizerEnabled: boolean;
  anthropicMaxTokens: number;
  anthropicModel: string;
  claudeApiEnabled: boolean;
  debugToken: string;
  googleSheetsEnabled: boolean;
  googleSheetsPrivateKey: string;
  googleSheetsServiceAccountEmail: string;
  googleSheetsSpreadsheetId: string;
  includePending: boolean;
  lineAccessToken: string;
  lineChannelSecret: string;
  logDir: string;
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
  const workspaceSeedDir = path.resolve(appRoot, "../data/live-demo-seed");
  if (fs.existsSync(workspaceSeedDir)) {
    return workspaceSeedDir;
  }

  return path.resolve(appRoot, "./data/live-demo-seed");
}

export function getRuntimeConfig(): RuntimeConfig {
  const appRoot = process.cwd();
  const configuredSeedDir = process.env.LIVE_DEMO_SEED_DIR
    ? path.resolve(appRoot, process.env.LIVE_DEMO_SEED_DIR)
    : getDefaultSeedDir(appRoot);

  return {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    claudeHumanizerEnabled: parseBoolean(process.env.CLAUDE_HUMANIZER_ENABLED, false),
    anthropicMaxTokens: parseInteger(process.env.CLAUDE_MAX_TOKENS, 300),
    anthropicModel: process.env.CLAUDE_MODEL ?? "claude-haiku-4-5",
    claudeApiEnabled: parseBoolean(process.env.CLAUDE_API_ENABLED, false),
    debugToken: process.env.LIVE_DEMO_DEBUG_TOKEN ?? "",
    googleSheetsEnabled: parseBoolean(process.env.GOOGLE_SHEETS_ENABLED, false),
    googleSheetsPrivateKey: (process.env.GOOGLE_SHEETS_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    googleSheetsServiceAccountEmail: process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL ?? "",
    googleSheetsSpreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "",
    includePending: parseBoolean(process.env.LIVE_DEMO_INCLUDE_PENDING, false),
    lineAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
    lineChannelSecret: process.env.LINE_CHANNEL_SECRET ?? "",
    logDir: process.env.LIVE_DEMO_LOG_DIR
      ? path.resolve(appRoot, process.env.LIVE_DEMO_LOG_DIR)
      : getDefaultLogDir(appRoot),
    seedDir: configuredSeedDir,
    sendReply: parseBoolean(process.env.LIVE_DEMO_SEND_REPLY, false),
    skipSignatureVerify: parseBoolean(process.env.LIVE_DEMO_SKIP_SIGNATURE_VERIFY, false),
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    supabaseUrl: process.env.SUPABASE_URL ?? "",
  };
}
