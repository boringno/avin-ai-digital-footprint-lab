const TAIPEI_TIME_ZONE = "Asia/Taipei";

export function formatTaipeiDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: TAIPEI_TIME_ZONE,
    year: "numeric",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function getPreviousTaipeiDate(now = new Date()) {
  const [year, month, day] = formatTaipeiDate(now).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

export function getTaipeiDateRange(metricDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metricDate)) {
    throw new Error("metricDate must use YYYY-MM-DD");
  }

  const [year, month, day] = metricDate.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { end: end.toISOString(), start: start.toISOString() };
}

export function getTaipeiHour(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    hour: "2-digit",
    hour12: false,
    timeZone: TAIPEI_TIME_ZONE,
  }).formatToParts(new Date(value));
  return Number.parseInt(parts.find((part) => part.type === "hour")?.value ?? "0", 10);
}

export function isTaipeiNight(value: string) {
  const hour = getTaipeiHour(value);
  return hour >= 21 || hour < 9;
}
