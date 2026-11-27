import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { brands, categories, parties, productVariants, products, stockLevels, stockLots, units } from "@/db/schema";
import type { AuthContext } from "@/lib/api/handler";
import { notFound } from "@/lib/errors";
import { num } from "@/lib/num";
import { addDays, todayIn } from "../_shared/dates";
import { refreshExpiredLots } from "../_shared/stock";
import { getSettings, resolveLocationId } from "../_shared/tenant";
import { qcol } from "../_shared/sql";

// Read models for the pharmacy-style Inventory and Batches screens.
// Stock is always for the active location (the sidebar's location switcher).

export type BatchStatus = "ACTIVE" | "NEAR_EXPIRY" | "EXPIRED" | "NO_EXPIRY";

function batchStatus(expiry: string | null, today: string, soon: string): { status: BatchStatus; daysLeft: number | null } {
  if (!expiry) return { status: "NO_EXPIRY", daysLeft: null };
  const daysLeft = Math.round((Date.parse(expiry) - Date.parse(today)) / 86_400_000);
  if (expiry < today) return { status: "EXPIRED", daysLeft };
  if (expiry <= soon) return { status: "NEAR_EXPIRY", daysLeft };
  return { status: "ACTIVE", daysLeft };
}

export async function listItems(auth: AuthContext) {
  const locationId = await resolveLocationId(db, auth);
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      model: products.model,
      description: products.description,
      hsCode: products.hsCode,
      categoryId: products.categoryId,
      categoryName: categories.name,
      brandId: products.brandId,
      brandName: brands.name,
      unitId: products.unitId,
      unitCode: units.code,
      allowDecimal: units.allowDecimal,
      purchaseUnitId: products.purchaseUnitId,
      purchaseUnitFactor: products.purchaseUnitFactor,
      lowStockThreshold: products.lowStockThreshold,
      trackExpiry: products.trackExpiry,
      hasVariants: products.hasVariants,
      variantOptions: products.variantOptions,
      taxRateId: products.taxRateId,
      createdAt: products.createdAt,
      totalBatches: sql<number>`(select count(*)::int from ${stockLots} l join ${productVariants} v on v.id = l.variant_id
        where v.product_id = ${qcol(products.id)} and l.location_id = ${locationId} and l.quantity_available > 0)`,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .innerJoin(units, eq(units.id, products.unitId))
    .where(and(eq(products.organizationId, auth.organizationId), eq(products.isActive, true)))
    .orderBy(asc(products.name));

  const ids = rows.map((r) => r.id);
  const variants = ids.length
    ? await db
        .select({
          id: productVariants.id,
          productId: productVariants.productId,
          name: productVariants.name,
          sku: productVariants.sku,
          barcode: productVariants.barcode,
          optionValues: productVariants.optionValues,
          costPrice: productVariants.costPrice,
          sellingPrice: productVariants.sellingPrice,
          mrp: productVariants.mrp,
          isDefault: productVariants.isDefault,
          stock: sql<string>`coalesce((select sl.quantity from ${stockLevels} sl where sl.variant_id = ${qcol(productVariants.id)} and sl.location_id = ${locationId}), 0)`,
        })
        .from(productVariants)
        .where(and(inArray(productVariants.productId, ids), eq(productVariants.isActive, true)))
        .orderBy(desc(productVariants.isDefault), asc(productVariants.createdAt))
    : [];

  const units_ = new Map((await db.select({ id: units.id, code: units.code }).from(units).where(eq(units.organizationId, auth.organizationId))).map((u) => [u.id, u.code]));

  return {
    locationId,
    items: rows.map((r) => {
      const vs = variants
        .filter((v) => v.productId === r.id)
        .map((v) => ({
          ...v,
          costPrice: num(v.costPrice),
          sellingPrice: num(v.sellingPrice),
          mrp: v.mrp === null ? null : num(v.mrp),
          stock: num(v.stock),
        }));
      return {
        ...r,
        purchaseUnitCode: r.purchaseUnitId ? (units_.get(r.purchaseUnitId) ?? null) : null,
        purchaseUnitFactor: r.purchaseUnitFactor === null ? null : num(r.purchaseUnitFactor),
        lowStockThreshold: r.lowStockThreshold === null ? 0 : num(r.lowStockThreshold),
        stockQuantity: vs.reduce((s, v) => s + v.stock, 0),
        variants: vs,
      };
    }),
  };
}

