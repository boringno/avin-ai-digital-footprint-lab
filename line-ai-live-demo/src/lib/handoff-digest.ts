import { listActiveBranches } from "@/lib/clinic-config";
import { DEFAULT_TENANT_ID } from "@/lib/conversation-store";
import { getRuntimeConfig, type RuntimeConfig } from "@/lib/live-demo-config";
import { reportOperationalError } from "@/lib/monitoring";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

export type HandoffDigestBranch = "高雄館" | "台中館" | "桃園館" | "林口館";

type HandoffTaskRow = {
  branch: string | null;
  id: string;
};

type DigestDeliveryRow = {
  id: string;
};

type ResendResponse = {
  id?: string;
};

export type HandoffDigestResult = {
  deliveries: Array<{ branch: HandoffDigestBranch; status: "sent" | "skipped"; taskCount: number }>;
  unassignedTaskCount: number;
};

const HANDOFF_DIGEST_BRANCHES = ["高雄館", "台中館", "桃園館", "林口館"] as const;

export function getHandoffDigestRecipients(config: RuntimeConfig): Record<HandoffDigestBranch, string> {
  return {
    "台中館": config.handoffDigestTaichungTo.trim(),
    "桃園館": config.handoffDigestTaoyuanTo.trim(),
    "林口館": config.handoffDigestLinkouTo.trim(),
    "高雄館": config.handoffDigestKaohsiungTo.trim(),
  };
}

export function getHandoffDigestKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Taipei",
    weekday: "short",
    year: "numeric",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = `${values.year}-${values.month}-${values.day}`;
  const slotByWeekday: Record<string, string> = {
    Fri: "weekday-evening",
    Mon: "weekday-evening",
    Sat: "saturday-afternoon",
    Sun: "sunday-afternoon",
    Thu: "weekday-evening",
    Tue: "weekday-evening",
    Wed: "weekday-evening",
  };

  return `${date}-${slotByWeekday[values.weekday] ?? "manual"}`;
}

export function buildHandoffDigestEmail(input: { branch: HandoffDigestBranch; taskCount: number; appBaseUrl: string; test?: boolean }) {
  const subject = input.test
    ? `【測試】${input.branch} 真人接手通知設定`
    : `【待處理提醒】${input.branch} 有 ${input.taskCount} 位客人等待真人客服`;
  const workbenchUrl = `${input.appBaseUrl.replace(/\/$/, "")}/admin/workbench`;
  const heading = input.test ? "高雄館通知測試成功" : `${input.branch} 待處理真人接手提醒`;
  const body = input.test
    ? "此為系統寄送測試。正式通知只會提供待處理數量，不會包含客人姓名、電話、LINE ID 或對話內容。"
    : `目前有 ${input.taskCount} 位客人等待真人客服處理。請登入客服工作台查看。`;

  return {
    html: `<p>${heading}</p><p>${body}</p><p><a href="${workbenchUrl}">前往客服工作台</a></p>`,
    subject,
    text: `${heading}\n\n${body}\n\n客服工作台：${workbenchUrl}`,
  };
}

export async function sendHandoffDigestTest(branch: HandoffDigestBranch = "高雄館") {
  const config = getRuntimeConfig();
  const recipient = getHandoffDigestRecipients(config)[branch];
  return sendHandoffDigestEmail({ appBaseUrl: config.appBaseUrl, branch, from: config.handoffDigestFrom, recipient, test: true });
}

