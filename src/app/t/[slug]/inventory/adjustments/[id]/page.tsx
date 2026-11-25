"use client";

import { use } from "react";
import { Printer } from "lucide-react";
import { PrintHeader } from "@/components/print-header";
import { Badge, Button, Card, DetailList, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/primitives";
import { useApi } from "@/lib/client/hooks";
import { ADJUSTMENT_REASONS } from "@/lib/client/labels";
import { useFmt, useSession } from "@/lib/client/session";
import { ProductName } from "@/components/product-name";

interface Adjustment {
  id: string;
  number: string;
  adjustmentDate: string;
  reason: string;
  totalValue: number;
  note: string | null;
  locationName: string;
  createdByName: string | null;
  createdAt: string;
  items: {
    id: string;
    displayName: string; productId?: string;
    sku: string;
    unitCode: string;
    lotNumber: string | null;
    expiryDate: string | null;
    quantity: number;
    unitCost: number;
    lineValue: number;
    serialNumbers: string[];
    note: string | null;
  }[];
}

export default function AdjustmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { base, can } = useSession();
  const { money, qty, date, dateTime } = useFmt();
  const { data, error, loading, reload } = useApi<{ adjustment: Adjustment }>(`/api/inventory/adjustments/${id}`);
  const showCost = can("purchases.view") || can("inventory.manage");
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (loading || !data) return <LoadingBlock />;
  const a = data.adjustment;
  const meta: [string, React.ReactNode][] = [
    ["Date", date(a.adjustmentDate)],
    ["Reason", ADJUSTMENT_REASONS[a.reason] ?? a.reason],
    ["Location", a.locationName],
    ["Recorded by", a.createdByName ?? "—"],
  ];
  return (
    <div>
      <PageHeader
        back={{ href: `${base}/inventory/adjustments`, label: "Adjustments" }}
        title={a.number}
        subtitle={`Recorded ${dateTime(a.createdAt)}`}
        actions={<Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print / PDF</Button>}
      />
      <PrintHeader title="Stock adjustment" number={a.number} meta={meta} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 sm:pl-5">Product</th>
                  <th className="px-3 py-2.5">Batch / serials</th>
                  <th className="px-3 py-2.5 text-right">Qty</th>
                  {showCost && <th className="px-3 py-2.5 text-right">Unit cost</th>}
                  {showCost && <th className="px-4 py-2.5 text-right sm:pr-5">Value</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {a.items.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-3 sm:pl-5">
                      <ProductName productId={i.productId} name={i.displayName} />
                      <div className="text-xs text-slate-400">{i.sku}</div>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      {i.lotNumber && <div>Batch {i.lotNumber}{i.expiryDate ? ` · exp ${date(i.expiryDate)}` : ""}</div>}
                      {i.serialNumbers.length > 0 && <div className="font-mono">{i.serialNumbers.join(", ")}</div>}
                      {!i.lotNumber && !i.serialNumbers.length && "—"}
                    </td>
                    <td className={`px-3 py-3 text-right font-semibold ${i.quantity < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                      {i.quantity > 0 ? "+" : ""}
                      {qty(i.quantity, i.unitCode)}
                    </td>
                    {showCost && <td className="px-3 py-3 text-right">{money(i.unitCost)}</td>}
                    {showCost && <td className="px-4 py-3 text-right sm:pr-5">{money(i.lineValue)}</td>}
                  </tr>
                ))}
              </tbody>
              {showCost && (
                <tfoot>
                  <tr className="border-t border-slate-200">
                    <td colSpan={4} className="px-4 py-3 text-right text-sm font-semibold text-slate-600 sm:pl-5">Total value change</td>
                    <td className={`px-4 py-3 text-right font-bold sm:pr-5 ${a.totalValue < 0 ? "text-rose-600" : "text-emerald-600"}`}>{money(a.totalValue)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
        <Card className="print:hidden">
          <DetailList items={[...meta, ["Items", <Badge key="i">{a.items.length}</Badge>]]} />
          {a.note && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{a.note}</p>}
        </Card>
      </div>
    </div>
  );
}
