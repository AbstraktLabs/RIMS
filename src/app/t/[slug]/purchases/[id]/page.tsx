"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Ban, Printer, Undo2, Wallet } from "lucide-react";
import { DocTotalsView, RecordPaymentModal, VoidDialog } from "@/components/doc";
import { PrintHeader } from "@/components/print-header";
import { Alert, Badge, Button, Card, CardHeader, DetailList, ErrorState, LinkButton, LoadingBlock, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { useApi } from "@/lib/client/hooks";
import { PAYMENT_METHOD_LABELS } from "@/lib/client/labels";
import { useFmt, useSession } from "@/lib/client/session";

interface Purchase {
  id: string;
  number: string;
  supplierInvoiceNumber: string | null;
  purchaseDate: string;
  dueDate: string | null;
  status: "POSTED" | "VOID";
  taxMode: string;
  subtotal: number;
  discount: number;
  otherCharges: number;
  taxAmount: number;
  roundOff: number;
  grandTotal: number;
  paidAmount: number;
  paymentStatus: string;
  creditedAmount: number;
  balanceDue: number;
  note: string | null;
  partyId: string;
  partyName: string;
  partyPhone: string | null;
  locationName: string;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
  createdByName: string | null;
  createdAt: string;
  voidReason: string | null;
  items: {
    id: string;
    displayName: string;
    sku: string;
    unitCode: string;
    trackSerials: boolean;
    quantity: number;
    quantityReturned: number;
    unitCost: number;
    discount: number;
    taxRate: number;
    taxAmount: number;
    lineTotal: number;
    landedUnitCost: number;
    lotNumber: string | null;
    manufacturingDate: string | null;
    expiryDate: string | null;
    serials: string[];
    returnableQuantity: number;
  }[];
  payments: { id: string; number: string; amount: number; method: string; paymentDate: string; referenceNumber: string | null; status: string }[];
  returns: { id: string; number: string; returnDate: string; status: string; resolution: string | null; grandTotal: number }[];
}

export default function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { base, can, readOnly } = useSession();
  const { money, qty, date, dateTime } = useFmt();
  const { data, error, loading, reload } = useApi<{ purchase: Purchase }>(`/api/purchases/${id}`);
  const [modal, setModal] = useState<"pay" | "void" | null>(null);
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (loading && !data) return <LoadingBlock />;
  if (!data) return null;
  const p = data.purchase;
  const posted = p.status === "POSTED";
  const canManage = can("purchases.manage") && !readOnly;
  const canPay = (can("finance.manage") || can("purchases.manage")) && !readOnly;
  const returnable = p.items.some((i) => i.returnableQuantity > 0);
  const showLanded = p.otherCharges > 0 || p.discount > 0;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = posted && p.balanceDue > 0.004 && p.dueDate && p.dueDate < today;

  return (
    <div>
      <PageHeader
        back={{ href: `${base}/purchases`, label: "Purchases" }}
        title={<span className="flex flex-wrap items-center gap-2">{p.number} <StatusBadge status={posted ? p.paymentStatus : "VOID"} />{overdue && <Badge tone="red">Overdue</Badge>}</span>}
        subtitle={`${p.partyName} · ${date(p.purchaseDate)}${p.supplierInvoiceNumber ? ` · supplier invoice ${p.supplierInvoiceNumber}` : ""}`}
        actions={
          <>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print / PDF</Button>
            {posted && canPay && p.balanceDue > 0.004 && <Button icon={Wallet} onClick={() => setModal("pay")}>Pay supplier</Button>}
            {posted && canManage && returnable && <LinkButton variant="secondary" icon={Undo2} href={`${base}/purchase-returns/new?purchaseId=${p.id}`}>Return to supplier</LinkButton>}
            {posted && canManage && <Button variant="ghost" icon={Ban} onClick={() => setModal("void")}>Void</Button>}
          </>
        }
      />
      {p.status === "VOID" && <div className="mb-4"><Alert>This purchase was voided{p.voidReason ? `: ${p.voidReason}` : ""}. Its stock and supplier balance were reversed.</Alert></div>}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2 print:border-0 print:shadow-none">
          <PrintHeader
            screen
            title="Purchase bill"
            number={p.number}
            meta={[["Date", date(p.purchaseDate)], ...(p.supplierInvoiceNumber ? ([["Supplier invoice", p.supplierInvoiceNumber]] as [string, React.ReactNode][]) : []), ...(p.dueDate ? ([["Due", date(p.dueDate)]] as [string, React.ReactNode][]) : [])]}
          />
          <div className="mb-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Supplier</div>
              <Link href={`${base}/parties/${p.partyId}`} className="font-semibold text-slate-800 hover:underline print:no-underline">{p.partyName}</Link>
              {p.partyPhone && <div className="text-slate-500">{p.partyPhone}</div>}
            </div>
            <div className="sm:text-right">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Received at</div>
              <div className="text-slate-700">{p.locationName}</div>
              {p.purchaseOrderId && (
                <div className="text-xs text-slate-500">
                  Against <Link href={`${base}/purchase-orders/${p.purchaseOrderId}`} className="font-semibold text-[#044d73] hover:underline">{p.purchaseOrderNumber}</Link>
                </div>
              )}
            </div>
          </div>
          <div className="-mx-4 overflow-x-auto sm:-mx-5">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 sm:pl-5">Item</th>
                  <th className="px-3 py-2.5 text-right">Qty</th>
                  <th className="px-3 py-2.5 text-right">Unit cost</th>
                  {showLanded && <th className="px-3 py-2.5 text-right print:hidden" title="Cost per unit after bill discount and freight">Landed</th>}
                  <th className="px-4 py-2.5 text-right sm:pr-5">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {p.items.map((i) => (
                  <tr key={i.id} className="align-top">
                    <td className="px-4 py-3 sm:pl-5">
                      <div className="font-semibold text-slate-800">{i.displayName}</div>
                      <div className="text-xs text-slate-400">
                        {i.sku}
                        {i.lotNumber && ` · Batch ${i.lotNumber}`}
                        {i.expiryDate && ` · Exp ${date(i.expiryDate)}`}
                        {i.taxRate > 0 && ` · ${i.taxRate}%`}
                      </div>
                      {i.serials.length > 0 && <div className="mt-1 text-xs text-slate-500">S/N: {i.serials.join(", ")}</div>}
                      {i.quantityReturned > 0 && <div className="mt-1"><Badge tone="amber">{qty(i.quantityReturned)} returned</Badge></div>}
                    </td>
                    <td className="px-3 py-3 text-right">{qty(i.quantity, i.unitCode)}</td>
                    <td className="px-3 py-3 text-right">{money(i.unitCost)}{i.discount > 0 && <div className="text-xs text-slate-400">− {money(i.discount)}</div>}</td>
                    {showLanded && <td className="px-3 py-3 text-right text-slate-500 print:hidden">{money(i.landedUnitCost)}</td>}
                    <td className="px-4 py-3 text-right font-semibold sm:pr-5">{money(i.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <DocTotalsView
              subtotal={p.subtotal}
              discount={p.discount}
              otherCharges={p.otherCharges}
              taxAmount={p.taxAmount}
              taxMode={p.taxMode}
              roundOff={p.roundOff}
              grandTotal={p.grandTotal}
              paid={p.paidAmount}
              credited={p.creditedAmount}
              balance={posted ? p.balanceDue : undefined}
            />
          </div>
          {p.note && <p className="mt-4 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{p.note}</p>}
        </Card>
        <div className="space-y-6 print:hidden">
          <Card padded={false}>
            <div className="p-4 sm:p-5"><CardHeader title="Payments to supplier" /></div>
            {p.payments.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-slate-400">Nothing paid yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {p.payments.map((x) => (
                  <li key={x.id} className={`flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5 ${x.status === "VOID" ? "opacity-50" : ""}`}>
                    <div>
                      <Link href={`${base}/finance/payments/${x.id}`} className="font-semibold text-[#044d73] hover:underline">{x.number}</Link>
                      <div className="text-xs text-slate-500">{date(x.paymentDate)} · {PAYMENT_METHOD_LABELS[x.method] ?? x.method}{x.referenceNumber ? ` · ${x.referenceNumber}` : ""}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{money(x.amount)}</div>
                      {x.status === "VOID" && <Badge tone="red">Void</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {p.returns.length > 0 && (
            <Card padded={false}>
              <div className="p-4 sm:p-5"><CardHeader title="Returns to supplier" /></div>
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {p.returns.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm sm:px-5">
                    <div>
                      <Link href={`${base}/purchase-returns/${r.id}`} className="font-semibold text-[#044d73] hover:underline">{r.number}</Link>
                      <div className="text-xs text-slate-500">{date(r.returnDate)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{money(r.grandTotal)}</div>
                      <StatusBadge status={r.resolution ?? r.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <DetailList
              items={[
                ["Due date", p.dueDate ? date(p.dueDate) : "—"],
                ["Tax", p.taxMode === "INCLUSIVE" ? "Included in costs" : p.taxMode === "EXEMPT" ? "Exempt" : "Added on top"],
                ["Recorded", `${dateTime(p.createdAt)}${p.createdByName ? ` · ${p.createdByName}` : ""}`],
              ]}
            />
          </Card>
        </div>
      </div>
      {modal === "pay" && <RecordPaymentModal open onClose={() => setModal(null)} path={`/api/purchases/${p.id}/payments`} balance={p.balanceDue} title="Pay supplier" onDone={() => { setModal(null); reload(); }} />}
      <VoidDialog
        open={modal === "void"}
        onClose={() => setModal(null)}
        path={`/api/purchases/${p.id}/void`}
        what="purchase"
        message="The goods are taken back out of stock and the amount is removed from the supplier’s balance. This can’t be undone. Purchases whose stock has already been sold can’t be voided."
        onDone={() => { setModal(null); reload(); }}
      />
    </div>
  );
}