/** Batches at the active location — for one product, or all of them (Batches page). */
export async function listItemBatches(auth: AuthContext, productId?: string) {
  await refreshExpiredLots(db, auth.organizationId);
  const settings = await getSettings(db, auth.organizationId);
  const locationId = await resolveLocationId(db, auth);
  const today = todayIn(settings.timezone);
  const soon = addDays(today, settings.expiryAlertDays);

  if (productId) {
    const p = await db.query.products.findFirst({
      where: and(eq(products.id, productId), eq(products.organizationId, auth.organizationId)),
      columns: { id: true },
    });
    if (!p) throw notFound("Item");
  }

  const rows = await db
    .select({
      id: stockLots.id,
      productId: productVariants.productId,
      productName: products.name,
      variantId: stockLots.variantId,
      variantName: productVariants.name,
      hasVariants: products.hasVariants,
      brandName: brands.name,
      categoryName: categories.name,
      unitCode: units.code,
      lotNumber: stockLots.lotNumber,
      manufacturingDate: stockLots.manufacturingDate,
      expiryDate: stockLots.expiryDate,
      unitCost: stockLots.unitCost,
      mrp: productVariants.mrp,
      sellingPrice: productVariants.sellingPrice,
      quantityReceived: stockLots.quantityReceived,
      quantityAvailable: stockLots.quantityAvailable,
      supplierId: stockLots.supplierId,
      supplierName: parties.name,
      purchaseItemId: stockLots.purchaseItemId,
      note: stockLots.note,
      createdAt: stockLots.createdAt,
    })
    .from(stockLots)
    .innerJoin(productVariants, eq(productVariants.id, stockLots.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(units, eq(units.id, products.unitId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(parties, eq(parties.id, stockLots.supplierId))
    .where(
      and(
        eq(stockLots.organizationId, auth.organizationId),
        eq(stockLots.locationId, locationId),
        productId ? eq(productVariants.productId, productId) : undefined,
      ),
    )
    .orderBy(sql`${stockLots.expiryDate} asc nulls last`, desc(stockLots.createdAt));

  return {
    batches: rows.map((r) => ({
      ...r,
      batchNumber: r.lotNumber ?? "—",
      variantName: r.hasVariants ? r.variantName : null,
      purchasePrice: num(r.unitCost),
      mrp: r.mrp === null ? null : num(r.mrp),
      salePrice: num(r.sellingPrice),
      quantityReceived: num(r.quantityReceived),
      quantityAvailable: num(r.quantityAvailable),
      party: r.supplierId ? { id: r.supplierId, name: r.supplierName ?? "" } : null,
      ...batchStatus(r.expiryDate, today, soon),
    })),
  };
}

/**
 * One row per sellable item (each size/colour separately) for the Purchase and
 * Sales item pickers — the pharmacy screens' "product" shape.
 */
export async function listSellables(auth: AuthContext) {
  const { items } = await listItems(auth);
  return {
    products: items.flatMap((p) =>
      p.variants.map((v) => ({
        id: v.id,
        productId: p.id,
        name: p.hasVariants && v.name ? `${p.name} (${v.name})` : p.name,
        aliasName: p.model ?? v.sku ?? null,
        manufacturer: p.brandName ?? null,
        hsnCode: p.hsCode ?? null,
        unit: p.unitCode,
        alternativeUnit: p.purchaseUnitCode,
        stockQuantity: v.stock,
        trackExpiry: p.trackExpiry,
        barcode: v.barcode,
        costPrice: v.costPrice,
        salePrice: v.sellingPrice,
        mrp: v.mrp,
      })),
    ),
  };
}

/**
 * Sellable batches of one item at the active location, earliest expiry first.
 * With `saleId`, quantities already on that sale count as available (editing it).
 */
export async function listVariantBatches(auth: AuthContext, variantId: string, saleId?: string) {
  await refreshExpiredLots(db, auth.organizationId);
  const locationId = await resolveLocationId(db, auth);
  const [v] = await db
    .select({ id: productVariants.id, mrp: productVariants.mrp, sellingPrice: productVariants.sellingPrice })
    .from(productVariants)
    .where(and(eq(productVariants.id, variantId), eq(productVariants.organizationId, auth.organizationId)));
  if (!v) throw notFound("Item");
  const onSale = saleId
    ? sql`coalesce((select sum(si.quantity) from sale_items si join sales s on s.id = si.sale_id
        where si.sale_id = ${saleId} and si.lot_id = ${qcol(stockLots.id)} and s.status = 'POSTED' and s.organization_id = ${auth.organizationId}), 0)`
    : sql`0`;
  const rows = await db
    .select({
      id: stockLots.id,
      lotNumber: stockLots.lotNumber,
      expiryDate: stockLots.expiryDate,
      status: stockLots.status,
      available: sql<string>`${stockLots.quantityAvailable} + ${onSale}`,
    })
    .from(stockLots)
    .where(and(eq(stockLots.variantId, variantId), eq(stockLots.locationId, locationId), sql`${stockLots.status} <> 'EXPIRED'`))
    .orderBy(sql`${stockLots.expiryDate} asc nulls last`, asc(stockLots.createdAt));
  return {
    batches: rows
      .filter((r) => num(r.available) > 0)
      .map((r) => ({
        id: r.id,
        batchNumber: r.lotNumber ?? "—",
        expiryDate: r.expiryDate ?? "",
        quantityAvailable: num(r.available),
        mrp: (v.mrp === null ? num(v.sellingPrice) : num(v.mrp)).toFixed(2),
        salePrice: num(v.sellingPrice).toFixed(2),
      })),
  };
}
