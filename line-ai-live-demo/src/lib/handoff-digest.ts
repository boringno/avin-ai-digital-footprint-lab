import { listActiveBranches } from "@/lib/clinic-config";
import { DEFAULT_TENANT_ID } from "@/lib/conversation-store";
import { getRuntimeConfig, type RuntimeConfig } from "@/lib/live-demo-config";
import { reportOperationalError } from "@/lib/monitoring";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

export type HandoffDigestBranch = string;
export type HandoffNotificationChannel = "email" | "line_group";
export type HandoffDigestSlot = "manual" | "weekday_2100" | "weekend_0800" | "weekend_2000";

export type HandoffDigestChannelRecipients = Record<HandoffNotificationChannel, string[]>;
export type HandoffDigestRecipients = Record<HandoffDigestBranch, HandoffDigestChannelRecipients>;

export type HandoffDigestRecipientRow = {
  branch: HandoffDigestBranch;
  channel: HandoffNotificationChannel;
  recipient_scope: "clinic" | "platform";
  target: string | null;
};

export type HandoffDigestExecutionResult = {
  deliveries: Array<{
    branch: HandoffDigestBranch;
    channel: HandoffNotificationChannel;
    errorMessage?: string | null;
    status: "failed" | "sent" | "skipped";
    taskCount: number;
  }>;
  digestKey: string;
  slot: HandoffDigestSlot;
  unassignedTaskCount: number;
};

type HandoffTaskRow = {
  branch: string | null;
};

type DigestDeliveryRow = {
  id: string;
};

type ResendResponse = {
  id?: string;
};

type SendDigestInput = {
  appBaseUrl: string;
  branch: HandoffDigestBranch;
  channel: HandoffNotificationChannel;
  recipients: string[];
  taskCount: number;
  test?: boolean;
};

type SendDigestResult = {
  errorMessage?: string | null;
  ok: boolean;
  providerMessageId: string | null;
};

type ExecuteHandoffDigestPlanInput = {
  appBaseUrl: string;
  branches: HandoffDigestBranch[];
  claimDelivery: (
    branch: HandoffDigestBranch,
    channel: HandoffNotificationChannel,
    digestKey: string,
    taskCount: number,
  ) => Promise<DigestDeliveryRow | null>;
  digestKey: string;
  enabledChannels?: Partial<Record<HandoffNotificationChannel, boolean>>;
  markFailed: (claimId: string, errorMessage: string) => Promise<void>;
  markSent: (claimId: string, providerMessageId: string | null) => Promise<void>;
  recipients: HandoffDigestRecipients;
  sendDigest: (input: SendDigestInput) => Promise<SendDigestResult>;
  slot: HandoffDigestSlot;
  taskCounts: Record<HandoffDigestBranch, number>;
  unassignedTaskCount: number;
};

const HANDOFF_DIGEST_CHANNELS: HandoffNotificationChannel[] = ["email", "line_group"];
const DEFAULT_BRANCHES = ["高雄館", "台中館", "桃園館", "林口館"];

export function activeDigestBranches() {
  const branchNames = listActiveBranches().map((branch) => branch.name.trim()).filter(Boolean);
  return branchNames.length > 0 ? branchNames : DEFAULT_BRANCHES;
}

export function createEmptyRecipientMap(branches: HandoffDigestBranch[]): HandoffDigestRecipients {
  return Object.fromEntries(
    branches.map((branch) => [
      branch,
      {
        email: [],
        line_group: [],
      },
    ]),
  ) as HandoffDigestRecipients;
}

export function getHandoffDigestRecipients(config: RuntimeConfig, branches: HandoffDigestBranch[] = activeDigestBranches()) {
  return Object.fromEntries(
    branches.map((branch) => [
      branch,
      {
        email: splitEmailRecipients(getBranchFallbackEmailTargets(config, branch)),
        line_group: splitLineTargets(config.adminNotifyTarget),
      },
    ]),
  ) as HandoffDigestRecipients;
}

