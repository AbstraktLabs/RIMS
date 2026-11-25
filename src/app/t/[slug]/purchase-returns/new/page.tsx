"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Trash2, Undo2 } from "lucide-react";
import { LocationSelect, PartySelect, VariantSearch } from "@/components/pickers";
import { LotSelect, SerialPicker } from "@/components/stock-pickers";
import { Checkbox, Field, FormGrid, Input, SearchInput, Textarea } from "@/components/ui/form";
import { Alert, Button, Card, CardHeader, EmptyState, ErrorState, LoadingBlock, PageHeader, SummaryRow, Tabs } from "@/components/ui/primitives";
import { DataTable } from "@/components/ui/table";
import { post } from "@/lib/client/api";
import { todayIso } from "@/lib/client/format";
import { useAction, useApi, useDebounced } from "@/lib/client/hooks";
import { useFmt, useSession } from "@/lib/client/session";
import type { SearchVariant } from "@/lib/client/types";

interface PItem {
  id: string;
  variantId: string;
  displayName: string;
  sku: string;
  unitCode: string;
  trackSerials: boolean;
  quantity: number;
  lineTotal: number;
  taxAmount: number;
  taxRate: number;
  lotId: string | null;
  lotNumber: string | null;
  expiryDate: string | null;
  lotAvailable: number | null;
  serials: string[];
  returnableQuantity: number;
}
interface Purchase {
  id: string;
  number: string;
  status: string;
  purchaseDate: string;
  partyId: string;
  partyName: string;
  locationId: string;
  locationName: string;
  supplierInvoiceNumber: string | null;
  subtotal: number;
  discount: number;
  otherCharges: number;
  taxMode: string;
  items: PItem[];
}

const REASONS = ["Damaged", "Expired", "Wrong item", "Excess quantity", "Quality issue"];

export default function NewPurchaseReturnPage() {
  const params = useSearchParams();
  const fixed = params.get("purchaseId");
  const [purchaseId, setPurchaseId] = useState(fixed ?? "");
  const [tab, setTab] = useState<"bill" | "free">("bill");
  const { base, can, readOnly } = useSession();
  if (!can("purchases.manage") || readOnly) return <Alert tone="amber">You don’t have permission to record supplier returns.</Alert>;
  return (
    <div>
      <PageHeader title="Return to supplier" back={{ href: `${base}/purchase-returns`, label: "Supplier returns" }} />
      {purchaseId ? (
        <FromPurchase purchaseId={purchaseId} onChange={fixed ? undefined : () => setPurchaseId("")} />
      ) : (
        <>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: "bill", label: "From a purchase" }, { value: "free", label: "Without a bill" }]} />
          <div className="mt-4">{tab === "bill" ? <PickPurchase onPick={setPurchaseId} /> : <FreeReturn />}</div>
        </>
      )}
    </div>
  );
}

function PickPurchase({ onPick }: { onPick: (id: string) => void }) {
  const { money, date } = useFmt();
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const { data, error, loading, reload } = useApi<{ items: { id: string; number: string; supplierInvoiceNumber: string | null; purchaseDate: string; partyName: string; grandTotal: number }[] }>("/api/purchases", {
    search: dq || undefined,
    status: "POSTED",
    limit: 15,
  });
  return (
    <Card padded={false}>
      <div className="space-y-3 p-4 sm:p-5">
        <CardHeader title="Which purchase did the goods come in on?" subtitle="Returns against a bill use its cost and batch automatically" />
        <SearchInput value={q} onChange={setQ} placeholder="Bill no., supplier invoice, supplier…" autoFocus />
      </div>
      <DataTable
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(r) => r.id}
        onRowClick={(r) => onPick(r.id)}
        empty={<EmptyState title="No matching purchases" description="Use “Without a bill” if the goods can’t be traced to a purchase." />}
        columns={[
          { key: "n", header: "Bill", cell: (r) => <span className="font-semibold text-[#044d73]">{r.number}</span> },
          { key: "i", header: "Supplier inv.", hideBelow: "md", cell: (r) => r.supplierInvoiceNumber ?? "—" },
          { key: "d", header: "Date", cell: (r) => date(r.purchaseDate) },
          { key: "p", header: "Supplier", cell: (r) => r.partyName },
          { key: "t", header: "Total", align: "right", cell: (r) => money(r.grandTotal) },
        ]}
      />
    </Card>
  );
}

