import { NextResponse } from "next/server";

import { getRuntimeConfig } from "@/lib/live-demo-config";
import { reportOperationalError } from "@/lib/monitoring";
import { runDailyRollup } from "@/lib/reporting-rollup";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const config = getRuntimeConfig();
  const authorized = Boolean(config.cronSecret) && request.headers.get("authorization") === `Bearer ${config.cronSecret}`;
  if (!authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDailyRollup({ retentionApplyRequested: config.retentionSweepMode === "apply" });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    await reportOperationalError({ alert: true, error, source: "daily_reporting_rollup" });
    return NextResponse.json({ ok: false, error: "Daily rollup failed" }, { status: 500 });
  }
}
