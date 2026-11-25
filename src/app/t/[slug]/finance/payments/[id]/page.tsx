"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Ban, Printer } from "lucide-react";
import { VoidDialog } from "@/components/doc";
import { PrintHeader } from "@/components/print-header";
import { Alert, Badge, Button, Card, DetailList, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/primitives";
import { useApi } from "@/lib/client/hooks";
import { PAYMENT_DIRECTION_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/client/labels";
import { useFmt, useSession } from "@/lib/client/session";

interface Payment {
  id: string;
  number: string;
  direction: string;
  amount: number;
  method: string;
  paymentDate: string;
  referenceNumber: string | null;
  notes: string | null;
  status: string;
  partyId: string | null;
  partyName: string | null;
  saleId: string | null;
  purchaseId: string | null;
  saleReturnId: string | null;
  purchaseReturnId: string | null;
  documentNumber: string | null;
  locationName: string;
  createdByName: string | null;
  voidedAt: string | null;
  createdAt: string;
  onAccount: boolean;
}

export default function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { base, can, readOnly } = useSession();
  const { money, date, dateTime } = useFmt();
  const { data, error, loading, reload } = useApi<{ payment: Payment }>(`/api/payments/${id}`);
  const [voiding, setVoiding] = useState(false);
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (loading && !data) return <LoadingBlock />;
  if (!data) return null;
  const p = data.payment;
  const inflow = p.direction === "RECEIVED_FROM_CUSTOMER" || p.direction === "REFUND_FROM_SUPPLIER";
  const doc = p.saleId
    ? `${base}/sales/${p.saleId}`
    : p.purchaseId
      ? `${base}/purchases/${p.purchaseId}`
      : p.saleReturnId
        ? `${base}/sale-returns/${p.saleReturnId}`
        : p.purchaseReturnId
          ? `${base}/purchase-returns/${p.purchaseReturnId}`
          : null;
  return (
    <div>
      <PageHeader
        back={{ href: `${base}/finance/payments`, label: "Payments" }}
        title={<span className="flex items-center gap-2">{p.number} {p.status === "VOID" && <Badge tone="red">Void</Badge>}</span>}
        subtitle={PAYMENT_DIRECTION_LABELS[p.direction] ?? p.direction}
        actions={
          <>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print receipt</Button>
            {p.status === "POSTED" && can("finance.manage") && !readOnly && <Button variant="ghost" icon={Ban} onClick={() => setVoiding(true)}>Void</Button>}
          </>
        }
      />
      {p.status === "VOID" && <div className="mb-4"><Alert>Voided {p.voidedAt ? dateTime(p.voidedAt) : ""}. The amount was put back on the account and documents it settled.</Alert></div>}
      <Card className="max-w-2xl print:border-0 print:shadow-none">
        <PrintHeader screen title={inflow ? "Payment receipt" : "Payment voucher"} number={p.number} meta={[["Date", date(p.paymentDate)]]} />
        <div className="mb-5 text-center">
          <div className={`text-3xl font-bold ${p.status === "VOID" ? "text-slate-400 line-through" : inflow ? "text-emerald-700" : "text-amber-700"}`}>{money(p.amount)}</div>
          <div className="text-sm text-slate-500">{inflow ? "received" : "paid"} by {PAYMENT_METHOD_LABELS[p.method] ?? p.method}</div>
        </div>
        <DetailList
          items={[
            [inflow ? "Received from" : "Paid to", p.partyId ? <Link href={`${base}/parties/${p.partyId}`} className="font-semibold text-[#044d73] hover:underline print:text-slate-800">{p.partyName}</Link> : "Walk-in customer"],
            ["Against", doc ? <Link href={doc} className="font-semibold text-[#044d73] hover:underline print:text-slate-800">{p.documentNumber}</Link> : p.onAccount ? "On account (oldest documents first)" : "—"],
            ["Date", date(p.paymentDate)],
            ["Reference", p.referenceNumber ?? "—"],
            ["Location", p.locationName],
            ["Recorded by", `${p.createdByName ?? "—"} · ${dateTime(p.createdAt)}`],
          ]}
        />
        {p.notes && <p className="mt-4 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{p.notes}</p>}
      </Card>
      {voiding && (
        <VoidDialog
          open
          onClose={() => setVoiding(false)}
          path={`/api/payments/${p.id}/void`}
          what="payment"
          message="The amount goes back onto the account balance and any invoices or bills it settled become unpaid again."
          onDone={() => { setVoiding(false); reload(); }}
        />
      )}
    </div>
  );
}
