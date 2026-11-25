"use client";

import { useSearchParams } from "next/navigation";
import { Barcode } from "lucide-react";
import { FilterSelect, SearchInput } from "@/components/ui/form";
import { Badge, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DataTable, Pagination, TableCard } from "@/components/ui/table";
import { LocationSelect } from "@/components/pickers";
import { useList } from "@/lib/client/hooks";
import { SERIAL_STATUS } from "@/lib/client/labels";
import { useFmt, useSession } from "@/lib/client/session";
import { ProductName } from "@/components/product-name";

interface SerialRow {
  id: string;
  serialNumber: string;
  status: string;
  displayName: string; productId?: string;
  sku: string;
  locationName: string | null;
  warrantyEndsOn: string | null;
  updatedAt: string;
}

export default function SerialsPage() {
  const { settings } = useSession();
  const { date, dateTime } = useFmt();
  const params = useSearchParams();
  const list = useList<SerialRow, { search: string; locationId: string; status: string }>("/api/inventory/serials", {
    search: params.get("search") ?? "",
    locationId: "all",
    status: "",
  });
  const { filters: f, set } = list;
  return (
    <div>
      <PageHeader title="Serial numbers" subtitle="Find any unit by serial / IMEI and see where it is" />
      <TableCard
        toolbar={
          <>
            <SearchInput className="w-full sm:w-72" value={f.search} onChange={(v) => set("search", v)} placeholder="Serial number or product…" />
            {settings.enableMultiLocation && (
              <div className="w-44">
                <LocationSelect includeAll value={f.locationId} onChange={(v) => set("locationId", v)} />
              </div>
            )}
            <FilterSelect
              label="Status"
              value={f.status}
              onChange={(v) => set("status", v)}
              options={[{ value: "", label: "Any status" }, ...Object.entries(SERIAL_STATUS).map(([value, s]) => ({ value, label: s.label }))]}
            />
          </>
        }
      >
        <DataTable
          rows={list.data?.items}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={Barcode} title="No serial numbers" description="Serials are recorded when you receive serial-tracked products." />}
          columns={[
            { key: "s", header: "Serial", cell: (r) => <span className="font-mono text-sm font-semibold text-slate-800">{r.serialNumber}</span> },
            { key: "p", header: "Product", cell: (r) => <div><ProductName productId={r.productId} name={r.displayName} className="text-slate-800" /><div className="text-xs text-slate-400">{r.sku}</div></div> },
            { key: "st", header: "Status", cell: (r) => { const s = SERIAL_STATUS[r.status] ?? { label: r.status, tone: "slate" as const }; return <Badge tone={s.tone}>{s.label}</Badge>; } },
            ...(settings.enableMultiLocation ? [{ key: "l", header: "Location", hideBelow: "md" as const, cell: (r: SerialRow) => r.locationName ?? "—" }] : []),
            { key: "w", header: "Warranty until", hideBelow: "lg", cell: (r) => (r.warrantyEndsOn ? date(r.warrantyEndsOn) : "—") },
            { key: "u", header: "Last change", hideBelow: "md", cell: (r) => <span className="text-slate-500">{dateTime(r.updatedAt)}</span> },
          ]}
          footer={list.data && <Pagination page={list.page} totalPages={list.data.totalPages} total={list.data.total} onPage={list.setPage} />}
        />
      </TableCard>
    </div>
  );
}
