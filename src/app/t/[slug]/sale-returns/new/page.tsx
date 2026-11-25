"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Undo2 } from "lucide-react";
import { Field, FormGrid, Input, SearchInput, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge, SummaryRow } from "@/components/ui/primitives";
import { DataTable } from "@/components/ui/table";
import { post } from "@/lib/client/api";
import { todayIso } from "@/lib/client/format";
import { useAction, useApi, useDebounced } from "@/lib/client/hooks";
import { PAYMENT_METHOD_LABELS } from "@/lib/client/labels";
import { useFmt, useSession } from "@/lib/client/session";

interface SaleItem {
  id: string;
  displayName: string;
  sku: string;
  unitCode: string;
  trackSerials: boolean;
  quantity: number;
  quantityReturned: number;
  returnableQuantity: number;
  lineTotal: number;
  taxAmount: number;
  serials: string[];
}
interface Sale {
  id: string;
  invoiceNumber: string;
  saleDate: string;
  status: string;
  partyId: string | null;
  partyName: string | null;
  customerName: string | null;
  subtotal: number;
  discount: number;
  taxMode: string;
  paidAmount: number;
  items: SaleItem[];
}

export default function NewSaleReturnPage() {
  const params = useSearchParams();
  const fixedSale = params.get("saleId");
  const [saleId, setSaleId] = useState(fixedSale ?? "");
  const { base, can, readOnly } = useSession();
  if (!can("sales.manage") || readOnly) return <Alert tone="amber">You don’t have permission to record returns.</Alert>;
  return (
    <div>
      <PageHeader title="New sale return" back={{ href: `${base}/sale-returns`, label: "Sale returns" }} />
      {saleId ? <ReturnForm saleId={saleId} onChangeSale={fixedSale ? undefined : () => setSaleId("")} /> : <PickSale onPick={setSaleId} />}
    </div>
  );
}

function PickSale({ onPick }: { onPick: (id: string) => void }) {
  const { money, dateTime } = useFmt();
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const { data, error, loading, reload } = useApi<{ items: { id: string; invoiceNumber: string; saleDate: string; customerName: string; grandTotal: number; paymentStatus: string }[] }>("/api/sales", {
    search: dq || undefined,
    status: "POSTED",
    limit: 15,
  });
  return (
    <Card padded={false}>
      <div className="space-y-3 p-4 sm:p-5">
        <CardHeader title="Which sale is being returned?" subtitle="Search by invoice number or customer" />
        <SearchInput value={q} onChange={setQ} placeholder="INV-00012, customer name…" autoFocus />
      </div>
      <DataTable
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(r) => r.id}
        onRowClick={(r) => onPick(r.id)}
        empty={<EmptyState title="No matching sales" />}
        columns={[
          { key: "n", header: "Invoice", cell: (r) => <span className="font-semibold text-[#044d73]">{r.invoiceNumber}</span> },
          { key: "d", header: "Date", cell: (r) => dateTime(r.saleDate) },
          { key: "c", header: "Customer", cell: (r) => r.customerName },
          { key: "t", header: "Total", align: "right", cell: (r) => money(r.grandTotal) },
          { key: "s", header: "", cell: (r) => <StatusBadge status={r.paymentStatus} /> },
        ]}
      />
    </Card>
  );
}

