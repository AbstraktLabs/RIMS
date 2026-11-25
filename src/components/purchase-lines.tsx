"use client";

import { Trash2 } from "lucide-react";
import { VariantSearch } from "@/components/pickers";
import { SerialEntry, parseSerials } from "@/components/stock-pickers";
import { Input } from "@/components/ui/form";
import { Button, EmptyState } from "@/components/ui/primitives";
import { useFmt, useSession } from "@/lib/client/session";
import type { SearchVariant } from "@/lib/client/types";
import { calculateTotals, type DocTotals, type TaxMode } from "@/lib/totals";

export interface PVariant {
  variantId: string;
  displayName: string;
  sku: string;
  unitCode: string;
  allowDecimal?: boolean;
  trackBatches: boolean;
  trackExpiry: boolean;
  trackSerials: boolean;
  taxRate: number;
  costPrice?: number;
  purchaseUnitId?: string | null;
  purchaseUnitFactor?: number | null;
  stock?: number;
}

export interface PLine {
  uid: number;
  v: PVariant;
  quantity: string;
  unitCost: string;
  discount: string;
  taxRate: string;
  inPurchaseUnits: boolean;
  purchaseOrderItemId?: string;
  ordered?: number; // pending qty on the order, for reference
  lotNumber: string;
  manufacturingDate: string;
  expiryDate: string;
  serialText: string;
}

let seq = 1;
export function newLine(v: PVariant, patch: Partial<PLine> = {}): PLine {
  const usePack = !!v.purchaseUnitId && !!v.purchaseUnitFactor;
  return {
    uid: seq++,
    v,
    quantity: "1",
    unitCost: String(Math.round((v.costPrice ?? 0) * (usePack ? v.purchaseUnitFactor! : 1) * 100) / 100 || ""),
    discount: "",
    taxRate: String(v.taxRate ?? 0),
    inPurchaseUnits: usePack,
    lotNumber: "",
    manufacturingDate: "",
    expiryDate: "",
    serialText: "",
    ...patch,
  };
}

export const fromSearch = (v: SearchVariant): PVariant => ({
  variantId: v.variantId,
  displayName: v.displayName,
  sku: v.sku,
  unitCode: v.unitCode,
  allowDecimal: v.allowDecimal,
  trackBatches: v.trackBatches,
  trackExpiry: v.trackExpiry,
  trackSerials: v.trackSerials,
  taxRate: v.taxRate,
  costPrice: v.costPrice,
  purchaseUnitId: v.purchaseUnitId,
  purchaseUnitFactor: v.purchaseUnitFactor,
  stock: v.stock,
});

export function purchaseTotals(lines: PLine[], doc: { taxMode: TaxMode; discount: string; otherCharges: string; roundOff?: string }): { totals: DocTotals | null; error: string | null } {
  try {
    return {
      totals: calculateTotals(
        lines.map((l) => ({ quantity: Number(l.quantity || 0), unitPrice: Number(l.unitCost || 0), discount: Number(l.discount || 0), taxRate: Number(l.taxRate || 0) })),
        { taxMode: doc.taxMode, discount: Number(doc.discount || 0), otherCharges: Number(doc.otherCharges || 0), roundOff: Number(doc.roundOff || 0) },
      ),
      error: null,
    };
  } catch (e) {
    return { totals: null, error: e instanceof Error ? e.message : "Invalid amounts" };
  }
}

export const orderItem = (l: PLine) => ({
  variantId: l.v.variantId,
  quantity: Number(l.quantity),
  unitCost: Number(l.unitCost || 0),
  discount: Number(l.discount || 0),
  taxRate: Number(l.taxRate || 0),
  inPurchaseUnits: l.inPurchaseUnits,
});

export const purchaseItem = (l: PLine) => ({
  ...orderItem(l),
  purchaseOrderItemId: l.purchaseOrderItemId,
  lotNumber: l.v.trackBatches ? l.lotNumber || null : null,
  manufacturingDate: l.v.trackBatches ? l.manufacturingDate || null : null,
  expiryDate: l.v.trackExpiry ? l.expiryDate || null : null,
  serials: l.v.trackSerials ? parseSerials(l.serialText) : [],
});

