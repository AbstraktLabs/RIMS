"use client";

import { useSearchParams } from "next/navigation";
import { Layers } from "lucide-react";
import { FilterSelect, SearchInput } from "@/components/ui/form";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { DataTable, Pagination, TableCard } from "@/components/ui/table";
import { LocationSelect } from "@/components/pickers";
import { useList } from "@/lib/client/hooks";
import { ExpiryBadge } from "@/components/stock-pickers";
import { useFmt, useSession } from "@/lib/client/session";

interface LotRow {
  id: string;
  displayName: string;
  sku: string;
  unitCode: string;
  locationName: string;
  supplierName: string | null;
  lotNumber: string | null;
  manufacturingDate: string | null;
  expiryDate: string | null;
  unitCost: number;
  quantityReceived: number;
  quantityAvailable: number;
  status: string;
  createdAt: string;
  daysToExpiry: number | null;
}

export default function LotsPage() {
  const { settings, can } = useSession();
  const { money, qty, date } = useFmt();
  const params = useSearchParams();
  const list = useList<LotRow, { search: string; locationId: string; status: string; expiringWithinDays: string }>("/api/inventory/lots", {
    search: params.get("search") ?? "",
    locationId: "all",
    status: params.get("expiring") ? "ACTIVE" : "",
    expiringWithinDays: params.get("expiring") ?? "",
  });
  const { filters: f, set } = list;
  const showCost = can("purchases.view") || can("inventory.manage");

  return (
    <div>
      <PageHeader title="Batches & expiry" subtitle="Every batch received, what’s left of it and when it expires" />
      <TableCard
        toolbar={
          <>
            <SearchInput className="w-full sm:w-72" value={f.search} onChange={(v) => set("search", v)} placeholder="Product or batch number…" />
            {settings.enableMultiLocation && (
              <div className="w-44">
                <LocationSelect includeAll value={f.locationId} onChange={(v) => set("locationId", v)} />
              </div>
            )}
            <FilterSelect
              label="Status"
              value={f.status}
              onChange={(v) => set("status", v)}
              options={[
                { value: "", label: "All batches" },
                { value: "ACTIVE", label: "Active" },
                { value: "EXPIRED", label: "Expired" },
                { value: "DEPLETED", label: "Used up" },
              ]}
            />
            {settings.enableExpiryTracking && (
              <FilterSelect
                label="Expiring"
                value={f.expiringWithinDays}
                onChange={(v) => set("expiringWithinDays", v)}
                options={[
                  { value: "", label: "Any expiry" },
                  { value: "7", label: "Expiring in 7 days" },
                  { value: "30", label: "Expiring in 30 days" },
                  { value: "60", label: "Expiring in 60 days" },
                  { value: "90", label: "Expiring in 90 days" },
                  ...(f.expiringWithinDays && !["7", "30", "60", "90"].includes(f.expiringWithinDays) ? [{ value: f.expiringWithinDays, label: `Expiring in ${f.expiringWithinDays} days` }] : []),
                ]}
              />
            )}
          </>
        }
      >
        <DataTable
          rows={list.data?.items}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={Layers} title="No batches" description="Batches are created when you receive batch-tracked products." />}
          columns={[
            { key: "p", header: "Product", cell: (r) => <div><div className="font-semibold text-slate-800">{r.displayName}</div><div className="text-xs text-slate-400">{r.sku}</div></div> },
            { key: "b", header: "Batch", cell: (r) => <span className="font-mono text-xs">{r.lotNumber ?? "—"}</span> },
            ...(settings.enableExpiryTracking
              ? [
                  {
                    key: "e",
                    header: "Expiry",
                    cell: (r: LotRow) =>
                      r.expiryDate ? (
                        <div className="flex flex-col items-start gap-0.5">
                          <span>{date(r.expiryDate)}</span>
                          {r.quantityAvailable > 0 && <ExpiryBadge days={r.daysToExpiry} />}
                        </div>
                      ) : (
                        "—"
                      ),
                  },
                ]
              : []),
            ...(settings.enableMultiLocation ? [{ key: "l", header: "Location", hideBelow: "md" as const, cell: (r: LotRow) => r.locationName }] : []),
            { key: "s", header: "Supplier", hideBelow: "lg", cell: (r) => r.supplierName ?? "—" },
            { key: "q", header: "Left / received", align: "right", cell: (r) => <span><b>{qty(r.quantityAvailable)}</b> <span className="text-slate-400">/ {qty(r.quantityReceived, r.unitCode)}</span></span> },
            ...(showCost ? [{ key: "c", header: "Unit cost", align: "right" as const, hideBelow: "md" as const, cell: (r: LotRow) => money(r.unitCost) }] : []),
            { key: "st", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
          ]}
          footer={list.data && <Pagination page={list.page} totalPages={list.data.totalPages} total={list.data.total} onPage={list.setPage} />}
        />
      </TableCard>
    </div>
  );
}
