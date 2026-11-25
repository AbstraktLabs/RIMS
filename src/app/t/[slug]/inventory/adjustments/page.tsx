"use client";

import { useRouter } from "next/navigation";
import { Plus, SlidersHorizontal } from "lucide-react";
import { DateRangeInputs, FilterSelect, SearchInput } from "@/components/ui/form";
import { Badge, EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { DataTable, Pagination, TableCard } from "@/components/ui/table";
import { LocationSelect } from "@/components/pickers";
import { useList } from "@/lib/client/hooks";
import { ADJUSTMENT_REASONS } from "@/lib/client/labels";
import { useFmt, useSession } from "@/lib/client/session";

interface AdjRow {
  id: string;
  number: string;
  adjustmentDate: string;
  reason: string;
  totalValue: number;
  note: string | null;
  locationName: string;
  createdByName: string | null;
  itemCount: number;
}

export default function AdjustmentsPage() {
  const { base, can, readOnly, settings } = useSession();
  const { money, date } = useFmt();
  const router = useRouter();
  const list = useList<AdjRow, { search: string; reason: string; locationId: string; from: string; to: string }>("/api/inventory/adjustments", {
    search: "",
    reason: "",
    locationId: "all",
    from: "",
    to: "",
  });
  const { filters: f, set, setFilters } = list;
  const showCost = can("purchases.view") || can("inventory.manage");
  return (
    <div>
      <PageHeader
        title="Stock adjustments"
        subtitle="Opening stock, counts, damage, loss and other corrections"
        actions={can("inventory.manage") && !readOnly && <LinkButton href={`${base}/inventory/adjustments/new`} icon={Plus}>New adjustment</LinkButton>}
      />
      <TableCard
        toolbar={
          <>
            <SearchInput className="w-full sm:w-60" value={f.search} onChange={(v) => set("search", v)} placeholder="Number or note…" />
            <FilterSelect label="Reason" value={f.reason} onChange={(v) => set("reason", v)} options={[{ value: "", label: "All reasons" }, ...Object.entries(ADJUSTMENT_REASONS).map(([value, label]) => ({ value, label }))]} />
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
          onRowClick={(r) => router.push(`${base}/inventory/adjustments/${r.id}`)}
          empty={
            <EmptyState
              icon={SlidersHorizontal}
              title="No adjustments"
              description="Use an adjustment to enter opening stock or correct counts."
              action={can("inventory.manage") && !readOnly && <LinkButton href={`${base}/inventory/adjustments/new`} icon={Plus}>New adjustment</LinkButton>}
            />
          }
          columns={[
            { key: "n", header: "Number", cell: (r) => <span className="font-semibold text-[#044d73]">{r.number}</span> },
            { key: "d", header: "Date", cell: (r) => date(r.adjustmentDate) },
            { key: "r", header: "Reason", cell: (r) => <Badge tone={["OPENING_STOCK", "FOUND"].includes(r.reason) ? "green" : ["COUNT_CORRECTION", "OTHER"].includes(r.reason) ? "blue" : "red"}>{ADJUSTMENT_REASONS[r.reason] ?? r.reason}</Badge> },
            ...(settings.enableMultiLocation ? [{ key: "l", header: "Location", hideBelow: "md" as const, cell: (r: AdjRow) => r.locationName }] : []),
            { key: "i", header: "Items", align: "right", cell: (r) => r.itemCount },
            ...(showCost ? [{ key: "v", header: "Value change", align: "right" as const, cell: (r: AdjRow) => <span className={r.totalValue < 0 ? "text-rose-600" : "text-emerald-600"}>{money(r.totalValue)}</span> }] : []),
            { key: "b", header: "By", hideBelow: "lg", cell: (r) => <span className="text-slate-500">{r.createdByName ?? "—"}</span> },
          ]}
          footer={list.data && <Pagination page={list.page} totalPages={list.data.totalPages} total={list.data.total} onPage={list.setPage} />}
        />
      </TableCard>
    </div>
  );
}
