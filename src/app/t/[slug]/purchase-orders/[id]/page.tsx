"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, PackageCheck, Pencil, Printer, Send, Trash2, Undo2, XCircle } from "lucide-react";
import { DocTotalsView } from "@/components/doc";
import type { PurchaseOrder } from "@/components/po-form";
import { PrintHeader } from "@/components/print-header";
import { ConfirmDialog } from "@/components/ui/modal";
import { Button, Card, CardHeader, ErrorState, LinkButton, LoadingBlock, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { del, post } from "@/lib/client/api";
import { useAction, useApi } from "@/lib/client/hooks";
import { useFmt, useSession } from "@/lib/client/session";

type Act = { kind: "status"; status: "SENT" | "DRAFT" | "CANCELLED" | "RECEIVED" } | { kind: "delete" };

export default function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { base, can, readOnly, settings } = useSession();
  const { money, qty, date, dateTime } = useFmt();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useApi<{ purchaseOrder: PurchaseOrder }>(`/api/purchase-orders/${id}`);
  const [act, setAct] = useState<Act | null>(null);
  const action = useAction();
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (loading && !data) return <LoadingBlock />;
  if (!data) return null;
  const po = data.purchaseOrder;
  const canManage = can("purchases.manage") && !readOnly;
  const editable = po.status === "DRAFT" || po.status === "SENT";
  const receivable = po.status === "SENT" || po.status === "PARTIALLY_RECEIVED" || po.status === "DRAFT";
  const copy = (a: Act) => {
    if (a.kind === "delete") return { title: `Delete ${po.number}?`, message: "The order will be removed permanently.", label: "Delete", danger: true };
    return {
      SENT: { title: "Mark as sent?", message: "Use this once you’ve sent the order to the supplier.", label: "Mark sent", danger: false },
      DRAFT: { title: "Move back to draft?", message: "The order goes back to draft for changes.", label: "Back to draft", danger: false },
      CANCELLED: { title: `Cancel ${po.number}?`, message: "Nothing more will be received against this order.", label: "Cancel order", danger: true },
      RECEIVED: { title: "Close this order?", message: "Marks the order as complete even though some items never arrived.", label: "Close order", danger: false },
    }[a.status];
  };

  return (
    <div>
      <PageHeader
        back={{ href: `${base}/purchase-orders`, label: "Purchase orders" }}
        title={<span className="flex flex-wrap items-center gap-2">{po.number} <StatusBadge status={po.status} /></span>}
        subtitle={`${po.partyName} · ordered ${date(po.orderDate)}${po.expectedDate ? ` · expected ${date(po.expectedDate)}` : ""}`}
        actions={
          <>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print / PDF</Button>
            {canManage && receivable && <LinkButton icon={PackageCheck} href={`${base}/purchases/new?poId=${po.id}`}>Receive goods</LinkButton>}
            {canManage && po.status === "DRAFT" && <Button variant="secondary" icon={Send} onClick={() => setAct({ kind: "status", status: "SENT" })}>Mark sent</Button>}
            {canManage && po.status === "SENT" && <Button variant="ghost" icon={Undo2} onClick={() => setAct({ kind: "status", status: "DRAFT" })}>To draft</Button>}
            {canManage && editable && po.receipts.length === 0 && <LinkButton variant="secondary" icon={Pencil} href={`${base}/purchase-orders/${po.id}/edit`}>Edit</LinkButton>}
            {canManage && po.status === "PARTIALLY_RECEIVED" && <Button variant="secondary" icon={CheckCheck} onClick={() => setAct({ kind: "status", status: "RECEIVED" })}>Close order</Button>}
            {canManage && editable && <Button variant="ghost" icon={XCircle} onClick={() => setAct({ kind: "status", status: "CANCELLED" })}>Cancel</Button>}
            {canManage && (po.status === "DRAFT" || po.status === "CANCELLED") && po.receipts.length === 0 && <Button variant="ghost" icon={Trash2} onClick={() => setAct({ kind: "delete" })}>Delete</Button>}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2 print:border-0 print:shadow-none">
          <PrintHeader screen title="Purchase order" number={po.number} meta={[["Date", date(po.orderDate)], ...(po.expectedDate ? ([["Expected", date(po.expectedDate)]] as [string, React.ReactNode][]) : [])]} />
          <div className="mb-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Supplier</div>
              <Link href={`${base}/parties/${po.partyId}`} className="font-semibold text-slate-800 hover:underline print:no-underline">{po.partyName}</Link>
              {po.partyPhone && <div className="text-slate-500">{po.partyPhone}</div>}
            </div>
            <div className="sm:text-right">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Deliver to</div>
              <div className="text-slate-700">{po.locationName}</div>
            </div>
          </div>
          <div className="-mx-4 overflow-x-auto sm:-mx-5">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 sm:pl-5">Item</th>
                  <th className="px-3 py-2.5 text-right">Ordered</th>
                  <th className="px-3 py-2.5 text-right print:hidden">Received</th>
                  <th className="px-3 py-2.5 text-right">Unit cost</th>
                  {po.taxAmount > 0 && <th className="px-3 py-2.5 text-right">{settings.taxLabel}</th>}
                  <th className="px-4 py-2.5 text-right sm:pr-5">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {po.items.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-3 sm:pl-5">
                      <div className="font-semibold text-slate-800">{i.displayName}</div>
                      <div className="text-xs text-slate-400">{i.sku}</div>
                    </td>
                    <td className="px-3 py-3 text-right">{qty(i.quantity, i.unitCode)}</td>
                    <td className={`px-3 py-3 text-right print:hidden ${i.quantityPending > 0 ? "text-amber-600" : "text-emerald-600"}`}>{qty(i.quantityReceived)}</td>
                    <td className="px-3 py-3 text-right">{money(i.unitCost)}</td>
                    {po.taxAmount > 0 && <td className="px-3 py-3 text-right text-slate-500">{i.taxRate}%</td>}
                    <td className="px-4 py-3 text-right font-semibold sm:pr-5">{money(i.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <DocTotalsView subtotal={po.subtotal} discount={po.discount} otherCharges={po.otherCharges} taxAmount={po.taxAmount} taxMode={po.taxMode} grandTotal={po.grandTotal} />
          </div>
          {po.note && <p className="mt-4 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{po.note}</p>}
        </Card>
        <div className="space-y-6 print:hidden">
          <Card padded={false}>
            <div className="p-4 sm:p-5"><CardHeader title="Goods received" subtitle="Purchases recorded against this order" /></div>
            {po.receipts.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-slate-400">Nothing received yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {po.receipts.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm sm:px-5">
                    <div>
                      <Link href={`${base}/purchases/${r.id}`} className="font-semibold text-[#044d73] hover:underline">{r.number}</Link>
                      <div className="text-xs text-slate-500">{date(r.purchaseDate)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{money(r.grandTotal)}</div>
                      <StatusBadge status={r.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <p className="text-xs text-slate-500">Created {dateTime(po.createdAt)}{po.createdByName ? ` by ${po.createdByName}` : ""}</p>
          </Card>
        </div>
      </div>
      {act && (
        <ConfirmDialog
          open
          onClose={() => setAct(null)}
          title={copy(act).title}
          message={copy(act).message}
          confirmLabel={copy(act).label}
          danger={copy(act).danger}
          busy={action.busy}
          error={action.error}
          onConfirm={() =>
            action.run(async () => {
              if (act.kind === "delete") {
                await del(`/api/purchase-orders/${po.id}`);
                toast("Order deleted");
                router.push(`${base}/purchase-orders`);
                return;
              }
              const r = await post<{ purchaseOrder: PurchaseOrder }>(`/api/purchase-orders/${po.id}/status`, { status: act.status });
              setData(r);
              setAct(null);
              toast("Order updated");
            })
          }
        />
      )}
    </div>
  );
}
