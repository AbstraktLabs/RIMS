"use client";

import { use, useState } from "react";
import { ArrowRight, CheckCircle2, Printer, Send, XCircle } from "lucide-react";
import { PrintHeader } from "@/components/print-header";
import { ConfirmDialog } from "@/components/ui/modal";
import { Button, Card, CardHeader, DetailList, ErrorState, LoadingBlock, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { post } from "@/lib/client/api";
import { useAction, useApi } from "@/lib/client/hooks";
import { useFmt, useSession } from "@/lib/client/session";

interface Transfer {
  id: string;
  number: string;
  status: "DRAFT" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
  transferDate: string;
  fromLocationId: string;
  fromLocationName: string;
  toLocationId: string;
  toLocationName: string;
  dispatchedAt: string | null;
  receivedAt: string | null;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
  totalQuantity: number;
  totalValue: number;
  items: { id: string; displayName: string; sku: string; unitCode: string; lotNumber: string | null; expiryDate: string | null; quantity: number; unitCost: number; serialNumbers: string[] }[];
}

type Action = "dispatch" | "receive" | "cancel";

export default function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { base, can, readOnly, session } = useSession();
  const { money, qty, date, dateTime } = useFmt();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useApi<{ transfer: Transfer }>(`/api/inventory/transfers/${id}`);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const act = useAction();
  const showCost = can("purchases.view") || can("inventory.manage");
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (loading || !data) return <LoadingBlock />;
  const t = data.transfer;
  const editable = can("inventory.manage") && !readOnly;
  const mine = new Set(session.locations.map((l) => l.id));
  const meta: [string, React.ReactNode][] = [
    ["Date", date(t.transferDate)],
    ["From", t.fromLocationName],
    ["To", t.toLocationName],
    ["Status", <StatusBadge key="s" status={t.status} />],
  ];
  const copy: Record<Action, { title: string; message: string; label: string; done: string }> = {
    dispatch: { title: "Dispatch this transfer?", message: `Stock leaves ${t.fromLocationName} now and is in transit until ${t.toLocationName} receives it.`, label: "Dispatch", done: "Transfer dispatched" },
    receive: { title: "Mark as received?", message: `Adds the stock to ${t.toLocationName}. Make sure everything arrived.`, label: "Receive", done: "Stock received" },
    cancel: {
      title: "Cancel this transfer?",
      message: t.status === "IN_TRANSIT" ? `The stock goes back to ${t.fromLocationName}.` : "The draft will be cancelled.",
      label: "Cancel transfer",
      done: "Transfer cancelled",
    },
  };

  return (
    <div>
      <PageHeader
        back={{ href: `${base}/inventory/transfers`, label: "Transfers" }}
        title={
          <span className="flex items-center gap-2">
            {t.number} <StatusBadge status={t.status} />
          </span>
        }
        subtitle={
          <span className="flex items-center gap-1.5">
            {t.fromLocationName} <ArrowRight className="h-3.5 w-3.5" /> {t.toLocationName}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print / PDF</Button>
            {editable && t.status === "DRAFT" && mine.has(t.fromLocationId) && <Button icon={Send} onClick={() => { act.setError(null); setConfirm("dispatch"); }}>Dispatch</Button>}
            {editable && t.status === "IN_TRANSIT" && mine.has(t.toLocationId) && <Button icon={CheckCircle2} onClick={() => { act.setError(null); setConfirm("receive"); }}>Receive</Button>}
            {editable && (t.status === "DRAFT" || t.status === "IN_TRANSIT") && mine.has(t.fromLocationId) && (
              <Button variant="ghost" icon={XCircle} onClick={() => { act.setError(null); setConfirm("cancel"); }}>Cancel</Button>
            )}
          </>
        }
      />
      <PrintHeader title="Stock transfer" number={t.number} meta={meta} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 sm:pl-5">Product</th>
                  <th className="px-3 py-2.5">Batch / serials</th>
                  <th className="px-3 py-2.5 text-right">Qty</th>
                  {showCost && <th className="px-4 py-2.5 text-right sm:pr-5">Value</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {t.items.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-3 sm:pl-5">
                      <div className="font-semibold text-slate-800">{i.displayName}</div>
                      <div className="text-xs text-slate-400">{i.sku}</div>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      {i.lotNumber && <div>Batch {i.lotNumber}{i.expiryDate ? ` · exp ${date(i.expiryDate)}` : ""}</div>}
                      {i.serialNumbers.length > 0 && <div className="font-mono">{i.serialNumbers.join(", ")}</div>}
                      {!i.lotNumber && !i.serialNumbers.length && (t.status === "DRAFT" ? "Chosen at dispatch" : "—")}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">{qty(i.quantity, i.unitCode)}</td>
                    {showCost && <td className="px-4 py-3 text-right sm:pr-5">{money(i.quantity * i.unitCost)}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 font-semibold">
                  <td colSpan={2} className="px-4 py-3 text-right text-slate-600 sm:pl-5">Total</td>
                  <td className="px-3 py-3 text-right">{qty(t.totalQuantity)}</td>
                  {showCost && <td className="px-4 py-3 text-right sm:pr-5">{money(t.totalValue)}</td>}
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
        <div className="space-y-6 print:hidden">
          <Card>
            <CardHeader title="Progress" />
            <ol className="space-y-3 text-sm">
              {[
                ["Created", t.createdAt, t.createdByName],
                ["Dispatched", t.dispatchedAt, null],
                [t.status === "CANCELLED" ? "Cancelled" : "Received", t.status === "CANCELLED" ? "cancelled" : t.receivedAt, null],
              ].map(([label, at, who]) => (
                <li key={label as string} className="flex items-start gap-3">
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${at ? (label === "Cancelled" ? "bg-rose-500" : "bg-emerald-500") : "bg-slate-200"}`} />
                  <div>
                    <div className={`font-semibold ${at ? "text-slate-800" : "text-slate-400"}`}>{label}</div>
                    {at && at !== "cancelled" && <div className="text-xs text-slate-500">{dateTime(at as string)}{who ? ` · ${who}` : ""}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
          <Card>
            <DetailList items={meta} />
            {t.note && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{t.note}</p>}
          </Card>
        </div>
      </div>
      {confirm && (
        <ConfirmDialog
          open
          onClose={() => setConfirm(null)}
          title={copy[confirm].title}
          message={copy[confirm].message}
          confirmLabel={copy[confirm].label}
          danger={confirm === "cancel"}
          busy={act.busy}
          error={act.error}
          onConfirm={() =>
            act.run(async () => {
              const r = await post<{ transfer: Transfer }>(`/api/inventory/transfers/${t.id}/${confirm}`);
              setData(r);
              toast(copy[confirm].done);
              setConfirm(null);
            })
          }
        />
      )}
    </div>
  );
}
