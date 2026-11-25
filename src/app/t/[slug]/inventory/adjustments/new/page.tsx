"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Minus, Plus, Save, Trash2 } from "lucide-react";
import { Field, FormGrid, Input, Select } from "@/components/ui/form";
import { Alert, Button, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { LocationSelect, VariantSearch } from "@/components/pickers";
import { LotSelect, SerialEntry, SerialPicker, parseSerials, type LineVariant } from "@/components/stock-pickers";
import { get, post } from "@/lib/client/api";
import { useAction } from "@/lib/client/hooks";
import { ADJUSTMENT_REASONS } from "@/lib/client/labels";
import { todayIso } from "@/lib/client/format";
import { useFmt, useSession } from "@/lib/client/session";
import type { SearchVariant } from "@/lib/client/types";

const INCREASE_ONLY = new Set(["OPENING_STOCK", "FOUND"]);
const DECREASE_ONLY = new Set(["DAMAGED", "EXPIRED", "LOST", "THEFT", "INTERNAL_USE"]);

interface Line {
  uid: number;
  v: LineVariant;
  sign: 1 | -1;
  quantity: string;
  unitCost: string;
  lotId: string;
  lotNumber: string;
  expiryDate: string;
  serialText: string; // increases
  serials: string[]; // decreases
}

export default function NewAdjustmentPage() {
  const { base, session, settings, can, readOnly } = useSession();
  const { money, qty } = useFmt();
  const router = useRouter();
  const params = useSearchParams();
  const [locationId, setLocationId] = useState(session.activeLocationId);
  const [reason, setReason] = useState(params.get("reason") ?? "COUNT_CORRECTION");
  const [adjDate, setAdjDate] = useState(todayIso(settings.timezone));
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const uid = useRef(1);
  const { busy, error, run } = useAction();
  const showCost = can("purchases.view") || can("inventory.manage");
  const forced: 1 | -1 | null = INCREASE_ONLY.has(reason) ? 1 : DECREASE_ONLY.has(reason) ? -1 : null;

  const add = (v: LineVariant, serial?: string | null) =>
    setLines((ls) => {
      const existing = ls.find((l) => l.v.variantId === v.variantId && !v.trackBatches);
      if (existing && !v.trackSerials) return ls.map((l) => (l === existing ? { ...l, quantity: String(Number(l.quantity || 0) + 1) } : l));
      const sign = forced ?? -1;
      return [
        ...ls,
        {
          uid: uid.current++,
          v,
          sign,
          quantity: v.trackSerials && serial ? "1" : "1",
          unitCost: String(Math.round((v.avgCost || v.costPrice || 0) * 100) / 100),
          lotId: "",
          lotNumber: "",
          expiryDate: "",
          serialText: "",
          serials: serial ? [serial] : [],
        },
      ];
    });

  // ?productId=… → start with that product's default variant
  useEffect(() => {
    const pid = params.get("productId");
    if (!pid) return;
    get<{ product: { variants: { sku: string; isDefault: boolean; isActive: boolean }[] } }>(`/api/products/${pid}`)
      .then((r) => {
        const v = r.product.variants.find((x) => x.isDefault && x.isActive) ?? r.product.variants.find((x) => x.isActive);
        if (!v) return;
        return get<{ variant: SearchVariant }>("/api/products/lookup", { code: v.sku, locationId: session.activeLocationId }).then((x) => add(x.variant));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const up = (u: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.uid === u ? { ...l, ...patch } : l)));
  const signOf = (l: Line) => forced ?? l.sign;
  const totalValue = lines.reduce((s, l) => s + signOf(l) * Number(l.quantity || 0) * (signOf(l) > 0 ? Number(l.unitCost || 0) : l.v.avgCost || l.v.costPrice || 0), 0);

  const submit = () =>
    run(async () => {
      const items = lines.map((l) => {
        const q = Number(l.quantity);
        if (!(q > 0)) throw new Error(`Enter a quantity for ${l.v.displayName}`);
        const inc = signOf(l) > 0;
        return {
          variantId: l.v.variantId,
          quantity: signOf(l) * q,
          unitCost: inc && l.unitCost !== "" ? Number(l.unitCost) : undefined,
          lotId: !inc && l.lotId ? l.lotId : null,
          lotNumber: inc && l.v.trackBatches ? l.lotNumber || null : null,
          expiryDate: inc && l.v.trackExpiry ? l.expiryDate || null : null,
          serials: l.v.trackSerials ? (inc ? parseSerials(l.serialText) : l.serials) : [],
        };
      });
      const r = await post<{ adjustment: { id: string } }>("/api/inventory/adjustments", {
        locationId,
        adjustmentDate: adjDate,
        reason,
        note: note || null,
        items,
      });
      router.push(`${base}/inventory/adjustments/${r.adjustment.id}`);
    });

  if (!can("inventory.manage") || readOnly) return <Alert tone="amber">You don’t have permission to adjust stock.</Alert>;

  return (
    <div>
      <PageHeader title="New stock adjustment" back={{ href: `${base}/inventory/adjustments`, label: "Adjustments" }} />
      <div className="space-y-6">
        {error && <Alert>{error}</Alert>}
        <Card>
          <FormGrid cols={settings.enableMultiLocation ? 4 : 3}>
            {settings.enableMultiLocation && (
              <Field label="Location">
                <LocationSelect value={locationId} onChange={(v) => { setLocationId(v); setLines([]); }} />
              </Field>
            )}
            <Field label="Reason" required>
              <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                {Object.entries(ADJUSTMENT_REASONS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                    {INCREASE_ONLY.has(k) ? " (+)" : DECREASE_ONLY.has(k) ? " (−)" : " (±)"}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date">
              <Input type="date" value={adjDate} onChange={(e) => setAdjDate(e.target.value)} />
            </Field>
            <Field label="Note">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
            </Field>
          </FormGrid>
        </Card>

        <Card padded={false}>
          <div className="space-y-3 p-4 sm:p-5">
            <CardHeader title="Products" subtitle={forced === 1 ? "Quantities will be added to stock" : forced === -1 ? "Quantities will be removed from stock" : "Use + / − on each line"} />
            <VariantSearch key={locationId} locationId={locationId} onPick={add} showCost={showCost} autoFocus />
          </div>
          {lines.length === 0 ? (
            <EmptyState title="No products added" description="Search or scan above to add products to this adjustment." className="py-10" />
          ) : (
            <div className="divide-y divide-slate-100 border-t border-slate-100">
              {lines.map((l) => {
                const inc = signOf(l) > 0;
                return (
                  <div key={l.uid} className="grid grid-cols-1 gap-3 p-4 sm:px-5 lg:grid-cols-12 lg:items-start">
                    <div className="lg:col-span-3">
                      <div className="font-semibold text-slate-800">{l.v.displayName}</div>
                      <div className="text-xs text-slate-500">
                        {l.v.sku} · in stock: <b>{qty(l.v.stock, l.v.unitCode)}</b>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 lg:col-span-3">
                      {!forced && (
                        <div className="flex overflow-hidden rounded-xl border border-slate-200">
                          <button type="button" aria-label="Add stock" onClick={() => up(l.uid, { sign: 1 })} className={`flex h-10 w-10 items-center justify-center ${inc ? "bg-emerald-600 text-white" : "bg-white text-slate-500"}`}>
                            <Plus className="h-4 w-4" />
                          </button>
                          <button type="button" aria-label="Remove stock" onClick={() => up(l.uid, { sign: -1 })} className={`flex h-10 w-10 items-center justify-center ${!inc ? "bg-rose-600 text-white" : "bg-white text-slate-500"}`}>
                            <Minus className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                      <Input
                        aria-label="Quantity"
                        inputMode={l.v.allowDecimal ? "decimal" : "numeric"}
                        value={l.quantity}
                        onChange={(e) => up(l.uid, { quantity: e.target.value })}
                        className="w-24"
                      />
                      <span className="text-xs text-slate-500">{l.v.unitCode}</span>
                    </div>
                    <div className="space-y-2 lg:col-span-5">
                      {inc && showCost && (
                        <Field label="Unit cost">
                          <Input inputMode="decimal" value={l.unitCost} onChange={(e) => up(l.uid, { unitCost: e.target.value })} />
                        </Field>
                      )}
                      {l.v.trackBatches && inc && (
                        <div className="grid grid-cols-2 gap-2">
                          <Field label="Batch no.">
                            <Input value={l.lotNumber} onChange={(e) => up(l.uid, { lotNumber: e.target.value })} />
                          </Field>
                          {l.v.trackExpiry && (
                            <Field label="Expiry date" required>
                              <Input type="date" value={l.expiryDate} onChange={(e) => up(l.uid, { expiryDate: e.target.value })} />
                            </Field>
                          )}
                        </div>
                      )}
                      {l.v.trackBatches && !inc && (
                        <Field label="Take from batch">
                          <LotSelect variantId={l.v.variantId} locationId={locationId} value={l.lotId} onChange={(id) => up(l.uid, { lotId: id })} />
                        </Field>
                      )}
                      {l.v.trackSerials && inc && <SerialEntry value={l.serialText} onChange={(t) => up(l.uid, { serialText: t })} expected={Number(l.quantity) || 0} />}
                      {l.v.trackSerials && !inc && (
                        <SerialPicker
                          variantId={l.v.variantId}
                          locationId={locationId}
                          value={l.serials}
                          max={Number(l.quantity) || undefined}
                          onChange={(s) => up(l.uid, { serials: s, quantity: String(Math.max(s.length, 1)) })}
                        />
                      )}
                    </div>
                    <div className="flex justify-end lg:col-span-1">
                      <Button variant="ghost" icon={Trash2} aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((x) => x.uid !== l.uid))} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="sticky bottom-0 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/90 p-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">
            {lines.length} line{lines.length === 1 ? "" : "s"}
            {showCost && (
              <>
                {" "}· value change ≈ <b className={totalValue < 0 ? "text-rose-600" : "text-emerald-600"}>{money(totalValue)}</b>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
            <Button icon={Save} loading={busy} disabled={!lines.length} onClick={submit}>Post adjustment</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