export function buildDigestRecipientsFromRows(input: {
  branches: HandoffDigestBranch[];
  fallbackRecipients: HandoffDigestRecipients;
  rows: HandoffDigestRecipientRow[];
}) {
  const clinicTargets = createEmptyRecipientMap(input.branches);
  const platformTargets = createEmptyRecipientMap(input.branches);

  for (const row of input.rows) {
    if (!row.target || !input.branches.includes(row.branch)) {
      continue;
    }

    const target = row.recipient_scope === "clinic" ? clinicTargets : platformTargets;
    target[row.branch][row.channel] = [
      ...target[row.branch][row.channel],
      normalizeTarget(row.channel, row.target),
    ].filter(Boolean);
  }

  return Object.fromEntries(
    input.branches.map((branch) => [
      branch,
      {
        email: uniqueRecipients([
          ...(clinicTargets[branch].email.length > 0 ? clinicTargets[branch].email : input.fallbackRecipients[branch]?.email ?? []),
          ...platformTargets[branch].email,
        ]),
        line_group: uniqueRecipients([
          ...(clinicTargets[branch].line_group.length > 0
            ? clinicTargets[branch].line_group
            : input.fallbackRecipients[branch]?.line_group ?? []),
          ...platformTargets[branch].line_group,
        ]),
      },
    ]),
  ) as HandoffDigestRecipients;
}

export async function loadHandoffDigestRecipients(
  config: RuntimeConfig,
  tenantId = DEFAULT_TENANT_ID,
  branches: HandoffDigestBranch[] = activeDigestBranches(),
) {
  const supabase = getSupabaseServerClient();
  const fallbackRecipients = getHandoffDigestRecipients(config, branches);
  const rows: HandoffDigestRecipientRow[] = [];

  for (const branch of branches) {
    const { data, error } = await supabase
      .from("handoff_notification_recipients")
      .select("branch, channel, recipient_scope, target")
      .eq("tenant_id", tenantId)
      .eq("branch", branch)
      .eq("is_active", true)
      .returns<HandoffDigestRecipientRow[]>();
    if (error) {
      throw new Error(`Failed to load handoff digest recipients for ${branch}: ${error.message}`);
    }
    rows.push(...(data ?? []));
  }

  return buildDigestRecipientsFromRows({
    branches,
    fallbackRecipients,
    rows,
  });
}

export function getHandoffDigestSlot(now = new Date()): HandoffDigestSlot {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Asia/Taipei",
      weekday: "short",
    }).formatToParts(now).map((part) => [part.type, part.value]),
  );
  const weekday = values.weekday ?? "";
  const hour = Number.parseInt(values.hour ?? "0", 10);
  const isWeekend = weekday === "Sat" || weekday === "Sun";

  if (!isWeekend) {
    return "weekday_2100";
  }

  return hour < 14 ? "weekend_0800" : "weekend_2000";
}

export function parseHandoffDigestSlot(value: string | null | undefined) {
  if (value === "weekday_2100" || value === "weekend_0800" || value === "weekend_2000" || value === "manual") {
    return value;
  }
  return null;
}

