"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2, X } from "lucide-react";
import { Field, FormGrid, Input, Select, Textarea, Toggle } from "@/components/ui/form";
import { Alert, Button, Card, CardHeader } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { post, put } from "@/lib/client/api";
import { useAction, useApi } from "@/lib/client/hooks";
import { useSession } from "@/lib/client/session";
import type { TaxRate, Unit } from "@/lib/client/types";

export interface ProductDetail {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  brandId: string | null;
  model: string | null;
  hsCode: string | null;
  unitId: string;
  purchaseUnitId: string | null;
  purchaseUnitFactor: string | null;
  taxRateId: string | null;
  imageUrl: string | null;
  trackBatches: boolean;
  trackExpiry: boolean;
  trackSerials: boolean;
  hasVariants: boolean;
  variantOptions: { name: string; values: string[] }[];
  attributes: Record<string, string>;
  lowStockThreshold: string | null;
  isActive: boolean;
  category: { name: string } | null;
  brand: { name: string } | null;
  unit: { code: string; name: string; allowDecimal: boolean };
  purchaseUnit: { code: string; name: string } | null;
  taxRate: { name: string; rate: string } | null;
  variants: {
    id: string;
    name: string;
    sku: string;
    barcode: string | null;
    optionValues: Record<string, string>;
    costPrice: string;
    sellingPrice: string;
    wholesalePrice: string | null;
    mrp: string | null;
    lowStockThreshold: string | null;
    isDefault: boolean;
    isActive: boolean;
    stock: { locationId: string; locationName: string; quantity: number; avgCost: number }[];
    totalStock: number;
  }[];
}

interface VariantRow {
  id?: string;
  optionValues: Record<string, string>;
  sku: string;
  barcode: string;
  costPrice: string;
  sellingPrice: string;
  wholesalePrice: string;
  mrp: string;
  isActive: boolean;
}

const s = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(Number(v)));
const comboKey = (o: Record<string, string>, names: string[]) => names.map((n) => (o[n] ?? "").toLowerCase()).join("|");
const parseValues = (t: string) => [...new Set(t.split(",").map((x) => x.trim()).filter(Boolean))];

function toRow(v?: ProductDetail["variants"][number]): VariantRow {
  return {
    id: v?.id,
    optionValues: v?.optionValues ?? {},
    sku: v?.sku ?? "",
    barcode: v?.barcode ?? "",
    costPrice: s(v?.costPrice) || "",
    sellingPrice: s(v?.sellingPrice) || "",
    wholesalePrice: s(v?.wholesalePrice),
    mrp: s(v?.mrp),
    isActive: v?.isActive ?? true,
  };
}

