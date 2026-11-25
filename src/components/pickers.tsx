"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Package, ScanBarcode } from "lucide-react";
import { get } from "@/lib/client/api";
import { useApi, useDebounced } from "@/lib/client/hooks";
import { useFmt } from "@/lib/client/session";
import type { Location, Page, PartyRow, SearchVariant } from "@/lib/client/types";
import { Select } from "./ui/form";

/**
 * Product search box. Typing searches by name/SKU/barcode; pressing Enter on an
 * exact barcode, SKU or serial number adds it straight away (scanner-friendly).
 */
export function VariantSearch({
  onPick,
  locationId,
  inStockOnly,
  placeholder = "Scan a barcode or search products…",
  autoFocus,
  showCost,
}: {
  onPick: (v: SearchVariant, serial?: string | null) => void;
  locationId?: string;
  inStockOnly?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  showCost?: boolean;
}) {
  const { money, qty } = useFmt();
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 200);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [items, setItems] = useState<SearchVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!dq) return;
    let alive = true;
    Promise.resolve().then(() => alive && setLoading(true));
    get<{ items: SearchVariant[] }>("/api/products/search", { q: dq, locationId, inStockOnly: inStockOnly ? "true" : undefined, limit: 12 })
      .then((r) => {
        if (!alive) return;
        setItems(r.items);
        setActive(0);
      })
      .catch(() => alive && setItems([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [dq, locationId, inStockOnly]);

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function pick(v: SearchVariant, serial?: string | null) {
    onPick(v, serial);
    setQ("");
    setItems([]);
    setOpen(false);
    setNotFound(null);
    input.current?.focus();
  }

  async function onEnter() {
    const code = q.trim();
    if (!code) return;
    // exact code first (barcode / SKU / serial), then the highlighted result
    try {
      const r = await get<{ variant: SearchVariant | null; serial: { serialNumber: string } | null }>("/api/products/lookup", { code, locationId });
      if (r.variant) return pick(r.variant, r.serial?.serialNumber ?? null);
    } catch {
      /* not an exact code */
    }
    if (items[active]) return pick(items[active]);
    setNotFound(code);
  }

  const shown = dq ? items : [];
  return (
    <div ref={box} className="relative">
      <ScanBarcode className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={input}
        value={q}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setNotFound(null);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, shown.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          } else if (e.key === "Escape") setOpen(false);
        }}
        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-9 text-sm placeholder-slate-400 focus:border-[#044d73] focus:outline-none focus:ring-4 focus:ring-[#044d73]/10"
      />
      {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
      {notFound && <p className="mt-1 text-[11px] font-medium text-rose-600">No product found for “{notFound}”.</p>}
      {open && dq && (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          {!loading && shown.length === 0 && <p className="px-4 py-3 text-xs text-slate-400">No matching products.</p>}
          {shown.map((v, i) => (
            <button
              key={v.variantId}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(v)}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === active ? "bg-slate-50" : ""}`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">
                {v.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Package className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{v.displayName}</p>
                <p className="truncate text-[11px] text-slate-400">
                  {v.sku}
                  {v.barcode ? ` · ${v.barcode}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-slate-800">{money(showCost ? v.costPrice : v.sellingPrice)}</p>
                <p className={`text-[11px] ${v.stock > 0 ? "text-slate-400" : "text-rose-500"}`}>{qty(v.stock, v.unitCode)} in stock</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Async party chooser (select with search). */
export function PartySelect({
  type,
  value,
  onChange,
  allowEmpty,
  emptyLabel = "— Select —",
  disabled,
}: {
  type: "CUSTOMER" | "SUPPLIER";
  value: string;
  onChange: (id: string, party: PartyRow | null) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const { data, loading } = useApi<Page<PartyRow>>("/api/parties", { type, limit: 200 });
  const items = data?.items ?? [];
  return (
    <Select
      value={value}
      disabled={disabled || loading}
      onChange={(e) => onChange(e.target.value, items.find((p) => p.id === e.target.value) ?? null)}
    >
      {(allowEmpty || !value) && <option value="">{loading ? "Loading…" : emptyLabel}</option>}
      {items.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.phone ? ` · ${p.phone}` : ""}
        </option>
      ))}
    </Select>
  );
}

export function useLocations() {
  const { data, loading, error, reload } = useApi<{ items: Location[] }>("/api/locations");
  return { locations: (data?.items ?? []).filter((l) => l.isActive), all: data?.items ?? [], loading, error, reload };
}

export function LocationSelect({
  value,
  onChange,
  includeAll,
  exclude,
  allLabel = "All locations",
}: {
  value: string;
  onChange: (id: string) => void;
  includeAll?: boolean;
  exclude?: string;
  allLabel?: string;
}) {
  const { locations } = useLocations();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {includeAll && <option value="all">{allLabel}</option>}
      {!includeAll && !value && <option value="">— Select location —</option>}
      {locations
        .filter((l) => l.id !== exclude)
        .map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
    </Select>
  );
}
