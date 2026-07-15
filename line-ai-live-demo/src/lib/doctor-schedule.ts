import fs from "node:fs/promises";
import path from "node:path";

import { parse } from "csv-parse/sync";

import {
  EMBEDDED_DOCTOR_SCHEDULE_ROWS,
  EMBEDDED_SCHEDULE_PUBLISH_STATUSES,
} from "@/lib/embedded-seed-data";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { DEFAULT_TENANT_ID } from "@/lib/conversation-store";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";
import type { LineReplyMessage } from "@/lib/treatment-carousel";

export type DoctorScheduleRow = {
  branch: string;
  doctor_name: string;
  notes: string;
  schedule_date: string;
  source_month: string;
  status: string;
  time_slot: string;
};

export type SchedulePublishStatusRow = {
  notes: string;
  published: string;
  published_at: string;
  source_month: string;
};

type DoctorScheduleDecision = {
  decisionType: "doctor_schedule_auto_reply";
  matchedKey: string;
  matchedType: "doctor_schedule";
  replyMessages?: LineReplyMessage[];
  replyText: string;
};

type DoctorScheduleQueryResult = {
  doctorName: null | string;
  sourceMonth: string;
};

const DOCTOR_SCHEDULE_FILENAME = "doctor_schedule_seed.csv";
const DOCTOR_SCHEDULE_PUBLISH_FILENAME = "doctor_schedule_publish_status_seed.csv";
const UNPUBLISHED_MONTH_REPLY =
  "下個月醫師門診時間目前仍在規劃中，建議您稍後再詢問，或先由真人客服為您協助確認。";
const UNKNOWN_DOCTOR_REPLY = "目前門診表已更新，請告訴我想查詢哪位醫師，我再幫您確認。";
const BRANCHES = ["高雄館", "台中館", "桃園館", "林口館"] as const;

type RuntimeScheduleAsset = {
  branch: string;
  original_content_url: string;
  preview_image_url: string;
};

type RuntimeScheduleRow = Pick<DoctorScheduleRow, "branch" | "doctor_name" | "schedule_date" | "status" | "time_slot">;

export function resolvePublishedScheduleForValidation(input: {
  assets: RuntimeScheduleAsset[];
  message: string;
  published: boolean;
  rows: RuntimeScheduleRow[];
  sourceMonth: string;
}): DoctorScheduleDecision {
  if (!input.published) {
    return { decisionType: "doctor_schedule_auto_reply", matchedKey: `doctor_schedule_unpublished:${input.sourceMonth}`, matchedType: "doctor_schedule", replyText: "本月門診表目前尚未公告，我先請真人客服協助您確認。" };
  }

  const doctorName = Array.from(new Set(input.rows.map((row) => row.doctor_name).filter(Boolean)))
    .sort((left, right) => right.length - left.length)
    .find((name) => normalizeText(input.message).includes(normalizeText(name)));
  if (doctorName) {
    const doctorRows = input.rows.filter((row) => row.doctor_name === doctorName);
    return { decisionType: "doctor_schedule_auto_reply", matchedKey: `doctor_schedule_found:${doctorName}:${input.sourceMonth}`, matchedType: "doctor_schedule", replyText: formatScheduleRows(doctorName, input.sourceMonth, doctorRows) };
  }

  const branch = findRequestedBranch(input.message);
  if (!branch) return { decisionType: "doctor_schedule_auto_reply", matchedKey: `doctor_schedule_branch_required:${input.sourceMonth}`, matchedType: "doctor_schedule", replyText: "請問想查哪一館的本月門診表？目前可查高雄、台中、桃園或林口館。" };
  const asset = input.assets.find((item) => item.branch === branch);
  if (!asset) return { decisionType: "doctor_schedule_auto_reply", matchedKey: `doctor_schedule_asset_missing:${branch}:${input.sourceMonth}`, matchedType: "doctor_schedule", replyText: `${branch}本月門診表暫時無法提供，我先請真人客服協助確認。` };
  return {
    decisionType: "doctor_schedule_auto_reply",
    matchedKey: `doctor_schedule_image:${branch}:${input.sourceMonth}`,
    matchedType: "doctor_schedule",
    replyMessages: [{ originalContentUrl: asset.original_content_url, previewImageUrl: asset.preview_image_url, type: "image" }],
    replyText: `以下為目前公告的${input.sourceMonth.slice(5)}月${branch}門診表；實際可預約時段仍由真人客服確認。`,
  };
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, "").trim().toLowerCase();
}

function buildMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getRequestedMonth(message: string, today: Date) {
  const explicitMonth = message.match(/(\d{1,2})\s*月/);
  if (explicitMonth) {
    const month = Number(explicitMonth[1]);
    if (month >= 1 && month <= 12) {
      return `${today.getFullYear()}-${String(month).padStart(2, "0")}`;
    }
  }

  return buildMonthKey(today);
}

function findRequestedBranch(message: string) {
  const normalized = normalizeText(message);
  return BRANCHES.find((branch) => normalized.includes(normalizeText(branch))) ?? null;
}

async function resolveRuntimeScheduleDecision(message: string, today: Date): Promise<DoctorScheduleDecision | null> {
  if (!hasSupabaseServerConfig()) return null;

  const sourceMonth = getRequestedMonth(message, today);
  if (sourceMonth !== buildMonthKey(today)) {
    return {
      decisionType: "doctor_schedule_auto_reply",
      matchedKey: `doctor_schedule_unpublished:${sourceMonth}`,
      matchedType: "doctor_schedule",
      replyText: "目前只會提供本月已公告的門診表；其他月份請由真人客服協助確認。",
    };
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data: status, error: statusError } = await supabase
      .from("schedule_publish_status")
      .select("published, published_version_id")
      .eq("tenant_id", DEFAULT_TENANT_ID)
      .eq("source_month", sourceMonth)
      .maybeSingle<{ published: boolean; published_version_id: string | null }>();

    if (statusError || !status?.published || !status.published_version_id) {
      return {
        decisionType: "doctor_schedule_auto_reply",
        matchedKey: `doctor_schedule_unpublished:${sourceMonth}`,
        matchedType: "doctor_schedule",
        replyText: "本月門診表目前尚未公告，我先請真人客服協助您確認。",
      };
    }

    const [{ data: assets, error: assetsError }, { data: rows, error: rowsError }] = await Promise.all([
      supabase
        .from("schedule_month_assets")
        .select("branch, original_content_url, preview_image_url")
        .eq("tenant_id", DEFAULT_TENANT_ID)
        .eq("version_id", status.published_version_id)
        .returns<RuntimeScheduleAsset[]>(),
      supabase
        .from("doctor_schedule")
        .select("branch, doctor_name, schedule_date, time_slot, status")
        .eq("tenant_id", DEFAULT_TENANT_ID)
        .eq("version_id", status.published_version_id)
        .eq("source_month", sourceMonth)
        .returns<RuntimeScheduleRow[]>(),
    ]);
    if (assetsError || rowsError) return null;

    return resolvePublishedScheduleForValidation({ assets: assets ?? [], message, published: true, rows: rows ?? [], sourceMonth });
  } catch {
    return null;
  }
}

function addMonths(date: Date, monthOffset: number) {
  return new Date(date.getFullYear(), date.getMonth() + monthOffset, 1);
}

function inferDoctorScheduleQuery(message: string, today: Date, doctorNames: string[]): DoctorScheduleQueryResult {
  const normalizedMessage = normalizeText(message);
  const nextMonthTerms = ["下個月", "下个月", "下月", "nextmonth"];
  const monthOffset = nextMonthTerms.some((term) => normalizedMessage.includes(normalizeText(term))) ? 1 : 0;
  const targetMonth = addMonths(today, monthOffset);

  const matchedDoctorName =
    doctorNames
      .filter((doctorName) => doctorName.trim().length > 0)
      .sort((left, right) => right.length - left.length)
      .find((doctorName) => normalizedMessage.includes(normalizeText(doctorName))) ?? null;

  return {
    doctorName: matchedDoctorName,
    sourceMonth: buildMonthKey(targetMonth),
  };
}

