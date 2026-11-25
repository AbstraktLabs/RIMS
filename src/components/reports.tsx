"use client";

import { Printer } from "lucide-react";
import { LocationSelect } from "@/components/pickers";
import { PrintHeader } from "@/components/print-header";
import { DateRangeInputs, Select } from "@/components/ui/form";
import { Button, Card, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/primitives";
import { addDaysIso, todayIso } from "@/lib/client/format";
import { useFmt, useSession } from "@/lib/client/session";

export interface Period {
  from: string;
  to: string;
  locationId: string;
}

function presets(today: string): Record<string, { label: string; from: string; to: string }> {
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthStart = `${y}-${pad(m)}-01`;
  const lastMonthStart = m === 1 ? `${y - 1}-12-01` : `${y}-${pad(m - 1)}-01`;
  return {
    month: { label: "This month", from: monthStart, to: today },
    last_month: { label: "Last month", from: lastMonthStart, to: addDaysIso(monthStart, -1) },
    d30: { label: "Last 30 days", from: addDaysIso(today, -29), to: today },
    d90: { label: "Last 90 days", from: addDaysIso(today, -89), to: today },
    year: { label: "This year", from: `${y}-01-01`, to: today },
    today: { label: "Today", from: today, to: today },
  };
}

/** Period preset + custom dates + location, shared by every report. */
export function PeriodFilter({ value, onChange, dates = true }: { value: Period; onChange: (p: Period) => void; dates?: boolean }) {
  const { settings } = useSession();
  const today = todayIso(settings.timezone);
  const p = presets(today);
  const current = Object.entries(p).find(([, x]) => x.from === value.from && x.to === value.to)?.[0] ?? (value.from || value.to ? "custom" : "month");
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {dates && (
        <>
          <Select
            className="w-40"
            aria-label="Period"
            value={current}
            onChange={(e) => {
              const x = p[e.target.value];
              if (x) onChange({ ...value, from: x.from, to: x.to });
            }}
          >
            {Object.entries(p).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
            {current === "custom" && <option value="custom">Custom</option>}
          </Select>
          <DateRangeInputs from={value.from} to={value.to} onChange={(r) => onChange({ ...value, ...r })} />
        </>
      )}
      {settings.enableMultiLocation && (
        <div className="w-44">
          <LocationSelect includeAll value={value.locationId} onChange={(locationId) => onChange({ ...value, locationId })} />
        </div>
      )}
    </div>
  );
}

export const initialPeriod = (): Period => ({ from: "", to: "", locationId: "all" });
export const periodQuery = (p: Period) => ({ from: p.from || undefined, to: p.to || undefined, locationId: p.locationId });

/** Report page chrome: title, back link, print, letterhead, loading / error states. */
export function ReportFrame({
  base,
  title,
  subtitle,
  range,
  filters,
  loading,
  error,
  onRetry,
  children,
}: {
  base: string;
  title: string;
  subtitle: string;
  range?: { from: string; to: string } | null;
  filters?: React.ReactNode;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  const { date } = useFmt();
  const period = range ? `${date(range.from)} – ${date(range.to)}` : undefined;
  return (
    <div>
      <PageHeader
        back={{ href: `${base}/reports`, label: "Reports" }}
        title={title}
        subtitle={period ? `${subtitle} · ${period}` : subtitle}
        actions={<Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print / PDF</Button>}
      />
      <PrintHeader title={title} meta={period ? [["Period", period]] : undefined} />
      {filters && <div className="mb-5">{filters}</div>}
      {error ? <Card><ErrorState message={error} onRetry={onRetry} /></Card> : loading ? <LoadingBlock /> : children}
    </div>
  );
}

/** Plain report table: right-aligned numeric columns, optional footer totals. */
export function ReportTable<T>({
  rows,
  columns,
  footer,
  empty = "No data for this period",
  rowKey,
}: {
  rows: T[];
  columns: { header: string; cell: (r: T) => React.ReactNode; num?: boolean; hideBelow?: "md" | "lg" }[];
  footer?: React.ReactNode[];
  empty?: string;
  rowKey: (r: T, i: number) => string;
}) {
  const hide = (h?: "md" | "lg") => (h === "md" ? "hidden md:table-cell print:table-cell" : h === "lg" ? "hidden lg:table-cell print:table-cell" : "");
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={`px-4 py-2.5 ${c.num ? "text-right" : ""} ${hide(c.hideBelow)}`}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-slate-400">{empty}</td></tr>
          ) : (
            rows.map((r, ri) => (
              <tr key={rowKey(r, ri)} className="hover:bg-slate-50/60">
                {columns.map((c, i) => (
                  <td key={i} className={`px-4 py-2.5 ${c.num ? "whitespace-nowrap text-right tabular-nums" : ""} ${hide(c.hideBelow)}`}>{c.cell(r)}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {footer && rows.length > 0 && (
          <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
            <tr>
              {footer.map((f, i) => (
                <td key={i} className={`px-4 py-2.5 ${i > 0 ? "whitespace-nowrap text-right tabular-nums" : ""} ${hide(columns[i]?.hideBelow)}`}>{f}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function Pct({ v }: { v: number | null | undefined }) {
  if (v === null || v === undefined || !Number.isFinite(v)) return <span className="text-slate-400">—</span>;
  return <span className={v < 0 ? "text-rose-600" : ""}>{v.toFixed(1)}%</span>;
}
