"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Package, Plus } from "lucide-react";
import { FilterSelect, SearchInput } from "@/components/ui/form";
import { Badge, EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { DataTable, Pagination, TableCard } from "@/components/ui/table";
import { LocationSelect } from "@/components/pickers";
import { useApi, useList } from "@/lib/client/hooks";
import { ProductThumb } from "@/components/product-thumb";
import { useFmt, useSession } from "@/lib/client/session";

interface ProductRow {
  id: string;
  name: string;
  model: string | null;
  imageUrl: string | null;
  isActive: boolean;
  hasVariants: boolean;
  trackBatches: boolean;
  trackExpiry: boolean;
  trackSerials: boolean;
  categoryName: string | null;
  brandName: string | null;
  unitCode: string;
  stock: number;
  variantCount: number;
  minPrice: string;
  maxPrice: string;
  defaultSku: string | null;
  stockValue: number;
  stockStatus: "IN" | "LOW" | "OUT";
}

export default function ProductsPage() {
  const { base, can, readOnly, settings } = useSession();
  const { money, qty } = useFmt();
  const router = useRouter();
  const params = useSearchParams();
  const cats = useApi<{ items: { id: string; name: string }[] }>("/api/categories");
  const brands = useApi<{ items: { id: string; name: string }[] }>("/api/brands");
  const list = useList<ProductRow, { search: string; categoryId: string; brandId: string; stock: string; status: string; locationId: string; sort: string }>(
    "/api/products",
    {
      search: "",
      categoryId: "",
      brandId: "",
      stock: params.get("stock") ?? "",
      status: "active",
      locationId: "all",
      sort: "name",
    },
  );
  const { filters: f, set } = list;
  const showCost = can("purchases.view") || can("inventory.manage");

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Everything you buy and sell"
        actions={can("products.manage") && !readOnly && <LinkButton href={`${base}/products/new`} icon={Plus}>Add product</LinkButton>}
      />
      <TableCard
        toolbar={
          <>
            <SearchInput className="w-full sm:w-72" value={f.search} onChange={(v) => set("search", v)} placeholder="Name, SKU or barcode…" />
            <FilterSelect
              label="Category"
              value={f.categoryId}
              onChange={(v) => set("categoryId", v)}
              options={[{ value: "", label: "All categories" }, ...(cats.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))]}
            />
            <FilterSelect
              label="Brand"
              value={f.brandId}
              onChange={(v) => set("brandId", v)}
              options={[{ value: "", label: "All brands" }, ...(brands.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))]}
            />
            <FilterSelect
              label="Stock"
              value={f.stock}
              onChange={(v) => set("stock", v)}
              options={[
                { value: "", label: "Any stock" },
                { value: "in", label: "In stock" },
                { value: "low", label: "Low stock" },
                { value: "out", label: "Out of stock" },
              ]}
            />
            <FilterSelect
              label="Status"
              value={f.status}
              onChange={(v) => set("status", v)}
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Archived" },
                { value: "all", label: "All" },
              ]}
            />
            {settings.enableMultiLocation && (
              <div className="w-44">
                <LocationSelect includeAll value={f.locationId} onChange={(v) => set("locationId", v)} />
              </div>
            )}
            <FilterSelect
              label="Sort"
              value={f.sort}
              onChange={(v) => set("sort", v)}
              options={[
                { value: "name", label: "Name A–Z" },
                { value: "-name", label: "Name Z–A" },
                { value: "-createdAt", label: "Newest" },
                { value: "-stock", label: "Most stock" },
                { value: "stock", label: "Least stock" },
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
          onRowClick={(r) => router.push(`${base}/products/${r.id}`)}
          empty={
            <EmptyState
              icon={Package}
              title={f.search || f.categoryId || f.stock ? "No products match" : "No products yet"}
              description={f.search || f.categoryId || f.stock ? "Try clearing some filters." : "Add the products you sell to start tracking stock."}
              action={can("products.manage") && !readOnly && !f.search && <LinkButton href={`${base}/products/new`} icon={Plus}>Add product</LinkButton>}
            />
          }
          columns={[
            {
              key: "p",
              header: "Product",
              cell: (r) => (
                <div className="flex items-center gap-3">
                  <ProductThumb url={r.imageUrl} name={r.name} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-800">
                      {r.name}
                      {!r.isActive && <Badge tone="red">Archived</Badge>}
                    </div>
                    <div className="text-xs text-slate-500">
                      {r.hasVariants ? `${r.variantCount} variants` : r.defaultSku}
                      {r.model ? ` · ${r.model}` : ""}
                    </div>
                  </div>
                </div>
              ),
            },
            {
              key: "c",
              header: "Category",
              hideBelow: "md",
              cell: (r) => (
                <div className="text-sm">
                  <div className="text-slate-700">{r.categoryName ?? "—"}</div>
                  {r.brandName && <div className="text-xs text-slate-400">{r.brandName}</div>}
                </div>
              ),
            },
            {
              key: "t",
              header: "Tracking",
              hideBelow: "lg",
              cell: (r) => (
                <div className="flex flex-wrap gap-1">
                  {r.trackExpiry ? <Badge tone="amber">Expiry</Badge> : r.trackBatches && <Badge tone="amber">Batch</Badge>}
                  {r.trackSerials && <Badge tone="blue">Serial</Badge>}
                  {!r.trackBatches && !r.trackSerials && <span className="text-xs text-slate-400">—</span>}
                </div>
              ),
            },
            {
              key: "pr",
              header: "Price",
              align: "right",
              cell: (r) => (r.minPrice === r.maxPrice ? money(r.minPrice) : `${money(r.minPrice)} – ${money(r.maxPrice)}`),
            },
            {
              key: "s",
              header: "Stock",
              align: "right",
              cell: (r) => (
                <div className="flex flex-col items-end gap-1">
                  <span className="font-semibold text-slate-800">{qty(r.stock, r.unitCode)}</span>
                  {r.stockStatus !== "IN" && <StatusBadge status={r.stockStatus} />}
                </div>
              ),
            },
            ...(showCost ? [{ key: "v", header: "Stock value", align: "right" as const, hideBelow: "md" as const, cell: (r: ProductRow) => money(r.stockValue) }] : []),
          ]}
          footer={list.data && <Pagination page={list.page} totalPages={list.data.totalPages} total={list.data.total} onPage={list.setPage} />}
        />
      </TableCard>
    </div>
  );
}
