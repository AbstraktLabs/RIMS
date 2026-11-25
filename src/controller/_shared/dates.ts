import { badRequest } from "@/lib/errors";

// Date ranges for lists and reports. Dates are calendar days (YYYY-MM-DD) in
// the tenant's timezone; SQL compares with `(ts at time zone tz)::date`.

export interface DateRange {
  from: string;
  to: string;
}

export function todayIn(timezone: string): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Defaults to the current month to date. */
export function resolveRange(timezone: string, from?: string, to?: string, defaultDays?: number): DateRange {
  const today = todayIn(timezone);
  const end = to ?? today;
  const start = from ?? (defaultDays ? addDays(end, -(defaultDays - 1)) : startOfMonth(end));
  if (start > end) throw badRequest("'from' must be on or before 'to'");
  const spanDays = (Date.parse(end) - Date.parse(start)) / 86_400_000;
  if (spanDays > 3660) throw badRequest("Date range is too long (max 10 years)");
  return { from: start, to: end };
}

/** Same-length range immediately before `range` — for period-over-period comparison. */
export function previousRange(range: DateRange): DateRange {
  const days = Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) + 1;
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) };
}
