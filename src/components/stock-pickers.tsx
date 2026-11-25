"use client";

import { useMemo, useState } from "react";
import { Select, Textarea } from "@/components/ui/form";
import { Badge } from "@/components/ui/primitives";
import { useApi } from "@/lib/client/hooks";
import { useFmt } from "@/lib/client/session";
import type { Lot, SearchVariant } from "@/lib/client/types";

/** The fields a document line needs from a product variant. */
export type LineVariant = Pick<
  SearchVariant,
  | "variantId"
  | "productId"
  | "displayName"
  | "sku"
  | "unitCode"
  | "allowDecimal"
  | "trackBatches"
  | "trackExpiry"
  | "trackSerials"
  | "stock"
  | "avgCost"
  | "costPrice"
  | "sellingPrice"
> &
  Partial<SearchVariant>;

/** Choose an existing batch at a location (or leave on automatic FEFO). */
export function LotSelect({
  variantId,
  locationId,
  value,
  onChange,
  autoLabel = "Auto (earliest expiry first)",
  allowAuto = true,
}: {
  variantId: string;
  locationId?: string;
  value: string;
  onChange: (lotId: string, lot: Lot | null) => void;
  autoLabel?: string;
  allowAuto?: boolean;
}) {
  const { date, qty } = useFmt();
  const { data, loading } = useApi<{ items: Lot[] }>(`/api/variants/${variantId}/lots`, { locationId });
  const lots = data?.items ?? [];
  return (
    <Select value={value} disabled={loading} onChange={(e) => onChange(e.target.value, lots.find((l) => l.id === e.target.value) ?? null)} aria-label="Batch">
      {allowAuto ? <option value="">{loading ? "Loading…" : autoLabel}</option> : <option value="">{loading ? "Loading…" : lots.length ? "— Choose batch —" : "No batches in stock"}</option>}
      {lots.map((l) => (
        <option key={l.id} value={l.id}>
          {l.lotNumber ?? "No batch no."}
          {l.expiryDate ? ` · exp ${date(l.expiryDate)}` : ""} · {qty(l.quantityAvailable)} left
        </option>
      ))}
    </Select>
  );
}

/** Pick serial numbers currently in stock at a location. */
export function SerialPicker({
  variantId,
  locationId,
  value,
  onChange,
  max,
}: {
  variantId: string;
  locationId?: string;
  value: string[];
  onChange: (v: string[]) => void;
  max?: number;
}) {
  const { data, loading } = useApi<{ items: { serialNumber: string }[] }>(`/api/variants/${variantId}/serials`, { locationId });
  const [q, setQ] = useState("");
  const items = useMemo(() => (data?.items ?? []).filter((s) => !q || s.serialNumber.toLowerCase().includes(q.toLowerCase())), [data, q]);
  const selected = new Set(value);
  if (loading && !data) return <p className="text-xs text-slate-400">Loading serial numbers…</p>;
  if (!data?.items.length) return <p className="text-xs text-rose-600">No serial numbers in stock here.</p>;
  return (
    <div className="rounded-xl border border-slate-200">
      <div className="flex items-center gap-2 border-b border-slate-100 p-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter or scan serial…"
          className="h-8 flex-1 rounded-lg border border-slate-200 px-2 text-xs focus:border-[#044d73] focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const hit = data.items.find((s) => s.serialNumber.toLowerCase() === q.trim().toLowerCase());
              if (hit && !selected.has(hit.serialNumber) && (!max || value.length < max)) onChange([...value, hit.serialNumber]);
              setQ("");
            }
          }}
        />
        <span className="text-xs font-semibold text-slate-500">
          {value.length}
          {max ? ` / ${max}` : ""} selected
        </span>
      </div>
      <div className="grid max-h-36 grid-cols-2 gap-1 overflow-y-auto p-2 sm:grid-cols-3">
        {items.map((s) => {
          const on = selected.has(s.serialNumber);
          return (
            <label key={s.serialNumber} className={`flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-xs ${on ? "bg-[#044d73]/10 font-semibold text-[#044d73]" : "text-slate-600 hover:bg-slate-50"}`}>
              <input
                type="checkbox"
                className="accent-[#044d73]"
                checked={on}
                disabled={!on && !!max && value.length >= max}
                onChange={(e) => onChange(e.target.checked ? [...value, s.serialNumber] : value.filter((x) => x !== s.serialNumber))}
              />
              <span className="truncate font-mono">{s.serialNumber}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export const parseSerials = (t: string) => [...new Set(t.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean))];

/** Type or scan new serial numbers — one per line. */
export function SerialEntry({ value, onChange, expected }: { value: string; onChange: (v: string) => void; expected: number }) {
  const n = parseSerials(value).length;
  return (
    <div>
      <Textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Scan or type serial numbers, one per line" className="font-mono text-xs" />
      <p className={`mt-1 text-[11px] font-semibold ${n === expected ? "text-emerald-600" : "text-amber-600"}`}>
        {n} of {expected} serial number{expected === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export function ExpiryBadge({ days }: { days: number | null }) {
  if (days === null) return null;
  if (days < 0) return <Badge tone="red">Expired {-days}d ago</Badge>;
  if (days === 0) return <Badge tone="red">Expires today</Badge>;
  if (days <= 30) return <Badge tone="amber">{days}d left</Badge>;
  return <Badge tone="slate">{days}d left</Badge>;
}
