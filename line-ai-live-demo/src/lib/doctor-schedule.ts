import fs from "node:fs/promises";
import path from "node:path";

import { parse } from "csv-parse/sync";

import {
  EMBEDDED_DOCTOR_SCHEDULE_ROWS,
  EMBEDDED_SCHEDULE_PUBLISH_STATUSES,
} from "@/lib/embedded-seed-data";
import { getRuntimeConfig } from "@/lib/live-demo-config";

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

function normalizeText(text: string) {
  return text.replace(/\s+/g, "").trim().toLowerCase();
}

function buildMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
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

function formatScheduleRows(doctorName: string, sourceMonth: string, rows: DoctorScheduleRow[]) {
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
