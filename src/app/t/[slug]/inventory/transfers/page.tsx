"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Truck } from "lucide-react";
import { DateRangeInputs, FilterSelect, SearchInput } from "@/components/ui/form";
import { Alert, EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { DataTable, Pagination, TableCard } from "@/components/ui/table";
import { LocationSelect } from "@/components/pickers";
import { useList } from "@/lib/client/hooks";
import { useFmt, useSession } from "@/lib/client/session";

interface TransferRow {
  id: string;
  number: string;
  status: string;
  transferDate: string;
  fromLocationName: string;
  toLocationName: string;
  itemCount: number;
  totalQuantity: number;
  createdByName: string | null;
}

export default function TransfersPage() {
  const { base, can, readOnly, settings } = useSession();
  const { date, qty } = useFmt();
  const router = useRouter();
  const list = useList<TransferRow, { search: string; status: string; locationId: string; from: string; to: string }>("/api/inventory/transfers", {
    search: "",
    status: "",
    locationId: "",
    from: "",
    to: "",
  });
  const { filters: f, set, setFilters } = list;
  return (
    <div>
      <PageHeader
        title="Stock transfers"
        subtitle="Move stock between your stores and warehouses"
        actions={can("inventory.manage") && !readOnly && <LinkButton href={`${base}/inventory/transfers/new`} icon={Plus}>New transfer</LinkButton>}
      />
      {!settings.enableMultiLocation && (
        <div className="mb-4">
          <Alert tone="blue">Turn on “Multiple locations” in Settings → Preferences and add a second location to transfer stock.</Alert>
        </div>
      )}
      <TableCard
        toolbar={
          <>
            <SearchInput className="w-full sm:w-60" value={f.search} onChange={(v) => set("search", v)} placeholder="Number or note…" />
            <FilterSelect
              label="Status"
              value={f.status}
              onChange={(v) => set("status", v)}
              options={[
                { value: "", label: "Any status" },
                { value: "DRAFT", label: "Draft" },
                { value: "IN_TRANSIT", label: "In transit" },
                { value: "RECEIVED", label: "Received" },
                { value: "CANCELLED", label: "Cancelled" },
              ]}
            />
            <div className="w-44">
              <LocationSelect includeAll allLabel="Any location" value={f.locationId || "all"} onChange={(v) => set("locationId", v === "all" ? "" : v)} />
            </div>
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
          onRowClick={(r) => router.push(`${base}/inventory/transfers/${r.id}`)}
          empty={<EmptyState icon={Truck} title="No transfers" description="Transfers move stock from one location to another." />}
          columns={[
            { key: "n", header: "Number", cell: (r) => <span className="font-semibold text-[#044d73]">{r.number}</span> },
            { key: "d", header: "Date", cell: (r) => date(r.transferDate) },
            {
              key: "r",
              header: "Route",
              cell: (r) => (
                <span className="flex items-center gap-1.5 text-slate-700">
                  {r.fromLocationName} <ArrowRight className="h-3.5 w-3.5 text-slate-400" /> {r.toLocationName}
                </span>
              ),
            },
            { key: "i", header: "Items", align: "right", hideBelow: "sm", cell: (r) => r.itemCount },
            { key: "q", header: "Quantity", align: "right", hideBelow: "md", cell: (r) => qty(r.totalQuantity) },
            { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
            { key: "b", header: "By", hideBelow: "lg", cell: (r) => <span className="text-slate-500">{r.createdByName ?? "—"}</span> },
          ]}
          footer={list.data && <Pagination page={list.page} totalPages={list.data.totalPages} total={list.data.total} onPage={list.setPage} />}
        />
      </TableCard>
    </div>
  );
}
