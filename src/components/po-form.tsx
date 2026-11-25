"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Save, Send } from "lucide-react";
import { TotalsBox } from "@/components/doc";
import { LocationSelect, PartySelect } from "@/components/pickers";
import { PurchaseLines, newLine, orderItem, purchaseTotals, type PLine } from "@/components/purchase-lines";
import { Field, FormGrid, Input, Textarea, Toggle } from "@/components/ui/form";
import { Alert, Button, Card, CardHeader } from "@/components/ui/primitives";
import { post, put } from "@/lib/client/api";
import { todayIso } from "@/lib/client/format";
import { useAction } from "@/lib/client/hooks";
import { useFmt, useSession } from "@/lib/client/session";

export interface PurchaseOrder {
  id: string;
  number: string;
  status: "DRAFT" | "SENT" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
  partyId: string;
  partyName: string;
  partyPhone: string | null;
  locationId: string;
  locationName: string;
  orderDate: string;
  expectedDate: string | null;
  taxMode: "EXCLUSIVE" | "INCLUSIVE" | "EXEMPT";
  subtotal: number;
  discount: number;
  otherCharges: number;
  taxAmount: number;
  grandTotal: number;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
  items: {
    id: string;
    variantId: string;
    displayName: string;
    sku: string;
    unitCode: string;
    trackBatches: boolean;
    trackExpiry: boolean;
    trackSerials: boolean;
    quantity: number;
    quantityReceived: number;
    quantityPending: number;
    unitCost: number;
    discount: number;
    taxRate: number;
    taxAmount: number;
    lineTotal: number;
  }[];
  receipts: { id: string; number: string; purchaseDate: string; status: string; grandTotal: number }[];
}

export function PurchaseOrderForm({ order }: { order?: PurchaseOrder }) {
  const { base, session, settings } = useSession();
  const { money } = useFmt();
  const router = useRouter();
  const initialParty = useSearchParams().get("partyId");
  const [partyId, setPartyId] = useState(order?.partyId ?? initialParty ?? "");
  const [locationId, setLocationId] = useState(order?.locationId ?? session.activeLocationId);
  const [orderDate, setOrderDate] = useState(order?.orderDate ?? todayIso(settings.timezone));
  const [expectedDate, setExpectedDate] = useState(order?.expectedDate ?? "");
  const [inclusive, setInclusive] = useState(order ? order.taxMode === "INCLUSIVE" : settings.pricesIncludeTax);
  const [discount, setDiscount] = useState(order?.discount ? String(order.discount) : "");
  const [otherCharges, setOtherCharges] = useState(order?.otherCharges ? String(order.otherCharges) : "");
  const [note, setNote] = useState(order?.note ?? "");
  const [lines, setLines] = useState<PLine[]>(() =>
    (order?.items ?? []).map((i) =>
      newLine(
        { variantId: i.variantId, displayName: i.displayName, sku: i.sku, unitCode: i.unitCode, trackBatches: i.trackBatches, trackExpiry: i.trackExpiry, trackSerials: i.trackSerials, taxRate: i.taxRate },
        { quantity: String(i.quantity), unitCost: String(i.unitCost), discount: i.discount ? String(i.discount) : "", taxRate: String(i.taxRate), inPurchaseUnits: false },
      ),
    ),
  );
  const [sending, setSending] = useState(false);
  const { busy, error, run } = useAction();
  const taxMode = inclusive ? "INCLUSIVE" : "EXCLUSIVE";
  const { totals, error: totalsError } = useMemo(() => purchaseTotals(lines, { taxMode, discount, otherCharges }), [lines, taxMode, discount, otherCharges]);

  const save = (send: boolean) => {
    setSending(send);
    return run(async () => {
      if (!partyId) throw new Error("Choose a supplier");
      const body = {
        partyId,
        locationId,
        orderDate,
        expectedDate: expectedDate || null,
        taxMode,
        discount: Number(discount || 0),
        otherCharges: Number(otherCharges || 0),
        note: note || null,
        status: send ? "SENT" : "DRAFT",
        items: lines.map(orderItem),
      };
      const r = order
        ? await put<{ purchaseOrder: { id: string } }>(`/api/purchase-orders/${order.id}`, body)
        : await post<{ purchaseOrder: { id: string } }>("/api/purchase-orders", body);
      router.push(`${base}/purchase-orders/${r.purchaseOrder.id}`);
    });
  };

  return (
    <div className="space-y-6">
      {error && <Alert>{error}</Alert>}
      <Card>
        <FormGrid cols={settings.enableMultiLocation ? 4 : 3}>
          <Field label="Supplier" required>
            <PartySelect type="SUPPLIER" value={partyId} onChange={(id) => setPartyId(id)} />
          </Field>
          {settings.enableMultiLocation && (
            <Field label="Deliver to">
              <LocationSelect value={locationId} onChange={setLocationId} />
            </Field>
          )}
          <Field label="Order date">
            <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          </Field>
          <Field label="Expected by">
            <Input type="date" value={expectedDate} min={orderDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </Field>
        </FormGrid>
      </Card>
      <Card padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader title="Items to order" />
        </div>
        <PurchaseLines lines={lines} setLines={setLines} mode="order" locationId={locationId} />
      </Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Notes for the supplier" />
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Delivery instructions, terms…" />
          <div className="mt-3">
            <Toggle checked={inclusive} onChange={setInclusive} label={`Costs include ${settings.taxLabel}`} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Totals" />
          <TotalsBox totals={totals} discount={discount} onDiscount={setDiscount} otherCharges={otherCharges} onOtherCharges={setOtherCharges} otherChargesLabel="Freight / other" taxIncluded={inclusive} />
          {totalsError && <p className="mt-2 text-xs font-semibold text-rose-600">{totalsError}</p>}
        </Card>
      </div>
      <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/90 p-3 backdrop-blur">
        <span className="text-sm text-slate-600">Total <b className="text-slate-900">{money(totals?.grandTotal ?? 0)}</b></span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button variant="secondary" icon={Save} loading={busy && !sending} disabled={!lines.length || busy || !!totalsError} onClick={() => save(false)}>Save draft</Button>
          <Button icon={Send} loading={busy && sending} disabled={!lines.length || busy || !!totalsError} onClick={() => save(true)}>Save & mark sent</Button>
        </div>
      </div>
    </div>
  );
}
