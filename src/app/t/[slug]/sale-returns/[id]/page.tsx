"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Ban, Printer } from "lucide-react";
import { VoidDialog } from "@/components/doc";
import { PrintHeader } from "@/components/print-header";
import { Alert, Badge, Button, Card, CardHeader, DetailList, ErrorState, LoadingBlock, PageHeader, StatusBadge, SummaryRow } from "@/components/ui/primitives";
import { useApi } from "@/lib/client/hooks";
import { PAYMENT_METHOD_LABELS } from "@/lib/client/labels";
import { useFmt, useSession } from "@/lib/client/session";
import { ProductName } from "@/components/product-name";

interface SaleReturn {
  id: string;
  number: string;
  saleId: string;
  invoiceNumber: string;
  customerName: string;
  partyId: string | null;
  returnDate: string;
  status: "POSTED" | "VOID";
  resolution: "REFUND" | "STORE_CREDIT";
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  reason: string | null;
  note: string | null;
  locationName: string;
  createdByName: string | null;
  items: { id: string; displayName: string; productId?: string; sku: string; unitCode: string; quantity: number; unitPrice: number; taxAmount: number; lineTotal: number; condition: string; restocked: boolean; serialNumbers: string[] }[];
  refunds: { id: string; number: string; amount: number; method: string; paymentDate: string; status: string }[];
}

export default function SaleReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { base, can, readOnly, settings } = useSession();
  const { money, qty, date } = useFmt();
  const { data, error, loading, reload } = useApi<{ saleReturn: SaleReturn }>(`/api/sale-returns/${id}`);
  const [voiding, setVoiding] = useState(false);
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (loading && !data) return <LoadingBlock />;
  if (!data) return null;
  const r = data.saleReturn;
  const meta: [string, React.ReactNode][] = [
    ["Date", date(r.returnDate)],
    ["Invoice", r.invoiceNumber],
    [
      "Customer",
      r.partyId ? (
        <Link href={`${base}/parties/${r.partyId}`} className="font-semibold text-[#044d73] hover:underline print:text-slate-800 print:no-underline">{r.customerName}</Link>
      ) : (
        r.customerName
      ),
    ],
  ];
  return (
    <div>
      <PageHeader
        back={{ href: `${base}/sale-returns`, label: "Sale returns" }}
        title={<span className="flex items-center gap-2">{r.number} <StatusBadge status={r.status} /></span>}
        subtitle={<>Return against <Link href={`${base}/sales/${r.saleId}`} className="font-semibold text-[#044d73] hover:underline">{r.invoiceNumber}</Link></>}
        actions={
          <>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print / PDF</Button>
            {r.status === "POSTED" && can("sales.manage") && !readOnly && <Button variant="ghost" icon={Ban} onClick={() => setVoiding(true)}>Void</Button>}
          </>
        }
      />
      {r.status === "VOID" && <div className="mb-4"><Alert>This return was voided; stock and refunds were reversed.</Alert></div>}
      <PrintHeader title="Credit note" number={r.number} meta={meta} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 sm:pl-5">Item</th>
                  <th className="px-3 py-2.5 text-right">Qty</th>
                  <th className="px-3 py-2.5">Condition</th>
                  <th className="px-4 py-2.5 text-right sm:pr-5">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.items.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-3 sm:pl-5">
                      <ProductName productId={i.productId} name={i.displayName} />
                      <div className="text-xs text-slate-400">{i.sku}</div>
                      {i.serialNumbers.length > 0 && <div className="font-mono text-xs text-slate-500">S/N: {i.serialNumbers.join(", ")}</div>}
                    </td>
                    <td className="px-3 py-3 text-right">{qty(i.quantity, i.unitCode)}</td>
                    <td className="px-3 py-3">{i.restocked ? <Badge tone="green">Restocked</Badge> : <Badge tone="red">Written off</Badge>}</td>
                    <td className="px-4 py-3 text-right font-semibold sm:pr-5">{money(i.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ml-auto max-w-xs space-y-0.5 p-4 sm:p-5">
            <SummaryRow label="Subtotal" value={money(r.subtotal)} />
            {r.taxAmount > 0 && <SummaryRow label={settings.taxLabel} value={money(r.taxAmount)} />}
            <SummaryRow label="Total" value={money(r.grandTotal)} strong />
          </div>
        </Card>
        <div className="space-y-6 print:hidden">
          <Card>
            <DetailList
              items={[
                ...meta,
                ["Resolution", <Badge key="r" tone={r.resolution === "REFUND" ? "amber" : "blue"}>{r.resolution === "REFUND" ? "Refund" : "Store credit"}</Badge>],
                ["Location", r.locationName],
                ["Recorded by", r.createdByName ?? "—"],
                ["Reason", r.reason ?? "—"],
              ]}
            />
            {r.note && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{r.note}</p>}
          </Card>
          {r.refunds.length > 0 && (
            <Card>
              <CardHeader title="Refunds" />
              <ul className="space-y-2 text-sm">
                {r.refunds.map((p) => (
                  <li key={p.id} className={`flex justify-between ${p.status === "VOID" ? "opacity-50" : ""}`}>
                    <span>
                      <Link href={`${base}/finance/payments/${p.id}`} className="font-semibold text-[#044d73] hover:underline">{p.number}</Link>{" "}
                      <span className="text-xs text-slate-500">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</span>
                    </span>
                    <span className="font-semibold">{money(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
      <VoidDialog
        open={voiding}
        onClose={() => setVoiding(false)}
        path={`/api/sale-returns/${r.id}/void`}
        what="return"
        message="Restocked items are taken out of stock again and any refund is voided."
        onDone={() => { setVoiding(false); reload(); }}
      />
    </div>
  );
}
