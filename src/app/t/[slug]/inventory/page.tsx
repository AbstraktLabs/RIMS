"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Boxes, Coins, Package, PackagePlus, Tags } from "lucide-react";
import { FilterSelect, SearchInput } from "@/components/ui/form";
import { EmptyState, LinkButton, PageHeader, StatCard, StatusBadge } from "@/components/ui/primitives";
import { DataTable, Pagination, TableCard } from "@/components/ui/table";
import { LocationSelect } from "@/components/pickers";
import { useApi, useList } from "@/lib/client/hooks";
import { useFmt, useSession } from "@/lib/client/session";

interface StockRow {
  id: string;
  variantId: string;
  productId: string;
  displayName: string;
  sku: string;
  barcode: string | null;
  categoryName: string | null;
  unitCode: string;
  locationName: string;
  quantity: number;
  avgCost: number;
  sellingPrice: number;
  lowStockThreshold: number | null;
  value: number;
  status: "IN" | "LOW" | "OUT" | "NEGATIVE";
}

export default function StockPage() {
  const { base, settings, can, readOnly } = useSession();
  const { money, qty, num } = useFmt();
  const router = useRouter();
  const params = useSearchParams();
  const cats = useApi<{ items: { id: string; name: string }[] }>("/api/categories");
  const list = useList<StockRow, { search: string; locationId: string; categoryId: string; status: string; sort: string }>("/api/inventory/stock", {
    search: "",
    locationId: params.get("locationId") ?? "all",
    categoryId: "",
    status: params.get("status") ?? "",
    sort: "name",
  });
  const { filters: f, set } = list;
  const summary = list.data?.summary as { totalQuantity: number; costValue: number; retailValue: number } | undefined;
  const showCost = can("purchases.view") || can("inventory.manage");

  return (
    <div>
      <PageHeader
        title="Stock on hand"
        subtitle="Current quantity and value of everything you hold"
        actions={
          can("purchases.manage") &&
          !readOnly && (
            <LinkButton
              variant="secondary"
              icon={PackagePlus}
              href={`${base}/purchase-orders/new?reorder=1${f.locationId && f.locationId !== "all" ? `&locationId=${f.locationId}` : ""}`}
            >
              Reorder low stock
            </LinkButton>
          )
        }
      />
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Units on hand" value={summary ? num(summary.totalQuantity, 0) : "—"} icon={Boxes} />
        {showCost && <StatCard label="Value at cost" value={summary ? money(summary.costValue) : "—"} icon={Coins} accent="green" />}
        <StatCard label="Value at selling price" value={summary ? money(summary.retailValue) : "—"} icon={Tags} accent="amber" />
      </div>
      <TableCard
        toolbar={
          <>
            <SearchInput className="w-full sm:w-72" value={f.search} onChange={(v) => set("search", v)} placeholder="Name, SKU or barcode…" />
            {settings.enableMultiLocation && (
              <div className="w-44">
                <LocationSelect includeAll value={f.locationId} onChange={(v) => set("locationId", v)} />
              </div>
            )}
            <FilterSelect
              label="Category"
              value={f.categoryId}
              onChange={(v) => set("categoryId", v)}
              options={[{ value: "", label: "All categories" }, ...(cats.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))]}
            />
            <FilterSelect
              label="Status"
              value={f.status}
              onChange={(v) => set("status", v)}
              options={[
                { value: "", label: "Any status" },
                { value: "in", label: "In stock" },
                { value: "low", label: "Low stock" },
                { value: "out", label: "Out of stock" },
                { value: "negative", label: "Below zero" },
              ]}
            />
            <FilterSelect
              label="Sort"
              value={f.sort}
              onChange={(v) => set("sort", v)}
              options={[
                { value: "name", label: "Name" },
                { value: "-quantity", label: "Most stock" },
                { value: "quantity", label: "Least stock" },
                { value: "-value", label: "Highest value" },
              ]}
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
          onRowClick={(r) => router.push(`${base}/products/${r.productId}`)}
          empty={<EmptyState icon={Package} title="No stock found" description={f.search || f.status ? "Try clearing the filters." : "Record a purchase or an opening-stock adjustment to get started."} />}
          columns={[
            {
              key: "p",
              header: "Product",
              cell: (r) => (
                <div>
                  <div className="font-semibold text-slate-800">{r.displayName}</div>
                  <div className="text-xs text-slate-400">
                    {r.sku}
                    {r.categoryName ? ` · ${r.categoryName}` : ""}
                  </div>
                </div>
              ),
            },
            ...(f.locationId === "all" && settings.enableMultiLocation ? [{ key: "l", header: "Location", hideBelow: "md" as const, cell: (r: StockRow) => r.locationName }] : []),
            {
              key: "q",
              header: "On hand",
              align: "right",
              cell: (r) => (
                <div className="flex flex-col items-end gap-1">
                  <span className={`font-semibold ${r.quantity < 0 ? "text-rose-600" : "text-slate-800"}`}>{qty(r.quantity, r.unitCode)}</span>
                  {r.status !== "IN" && <StatusBadge status={r.status} />}
                </div>
              ),
            },
            { key: "t", header: "Alert at", align: "right", hideBelow: "lg", cell: (r) => (r.lowStockThreshold === null ? "—" : qty(r.lowStockThreshold)) },
            ...(showCost
              ? [
                  { key: "c", header: "Avg cost", align: "right" as const, hideBelow: "md" as const, cell: (r: StockRow) => money(r.avgCost) },
                  { key: "v", header: "Value", align: "right" as const, cell: (r: StockRow) => <span className="font-semibold">{money(r.value)}</span> },
                ]
              : []),
            { key: "s", header: "Price", align: "right", hideBelow: "sm", cell: (r) => money(r.sellingPrice) },
          ]}
          footer={list.data && <Pagination page={list.page} totalPages={list.data.totalPages} total={list.data.total} onPage={list.setPage} />}
        />
      </TableCard>
    </div>
  );
}
