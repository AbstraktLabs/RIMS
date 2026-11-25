"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ImageUp, SlidersHorizontal, Trash2 } from "lucide-react";
import { ProductForm, type ProductDetail } from "@/components/product-form";
import { ProductThumb } from "@/components/product-thumb";
import { MovementsTable } from "@/components/movements-table";
import { ConfirmDialog } from "@/components/ui/modal";
import { Alert, Badge, Button, Card, CardHeader, DetailList, ErrorState, LinkButton, LoadingBlock, PageHeader, StatusBadge, Tabs } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, del } from "@/lib/client/api";
import { useAction, useApi } from "@/lib/client/hooks";
import { useFmt, useSession } from "@/lib/client/session";

type Tab = "overview" | "edit" | "history";

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { base, can, readOnly, settings } = useSession();
  const { money, qty } = useFmt();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useApi<{ product: ProductDetail }>(`/api/products/${id}`);
  const [tab, setTab] = useState<Tab>("overview");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useAction();
  const image = useAction();
  const editable = can("products.manage") && !readOnly;
  const showCost = can("purchases.view") || can("inventory.manage");

  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (loading && !data) return <LoadingBlock />;
  if (!data) return null;
  const p = data.product;
  const variants = p.variants.filter((v) => v.isActive || v.totalStock !== 0);
  const total = p.variants.reduce((s, v) => s + v.totalStock, 0);
  const value = p.variants.reduce((s, v) => s + v.stock.reduce((a, l) => a + l.quantity * l.avgCost, 0), 0);
  const threshold = p.lowStockThreshold === null ? null : Number(p.lowStockThreshold);
  const locations = [...new Map(p.variants.flatMap((v) => v.stock).map((l) => [l.locationId, l.locationName])).entries()];

  return (
    <div>
      <PageHeader
        back={{ href: `${base}/products`, label: "Products" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.name}
            {!p.isActive && <Badge tone="red">Archived</Badge>}
          </span>
        }
        subtitle={[p.category?.name, p.brand?.name, p.model].filter(Boolean).join(" · ") || undefined}
        actions={
          editable && (
            <>
              {can("inventory.manage") && (
                <LinkButton variant="secondary" icon={SlidersHorizontal} href={`${base}/inventory/adjustments/new?productId=${p.id}`}>
                  Adjust stock
                </LinkButton>
              )}
              <Button variant="ghost" icon={p.isActive ? Trash2 : Archive} onClick={() => { remove.setError(null); setConfirmDelete(true); }}>
                Delete
              </Button>
            </>
          )
        }
      />
      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "overview", label: "Overview" },
            ...(editable ? [{ value: "edit" as const, label: "Edit details" }] : []),
            { value: "history", label: "Stock history" },
          ]}
        />
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card padded={false}>
              <div className="p-4 sm:p-5">
                <CardHeader title="Stock by variant" subtitle={`${qty(total, p.unit.code)} on hand${showCost ? ` · ${money(value)} at cost` : ""}`} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 sm:pl-5">Variant</th>
                      <th className="px-3 py-2.5 text-right">Price</th>
                      {showCost && <th className="px-3 py-2.5 text-right">Cost</th>}
                      {locations.length > 1 && locations.map(([lid, name]) => <th key={lid} className="px-3 py-2.5 text-right">{name}</th>)}
                      <th className="px-4 py-2.5 text-right sm:pr-5">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {variants.map((v) => {
                      const vt = threshold ?? (v.lowStockThreshold === null ? null : Number(v.lowStockThreshold));
                      const status = v.totalStock <= 0 ? "OUT" : vt !== null && v.totalStock <= vt ? "LOW" : null;
                      return (
                        <tr key={v.id} className={v.isActive ? "" : "opacity-60"}>
                          <td className="px-4 py-3 sm:pl-5">
                            <div className="font-semibold text-slate-800">
                              {p.hasVariants ? Object.values(v.optionValues).join(" / ") : "Default"} {!v.isActive && <Badge tone="red">Archived</Badge>}
                            </div>
                            <div className="text-xs text-slate-500">
                              {v.sku}
                              {v.barcode ? ` · ${v.barcode}` : ""}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right">{money(v.sellingPrice)}</td>
                          {showCost && <td className="px-3 py-3 text-right text-slate-500">{money(v.costPrice)}</td>}
                          {locations.length > 1 &&
                            locations.map(([lid]) => <td key={lid} className="px-3 py-3 text-right">{qty(v.stock.find((l) => l.locationId === lid)?.quantity ?? 0)}</td>)}
                          <td className="px-4 py-3 text-right sm:pr-5">
                            <div className="font-semibold text-slate-800">{qty(v.totalStock, p.unit.code)}</div>
                            {status && <StatusBadge status={status} />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {(p.trackBatches || p.trackSerials) && (
                <div className="flex flex-wrap gap-2 border-t border-slate-100 p-4 sm:px-5">
                  {p.trackBatches && <LinkButton size="sm" variant="secondary" href={`${base}/inventory/lots?search=${encodeURIComponent(p.name)}`}>View batches</LinkButton>}
                  {p.trackSerials && <LinkButton size="sm" variant="secondary" href={`${base}/inventory/serials?search=${encodeURIComponent(p.name)}`}>View serial numbers</LinkButton>}
                </div>
              )}
            </Card>
            {Object.keys(p.attributes).length > 0 && (
              <Card>
                <CardHeader title="Attributes" />
                <DetailList items={Object.entries(p.attributes)} />
              </Card>
            )}
            {p.description && (
              <Card>
                <CardHeader title="Description" />
                <p className="whitespace-pre-line text-sm text-slate-600">{p.description}</p>
              </Card>
            )}
          </div>
          <div className="space-y-6">
            <Card>
              <div className="flex flex-col items-center gap-3">
                <ProductThumb url={p.imageUrl} name={p.name} size="lg" />
                {image.error && <Alert>{image.error}</Alert>}
                {editable && (
                  <div className="flex gap-2">
                    <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      <ImageUp className="h-4 w-4" /> {image.busy ? "Uploading…" : p.imageUrl ? "Change photo" : "Add photo"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const form = new FormData();
                          form.set("file", file);
                          image.run(async () => {
                            const r = await api<{ imageUrl: string }>(`/api/products/${p.id}/image`, { form });
                            setData({ product: { ...p, imageUrl: r.imageUrl } });
                          });
                        }}
                      />
                    </label>
                    {p.imageUrl && (
                      <Button size="sm" variant="ghost" onClick={() => image.run(async () => { await del(`/api/products/${p.id}/image`); setData({ product: { ...p, imageUrl: null } }); })}>
                        Remove
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Details" />
              <DetailList
                items={[
                  ["Unit", `${p.unit.name} (${p.unit.code})`],
                  ...(p.purchaseUnit ? ([["Bought in", `${p.purchaseUnit.name} = ${Number(p.purchaseUnitFactor)} ${p.unit.code}`]] as [string, React.ReactNode][]) : []),
                  [settings.taxLabel, p.taxRate ? p.taxRate.name : "None"],
                  ["Low-stock alert", threshold === null ? "—" : qty(threshold, p.unit.code)],
                  [
                    "Tracking",
                    <span key="t" className="flex flex-wrap justify-end gap-1">
                      {p.trackExpiry ? <Badge tone="amber">Batch + expiry</Badge> : p.trackBatches ? <Badge tone="amber">Batch</Badge> : null}
                      {p.trackSerials && <Badge tone="blue">Serial</Badge>}
                      {!p.trackBatches && !p.trackSerials && "—"}
                    </span>,
                  ],
                  ...(p.hsCode ? ([["HS code", p.hsCode]] as [string, React.ReactNode][]) : []),
                ]}
              />
            </Card>
          </div>
        </div>
      )}

      {tab === "edit" && (
        <ProductForm
          key={JSON.stringify(p.variants.map((v) => v.id))}
          product={p}
          onSaved={(np) => {
            setData({ product: np });
            setTab("overview");
          }}
        />
      )}

      {tab === "history" && <MovementsTable productId={p.id} />}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${p.name}?`}
        message="Products that were never bought, sold or stocked are deleted. Anything with history is archived instead, so your records stay correct."
        confirmLabel="Delete"
        danger
        busy={remove.busy}
        error={remove.error}
        onConfirm={() =>
          remove.run(async () => {
            const r = await del<{ deleted: boolean; message?: string }>(`/api/products/${p.id}`);
            toast(r.deleted ? "Product deleted" : (r.message ?? "Product archived"));
            router.push(`${base}/products`);
          })
        }
      />
    </div>
  );
}
