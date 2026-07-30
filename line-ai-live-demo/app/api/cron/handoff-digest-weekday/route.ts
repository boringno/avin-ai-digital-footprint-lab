import { handleHandoffDigestCron } from "@/lib/handoff-digest-cron";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleHandoffDigestCron(request, "handoff_digest_weekday_cron");
}
