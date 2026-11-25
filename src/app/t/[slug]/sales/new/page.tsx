"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import { PaymentRows, TotalsBox, paymentBody, type PaymentRow } from "@/components/doc";
import { PartySelect, VariantSearch } from "@/components/pickers";
import { LotSelect, SerialPicker } from "@/components/stock-pickers";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Button, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { post } from "@/lib/client/api";
import { todayIso } from "@/lib/client/format";
import { useAction } from "@/lib/client/hooks";
import { useFmt, useSession } from "@/lib/client/session";
import type { PartyRow, SearchVariant } from "@/lib/client/types";
import { calculateTotals } from "@/lib/totals";

interface Line {
  uid: number;
  v: SearchVariant;
  quantity: string;
  unitPrice: string;
  discount: string;
  lotId: string;
  serials: string[];
}

export default function NewInvoicePage() {
  const { base, settings, can, readOnly } = useSession();
  const { money, qty } = useFmt();
  const router = useRouter();
  const today = todayIso(settings.timezone);
  const initialParty = useSearchParams().get("partyId");
  const [partyId, setPartyId] = useState(initialParty ?? "");
  const [party, setParty] = useState<PartyRow | null>(null);
  const [walkIn, setWalkIn] = useState({ name: "", phone: "" });
  const [saleDate, setSaleDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [level, setLevel] = useState<"RETAIL" | "WHOLESALE">("RETAIL");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState("");
  const [otherCharges, setOtherCharges] = useState("");
  const [roundOff, setRoundOff] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const uid = useRef(1);
  const { busy, error, run } = useAction();
  const price = (v: SearchVariant, lv = level) => String(lv === "WHOLESALE" && v.wholesalePrice !== null ? v.wholesalePrice : v.sellingPrice);

  const add = (v: SearchVariant, serial?: string | null) =>
    setLines((ls) => {
      const ex = ls.find((l) => l.v.variantId === v.variantId);
      if (ex && v.trackSerials && serial) return ls.map((l) => (l === ex && !l.serials.includes(serial) ? { ...l, serials: [...l.serials, serial], quantity: String(l.serials.length + 1) } : l));
      if (ex && !v.trackSerials) return ls.map((l) => (l === ex ? { ...l, quantity: String(Number(l.quantity || 0) + 1) } : l));
      return [...ls, { uid: uid.current++, v, quantity: v.trackSerials ? (serial ? "1" : "0") : "1", unitPrice: price(v), discount: "", lotId: "", serials: serial ? [serial] : [] }];
    });
  const up = (u: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.uid === u ? { ...l, ...p } : l)));

  const taxMode = settings.taxRegistered ? (settings.pricesIncludeTax ? "INCLUSIVE" : "EXCLUSIVE") : "EXEMPT";
  const { totals, totalsError } = useMemo(() => {
    try {
      return {
        totals: calculateTotals(
          lines.map((l) => ({ quantity: Number(l.quantity || 0), unitPrice: Number(l.unitPrice || 0), discount: Number(l.discount || 0), taxRate: l.v.taxRate })),
          { taxMode, discount: Number(discount || 0), otherCharges: Number(otherCharges || 0), roundOff: Number(roundOff || 0) },
        ),
        totalsError: null,
      };
    } catch (e) {
      return { totals: null, totalsError: e instanceof Error ? e.message : "Invalid amounts" };
    }
  }, [lines, discount, otherCharges, roundOff, taxMode]);

  const submit = () =>
    run(async () => {
      const r = await post<{ sale: { id: string } }>("/api/sales", {
        channel: "INVOICE",
        partyId: partyId || undefined,
        customerName: !partyId ? walkIn.name || null : null,
        customerPhone: !partyId ? walkIn.phone || null : null,
        saleDate,
        dueDate: dueDate || null,
        priceLevel: level,
        discount: Number(discount || 0),
        otherCharges: Number(otherCharges || 0),
        roundOff: Number(roundOff || 0),
        note: note || null,
        items: lines.map((l) => ({
          variantId: l.v.variantId,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          discount: Number(l.discount || 0),
          lotId: l.lotId || null,
          serials: l.v.trackSerials ? l.serials : [],
        })),
        payments: paymentBody(payments),
      });
      router.push(`${base}/sales/${r.sale.id}`);
    });

  if (!can("sales.manage") || readOnly) return <Alert tone="amber">You don’t have permission to create invoices.</Alert>;

  return (
    <div>
      <PageHeader title="New invoice" subtitle="For account customers, deliveries and back-dated sales" back={{ href: `${base}/sales`, label: "Sales" }} />
      <div className="space-y-6">
        {error && <Alert>{error}</Alert>}
        <Card>
          <FormGrid cols={4}>
            <Field label="Customer" hint={partyId ? undefined : "Leave as walk-in for cash sales"}>
              <PartySelect
                type="CUSTOMER"
                value={partyId}
                allowEmpty
                emptyLabel="Walk-in customer"
                onChange={(id, p) => {
                  setPartyId(id);
                  setParty(p);
                }}
              />
            </Field>
            {!partyId ? (
              <>
                <Field label="Name">
                  <Input value={walkIn.name} onChange={(e) => setWalkIn({ ...walkIn, name: e.target.value })} placeholder="Optional" />
                </Field>
                <Field label="Phone">
                  <Input value={walkIn.phone} onChange={(e) => setWalkIn({ ...walkIn, phone: e.target.value })} placeholder="Optional" />
                </Field>
              </>
            ) : (
              <Field label="Due date" hint={party?.creditLimit ? `Credit limit ${money(party.creditLimit)} · balance ${money(party.balance)}` : undefined}>
                <Input type="date" value={dueDate} min={saleDate} onChange={(e) => setDueDate(e.target.value)} />
              </Field>
            )}
            <Field label="Invoice date">
              <Input type="date" value={saleDate} max={today} onChange={(e) => setSaleDate(e.target.value)} />
            </Field>
            {settings.enableWholesalePricing && (
              <Field label="Price level">
                <Select
                  value={level}
                  onChange={(e) => {
                    const lv = e.target.value as "RETAIL" | "WHOLESALE";
                    setLevel(lv);
                    setLines((ls) => ls.map((l) => ({ ...l, unitPrice: price(l.v, lv) })));
                  }}
                >
                  <option value="RETAIL">Retail</option>
                  <option value="WHOLESALE">Wholesale</option>
                </Select>
              </Field>
            )}
          </FormGrid>
        </Card>

        <Card padded={false}>
          <div className="space-y-3 p-4 sm:p-5">
            <CardHeader title="Items" />
            <VariantSearch onPick={add} inStockOnly={!settings.allowNegativeStock} autoFocus />
          </div>
          {lines.length === 0 ? (
            <EmptyState title="No items yet" description="Search or scan products to add them to the invoice." className="py-10" />
          ) : (
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 sm:pl-5">Item</th>
                    <th className="w-28 px-2 py-2.5">Qty</th>
                    <th className="w-32 px-2 py-2.5">Price</th>
                    <th className="w-28 px-2 py-2.5">Discount</th>
                    <th className="w-32 px-2 py-2.5 text-right">Amount</th>
                    <th className="w-12 px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((l) => {
                    const n = Number(l.quantity || 0);
                    const short = !settings.allowNegativeStock && n > l.v.stock;
                    return (
                      <tr key={l.uid} className="align-top">
                        <td className="px-4 py-3 sm:pl-5">
                          <div className="font-semibold text-slate-800">{l.v.displayName}</div>
                          <div className={`text-xs ${short ? "font-semibold text-rose-600" : "text-slate-500"}`}>
                            {l.v.sku} · {qty(l.v.stock, l.v.unitCode)} in stock{l.v.taxRate ? ` · ${settings.taxLabel} ${l.v.taxRate}%` : ""}
                          </div>
                          {(l.v.trackBatches || l.v.trackSerials) && (
                            <div className="mt-2 max-w-md space-y-2">
                              {l.v.trackBatches && <LotSelect variantId={l.v.variantId} value={l.lotId} onChange={(id) => up(l.uid, { lotId: id })} />}
                              {l.v.trackSerials && <SerialPicker variantId={l.v.variantId} value={l.serials} onChange={(s) => up(l.uid, { serials: s, quantity: String(s.length) })} />}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          <Input aria-label="Quantity" inputMode={l.v.allowDecimal ? "decimal" : "numeric"} value={l.quantity} disabled={l.v.trackSerials} onChange={(e) => up(l.uid, { quantity: e.target.value })} />
                        </td>
                        <td className="px-2 py-3">
                          <Input aria-label="Price" inputMode="decimal" value={l.unitPrice} onChange={(e) => up(l.uid, { unitPrice: e.target.value })} />
                        </td>
                        <td className="px-2 py-3">
                          <Input aria-label="Discount" inputMode="decimal" placeholder="0" value={l.discount} onChange={(e) => up(l.uid, { discount: e.target.value })} />
                        </td>
                        <td className="px-2 py-3 pt-5 text-right font-semibold">{money(n * Number(l.unitPrice || 0) - Number(l.discount || 0))}</td>
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
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Payment received" subtitle={partyId ? "Leave empty to invoice on credit" : "Walk-in invoices must be paid in full"} />
            <PaymentRows value={payments} onChange={setPayments} total={totals?.grandTotal ?? 0} />
            <div className="mt-4">
              <Field label="Note">
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shown on the invoice" />
              </Field>
            </div>
          </Card>
          <Card>
            <CardHeader title="Totals" />
            <TotalsBox
              totals={totals}
              discount={discount}
              onDiscount={setDiscount}
              otherCharges={otherCharges}
              onOtherCharges={setOtherCharges}
              otherChargesLabel="Delivery / other"
              roundOff={roundOff}
              onRoundOff={setRoundOff}
              taxIncluded={taxMode === "INCLUSIVE"}
            />
            {totalsError && <p className="mt-2 text-xs font-semibold text-rose-600">{totalsError}</p>}
          </Card>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/90 p-3 backdrop-blur">
          <span className="text-sm text-slate-600">
            Total <b className="text-slate-900">{money(totals?.grandTotal ?? 0)}</b>
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
            <Button icon={Save} loading={busy} disabled={!lines.length || !!totalsError} onClick={submit}>Save invoice</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