/** Line editor for purchase orders (mode="order") and goods received (mode="purchase"). */
export function PurchaseLines({ lines, setLines, mode, locationId }: { lines: PLine[]; setLines: (fn: (ls: PLine[]) => PLine[]) => void; mode: "order" | "purchase"; locationId?: string }) {
  const { money, qty } = useFmt();
  const { settings } = useSession();
  const up = (u: number, p: Partial<PLine>) => setLines((ls) => ls.map((l) => (l.uid === u ? { ...l, ...p } : l)));
  const add = (sv: SearchVariant) =>
    setLines((ls) => {
      const ex = ls.find((l) => l.v.variantId === sv.variantId && !l.purchaseOrderItemId && !(mode === "purchase" && sv.trackBatches));
      if (ex) return ls.map((l) => (l === ex ? { ...l, quantity: String(Number(l.quantity || 0) + 1) } : l));
      return [...ls, newLine(fromSearch(sv))];
    });

  return (
    <>
      <div className="p-4 pt-0 sm:px-5">
        <VariantSearch onPick={add} locationId={locationId} showCost placeholder="Scan or search products to add…" />
      </div>
      {lines.length === 0 ? (
        <EmptyState title="No items yet" description="Search for the products you are ordering or receiving." className="py-10" />
      ) : (
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 sm:pl-5">Item</th>
                <th className="w-28 px-2 py-2.5">Qty</th>
                <th className="w-32 px-2 py-2.5">Unit cost</th>
                <th className="w-24 px-2 py-2.5">Discount</th>
                <th className="w-20 px-2 py-2.5">{settings.taxLabel} %</th>
                <th className="w-32 px-2 py-2.5 text-right">Amount</th>
                <th className="w-12 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => {
                const amount = Number(l.quantity || 0) * Number(l.unitCost || 0) - Number(l.discount || 0);
                const factor = l.v.purchaseUnitFactor ?? null;
                const baseQty = l.inPurchaseUnits && factor ? Number(l.quantity || 0) * factor : Number(l.quantity || 0);
                return (
                  <tr key={l.uid} className="align-top">
                    <td className="px-4 py-3 sm:pl-5">
                      <div className="font-semibold text-slate-800">{l.v.displayName}</div>
                      <div className="text-xs text-slate-500">
                        {l.v.sku}
                        {l.v.stock !== undefined && ` · ${qty(l.v.stock, l.v.unitCode)} in stock`}
                        {l.ordered !== undefined && ` · ${qty(l.ordered, l.v.unitCode)} pending on order`}
                      </div>
                      {factor && l.v.purchaseUnitId && (
                        <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            className="accent-[#044d73]"
                            checked={l.inPurchaseUnits}
                            onChange={(e) => {
                              const on = e.target.checked;
                              const cost = Number(l.unitCost || 0);
                              up(l.uid, { inPurchaseUnits: on, unitCost: String(Math.round((on ? cost * factor : cost / factor) * 10000) / 10000) });
                            }}
                          />
                          In packs of {factor} {l.v.unitCode}
                          {l.inPurchaseUnits && <span className="text-slate-400">= {qty(baseQty, l.v.unitCode)}</span>}
                        </label>
                      )}
                      {mode === "purchase" && (l.v.trackBatches || l.v.trackSerials) && (
                        <div className="mt-2 grid max-w-xl grid-cols-1 gap-2 sm:grid-cols-3">
                          {l.v.trackBatches && (
                            <>
                              <Input aria-label="Batch number" placeholder="Batch no." value={l.lotNumber} onChange={(e) => up(l.uid, { lotNumber: e.target.value })} />
                              {l.v.trackExpiry && (
                                <label className="text-[11px] font-semibold text-slate-500">
                                  Expiry *
                                  <Input type="date" value={l.expiryDate} onChange={(e) => up(l.uid, { expiryDate: e.target.value })} />
                                </label>
                              )}
                              <label className="text-[11px] font-semibold text-slate-500">
                                Mfg. date
                                <Input type="date" value={l.manufacturingDate} onChange={(e) => up(l.uid, { manufacturingDate: e.target.value })} />
                              </label>
                            </>
                          )}
                          {l.v.trackSerials && (
                            <div className="sm:col-span-3">
                              <SerialEntry value={l.serialText} onChange={(t) => up(l.uid, { serialText: t })} expected={baseQty} />
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <Input aria-label="Quantity" inputMode="decimal" value={l.quantity} onChange={(e) => up(l.uid, { quantity: e.target.value })} />
                    </td>
                    <td className="px-2 py-3">
                      <Input aria-label="Unit cost" inputMode="decimal" value={l.unitCost} onChange={(e) => up(l.uid, { unitCost: e.target.value })} />
                    </td>
                    <td className="px-2 py-3">
                      <Input aria-label="Discount" inputMode="decimal" placeholder="0" value={l.discount} onChange={(e) => up(l.uid, { discount: e.target.value })} />
                    </td>
                    <td className="px-2 py-3">
                      <Input aria-label="Tax rate" inputMode="decimal" value={l.taxRate} onChange={(e) => up(l.uid, { taxRate: e.target.value })} />
                    </td>
                    <td className="px-2 py-3 pt-5 text-right font-semibold">{money(amount)}</td>
                    <td className="px-2 py-3">
                      <Button variant="ghost" icon={Trash2} aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((x) => x.uid !== l.uid))} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