export function getHandoffDigestKey(now = new Date(), slot = getHandoffDigestSlot(now)) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "Asia/Taipei",
      year: "numeric",
    }).formatToParts(now).map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}-${slot}`;
}

export function buildHandoffDigestEmail(input: {
  appBaseUrl: string;
  branch: HandoffDigestBranch;
  taskCount: number;
  test?: boolean;
}) {
  const workbenchUrl = `${input.appBaseUrl.replace(/\/$/, "")}/admin/workbench`;
  const subject = input.test
    ? `[測試通知] ${input.branch} 待處理真人客服提醒`
    : `[待處理提醒] ${input.branch} 有 ${input.taskCount} 位客人等待真人客服`;
  const heading = input.test ? `${input.branch} 測試通知` : `${input.branch} 待處理真人接手提醒`;
  const body = input.test
    ? "這是一封測試通知。內容只包含待處理數量與工作台連結，不包含姓名、電話或對話內容。"
    : `目前有 ${input.taskCount} 位客人等待真人客服處理。請登入客服工作台查看。`;

  return {
    html: `<p>${heading}</p><p>${body}</p><p><a href="${workbenchUrl}">前往客服工作台</a></p>`,
    subject,
    text: `${heading}\n\n${body}\n\n前往客服工作台：${workbenchUrl}`,
  };
}

export function buildHandoffDigestLineText(input: {
  appBaseUrl: string;
  branch: HandoffDigestBranch;
  taskCount: number;
  test?: boolean;
}) {
  const workbenchUrl = `${input.appBaseUrl.replace(/\/$/, "")}/admin/workbench`;
  if (input.test) {
    return [
      `${input.branch} 測試通知`,
      "這是一則待處理通知測試訊息。",
      "內容只包含待處理數量與工作台連結，不包含姓名、電話或對話內容。",
      `工作台：${workbenchUrl}`,
    ].join("\n");
  }

  return [
    `${input.branch} 待處理真人接手提醒`,
    `目前有 ${input.taskCount} 位客人等待真人客服處理。`,
    `工作台：${workbenchUrl}`,
  ].join("\n");
}

export async function sendHandoffDigestTest(
  branch: HandoffDigestBranch = "高雄館",
  recipientScope: "clinic" | "platform" = "clinic",
  tenantId = DEFAULT_TENANT_ID,
  channel: HandoffNotificationChannel = "email",
) {
  const config = getRuntimeConfig();
  const recipients = await loadRecipientsForScope(branch, channel, recipientScope, config, tenantId);
  if (recipients.length === 0) {
    return { ok: false, providerMessageId: null };
  }

  return sendHandoffDigest({
    appBaseUrl: config.appBaseUrl,
    branch,
    channel,
    recipients,
    taskCount: 0,
    test: true,
  });
}

export async function runHandoffDigest(
  now = new Date(),
  slotInput?: HandoffDigestSlot,
): Promise<HandoffDigestExecutionResult> {
  const slot = slotInput ?? getHandoffDigestSlot(now);
  const digestKey = getHandoffDigestKey(now, slot);

  if (!hasSupabaseServerConfig()) {
    return {
      deliveries: [],
      digestKey,
      slot,
      unassignedTaskCount: 0,
    };
  }

  const config = getRuntimeConfig();
  const branches = activeDigestBranches();
  const [recipients, taskInfo] = await Promise.all([
    loadHandoffDigestRecipients(config, DEFAULT_TENANT_ID, branches),
    loadBranchTaskCounts(branches),
  ]);

  return executeHandoffDigestPlan({
    appBaseUrl: config.appBaseUrl,
    branches,
    claimDelivery: claimDigestDelivery,
    digestKey,
    markFailed: markDigestDeliveryFailed,
    markSent: markDigestDeliverySent,
    recipients,
    sendDigest: sendHandoffDigest,
    slot,
    taskCounts: taskInfo.taskCounts,
    unassignedTaskCount: taskInfo.unassignedTaskCount,
  });
}

export async function executeHandoffDigestPlan(input: ExecuteHandoffDigestPlanInput): Promise<HandoffDigestExecutionResult> {
  const deliveries: HandoffDigestExecutionResult["deliveries"] = [];

  for (const branch of input.branches) {
    const taskCount = input.taskCounts[branch] ?? 0;

    for (const channel of HANDOFF_DIGEST_CHANNELS) {
      const recipients = input.recipients[branch]?.[channel] ?? [];
      const isChannelEnabled = input.enabledChannels?.[channel] ?? canSendChannel(channel);

      if (taskCount === 0 || recipients.length === 0 || !isChannelEnabled) {
        deliveries.push({ branch, channel, status: "skipped", taskCount });
        continue;
      }

      const claim = await input.claimDelivery(branch, channel, input.digestKey, taskCount);
      if (!claim) {
        deliveries.push({ branch, channel, status: "skipped", taskCount });
        continue;
      }

      let result: SendDigestResult;
      try {
        result = await input.sendDigest({
          appBaseUrl: input.appBaseUrl,
          branch,
          channel,
          recipients,
          taskCount,
        });
      } catch (error) {
        result = {
          errorMessage: error instanceof Error ? error.message : "Unknown handoff digest failure",
          ok: false,
          providerMessageId: null,
        };
      }

      if (!result.ok) {
        const errorMessage = result.errorMessage ?? "Handoff digest delivery failed";
        await input.markFailed(claim.id, errorMessage);
        deliveries.push({
          branch,
          channel,
          errorMessage,
          status: "failed",
          taskCount,
        });
        continue;
      }

      await input.markSent(claim.id, result.providerMessageId);
      deliveries.push({ branch, channel, status: "sent", taskCount });
    }
  }

  return {
    deliveries,
    digestKey: input.digestKey,
    slot: input.slot,
    unassignedTaskCount: input.unassignedTaskCount,
  };
}

async function loadBranchTaskCounts(branches: HandoffDigestBranch[]) {
  const supabase = getSupabaseServerClient();
  const taskCounts: Record<HandoffDigestBranch, number> = Object.fromEntries(branches.map((branch) => [branch, 0]));

  for (const branch of branches) {
    const { count, error } = await supabase
      .from("handoff_tasks")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", DEFAULT_TENANT_ID)
      .eq("branch", branch)
      .in("status", ["open", "taken"]);
    if (error) {
      throw new Error(`Failed to load pending handoff tasks for ${branch}: ${error.message}`);
    }
    taskCounts[branch] = count ?? 0;
  }

  const { data, error } = await supabase
    .from("handoff_tasks")
    .select("branch")
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .in("status", ["open", "taken"])
    .returns<HandoffTaskRow[]>();
  if (error) {
    throw new Error(`Failed to load handoff task branches: ${error.message}`);
  }

  const unassignedTaskCount = (data ?? []).filter((row) => !row.branch || !branches.includes(row.branch)).length;
  return { taskCounts, unassignedTaskCount };
}

async function claimDigestDelivery(branch: HandoffDigestBranch, channel: HandoffNotificationChannel, digestKey: string, taskCount: number) {
  const supabase = getSupabaseServerClient();
  const { data: failedDelivery, error: retryError } = await supabase
    .from("handoff_digest_deliveries")
    .update({
      error_message: null,
      provider_message_id: null,
      sent_at: null,
      status: "sending",
      task_count: taskCount,
    })
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .eq("branch", branch)
    .eq("channel", channel)
    .eq("digest_key", digestKey)
    .eq("status", "failed")
    .select("id")
    .maybeSingle<DigestDeliveryRow>();

  if (retryError) {
    throw new Error(`Failed to retry handoff digest delivery: ${retryError.message}`);
  }

  if (failedDelivery) {
    return failedDelivery;
  }

  const { data, error } = await supabase
    .from("handoff_digest_deliveries")
    .insert({
      branch,
      channel,
      digest_key: digestKey,
      status: "sending",
      task_count: taskCount,
      tenant_id: DEFAULT_TENANT_ID,
    })
    .select("id")
    .maybeSingle<DigestDeliveryRow>();

  if (error) {
    if (error.code === "23505") {
      return null;
    }
    throw new Error(`Failed to reserve handoff digest delivery: ${error.message}`);
  }

  return data;
}

async function markDigestDeliverySent(claimId: string, providerMessageId: string | null) {
  const { error } = await getSupabaseServerClient()
    .from("handoff_digest_deliveries")
    .update({
      error_message: null,
      provider_message_id: providerMessageId,
      sent_at: new Date().toISOString(),
      status: "sent",
    })
    .eq("id", claimId)
    .eq("tenant_id", DEFAULT_TENANT_ID);

  if (error) {
    await reportOperationalError({
      alert: false,
      error,
      source: "handoff_digest_delivery_audit",
    });
  }
}

async function markDigestDeliveryFailed(claimId: string, errorMessage: string) {
  const { error } = await getSupabaseServerClient()
    .from("handoff_digest_deliveries")
    .update({
      error_message: errorMessage,
      status: "failed",
    })
    .eq("id", claimId)
    .eq("tenant_id", DEFAULT_TENANT_ID);

  if (error) {
    await reportOperationalError({
      alert: false,
      error,
      source: "handoff_digest_delivery_audit",
    });
  }
}

async function sendHandoffDigest(input: SendDigestInput): Promise<SendDigestResult> {
  return input.channel === "email" ? sendHandoffDigestEmail(input) : sendHandoffDigestLineGroup(input);
}

async function sendHandoffDigestEmail(input: SendDigestInput): Promise<SendDigestResult> {
  const config = getRuntimeConfig();
  if (!config.resendApiKey || !config.handoffDigestFrom || input.recipients.length === 0) {
    return {
      errorMessage: "Handoff digest email config is incomplete",
      ok: false,
      providerMessageId: null,
    };
  }

  const message = buildHandoffDigestEmail({
    appBaseUrl: input.appBaseUrl,
    branch: input.branch,
    taskCount: input.taskCount,
    test: input.test,
  });

  try {
    const response = await fetch("https://api.resend.com/emails", {
      body: JSON.stringify({
        from: config.handoffDigestFrom,
        html: message.html,
        subject: message.subject,
        text: message.text,
        to: input.recipients,
      }),
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "line-ai-live-demo",
      },
      method: "POST",
    });

    if (!response.ok) {
      const body = await response.text();
      const errorMessage = `Handoff digest email failed: ${response.status} ${body}`;
      await reportOperationalError({
        alert: false,
        error: new Error(errorMessage),
        extra: { branch: input.branch },
        source: "handoff_digest_email",
      });
      return { errorMessage, ok: false, providerMessageId: null };
    }

    const body = (await response.json()) as ResendResponse;
    return { ok: true, providerMessageId: body.id ?? null };
  } catch (error) {
    await reportOperationalError({
      alert: false,
      error,
      extra: { branch: input.branch },
      source: "handoff_digest_email",
    });
    return {
      errorMessage: error instanceof Error ? error.message : "Unknown handoff digest email error",
      ok: false,
      providerMessageId: null,
    };
  }
}

async function sendHandoffDigestLineGroup(input: SendDigestInput): Promise<SendDigestResult> {
  const config = getRuntimeConfig();
  if (!config.lineAccessToken || input.recipients.length === 0) {
    return {
      errorMessage: "Handoff digest LINE config is incomplete",
      ok: false,
      providerMessageId: null,
    };
  }

  const text = buildHandoffDigestLineText({
    appBaseUrl: input.appBaseUrl,
    branch: input.branch,
    taskCount: input.taskCount,
    test: input.test,
  });

  const failedTargets: string[] = [];
  for (const target of input.recipients) {
    try {
      const response = await fetch("https://api.line.me/v2/bot/message/push", {
        body: JSON.stringify({
          messages: [{ text, type: "text" }],
          to: target,
        }),
        headers: {
          Authorization: `Bearer ${config.lineAccessToken}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        failedTargets.push(target);
        await reportOperationalError({
          alert: false,
          error: new Error(`Handoff digest LINE push failed: ${response.status} ${await response.text()}`),
          extra: {
            branch: input.branch,
            target,
          },
          source: "handoff_digest_line_group",
        });
      }
    } catch (error) {
      failedTargets.push(target);
      await reportOperationalError({
        alert: false,
        error,
        extra: {
          branch: input.branch,
          target,
        },
        source: "handoff_digest_line_group",
      });
    }
  }

  if (failedTargets.length > 0) {
    return {
      errorMessage: `LINE group push failed for ${failedTargets.length} target(s)`,
      ok: false,
      providerMessageId: null,
    };
  }

  return { ok: true, providerMessageId: null };
}