function ReturnForm({ saleId, onChangeSale }: { saleId: string; onChangeSale?: () => void }) {
  const { base, settings } = useSession();
  const { money, qty, dateTime } = useFmt();
  const router = useRouter();
  const { data, error, loading, reload } = useApi<{ sale: Sale }>(`/api/sales/${saleId}`);
  const [picks, setPicks] = useState<Record<string, { quantity: string; condition: "RESELLABLE" | "DAMAGED"; serials: string[] }>>({});
  const [resolution, setResolution] = useState<"" | "REFUND" | "STORE_CREDIT">("");
  const [refundMethod, setRefundMethod] = useState("CASH");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [returnDate, setReturnDate] = useState(todayIso(settings.timezone));
  const { busy, error: saveErr, run } = useAction();

  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (loading || !data) return <LoadingBlock />;
  const s = data.sale;
  if (s.status !== "POSTED") return <Alert>This sale is void and can’t be returned.</Alert>;
  const items = s.items.filter((i) => i.returnableQuantity > 0);
  const billFactor = s.subtotal > 0 ? 1 - s.discount / s.subtotal : 1;
  const estimate = items.reduce((sum, i) => {
    const n = Number(picks[i.id]?.quantity || 0);
    if (!n) return sum;
    const net = (i.lineTotal / i.quantity) * billFactor * n;
    const tax = (i.taxAmount / i.quantity) * n;
    return sum + (s.taxMode === "EXCLUSIVE" ? net + tax : net);
  }, 0);
  const set = (id: string, p: Partial<(typeof picks)[string]>) =>
    setPicks((x) => ({ ...x, [id]: { ...(x[id] ?? { quantity: "", condition: "RESELLABLE" as const, serials: [] }), ...p } }));

  const submit = () =>
    run(async () => {
      const lines = items
        .filter((i) => Number(picks[i.id]?.quantity) > 0)
        .map((i) => ({ saleItemId: i.id, quantity: Number(picks[i.id].quantity), condition: picks[i.id].condition, serials: i.trackSerials ? picks[i.id].serials : [] }));
      if (!lines.length) throw new Error("Enter how many of each item are coming back");
      const r = await post<{ saleReturn: { id: string } }>("/api/sale-returns", {
        saleId,
        returnDate,
        resolution: resolution || undefined,
        refundMethod,
        reason: reason || null,
        note: note || null,
        items: lines,
      });
      router.push(`${base}/sale-returns/${r.saleReturn.id}`);
    });

  return (
    <div className="space-y-6">
      {saveErr && <Alert>{saveErr}</Alert>}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-800">{s.invoiceNumber} · {s.partyName ?? s.customerName ?? "Walk-in customer"}</div>
            <div className="text-xs text-slate-500">{dateTime(s.saleDate)} · paid {money(s.paidAmount)}</div>
          </div>
          {onChangeSale && <Button size="sm" variant="secondary" onClick={onChangeSale}>Choose another sale</Button>}
        </div>
      </Card>
      <Card padded={false}>
        <div className="p-4 sm:p-5"><CardHeader title="Items coming back" /></div>
        {items.length === 0 ? (
          <EmptyState title="Everything on this sale has already been returned" className="py-10" />
        ) : (
          <div className="divide-y divide-slate-100 border-t border-slate-100">
            {items.map((i) => {
              const p = picks[i.id];
              const soldSerials = i.serials.filter(Boolean);
              return (
                <div key={i.id} className="grid grid-cols-1 gap-3 p-4 sm:px-5 lg:grid-cols-12 lg:items-start">
                  <div className="lg:col-span-5">
                    <div className="font-semibold text-slate-800">{i.displayName}</div>
                    <div className="text-xs text-slate-500">
                      Sold {qty(i.quantity, i.unitCode)}
                      {i.quantityReturned > 0 && ` · ${qty(i.quantityReturned)} already returned`} · can return <b>{qty(i.returnableQuantity)}</b>
                    </div>
                  </div>
                  <div className="lg:col-span-2">
                    {i.trackSerials ? (
                      <Badge tone="blue">{p?.serials.length ?? 0} selected</Badge>
                    ) : (
                      <Input aria-label="Return quantity" inputMode="decimal" placeholder="0" value={p?.quantity ?? ""} onChange={(e) => set(i.id, { quantity: e.target.value })} />
                    )}
                  </div>
                  <div className="lg:col-span-2">
                    <Select aria-label="Condition" value={p?.condition ?? "RESELLABLE"} onChange={(e) => set(i.id, { condition: e.target.value as "RESELLABLE" | "DAMAGED" })}>
                      <option value="RESELLABLE">Back to stock</option>
                      <option value="DAMAGED">Damaged — write off</option>
                    </Select>
                  </div>
                  {i.trackSerials && (
                    <div className="flex flex-wrap gap-1.5 lg:col-span-3">
                      {soldSerials.map((sn) => {
                        const on = p?.serials.includes(sn);
                        return (
                          <button
                            key={sn}
                            type="button"
                            onClick={() => {
                              const next = on ? (p?.serials ?? []).filter((x) => x !== sn) : [...(p?.serials ?? []), sn];
                              set(i.id, { serials: next, quantity: String(next.length) });
                            }}
                            className={`rounded-md border px-2 py-1 font-mono text-xs ${on ? "border-[#044d73] bg-[#044d73]/10 text-[#044d73]" : "border-slate-200 text-slate-600"}`}
                          >
                            {sn}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Refund" />
          <FormGrid>
            <Field label="Give back as" hint={s.partyId ? "Automatic: refund what was paid, credit the rest" : "Walk-in sales can only be refunded"}>
              <Select value={resolution} onChange={(e) => setResolution(e.target.value as typeof resolution)}>
                <option value="">Automatic</option>
                <option value="REFUND">Refund money</option>
                {s.partyId && <option value="STORE_CREDIT">Store credit</option>}
              </Select>
            </Field>
            <Field label="Refund method">
              <Select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)} disabled={resolution === "STORE_CREDIT"}>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Reason">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong size, faulty…" />
            </Field>
            <Field label="Return date">
              <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
            </Field>
          </FormGrid>
          <div className="mt-4">
            <Field label="Note"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
        </Card>
        <Card>
          <CardHeader title="Summary" />
          <SummaryRow label="Estimated amount" value={money(estimate)} strong />
          <p className="mt-2 text-xs text-slate-500">Includes this item’s share of any bill discount{s.taxMode === "EXCLUSIVE" ? ` and ${settings.taxLabel}` : ""}. The exact figure is worked out when you save.</p>
          <Button className="mt-4 w-full" icon={Undo2} loading={busy} disabled={estimate <= 0} onClick={submit}>Record return</Button>
        </Card>
      </div>
    </div>
  );
}
