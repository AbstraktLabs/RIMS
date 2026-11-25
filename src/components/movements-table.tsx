"use client";

import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { DateRangeInputs, FilterSelect } from "@/components/ui/form";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { DataTable, Pagination, TableCard } from "@/components/ui/table";
import { LocationSelect } from "@/components/pickers";
import { useList } from "@/lib/client/hooks";
import { MOVEMENT_LABELS, docHref } from "@/lib/client/labels";
import { useFmt, useSession } from "@/lib/client/session";

interface Movement {
  id: string;
  occurredAt: string;
  type: string;
  variantId: string;
  displayName: string;
  sku: string;
  unitCode: string;
  locationName: string;
  lotNumber: string | null;
  quantity: number;
  unitCost: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  userName: string | null;
}

/** Stock movement ledger — used on its own page and inside product details. */
export function MovementsTable({ productId, variantId }: { productId?: string; variantId?: string }) {
  const { base, settings, can } = useSession();
  const { dateTime, qty, money } = useFmt();
  const showCost = can("purchases.view") || can("inventory.manage");
  const list = useList<Movement, { type: string; locationId: string; from: string; to: string }>(
    "/api/inventory/movements",
    { type: "", locationId: "all", from: "", to: "" },
    { productId, variantId },
  );
  const { filters: f, set, setFilters } = list;
  return (
    <TableCard
      toolbar={
        <>
          <FilterSelect
            label="Type"
            value={f.type}
            onChange={(v) => set("type", v)}
            options={[{ value: "", label: "All movements" }, ...Object.entries(MOVEMENT_LABELS).map(([value, m]) => ({ value, label: m.label }))]}
          />
          {settings.enableMultiLocation && (
            <div className="w-44">
              <LocationSelect includeAll value={f.locationId} onChange={(v) => set("locationId", v)} />
            </div>
          )}
          <DateRangeInputs from={f.from} to={f.to} onChange={(r) => { setFilters((x) => ({ ...x, ...r })); list.setPage(1); }} />
        </>
      }
    >
      <DataTable
        rows={list.data?.items}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={ArrowLeftRight} title="No stock movements" description="Purchases, sales, adjustments and transfers show up here." />}
        columns={[
          { key: "d", header: "When", cell: (r) => <span className="whitespace-nowrap text-slate-600">{dateTime(r.occurredAt)}</span> },
          ...(productId && !variantId
            ? []
            : [{ key: "p", header: "Product", cell: (r: Movement) => <div><div className="font-semibold text-slate-800">{r.displayName}</div><div className="text-xs text-slate-400">{r.sku}</div></div> }]),
          ...(productId ? [{ key: "v", header: "Variant", cell: (r: Movement) => <span className="text-slate-700">{r.displayName}</span> }] : []),
          {
            key: "t",
            header: "Type",
            cell: (r) => {
              const m = MOVEMENT_LABELS[r.type] ?? { label: r.type, tone: "slate" as const };
              const href = docHref(base, r.referenceType, r.referenceId);
              return (
                <div className="flex flex-col items-start gap-0.5">
                  <Badge tone={m.tone}>{m.label}</Badge>
                  {href && <Link href={href} onClick={(e) => e.stopPropagation()} className="text-xs font-semibold text-[#044d73] hover:underline">Open document →</Link>}
                </div>
              );
            },
          },
          { key: "l", header: "Location", cell: (r) => r.locationName, hideBelow: "md" },
          ...(settings.enableBatchTracking ? [{ key: "b", header: "Batch", hideBelow: "lg" as const, cell: (r: Movement) => r.lotNumber ?? "—" }] : []),
          {
            key: "q",
            header: "Qty",
            align: "right",
            cell: (r) => <span className={`font-semibold ${r.quantity < 0 ? "text-rose-600" : "text-emerald-600"}`}>{r.quantity > 0 ? "+" : ""}{qty(r.quantity, r.unitCode)}</span>,
          },
          ...(showCost ? [{ key: "c", header: "Unit cost", align: "right" as const, hideBelow: "md" as const, cell: (r: Movement) => money(r.unitCost) }] : []),
          { key: "bal", header: "Balance", align: "right", cell: (r) => qty(r.balanceAfter) },
          { key: "u", header: "By", hideBelow: "lg", cell: (r) => <span className="text-slate-500">{r.userName ?? "—"}</span> },
        ]}
        footer={list.data && <Pagination page={list.page} totalPages={list.data.totalPages} total={list.data.total} onPage={list.setPage} />}
      />
    </TableCard>
  );
}
