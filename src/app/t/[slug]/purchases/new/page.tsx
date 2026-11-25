"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { PaymentRows, TotalsBox, paymentBody, type PaymentRow } from "@/components/doc";
import { LocationSelect, PartySelect } from "@/components/pickers";
import type { PurchaseOrder } from "@/components/po-form";
import { PurchaseLines, newLine, purchaseItem, purchaseTotals, type PLine } from "@/components/purchase-lines";
import { Field, FormGrid, Input, Textarea, Toggle } from "@/components/ui/form";
import { Alert, Button, Card, CardHeader, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/primitives";
import { post } from "@/lib/client/api";
import { todayIso } from "@/lib/client/format";
import { useAction, useApi } from "@/lib/client/hooks";
import { useFmt, useSession } from "@/lib/client/session";

export default function NewPurchasePage() {
  const params = useSearchParams();
  const poId = params.get("poId");
  const { base, can, readOnly } = useSession();
  const allowed = can("purchases.manage") && !readOnly;
  return (
    <div>
      <PageHeader
        title={poId ? "Receive goods" : "Record purchase"}
        subtitle="Adds the goods to stock and records what you owe the supplier"
        back={poId ? { href: `${base}/purchase-orders/${poId}`, label: "Purchase order" } : { href: `${base}/purchases`, label: "Purchases" }}
      />
      {!allowed ? <Alert tone="amber">You don’t have permission to record purchases.</Alert> : poId ? <FromOrder poId={poId} /> : <PurchaseForm />}
    </div>
  );
}

function FromOrder({ poId }: { poId: string }) {
  const { data, error, loading, reload } = useApi<{ purchaseOrder: PurchaseOrder }>(`/api/purchase-orders/${poId}`);
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (loading || !data) return <LoadingBlock />;
  const po = data.purchaseOrder;
  if (po.status === "RECEIVED" || po.status === "CANCELLED") return <Alert tone="amber">{po.number} is {po.status.toLowerCase()} — nothing more can be received against it.</Alert>;
  return <PurchaseForm order={po} />;
}

function PurchaseForm({ order }: { order?: PurchaseOrder }) {
  const { base, session, settings } = useSession();
  const { money } = useFmt();
  const router = useRouter();
  const [partyId, setPartyId] = useState(order?.partyId ?? "");
  const [locationId, setLocationId] = useState(order?.locationId ?? session.activeLocationId);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayIso(settings.timezone));
  const [dueDate, setDueDate] = useState("");
  const [inclusive, setInclusive] = useState(order ? order.taxMode === "INCLUSIVE" : settings.pricesIncludeTax);
  const [discount, setDiscount] = useState("");
  const [otherCharges, setOtherCharges] = useState("");
  const [roundOff, setRoundOff] = useState("");
  const [note, setNote] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [lines, setLines] = useState<PLine[]>(() =>
    (order?.items ?? [])
      .filter((i) => i.quantityPending > 0)
      .map((i) =>
        newLine(
          { variantId: i.variantId, displayName: i.displayName, sku: i.sku, unitCode: i.unitCode, trackBatches: i.trackBatches, trackExpiry: i.trackExpiry, trackSerials: i.trackSerials, taxRate: i.taxRate },
          {
            quantity: String(i.quantityPending),
            unitCost: String(i.unitCost),
            discount: i.discount && i.quantity ? String(Math.round((i.discount / i.quantity) * i.quantityPending * 100) / 100) : "",
            taxRate: String(i.taxRate),
            inPurchaseUnits: false,
            purchaseOrderItemId: i.id,
            ordered: i.quantityPending,
          },
        ),
      ),
  );
  const { busy, error, fieldErrors, run } = useAction();
  const taxMode = inclusive ? "INCLUSIVE" : "EXCLUSIVE";
  const { totals, error: totalsError } = useMemo(() => purchaseTotals(lines, { taxMode, discount, otherCharges, roundOff }), [lines, taxMode, discount, otherCharges, roundOff]);
  const grand = totals?.grandTotal ?? 0;
  const paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

  const submit = () =>
    run(async () => {
      if (!partyId) throw new Error("Choose a supplier");
      for (const l of lines) {
        if (l.v.trackSerials) {
          const n = l.serialText.split(/[\n,;]+/).filter((s) => s.trim()).length;
          const need = Number(l.quantity) * (l.inPurchaseUnits && l.v.purchaseUnitFactor ? l.v.purchaseUnitFactor : 1);
          if (n !== need) throw new Error(`${l.v.displayName}: enter ${need} serial number${need === 1 ? "" : "s"} (got ${n})`);
        }
        if (l.v.trackExpiry && !l.expiryDate) throw new Error(`${l.v.displayName}: enter the expiry date`);
      }
      if (paid > grand + 0.004) throw new Error("Payments are more than the bill total");
      const r = await post<{ purchase: { id: string } }>("/api/purchases", {
        partyId,
        locationId,
        purchaseOrderId: order?.id,
        supplierInvoiceNumber: invoiceNo || null,
        purchaseDate,
        dueDate: dueDate || null,
        taxMode,
        discount: Number(discount || 0),
        otherCharges: Number(otherCharges || 0),
        roundOff: Number(roundOff || 0),
        note: note || null,
        items: lines.map(purchaseItem),
        payments: paymentBody(payments).map((p) => ({ ...p, paymentDate: purchaseDate })),
      });
      router.push(`${base}/purchases/${r.purchase.id}`);
    });

  return (
    <div className="space-y-6">
      {error && <Alert>{error}</Alert>}
      {order && <Alert tone="blue">Receiving against <b>{order.number}</b>. Quantities are pre-filled with what’s still to arrive — change them to what actually came in.</Alert>}
      <Card>
        <FormGrid cols={settings.enableMultiLocation ? 4 : 3}>
          <Field label="Supplier" required error={fieldErrors.partyId}>
            {order ? <Input value={order.partyName} disabled /> : <PartySelect type="SUPPLIER" value={partyId} onChange={(id) => setPartyId(id)} />}
          </Field>
          <Field label="Supplier invoice no." hint="As printed on their bill">
            <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} maxLength={100} />
          </Field>
          {settings.enableMultiLocation && (
            <Field label="Received at">
              <LocationSelect value={locationId} onChange={setLocationId} />
            </Field>
          )}
          <Field label="Purchase date">
            <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </Field>
          <Field label="Payment due" hint="Leave empty if paid now">
            <Input type="date" value={dueDate} min={purchaseDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </FormGrid>
      </Card>
      <Card padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader title="Items received" subtitle="Batch, expiry and serial numbers are asked for only on products that track them" />
        </div>
        <PurchaseLines lines={lines} setLines={setLines} mode="purchase" locationId={locationId} />
      </Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Payment made" subtitle="Anything you paid the supplier now. The rest stays on their account." />
            <PaymentRows value={payments} onChange={setPayments} total={grand} label="Payment" />
          </Card>
          <Card>
            <CardHeader title="Note" />
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="mt-3">
              <Toggle checked={inclusive} onChange={setInclusive} label={`Costs include ${settings.taxLabel}`} />
            </div>
          </Card>
        </div>
        <Card>
          <CardHeader title="Totals" subtitle="Freight and other charges are spread into the landed cost of each item" />
          <TotalsBox
            totals={totals}
            discount={discount}
            onDiscount={setDiscount}
            otherCharges={otherCharges}
            onOtherCharges={setOtherCharges}
            otherChargesLabel="Freight / other"
            roundOff={roundOff}
            onRoundOff={setRoundOff}
            taxIncluded={inclusive}
          />
          {totalsError && <p className="mt-2 text-xs font-semibold text-rose-600">{totalsError}</p>}
        </Card>
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/90 p-3 backdrop-blur">
        <span className="text-sm text-slate-600">
          Total <b className="text-slate-900">{money(grand)}</b>
          {grand - paid > 0.004 && <> · on account <b className="text-amber-600">{money(grand - paid)}</b></>}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button icon={PackageCheck} loading={busy} disabled={!lines.length || !!totalsError} onClick={submit}>Post purchase</Button>
        </div>
      </div>
    </div>
  );
}
