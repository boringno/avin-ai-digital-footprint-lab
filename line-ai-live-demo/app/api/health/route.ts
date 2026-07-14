import { NextResponse } from "next/server";

import { getRuntimeConfig } from "@/lib/live-demo-config";
import { getSeedSummary } from "@/lib/seed-loader";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET() {
  const config = getRuntimeConfig();
  const summary = await getSeedSummary();
  let databaseStatus = "missing_env";

  if (hasSupabaseServerConfig()) {
    try {
      const supabase = getSupabaseServerClient();
      const { error } = await supabase
        .from("conversation_runtime_state")
        .select("line_user_id", { count: "exact", head: true });

      databaseStatus = error ? `error:${error.code ?? "unknown"}` : "configured";
    } catch {
      databaseStatus = "error:unreachable";
    }
  }

  const aiStatus =
    config.aiProvider === "openai"
      ? config.openAiApiKey
        ? `configured:${config.aiProvider}`
        : "disabled_or_missing_env"
      : config.claudeApiEnabled && config.anthropicApiKey
        ? `configured:${config.aiProvider}`
        : "disabled_or_missing_env";

  const sentryStatus = !config.sentryDsn
    ? "disabled_or_missing_env"
    : config.sentryAuthToken && config.sentryOrg && config.sentryProject
      ? "configured_runtime_and_build_upload"
      : "configured_runtime_only";

  return NextResponse.json({
    ok: true,
    app_status: "ok",
    ai_provider: config.aiProvider,
    ai_status: aiStatus,
    humanizer_status:
      config.claudeHumanizerEnabled && config.anthropicApiKey ? "configured" : "disabled_or_missing_env",
    database_status: databaseStatus,
    sentry_status: sentryStatus,
    sentry_environment: config.sentryEnvironment,
    google_sheets_status:
      config.googleSheetsEnabled &&
      config.googleSheetsSpreadsheetId &&
      config.googleSheetsServiceAccountEmail &&
      config.googleSheetsPrivateKey
        ? "configured"
        : "disabled_or_missing_env",
    line_config_status: config.lineChannelSecret && config.lineAccessToken ? "configured" : "missing_env",
    seed_status: {
      dir: config.seedDir,
      faq_count: summary.faqCount,
      handoff_count: summary.handoffCount,
      pregnancy_rule_count: summary.pregnancyRuleCount,
      pricing_count: summary.pricingCount,
    },
  });
}
