import { NextResponse } from "next/server";

import { canViewOperationalDebug, requireAdminStaff } from "@/lib/admin-auth";
import { readRecentWebhookAudit } from "@/lib/webhook-audit-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const staff = await requireAdminStaff(request);
  if (!staff) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canViewOperationalDebug(staff.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;
  const entries = await readRecentWebhookAudit(limit);
  const operationalEntries = entries.map((entry) => ({
    eventCount: entry.eventCount,
    hasRequestError: entry.hasRequestError ?? Boolean((entry as { requestError?: unknown }).requestError),
    loggedAt: entry.loggedAt,
    replyResults: entry.replyResults.map((result) => ({
      attempts: result.attempts,
      hasError: result.hasError ?? Boolean((result as { errorMessage?: unknown }).errorMessage),
      ok: result.ok,
      status: result.status,
    })),
    resultCounts: entry.results.reduce<Record<string, number>>((counts, result) => {
      counts[result.decision.decisionType] = (counts[result.decision.decisionType] ?? 0) + 1;
      return counts;
    }, {}),
    sendReply: entry.sendReply,
    signatureVerified: entry.signatureVerified,
  }));

  return NextResponse.json({
    ok: true,
    count: operationalEntries.length,
    entries: operationalEntries,
    redacted: "operational-only",
  });
}