export async function runHandoffDigest(now = new Date()): Promise<HandoffDigestResult> {
  if (!hasSupabaseServerConfig()) {
    return { deliveries: [], unassignedTaskCount: 0 };
  }

  const config = getRuntimeConfig();
  const recipients = getHandoffDigestRecipients(config);
  const { data, error } = await getSupabaseServerClient()
    .from("handoff_tasks")
    .select("id, branch")
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .in("status", ["open", "taken"]);
  if (error) {
    throw new Error(`Failed to load pending handoff tasks: ${error.message}`);
  }

  const counts = new Map<HandoffDigestBranch, number>();
  let unassignedTaskCount = 0;
  for (const task of (data ?? []) as HandoffTaskRow[]) {
    if (!isHandoffDigestBranch(task.branch)) {
      unassignedTaskCount += 1;
      continue;
    }
    counts.set(task.branch, (counts.get(task.branch) ?? 0) + 1);
  }

  const digestKey = getHandoffDigestKey(now);
  const deliveries: HandoffDigestResult["deliveries"] = [];
  for (const branch of activeDigestBranches()) {
    const taskCount = counts.get(branch) ?? 0;
    if (taskCount === 0 || !recipients[branch] || !config.handoffDigestFrom || !config.resendApiKey) {
      deliveries.push({ branch, status: "skipped", taskCount });
      continue;
    }

    const claim = await claimDigestDelivery(branch, digestKey, taskCount);
    if (!claim) {
      deliveries.push({ branch, status: "skipped", taskCount });
      continue;
    }

    const result = await sendHandoffDigestEmail({
      appBaseUrl: config.appBaseUrl,
      branch,
      from: config.handoffDigestFrom,
      recipient: recipients[branch],
      taskCount,
    });
    if (!result.ok) {
      await getSupabaseServerClient().from("handoff_digest_deliveries").delete().eq("id", claim.id).eq("tenant_id", DEFAULT_TENANT_ID);
      throw new Error("Handoff digest email failed");
    }

    const { error: updateError } = await getSupabaseServerClient()
      .from("handoff_digest_deliveries")
      .update({ provider_message_id: result.providerMessageId, sent_at: new Date().toISOString(), status: "sent" })
      .eq("id", claim.id)
      .eq("tenant_id", DEFAULT_TENANT_ID);
    if (updateError) {
      await reportOperationalError({ alert: false, error: updateError, source: "handoff_digest_delivery_audit" });
    }
    deliveries.push({ branch, status: "sent", taskCount });
  }

  return { deliveries, unassignedTaskCount };
}

async function claimDigestDelivery(branch: HandoffDigestBranch, digestKey: string, taskCount: number) {
  const { data, error } = await getSupabaseServerClient()
    .from("handoff_digest_deliveries")
    .insert({ branch, digest_key: digestKey, status: "sending", task_count: taskCount, tenant_id: DEFAULT_TENANT_ID })
    .select("id")
    .maybeSingle<DigestDeliveryRow>();
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(`Failed to reserve handoff digest delivery: ${error.message}`);
  }
  return data;
}

async function sendHandoffDigestEmail(input: {
  appBaseUrl: string;
  branch: HandoffDigestBranch;
  from: string;
  recipient: string;
  taskCount?: number;
  test?: boolean;
}) {
  const config = getRuntimeConfig();
  if (!config.resendApiKey || !input.from || !input.recipient) return { ok: false, providerMessageId: null };

  const message = buildHandoffDigestEmail({
    appBaseUrl: input.appBaseUrl,
    branch: input.branch,
    taskCount: input.taskCount ?? 0,
    test: input.test,
  });
  try {
    const response = await fetch("https://api.resend.com/emails", {
      body: JSON.stringify({ from: input.from, html: message.html, subject: message.subject, text: message.text, to: [input.recipient] }),
      headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json", "User-Agent": "line-ai-live-demo" },
      method: "POST",
    });
    if (!response.ok) {
      await reportOperationalError({ alert: false, error: new Error(`Handoff digest email failed: ${response.status}`), source: "handoff_digest_email" });
      return { ok: false, providerMessageId: null };
    }
    const body = (await response.json()) as ResendResponse;
    return { ok: true, providerMessageId: body.id ?? null };
  } catch (error) {
    await reportOperationalError({ alert: false, error, source: "handoff_digest_email" });
    return { ok: false, providerMessageId: null };
  }
}

function activeDigestBranches(): HandoffDigestBranch[] {
  return listActiveBranches().map((branch) => branch.name).filter(isHandoffDigestBranch);
}

function isHandoffDigestBranch(value: string | null): value is HandoffDigestBranch {
  return typeof value === "string" && HANDOFF_DIGEST_BRANCHES.includes(value as HandoffDigestBranch);
}