async function loadCsvIfExists<T>(filePath: string): Promise<T[]> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return parse(content, {
      bom: true,
      columns: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    }) as T[];
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function loadDoctorScheduleSeedData() {
  const { seedDir } = getRuntimeConfig();
  const publishStatuses = await loadCsvIfExists<SchedulePublishStatusRow>(path.join(seedDir, DOCTOR_SCHEDULE_PUBLISH_FILENAME));
  const scheduleRows = await loadCsvIfExists<DoctorScheduleRow>(path.join(seedDir, DOCTOR_SCHEDULE_FILENAME));

  return {
    publishStatuses: publishStatuses.length > 0 ? publishStatuses : EMBEDDED_SCHEDULE_PUBLISH_STATUSES,
    scheduleRows: scheduleRows.length > 0 ? scheduleRows : EMBEDDED_DOCTOR_SCHEDULE_ROWS,
  };
}

function isPublishedForMonth(sourceMonth: string, publishStatuses: SchedulePublishStatusRow[]) {
  return publishStatuses.some((row) => row.source_month === sourceMonth && row.published === "true");
}

function formatScheduleRows(doctorName: string, sourceMonth: string, rows: Array<Pick<DoctorScheduleRow, "branch" | "schedule_date" | "status" | "time_slot">>) {
  const sortedRows = [...rows].sort((left, right) =>
    `${left.schedule_date} ${left.time_slot}`.localeCompare(`${right.schedule_date} ${right.time_slot}`),
  );
  const formattedRows = sortedRows.map((row) => {
    const branchSuffix = row.branch ? `（${row.branch}）` : "";
    const statusSuffix = row.status && row.status !== "available" ? `，狀態：${row.status}` : "";
    return `- ${row.schedule_date} ${row.time_slot}${branchSuffix}${statusSuffix}`;
  });

  return `${doctorName} ${sourceMonth} 門診時間如下：\n${formattedRows.join("\n")}`;
}

export async function resolveDoctorScheduleDecision({
  fallbackReply,
  message,
  today,
}: {
  fallbackReply: string;
  message: string;
  today: Date;
}): Promise<DoctorScheduleDecision> {
  const runtimeDecision = await resolveRuntimeScheduleDecision(message, today);
  if (runtimeDecision) return runtimeDecision;

  const data = await loadDoctorScheduleSeedData();
  const knownDoctorNames = Array.from(new Set(data.scheduleRows.map((row) => row.doctor_name).filter(Boolean)));
  const query = inferDoctorScheduleQuery(message, today, knownDoctorNames);

  if (!isPublishedForMonth(query.sourceMonth, data.publishStatuses)) {
    return {
      decisionType: "doctor_schedule_auto_reply",
      matchedKey: `doctor_schedule_unpublished:${query.sourceMonth}`,
      matchedType: "doctor_schedule",
      replyText: UNPUBLISHED_MONTH_REPLY,
    };
  }

  if (!query.doctorName) {
    return {
      decisionType: "doctor_schedule_auto_reply",
      matchedKey: `doctor_schedule_missing_doctor:${query.sourceMonth}`,
      matchedType: "doctor_schedule",
      replyText: UNKNOWN_DOCTOR_REPLY,
    };
  }

  const scheduleRows = data.scheduleRows.filter(
    (row) => row.source_month === query.sourceMonth && row.doctor_name === query.doctorName,
  );

  if (scheduleRows.length === 0) {
    return {
      decisionType: "doctor_schedule_auto_reply",
      matchedKey: `doctor_schedule_not_found:${query.doctorName}:${query.sourceMonth}`,
      matchedType: "doctor_schedule",
      replyText: `查無 ${query.doctorName} 醫師 ${query.sourceMonth} 的門診資料，建議由真人客服為您進一步確認。`,
    };
  }

  return {
    decisionType: "doctor_schedule_auto_reply",
    matchedKey: `doctor_schedule_found:${query.doctorName}:${query.sourceMonth}`,
    matchedType: "doctor_schedule",
    replyText: formatScheduleRows(query.doctorName, query.sourceMonth, scheduleRows) || fallbackReply,
  };
}