async function loadRecipientsForScope(
  branch: HandoffDigestBranch,
  channel: HandoffNotificationChannel,
  scope: "clinic" | "platform",
  config: RuntimeConfig,
  tenantId: string,
) {
  const { data, error } = await getSupabaseServerClient()
    .from("handoff_notification_recipients")
    .select("target")
    .eq("tenant_id", tenantId)
    .eq("branch", branch)
    .eq("recipient_scope", scope)
    .eq("channel", channel)
    .eq("is_active", true)
    .returns<Array<{ target: string | null }>>();
  if (error) {
    throw new Error(`Failed to load ${scope} ${channel} notification recipients: ${error.message}`);
  }

  const savedRecipients = uniqueRecipients(
    (data ?? [])
      .map((row) => normalizeTarget(channel, row.target))
      .filter(Boolean),
  );

  if (scope === "clinic" && savedRecipients.length === 0) {
    return getHandoffDigestRecipients(config, [branch])[branch][channel];
  }

  return savedRecipients;
}

function canSendChannel(channel: HandoffNotificationChannel) {
  const config = getRuntimeConfig();
  return channel === "email"
    ? Boolean(config.resendApiKey && config.handoffDigestFrom)
    : Boolean(config.lineAccessToken);
}

function getBranchFallbackEmailTargets(config: RuntimeConfig, branch: HandoffDigestBranch) {
  switch (branch) {
    case "高雄館":
      return config.handoffDigestKaohsiungTo;
    case "台中館":
      return config.handoffDigestTaichungTo;
    case "桃園館":
      return config.handoffDigestTaoyuanTo;
    case "林口館":
      return config.handoffDigestLinkouTo;
    default:
      return "";
  }
}

function splitEmailRecipients(value: string) {
  return uniqueRecipients(
    value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function splitLineTargets(value: string) {
  return uniqueRecipients(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function normalizeTarget(channel: HandoffNotificationChannel, value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();
  return channel === "email" ? trimmed.toLowerCase() : trimmed;
}

function uniqueRecipients(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
