"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Ban, HandCoins, Printer, ReceiptText, Undo2 } from "lucide-react";
import { DocTotalsView, RecordPaymentModal, VoidDialog } from "@/components/doc";
import { PrintHeader } from "@/components/print-header";
import { Receipt, printReceipt, type ReceiptSale } from "@/components/receipt";
import { Alert, Badge, Button, Card, CardHeader, ErrorState, LinkButton, LoadingBlock, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { useApi } from "@/lib/client/hooks";
import { PAYMENT_METHOD_LABELS } from "@/lib/client/labels";
import { useFmt, useSession } from "@/lib/client/session";
import { ProductName } from "@/components/product-name";

interface SaleDetail extends ReceiptSale {
  id: string;
  channel: "POS" | "INVOICE";
  status: "POSTED" | "VOID";
  paymentStatus: string;
  partyId: string | null;
  partyPhone: string | null;
  partyTaxId: string | null;
  partyAddress: string | null;
  customerPhone: string | null;
  dueDate: string | null;
  totalCost: number;
  grossProfit: number;
  creditedAmount: number;
  balanceDue: number;
  note: string | null;
  voidReason: string | null;
  voidedAt: string | null;
  items: (ReceiptSale["items"][number] & { sku: string; lotNumber: string | null; expiryDate: string | null; taxRate: number; taxAmount: number; quantityReturned: number; returnableQuantity: number; unitCost: number })[];
  payments: { id: string; number: string; amount: number; method: string; paymentDate: string; referenceNumber: string | null; status: string }[];
  returns: { id: string; number: string; returnDate: string; status: string; grandTotal: number }[];
}

export default function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { base, can, readOnly, settings } = useSession();
  const { money, qty, date, dateTime } = useFmt();
  const { data, error, loading, reload } = useApi<{ sale: SaleDetail }>(`/api/sales/${id}`);
  const [paying, setPaying] = useState(false);
  const [voiding, setVoiding] = useState(false);
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (loading && !data) return <LoadingBlock />;
  if (!data) return null;
  const s = data.sale;
  const posted = s.status === "POSTED";
  const canManage = can("sales.manage") && !readOnly;
  const canPay = (can("sales.manage") || can("finance.manage")) && !readOnly;
  const returnable = s.items.some((i) => i.returnableQuantity > 0);
  const showCost = typeof s.grossProfit === "number";
  const customer = s.partyName ?? s.customerName ?? "Walk-in customer";

  return (
    <div>
      <PageHeader
        back={{ href: `${base}/sales`, label: "Sales" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {s.invoiceNumber} <StatusBadge status={posted ? s.paymentStatus : "VOID"} />
          </span>
        }
        subtitle={`${s.channel === "POS" ? "POS sale" : "Invoice"} · ${dateTime(s.saleDate)}${s.cashierName ? ` · by ${s.cashierName}` : ""}`}
        actions={
          <>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print / PDF</Button>
            {s.channel === "POS" && <Button variant="secondary" icon={ReceiptText} onClick={printReceipt}>Receipt</Button>}
            {posted && canPay && s.balanceDue > 0.004 && <Button icon={HandCoins} onClick={() => setPaying(true)}>Record payment</Button>}
            {posted && canManage && returnable && <LinkButton variant="secondary" icon={Undo2} href={`${base}/sale-returns/new?saleId=${s.id}`}>Return items</LinkButton>}
            {posted && canManage && !s.returns.some((r) => r.status === "POSTED") && <Button variant="ghost" icon={Ban} onClick={() => setVoiding(true)}>Void</Button>}
          </>
        }
      />
      {!posted && (
        <div className="mb-4 print:hidden">
          <Alert>Voided {s.voidedAt ? dateTime(s.voidedAt) : ""}{s.voidReason ? ` — ${s.voidReason}` : ""}. Stock and payments were reversed.</Alert>
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2 print:border-0 print:shadow-none">
          <PrintHeader screen title={settings.taxRegistered ? "Tax invoice" : "Invoice"} number={s.invoiceNumber} meta={[["Date", date(s.saleDate)], ...(s.dueDate ? ([["Due", date(s.dueDate)]] as [string, React.ReactNode][]) : [])]} />
          <div className="mb-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Bill to</div>
              <div className="font-semibold text-slate-800">
                {s.partyId ? <Link href={`${base}/parties/${s.partyId}`} className="hover:underline print:no-underline">{customer}</Link> : customer}
              </div>
              {(s.partyPhone ?? s.customerPhone) && <div className="text-slate-500">{s.partyPhone ?? s.customerPhone}</div>}
              {s.partyAddress && <div className="whitespace-pre-line text-slate-500">{s.partyAddress}</div>}
              {s.partyTaxId && <div className="text-slate-500">{settings.taxIdLabel}: {s.partyTaxId}</div>}
            </div>
            {s.locationName && (
              <div className="sm:text-right">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sold at</div>
                <div className="text-slate-700">{s.locationName}</div>
              </div>
            )}
          </div>
          <div className="-mx-4 overflow-x-auto sm:-mx-5">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 sm:pl-5">Item</th>
                  <th className="px-3 py-2.5 text-right">Qty</th>
                  <th className="px-3 py-2.5 text-right">Price</th>
                  <th className="px-3 py-2.5 text-right">Disc.</th>
                  {s.taxAmount > 0 && <th className="px-3 py-2.5 text-right">{settings.taxLabel}</th>}
                  <th className="px-4 py-2.5 text-right sm:pr-5">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {s.items.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-3 sm:pl-5">
                      <ProductName productId={i.productId} name={i.displayName} />
                      <div className="text-xs text-slate-400">
                        {i.sku}
                        {i.lotNumber ? ` · Batch ${i.lotNumber}` : ""}
                        {i.expiryDate ? ` · exp ${date(i.expiryDate)}` : ""}
                      </div>
                      {i.serials && i.serials.length > 0 && <div className="font-mono text-xs text-slate-500">S/N: {i.serials.join(", ")}</div>}
                      {i.quantityReturned > 0 && <Badge tone="amber">{qty(i.quantityReturned)} returned</Badge>}
                    </td>
                    <td className="px-3 py-3 text-right">{qty(i.quantity, i.unitCode)}</td>
                    <td className="px-3 py-3 text-right">{money(i.unitPrice)}</td>
                    <td className="px-3 py-3 text-right text-slate-500">{i.discount > 0 ? money(i.discount) : "—"}</td>
                    {s.taxAmount > 0 && <td className="px-3 py-3 text-right text-slate-500">{i.taxRate}%</td>}
                    <td className="px-4 py-3 text-right font-semibold sm:pr-5">{money(i.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <DocTotalsView
              subtotal={s.subtotal}
              discount={s.discount}
              otherCharges={s.otherCharges}
              taxAmount={s.taxAmount}
              taxMode={s.taxMode}
              roundOff={s.roundOff}
              grandTotal={s.grandTotal}
              paid={s.paidAmount}
              credited={s.creditedAmount}
              balance={posted ? s.balanceDue : undefined}
            />
          </div>
          {s.note && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{s.note}</p>}
          {settings.invoiceFooter && <p className="mt-6 whitespace-pre-line border-t border-slate-100 pt-3 text-center text-xs text-slate-500">{settings.invoiceFooter}</p>}
        </Card>

        <div className="space-y-6 print:hidden">
          {showCost && posted && s.grossProfit !== undefined && (
            <Card>
              <CardHeader title="Profit" />
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-2xl font-bold text-emerald-600">{money(s.grossProfit)}</div>
                  <div className="text-xs text-slate-500">Cost of goods {money(s.totalCost)}</div>
                </div>
                {s.grossProfit + s.totalCost > 0 && <Badge tone={s.grossProfit >= 0 ? "green" : "red"}>{Math.round((s.grossProfit / (s.grossProfit + s.totalCost)) * 100)}% margin</Badge>}
              </div>
            </Card>
          )}
          <Card padded={false}>
            <div className="p-4 sm:p-5">
              <CardHeader title="Payments" />
            </div>
            {s.payments.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-slate-400">No payments yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {s.payments.map((p) => (
                  <li key={p.id} className={`flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5 ${p.status === "VOID" ? "opacity-50" : ""}`}>
                    <div>
                      <Link href={`${base}/finance/payments/${p.id}`} className="font-semibold text-[#044d73] hover:underline">{p.number}</Link>
                      <div className="text-xs text-slate-500">{date(p.paymentDate)} · {PAYMENT_METHOD_LABELS[p.method] ?? p.method}{p.referenceNumber ? ` · ${p.referenceNumber}` : ""}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{money(p.amount)}</div>
                      {p.status === "VOID" && <Badge tone="red">Void</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {s.amountTendered !== null && s.changeGiven > 0 && (
              <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Cash tendered {money(s.amountTendered)} · change {money(s.changeGiven)}</div>
            )}
          </Card>
          {s.returns.length > 0 && (
            <Card padded={false}>
              <div className="p-4 sm:p-5"><CardHeader title="Returns" /></div>
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {s.returns.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm sm:px-5">
                    <div>
                      <Link href={`${base}/sale-returns/${r.id}`} className="font-semibold text-[#044d73] hover:underline">{r.number}</Link>
                      <div className="text-xs text-slate-500">{date(r.returnDate)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{money(r.grandTotal)}</div>
                      <StatusBadge status={r.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
      {paying && (
        <RecordPaymentModal
          open
          onClose={() => setPaying(false)}
          path={`/api/sales/${s.id}/payments`}
          balance={s.balanceDue}
          title="Receive payment"
          onDone={() => { setPaying(false); reload(); }}
        />
      )}
      <VoidDialog
        open={voiding}
        onClose={() => setVoiding(false)}
        path={`/api/sales/${s.id}/void`}
        what="sale"
        message="Stock goes back on the shelf and any payments on this sale are voided. The invoice number stays in your records as void."
        onDone={() => { setVoiding(false); reload(); }}
      />
      <Receipt sale={s} />
    </div>
  );
}
