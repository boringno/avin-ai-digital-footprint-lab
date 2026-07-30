import { NextResponse } from "next/server";

import { parseHandoffDigestSlot, runHandoffDigest } from "@/lib/handoff-digest";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { reportOperationalError } from "@/lib/monitoring";

export async function handleHandoffDigestCron(request: Request, source: string) {
  const config = getRuntimeConfig();
  if (!config.cronSecret || request.headers.get("authorization") !== `Bearer ${config.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized", ok: false }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const slot = parseHandoffDigestSlot(url.searchParams.get("slot")) ?? undefined;
    return NextResponse.json({ ok: true, result: await runHandoffDigest(new Date(), slot) });
  } catch (error) {
    await reportOperationalError({ alert: true, error, source });
    return NextResponse.json({ error: "Handoff digest failed", ok: false }, { status: 500 });
  }
}