function ReturnMeta({
  reason,
  setReason,
  note,
  setNote,
  returnDate,
  setReturnDate,
}: {
  reason: string;
  setReason: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  returnDate: string;
  setReturnDate: (v: string) => void;
}) {
  return (
    <Card>
      <CardHeader title="Details" />
      <div className="space-y-3">
        <Field label="Return date">
          <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
        </Field>
        <Field label="Reason">
          <Input list="pr-reasons" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Damaged, expired…" maxLength={255} />
          <datalist id="pr-reasons">{REASONS.map((r) => <option key={r} value={r} />)}</datalist>
        </Field>
        <Field label="Note">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <p className="text-xs text-slate-500">The goods leave stock now. Once the supplier settles it, complete the return as a refund, credit note or replacement.</p>
      </div>
    </Card>
  );
}

function FromPurchase({ purchaseId, onChange }: { purchaseId: string; onChange?: () => void }) {
  const { base, settings } = useSession();
  const { money, qty, date } = useFmt();
  const router = useRouter();
  const { data, error, loading, reload } = useApi<{ purchase: Purchase }>(`/api/purchases/${purchaseId}`);
  const [picks, setPicks] = useState<Record<string, { quantity: string; serials: string[] }>>({});
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [returnDate, setReturnDate] = useState(todayIso(settings.timezone));
  const { busy, error: saveErr, run } = useAction();
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (loading || !data) return <LoadingBlock />;
  const p = data.purchase;
  if (p.status !== "POSTED") return <Alert>This purchase is void — nothing can be returned from it.</Alert>;
  const items = p.items.filter((i) => i.returnableQuantity > 0);
  const billFactor = p.subtotal > 0 ? 1 - p.discount / p.subtotal : 1;
  const set = (id: string, x: Partial<{ quantity: string; serials: string[] }>) => setPicks((s) => ({ ...s, [id]: { ...(s[id] ?? { quantity: "", serials: [] }), ...x } }));
  const estimate = items.reduce((sum, i) => {
    const n = Number(picks[i.id]?.quantity || 0);
    if (!n) return sum;
    const unit = (i.lineTotal / i.quantity) * billFactor;
    const tax = p.taxMode === "EXCLUSIVE" ? (unit * n * i.taxRate) / 100 : 0;
    return sum + unit * n + tax;
  }, 0);

  const submit = () =>
    run(async () => {
      const lines = items
        .filter((i) => Number(picks[i.id]?.quantity) > 0)
        .map((i) => ({ purchaseItemId: i.id, variantId: i.variantId, quantity: Number(picks[i.id].quantity), serials: i.trackSerials ? picks[i.id].serials : [] }));
      if (!lines.length) throw new Error("Enter how many of each item are going back");
      for (const l of lines) {
        const it = items.find((i) => i.id === l.purchaseItemId)!;
        if (it.trackSerials && l.serials.length !== l.quantity) throw new Error(`${it.displayName}: tick ${l.quantity} serial number${l.quantity === 1 ? "" : "s"}`);
      }
      const r = await post<{ purchaseReturn: { id: string } }>("/api/purchase-returns", {
        purchaseId: p.id,
        locationId: p.locationId,
        returnDate,
        reason: reason || null,
        note: note || null,
        items: lines,
      });
      router.push(`${base}/purchase-returns/${r.purchaseReturn.id}`);
    });

  return (
    <div className="space-y-6">
      {saveErr && <Alert>{saveErr}</Alert>}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-800">{p.number} · {p.partyName}</div>
            <div className="text-xs text-slate-500">{date(p.purchaseDate)}{p.supplierInvoiceNumber ? ` · supplier invoice ${p.supplierInvoiceNumber}` : ""} · {p.locationName}</div>
          </div>
          {onChange && <Button variant="ghost" size="sm" onClick={onChange}>Choose another purchase</Button>}
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card padded={false} className="xl:col-span-2">
          <div className="p-4 sm:p-5"><CardHeader title="Items going back" /></div>
          {items.length === 0 ? (
            <EmptyState title="Everything on this purchase has already been returned" className="py-10" />
          ) : (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {items.map((i) => {
                const pick = picks[i.id];
                const n = Number(pick?.quantity || 0);
                return (
                  <li key={i.id} className="space-y-2 px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800">{i.displayName}</div>
                        <div className="text-xs text-slate-500">
                          {i.sku}
                          {i.lotNumber && ` · Batch ${i.lotNumber}`}
                          {i.expiryDate && ` · Exp ${date(i.expiryDate)}`} · can return {qty(i.returnableQuantity, i.unitCode)}
                          {i.lotAvailable !== null && i.lotAvailable < i.returnableQuantity && <span className="text-amber-600"> · only {qty(i.lotAvailable)} of this batch left in stock</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          className="w-24 text-right"
                          inputMode="decimal"
                          placeholder="0"
                          value={pick?.quantity ?? ""}
                          onChange={(e) => set(i.id, { quantity: e.target.value })}
                          aria-label={`Quantity of ${i.displayName} to return`}
                        />
                        <Button size="sm" variant="ghost" onClick={() => set(i.id, { quantity: String(i.returnableQuantity), serials: i.trackSerials ? i.serials.slice(0, i.returnableQuantity) : [] })}>All</Button>
                      </div>
                    </div>
                    {n > i.returnableQuantity && <p className="text-xs font-semibold text-rose-600">Only {qty(i.returnableQuantity)} can be returned</p>}
                    {i.trackSerials && n > 0 && (
                      <div className="flex flex-wrap gap-3 rounded-lg bg-slate-50 p-2">
                        {i.serials.map((sn) => (
                          <Checkbox
                            key={sn}
                            checked={pick?.serials.includes(sn) ?? false}
                            onChange={(c) => set(i.id, { serials: c ? [...(pick?.serials ?? []), sn] : (pick?.serials ?? []).filter((x) => x !== sn) })}
                            label={<span className="font-mono text-xs">{sn}</span>}
                          />
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <div className="space-y-6">
          <ReturnMeta reason={reason} setReason={setReason} note={note} setNote={setNote} returnDate={returnDate} setReturnDate={setReturnDate} />
          <Card>
            <SummaryRow label="Estimated value" value={money(estimate)} strong />
            <p className="mt-1 text-xs text-slate-500">Valued at the purchase cost after bill discount. The exact amount is worked out when you save.</p>
            <Button className="mt-4 w-full" icon={Undo2} loading={busy} disabled={!items.length} onClick={submit}>Record return</Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

interface FreeLine {
  uid: number;
  v: SearchVariant;
  quantity: string;
  unitCost: string;
  lotId: string;
  serials: string[];
}
let uid = 1;

function FreeReturn() {
  const { base, session, settings } = useSession();
  const { money, qty } = useFmt();
  const router = useRouter();
  const [partyId, setPartyId] = useState("");
  const [locationId, setLocationId] = useState(session.activeLocationId);
  const [lines, setLines] = useState<FreeLine[]>([]);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [returnDate, setReturnDate] = useState(todayIso(settings.timezone));
  const { busy, error, run } = useAction();
  const up = (u: number, p: Partial<FreeLine>) => setLines((ls) => ls.map((l) => (l.uid === u ? { ...l, ...p } : l)));
  const total = lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitCost || 0), 0);

  const submit = () =>
    run(async () => {
      if (!partyId) throw new Error("Choose the supplier");
      if (!lines.length) throw new Error("Add the items going back");
      for (const l of lines) {
        if (l.v.trackSerials && l.serials.length !== Number(l.quantity)) throw new Error(`${l.v.displayName}: pick ${l.quantity} serial number(s)`);
        if (l.v.trackBatches && !l.lotId) throw new Error(`${l.v.displayName}: choose the batch`);
      }
      const r = await post<{ purchaseReturn: { id: string } }>("/api/purchase-returns", {
        partyId,
        locationId,
        returnDate,
        reason: reason || null,
        note: note || null,
        items: lines.map((l) => ({ variantId: l.v.variantId, quantity: Number(l.quantity), unitCost: Number(l.unitCost || 0), lotId: l.lotId || null, serials: l.serials })),
      });
      router.push(`${base}/purchase-returns/${r.purchaseReturn.id}`);
    });

  return (
    <div className="space-y-6">
      {error && <Alert>{error}</Alert>}
      <Card>
        <FormGrid cols={settings.enableMultiLocation ? 2 : 1}>
          <Field label="Supplier" required>
            <PartySelect type="SUPPLIER" value={partyId} onChange={(id) => setPartyId(id)} />
          </Field>
          {settings.enableMultiLocation && (
            <Field label="Sent from">
              <LocationSelect value={locationId} onChange={(id) => { setLocationId(id); setLines((ls) => ls.map((l) => ({ ...l, lotId: "", serials: [] }))); }} />
            </Field>
          )}
        </FormGrid>
      </Card>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card padded={false} className="xl:col-span-2">
          <div className="p-4 sm:p-5">
            <CardHeader title="Items going back" />
            <VariantSearch
              locationId={locationId}
              showCost
              onPick={(v) => setLines((ls) => (ls.some((l) => l.v.variantId === v.variantId && !v.trackBatches) ? ls : [...ls, { uid: uid++, v, quantity: "1", unitCost: String(v.costPrice ?? 0), lotId: "", serials: [] }]))}
              placeholder="Search products in stock…"
            />
          </div>
          {lines.length === 0 ? (
            <EmptyState title="No items yet" description="Search for the products you’re sending back." className="py-10" />
          ) : (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {lines.map((l) => (
                <li key={l.uid} className="space-y-2 px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800">{l.v.displayName}</div>
                      <div className="text-xs text-slate-500">{l.v.sku} · in stock {qty(l.v.stock ?? 0, l.v.unitCode)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input className="w-20 text-right" inputMode="decimal" value={l.quantity} onChange={(e) => up(l.uid, { quantity: e.target.value })} aria-label="Quantity" />
                      <Input className="w-28 text-right" inputMode="decimal" value={l.unitCost} onChange={(e) => up(l.uid, { unitCost: e.target.value })} aria-label="Unit cost" title="Unit cost" />
                      <Button variant="ghost" icon={Trash2} aria-label="Remove" onClick={() => setLines((ls) => ls.filter((x) => x.uid !== l.uid))} />
                    </div>
                  </div>
                  {l.v.trackBatches && (
                    <LotSelect variantId={l.v.variantId} locationId={locationId} value={l.lotId} onChange={(id, lot) => up(l.uid, { lotId: id, ...(lot ? { unitCost: String(lot.unitCost ?? l.unitCost) } : {}) })} />
                  )}
                  {l.v.trackSerials && <SerialPicker variantId={l.v.variantId} locationId={locationId} value={l.serials} onChange={(s) => up(l.uid, { serials: s })} max={Number(l.quantity) || undefined} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-6">
          <ReturnMeta reason={reason} setReason={setReason} note={note} setNote={setNote} returnDate={returnDate} setReturnDate={setReturnDate} />
          <Card>
            <SummaryRow label="Value (before tax)" value={money(total)} strong />
            <Button className="mt-4 w-full" icon={Undo2} loading={busy} disabled={!lines.length} onClick={submit}>Record return</Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
