import NepaliDate from "nepali-date-converter";

export interface FormatSettings {
  currencyCode: string;
  currencySymbol: string;
  currencyDecimals: number;
  locale: string;
  timezone: string;
  calendarSystem: "AD" | "BS";
}

export const DEFAULT_FORMAT: FormatSettings = {
  currencyCode: "NPR",
  currencySymbol: "Rs.",
  currencyDecimals: 2,
  locale: "en-US",
  timezone: "Asia/Kathmandu",
  calendarSystem: "AD",
};

export const toNum = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function formatNumber(v: unknown, f: FormatSettings, decimals = f.currencyDecimals) {
  return new Intl.NumberFormat(f.locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(toNum(v));
}

export function formatMoney(v: unknown, f: FormatSettings) {
  const n = toNum(v);
  const s = formatNumber(Math.abs(n), f);
  return `${n < 0 ? "−" : ""}${f.currencySymbol} ${s}`;
}

/** Compact money for charts and KPI tiles: Rs. 12.5k, Rs. 1.2M */
export function formatMoneyShort(v: unknown, f: FormatSettings) {
  const n = toNum(v);
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1e7) return `${sign}${f.currencySymbol} ${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e4) return `${sign}${f.currencySymbol} ${(abs / 1e3).toFixed(1)}k`;
  return formatMoney(n, f);
}

export function formatQty(v: unknown, unit?: string | null) {
  const n = toNum(v);
  const s = Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return unit ? `${s} ${unit}` : s;
}

const BS_MONTHS = ["Baishakh", "Jestha", "Asar", "Shrawan", "Bhadra", "Ashwin", "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"];

/** YYYY-MM-DD (calendar day) → display string in the tenant's calendar. */
export function formatDate(iso: string | null | undefined, f: FormatSettings) {
  if (!iso) return "—";
  const day = iso.length > 10 ? isoDayIn(iso, f.timezone) : iso;
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return iso;
  if (f.calendarSystem === "BS") {
    try {
      const nd = new NepaliDate(new Date(y, m - 1, d));
      return `${nd.getDate()} ${BS_MONTHS[nd.getMonth()]} ${nd.getYear()}`;
    } catch {
      /* out of supported range — fall back to AD */
    }
  }
  return new Intl.DateTimeFormat(f.locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function formatDateTime(ts: string | null | undefined, f: FormatSettings) {
  if (!ts) return "—";
  const date = formatDate(ts, f);
  const time = new Intl.DateTimeFormat(f.locale, { hour: "numeric", minute: "2-digit", timeZone: f.timezone }).format(new Date(ts));
  return `${date}, ${time}`;
}

/** Timestamp → YYYY-MM-DD in a timezone */
export function isoDayIn(ts: string | Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    typeof ts === "string" ? new Date(ts) : ts,
  );
}

export function todayIso(timezone: string) {
  return isoDayIn(new Date(), timezone);
}

export function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const titleCase = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
