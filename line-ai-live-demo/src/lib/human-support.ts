import { clinicConfig } from "@/lib/clinic-config";

export type HumanSupportStatus = {
  inServiceHours: boolean;
  summary: string;
};

function getLocalDateParts(now: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
    weekday: "short",
  });

  const parts = formatter.formatToParts(now);
  const weekdayValue = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
  const hour = Number.parseInt(parts.find((part) => part.type === "hour")?.value ?? "0", 10);
  const minute = Number.parseInt(parts.find((part) => part.type === "minute")?.value ?? "0", 10);
  const weekdayMap: Record<string, number> = {
    Fri: 5,
    Mon: 1,
    Sat: 6,
    Sun: 0,
    Thu: 4,
    Tue: 2,
    Wed: 3,
  };

  return {
    hour,
    minute,
    weekday: weekdayMap[weekdayValue] ?? 1,
  };
}

function parseHourMinute(value: string) {
  const [hour, minute] = value.split(":").map((part) => Number.parseInt(part, 10));
  return hour * 60 + minute;
}

export function getHumanSupportStatus(now = new Date()): HumanSupportStatus {
  const config = clinicConfig.humanSupportHours;
  const local = getLocalDateParts(now, config.timezone);
  const currentMinute = local.hour * 60 + local.minute;
  const startMinute = parseHourMinute(config.weekdayStart);
  const endMinute = parseHourMinute(config.weekdayEnd);
  const inServiceHours =
    config.weekdays.includes(local.weekday) && currentMinute >= startMinute && currentMinute < endMinute;

  return {
    inServiceHours,
    summary: config.fallbackSummary,
  };
}