export function ProductForm({ product, onSaved }: { product?: ProductDetail; onSaved?: (p: ProductDetail) => void }) {
  const { settings, base } = useSession();
  const router = useRouter();
  const toast = useToast();
  const units = useApi<{ items: Unit[] }>("/api/units");
  const taxes = useApi<{ items: TaxRate[] }>("/api/tax-rates");
  const cats = useApi<{ items: { id: string; name: string }[] }>("/api/categories");
  const brands = useApi<{ items: { id: string; name: string }[] }>("/api/brands");

  const [f, setF] = useState(() => ({
    name: product?.name ?? "",
    description: product?.description ?? "",
    categoryId: product?.categoryId ?? "",
    brandId: product?.brandId ?? "",
    model: product?.model ?? "",
    hsCode: product?.hsCode ?? "",
    unitId: product?.unitId ?? "",
    purchaseUnitId: product?.purchaseUnitId ?? "",
    purchaseUnitFactor: s(product?.purchaseUnitFactor),
    taxRateId: product ? (product.taxRateId ?? "") : "__default",
    trackBatches: product?.trackBatches ?? false,
    trackExpiry: product?.trackExpiry ?? false,
    trackSerials: product?.trackSerials ?? false,
    lowStockThreshold: s(product?.lowStockThreshold),
    isActive: product?.isActive ?? true,
  }));
  const up = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const [attrs, setAttrs] = useState<{ k: string; v: string }[]>(() => Object.entries(product?.attributes ?? {}).map(([k, v]) => ({ k, v })));
  const [hasOptions, setHasOptions] = useState(product?.hasVariants ?? false);
  const [options, setOptions] = useState<{ name: string; values: string }[]>(() =>
    product?.variantOptions.length ? product.variantOptions.map((o) => ({ name: o.name, values: o.values.join(", ") })) : [{ name: "Size", values: "" }],
  );
  // existing + edited rows, keyed by option combination
  const [rows, setRows] = useState<Record<string, VariantRow>>(() => {
    const names = product?.variantOptions.map((o) => o.name) ?? [];
    return Object.fromEntries((product?.variants ?? []).map((v) => [product?.hasVariants ? comboKey(v.optionValues, names) : "__single", toRow(v)]));
  });
  const single = rows["__single"] ?? toRow(product?.variants.find((v) => v.isDefault));

  const parsedOptions = useMemo(
    () => options.map((o) => ({ name: o.name.trim(), values: parseValues(o.values) })).filter((o) => o.name && o.values.length),
    [options],
  );
  const optionNames = parsedOptions.map((o) => o.name);
  const combos = useMemo(() => {
    if (!parsedOptions.length) return [] as Record<string, string>[];
    return parsedOptions.reduce<Record<string, string>[]>((acc, o) => acc.flatMap((c) => o.values.map((v) => ({ ...c, [o.name]: v }))), [{}]);
  }, [parsedOptions]);

  const [bulk, setBulk] = useState({ costPrice: "", sellingPrice: "" });
  const { busy, error, run, fieldErrors } = useAction();
  const unit = units.data?.items.find((u) => u.id === f.unitId);
  const defaultTax = taxes.data?.items.find((t) => t.isDefault && t.isActive);

  const rowFor = (combo: Record<string, string>): VariantRow => rows[comboKey(combo, optionNames)] ?? { ...toRow(), optionValues: combo, costPrice: bulk.costPrice, sellingPrice: bulk.sellingPrice };
  const setRow = (combo: Record<string, string>, patch: Partial<VariantRow>) =>
    setRows((r) => ({ ...r, [comboKey(combo, optionNames)]: { ...rowFor(combo), ...patch, optionValues: combo } }));

  const submit = () =>
    run(async () => {
      const num = (v: string) => (v === "" ? null : Number(v));
      const variantBody = (r: VariantRow) => ({
        id: r.id,
        sku: r.sku.trim() || undefined,
        barcode: r.barcode.trim() || null,
        optionValues: r.optionValues,
        costPrice: Number(r.costPrice || 0),
        sellingPrice: Number(r.sellingPrice || 0),
        wholesalePrice: num(r.wholesalePrice),
        mrp: num(r.mrp),
        isActive: r.isActive,
      });
      let variants;
      if (hasOptions && settings.enableVariants) {
        if (!combos.length) throw new Error("Add at least one option with values, e.g. Size: S, M, L");
        // reuse the old single variant for the first combination so its stock history carries over
        const leftover = product?.variants.find((v) => v.isDefault && !Object.keys(v.optionValues).length);
        variants = combos.map((c, i) => {
          const r = rowFor(c);
          return variantBody({ ...r, id: r.id ?? (i === 0 && leftover && !Object.values(rows).some((x) => x.id === leftover.id && Object.keys(x.optionValues).length) ? leftover.id : undefined) });
        });
      } else {
        const keep = single.id ?? product?.variants.find((v) => v.isDefault)?.id;
        variants = [variantBody({ ...single, id: keep, optionValues: {} })];
      }
      const body = {
        name: f.name,
        description: f.description || null,
        categoryId: f.categoryId || null,
        brandId: f.brandId || null,
        model: f.model || null,
        hsCode: f.hsCode || null,
        unitId: f.unitId,
        purchaseUnitId: f.purchaseUnitId || null,
        purchaseUnitFactor: f.purchaseUnitId ? num(f.purchaseUnitFactor) : null,
        taxRateId: f.taxRateId === "__default" ? (defaultTax?.id ?? null) : f.taxRateId || null,
        trackBatches: f.trackBatches || f.trackExpiry,
        trackExpiry: f.trackExpiry,
        trackSerials: f.trackSerials,
        variantOptions: hasOptions && settings.enableVariants ? parsedOptions : [],
        attributes: Object.fromEntries(attrs.filter((a) => a.k.trim()).map((a) => [a.k.trim(), a.v])),
        lowStockThreshold: num(f.lowStockThreshold),
        isActive: f.isActive,
        variants,
      };
      if (product) {
        const r = await put<{ product: ProductDetail }>(`/api/products/${product.id}`, body);
        toast("Product saved");
        onSaved?.(r.product);
      } else {
        const r = await post<{ product: ProductDetail }>("/api/products", body);
        toast("Product created");
        router.push(`${base}/products/${r.product.id}`);
      }
    });

  const showWholesale = settings.enableWholesalePricing;
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {error && <Alert>{error}</Alert>}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Basics" />
            <div className="space-y-4">
              <Field label="Product name" required error={fieldErrors.name}>
                <Input required value={f.name} onChange={(e) => up("name", e.target.value)} placeholder="e.g. Cotton T-Shirt" autoFocus={!product} />
              </Field>
              <FormGrid>
                <Field label="Category">
                  <Select value={f.categoryId} onChange={(e) => up("categoryId", e.target.value)}>
                    <option value="">— None —</option>
                    {cats.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Brand">
                  <Select value={f.brandId} onChange={(e) => up("brandId", e.target.value)}>
                    <option value="">— None —</option>
                    {brands.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Model / style">
                  <Input value={f.model} onChange={(e) => up("model", e.target.value)} />
                </Field>
                <Field label="HS code" hint="For customs / tax filings">
                  <Input value={f.hsCode} onChange={(e) => up("hsCode", e.target.value)} />
                </Field>
              </FormGrid>
              <Field label="Description">
                <Textarea rows={3} value={f.description} onChange={(e) => up("description", e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              title={hasOptions ? "Variants" : "Pricing & codes"}
              subtitle={hasOptions ? `${combos.length} combination${combos.length === 1 ? "" : "s"} — each has its own SKU, price and stock` : "Leave SKU empty to generate one"}
            />
            {settings.enableVariants && (
              <div className="mb-4 rounded-xl bg-slate-50 px-3">
                <Toggle checked={hasOptions} onChange={setHasOptions} label="This product comes in options" description="Sizes, colours, weights, flavours…" />
              </div>
            )}
            {!hasOptions || !settings.enableVariants ? (
              <FormGrid cols={showWholesale ? 3 : 2}>
                <Field label="Selling price" required error={fieldErrors["variants.0.sellingPrice"]}>
                  <Input required inputMode="decimal" value={single.sellingPrice} onChange={(e) => setRows((r) => ({ ...r, __single: { ...single, sellingPrice: e.target.value } }))} />
                </Field>
                <Field label="Cost price" hint="Used until you record a purchase">
                  <Input inputMode="decimal" value={single.costPrice} onChange={(e) => setRows((r) => ({ ...r, __single: { ...single, costPrice: e.target.value } }))} />
                </Field>
                {showWholesale && (
                  <Field label="Wholesale price">
                    <Input inputMode="decimal" value={single.wholesalePrice} onChange={(e) => setRows((r) => ({ ...r, __single: { ...single, wholesalePrice: e.target.value } }))} />
                  </Field>
                )}
                <Field label="MRP / list price" hint="Optional, printed on labels">
                  <Input inputMode="decimal" value={single.mrp} onChange={(e) => setRows((r) => ({ ...r, __single: { ...single, mrp: e.target.value } }))} />
                </Field>
                <Field label="SKU">
                  <Input value={single.sku} onChange={(e) => setRows((r) => ({ ...r, __single: { ...single, sku: e.target.value } }))} placeholder="Auto" />
                </Field>
                <Field label="Barcode">
                  <Input value={single.barcode} onChange={(e) => setRows((r) => ({ ...r, __single: { ...single, barcode: e.target.value } }))} placeholder="Scan or type" />
                </Field>
              </FormGrid>
            ) : (
              <div className="space-y-4">
                {options.map((o, i) => (
                  <div key={i} className="grid grid-cols-[1fr_2fr_auto] items-end gap-2">
                    <Field label={i === 0 ? "Option" : ""}>
                      <Input value={o.name} placeholder="Size" onChange={(e) => setOptions((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
                    </Field>
                    <Field label={i === 0 ? "Values (comma separated)" : ""}>
                      <Input value={o.values} placeholder="S, M, L, XL" onChange={(e) => setOptions((x) => x.map((y, j) => (j === i ? { ...y, values: e.target.value } : y)))} />
                    </Field>
                    <Button variant="ghost" icon={X} aria-label="Remove option" disabled={options.length === 1} onClick={() => setOptions((x) => x.filter((_, j) => j !== i))} />
                  </div>
                ))}
                {options.length < 3 && (
                  <Button size="sm" variant="secondary" icon={Plus} onClick={() => setOptions((x) => [...x, { name: x.length === 1 ? "Colour" : "Material", values: "" }])}>
                    Add another option
                  </Button>
                )}
                {combos.length > 0 && (
                  <div className="-mx-4 overflow-x-auto sm:-mx-5">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-2 sm:pl-5">Variant</th>
                          <th className="px-2 py-2">SKU</th>
                          <th className="px-2 py-2">Barcode</th>
                          <th className="px-2 py-2">Cost</th>
                          <th className="px-2 py-2">Price</th>
                          {showWholesale && <th className="px-2 py-2">Wholesale</th>}
                          <th className="px-2 py-2 pr-4 sm:pr-5">On</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        <tr className="bg-[#044d73]/[0.03]">
                          <td className="px-4 py-2 text-xs font-semibold text-slate-500 sm:pl-5" colSpan={3}>Set for all →</td>
                          <td className="px-2 py-2"><Input inputMode="decimal" placeholder="Cost" value={bulk.costPrice} onChange={(e) => setBulk({ ...bulk, costPrice: e.target.value })} /></td>
                          <td className="px-2 py-2"><Input inputMode="decimal" placeholder="Price" value={bulk.sellingPrice} onChange={(e) => setBulk({ ...bulk, sellingPrice: e.target.value })} /></td>
                          <td className="px-2 py-2 pr-4 sm:pr-5" colSpan={showWholesale ? 2 : 1}>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                setRows((r) => {
                                  const next = { ...r };
                                  for (const c of combos) {
                                    const k = comboKey(c, optionNames);
                                    const cur = r[k] ?? { ...toRow(), optionValues: c };
                                    next[k] = { ...cur, optionValues: c, ...(bulk.costPrice && { costPrice: bulk.costPrice }), ...(bulk.sellingPrice && { sellingPrice: bulk.sellingPrice }) };
                                  }
                                  return next;
                                })
                              }
                            >
                              Apply
                            </Button>
                          </td>
                        </tr>
                        {combos.map((c) => {
                          const r = rowFor(c);
                          const set = (p: Partial<VariantRow>) => setRow(c, p);
                          return (
                            <tr key={comboKey(c, optionNames)} className={r.isActive ? "" : "opacity-50"}>
                              <td className="px-4 py-2 font-medium text-slate-800 sm:pl-5">{optionNames.map((n) => c[n]).join(" / ")}</td>
                              <td className="px-2 py-2"><Input value={r.sku} placeholder="Auto" onChange={(e) => set({ sku: e.target.value })} aria-label="SKU" /></td>
                              <td className="px-2 py-2"><Input value={r.barcode} onChange={(e) => set({ barcode: e.target.value })} aria-label="Barcode" /></td>
                              <td className="px-2 py-2"><Input inputMode="decimal" placeholder="0" value={r.costPrice} onChange={(e) => set({ costPrice: e.target.value })} aria-label="Cost price" /></td>
                              <td className="px-2 py-2"><Input inputMode="decimal" placeholder="0" value={r.sellingPrice} onChange={(e) => set({ sellingPrice: e.target.value })} aria-label="Selling price" /></td>
                              {showWholesale && <td className="px-2 py-2"><Input inputMode="decimal" placeholder="—" value={r.wholesalePrice} onChange={(e) => set({ wholesalePrice: e.target.value })} aria-label="Wholesale price" /></td>}
                              <td className="px-2 py-2 pr-4 sm:pr-5">
                                <input type="checkbox" className="h-4 w-4 accent-[#044d73]" checked={r.isActive} onChange={(e) => set({ isActive: e.target.checked })} aria-label="Active" />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {product?.hasVariants && (
                  <p className="text-xs text-slate-500">Removing a value deletes that variant, or archives it if it has stock history.</p>
                )}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Attributes"
              subtitle="Any extra details — material, warranty, origin, voltage…"
              actions={<Button size="sm" variant="secondary" icon={Plus} onClick={() => setAttrs((a) => [...a, { k: "", v: "" }])}>Add</Button>}
            />
            {attrs.length === 0 ? (
              <p className="text-sm text-slate-400">No attributes.</p>
            ) : (
              <div className="space-y-2">
                {attrs.map((a, i) => (
                  <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
                    <Input value={a.k} placeholder="Name" onChange={(e) => setAttrs((x) => x.map((y, j) => (j === i ? { ...y, k: e.target.value } : y)))} />
                    <Input value={a.v} placeholder="Value" onChange={(e) => setAttrs((x) => x.map((y, j) => (j === i ? { ...y, v: e.target.value } : y)))} />
                    <Button variant="ghost" icon={Trash2} aria-label="Remove attribute" onClick={() => setAttrs((x) => x.filter((_, j) => j !== i))} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Units & tax" />
            <div className="space-y-4">
              <Field label="Selling unit" required error={fieldErrors.unitId}>
                <Select required value={f.unitId} onChange={(e) => up("unitId", e.target.value)}>
                  <option value="">— Select —</option>
                  {units.data?.items.filter((u) => u.isActive || u.id === f.unitId).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.code}){u.allowDecimal ? " · decimal" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Buy in a bigger unit" hint="e.g. buy by the box of 12, sell by the piece">
                <Select value={f.purchaseUnitId} onChange={(e) => up("purchaseUnitId", e.target.value)}>
                  <option value="">Same as selling unit</option>
                  {units.data?.items.filter((u) => u.id !== f.unitId && (u.isActive || u.id === f.purchaseUnitId)).map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.code})</option>
                  ))}
                </Select>
              </Field>
              {f.purchaseUnitId && (
                <Field label={`${unit?.code ?? "Units"} per ${units.data?.items.find((u) => u.id === f.purchaseUnitId)?.code ?? "purchase unit"}`} required>
                  <Input required inputMode="decimal" value={f.purchaseUnitFactor} onChange={(e) => up("purchaseUnitFactor", e.target.value)} />
                </Field>
              )}
              <Field label={`${settings.taxLabel} rate`}>
                <Select value={f.taxRateId} onChange={(e) => up("taxRateId", e.target.value)}>
                  {!product && <option value="__default">{defaultTax ? `Default (${defaultTax.name})` : "Default (none)"}</option>}
                  <option value="">No {settings.taxLabel}</option>
                  {taxes.data?.items.filter((t) => t.isActive || t.id === f.taxRateId).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Low-stock alert at" hint={unit ? `In ${unit.code}. Leave empty for no alert.` : "Leave empty for no alert."}>
                <Input inputMode="decimal" value={f.lowStockThreshold} onChange={(e) => up("lowStockThreshold", e.target.value)} />
              </Field>
            </div>
          </Card>
          {(settings.enableBatchTracking || settings.enableExpiryTracking || settings.enableSerialTracking) && (
            <Card>
              <CardHeader title="Tracking" subtitle={product ? "Can only change while the product has no stock" : undefined} />
              <div className="divide-y divide-slate-100">
                {settings.enableBatchTracking && (
                  <Toggle checked={f.trackBatches || f.trackExpiry} disabled={f.trackExpiry} onChange={(v) => up("trackBatches", v)} label="Batch / lot numbers" />
                )}
                {settings.enableExpiryTracking && (
                  <Toggle checked={f.trackExpiry} onChange={(v) => setF((x) => ({ ...x, trackExpiry: v, trackBatches: v || x.trackBatches }))} label="Expiry dates" description="Sells earliest-expiring stock first" />
                )}
                {settings.enableSerialTracking && (
                  <Toggle
                    checked={f.trackSerials}
                    onChange={(v) => up("trackSerials", v)}
                    label="Serial numbers"
                    description={unit?.allowDecimal ? "Needs a whole-number unit like pcs" : "Every unit gets a unique serial / IMEI"}
                  />
                )}
              </div>
            </Card>
          )}
          <Card>
            <Toggle checked={f.isActive} onChange={(v) => up("isActive", v)} label="Active" description="Inactive products can’t be sold or bought" />
          </Card>
        </div>
      </div>
      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" icon={Save} loading={busy}>{product ? "Save changes" : "Create product"}</Button>
      </div>
    </form>
  );
}

