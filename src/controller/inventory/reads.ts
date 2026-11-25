import { and, asc, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import {
  categories,
  locations,
  parties,
  productVariants,
  products,
  serialNumbers,
  stockLevels,
  stockLots,
  stockMovements,
  units,
  users,
} from "@/db/schema";
import type { AuthContext } from "@/lib/api/handler";
import { num } from "@/lib/num";
import type { lotsQuery, movementsQuery, serialsQuery, stockQuery } from "@/lib/validation/inventory";
import { addDays, todayIn } from "../_shared/dates";
import { countAll, likePattern, offsetFor, pageOf } from "../_shared/paging";
import { refreshExpiredLots } from "../_shared/stock";
import { getSettings, resolveLocationFilter } from "../_shared/tenant";

const displayName = sql<string>`case when ${productVariants.isDefault} then ${products.name} else ${products.name} || ' (' || ${productVariants.name} || ')' end`;

function variantSearch(search: string | undefined): SQL | undefined {
  if (!search) return undefined;
  const p = likePattern(search);
  return or(
    ilike(products.name, p),
    ilike(productVariants.name, p),
    ilike(productVariants.sku, p),
    ilike(productVariants.barcode, p),
  );
}

// ── stock levels ─────────────────────────────────────────────
export async function listStock(auth: AuthContext, q: z.infer<typeof stockQuery>) {
  const locationId = await resolveLocationFilter(db, auth, q.locationId);
  const threshold = sql`coalesce(${productVariants.lowStockThreshold}, ${products.lowStockThreshold})`;
  const conds: (SQL | undefined)[] = [
    eq(stockLevels.organizationId, auth.organizationId),
    locationId ? eq(stockLevels.locationId, locationId) : undefined,
    q.categoryId ? eq(products.categoryId, q.categoryId) : undefined,
    variantSearch(q.search),
  ];
  if (q.status === "out") conds.push(sql`${stockLevels.quantity} = 0`);
  if (q.status === "negative") conds.push(sql`${stockLevels.quantity} < 0`);
  if (q.status === "in") conds.push(sql`${stockLevels.quantity} > 0`);
  if (q.status === "low") conds.push(sql`${stockLevels.quantity} > 0 and ${threshold} is not null and ${stockLevels.quantity} <= ${threshold}`);
  if (!q.status) {
    // hide empty rows of archived items
    conds.push(sql`(${stockLevels.quantity} <> 0 or (${productVariants.isActive} and ${products.isActive}))`);
  }
  const where = and(...conds);
  const value = sql`${stockLevels.quantity} * ${stockLevels.avgCost}`;
  const order = {
    name: asc(products.name),
    quantity: asc(stockLevels.quantity),
    "-quantity": desc(stockLevels.quantity),
    value: sql`${value} asc`,
    "-value": sql`${value} desc`,
  }[q.sort];

  const from = () =>
    db
      .select({
        id: stockLevels.id,
        variantId: productVariants.id,
        productId: products.id,
        displayName,
        sku: productVariants.sku,
        barcode: productVariants.barcode,
        categoryName: categories.name,
        unitCode: units.code,
        locationId: locations.id,
        locationName: locations.name,
        quantity: stockLevels.quantity,
        avgCost: stockLevels.avgCost,
        sellingPrice: productVariants.sellingPrice,
        lowStockThreshold: sql<string | null>`${threshold}`,
        trackBatches: products.trackBatches,
        trackSerials: products.trackSerials,
        isActive: sql<boolean>`${productVariants.isActive} and ${products.isActive}`,
        updatedAt: stockLevels.updatedAt,
      })
      .from(stockLevels)
      .innerJoin(productVariants, eq(productVariants.id, stockLevels.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .innerJoin(locations, eq(locations.id, stockLevels.locationId))
      .leftJoin(categories, eq(categories.id, products.categoryId));

  const [rows, [summary]] = await Promise.all([
    from()
      .where(where)
      .orderBy(order, asc(stockLevels.id))
      .limit(q.limit)
      .offset(offsetFor(q.page, q.limit)),
    db
      .select({
        total: countAll,
        totalQuantity: sql<string>`coalesce(sum(${stockLevels.quantity}), 0)`,
        totalValue: sql<string>`coalesce(sum(case when ${stockLevels.quantity} > 0 then ${value} else 0 end), 0)`,
        retailValue: sql<string>`coalesce(sum(case when ${stockLevels.quantity} > 0 then ${stockLevels.quantity} * ${productVariants.sellingPrice} else 0 end), 0)`,
      })
      .from(stockLevels)
      .innerJoin(productVariants, eq(productVariants.id, stockLevels.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(where),
  ]);

  const items = rows.map((r) => {
    const qty = num(r.quantity);
    const t = r.lowStockThreshold === null ? null : num(r.lowStockThreshold);
    return {
      ...r,
      quantity: qty,
      avgCost: num(r.avgCost),
      sellingPrice: num(r.sellingPrice),
      lowStockThreshold: t,
      value: Math.round(qty * num(r.avgCost) * 100) / 100,
      status: qty < 0 ? "NEGATIVE" : qty === 0 ? "OUT" : t !== null && qty <= t ? "LOW" : "IN",
    };
  });
  return {
    ...pageOf(items, summary.total, q.page, q.limit),
    summary: {
      totalQuantity: num(summary.totalQuantity),
      costValue: num(summary.totalValue),
      retailValue: num(summary.retailValue),
    },
    locationId: locationId ?? "all",
  };
}

// ── lots / batches ───────────────────────────────────────────
export async function listLots(auth: AuthContext, q: z.infer<typeof lotsQuery>) {
  await refreshExpiredLots(db, auth.organizationId);
  const settings = await getSettings(db, auth.organizationId);
  const locationId = await resolveLocationFilter(db, auth, q.locationId);
  const today = todayIn(settings.timezone);

  const conds: (SQL | undefined)[] = [
    eq(stockLots.organizationId, auth.organizationId),
    locationId ? eq(stockLots.locationId, locationId) : undefined,
    q.variantId ? eq(stockLots.variantId, q.variantId) : undefined,
    q.status ? eq(stockLots.status, q.status) : undefined,
    q.search ? or(variantSearch(q.search), ilike(stockLots.lotNumber, likePattern(q.search))) : undefined,
  ];
  if (q.expiringWithinDays !== undefined) {
    conds.push(
      sql`${stockLots.expiryDate} is not null and ${stockLots.expiryDate} >= ${today} and ${stockLots.expiryDate} <= ${addDays(today, q.expiringWithinDays)} and ${stockLots.quantityAvailable} > 0`,
    );
  }
  const where = and(...conds);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: stockLots.id,
        variantId: stockLots.variantId,
        displayName,
        sku: productVariants.sku,
        unitCode: units.code,
        locationId: stockLots.locationId,
        locationName: locations.name,
        supplierName: parties.name,
        lotNumber: stockLots.lotNumber,
        manufacturingDate: stockLots.manufacturingDate,
        expiryDate: stockLots.expiryDate,
        unitCost: stockLots.unitCost,
        quantityReceived: stockLots.quantityReceived,
        quantityAvailable: stockLots.quantityAvailable,
        status: stockLots.status,
        createdAt: stockLots.createdAt,
      })
      .from(stockLots)
      .innerJoin(productVariants, eq(productVariants.id, stockLots.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .innerJoin(locations, eq(locations.id, stockLots.locationId))
      .leftJoin(parties, eq(parties.id, stockLots.supplierId))
      .where(where)
      .orderBy(sql`${stockLots.expiryDate} asc nulls last`, desc(stockLots.createdAt))
      .limit(q.limit)
      .offset(offsetFor(q.page, q.limit)),
    db
      .select({ total: countAll })
      .from(stockLots)
      .innerJoin(productVariants, eq(productVariants.id, stockLots.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(where),
  ]);

  const items = rows.map((r) => ({
    ...r,
    unitCost: num(r.unitCost),
    quantityReceived: num(r.quantityReceived),
    quantityAvailable: num(r.quantityAvailable),
    daysToExpiry: r.expiryDate ? Math.round((Date.parse(r.expiryDate) - Date.parse(today)) / 86_400_000) : null,
  }));
  return pageOf(items, total, q.page, q.limit);
}

// ── serial numbers ───────────────────────────────────────────
export async function listSerials(auth: AuthContext, q: z.infer<typeof serialsQuery>) {
  const locationId = await resolveLocationFilter(db, auth, q.locationId);
  const where = and(
    eq(serialNumbers.organizationId, auth.organizationId),
    locationId ? eq(serialNumbers.locationId, locationId) : undefined,
    q.variantId ? eq(serialNumbers.variantId, q.variantId) : undefined,
    q.status ? eq(serialNumbers.status, q.status) : undefined,
    q.search ? or(ilike(serialNumbers.serialNumber, likePattern(q.search)), variantSearch(q.search)) : undefined,
  );
  const [items, [{ total }]] = await Promise.all([
    db
      .select({
        id: serialNumbers.id,
        serialNumber: serialNumbers.serialNumber,
        status: serialNumbers.status,
        variantId: serialNumbers.variantId,
        displayName,
        sku: productVariants.sku,
        locationId: serialNumbers.locationId,
        locationName: locations.name,
        purchaseItemId: serialNumbers.purchaseItemId,
        saleItemId: serialNumbers.saleItemId,
        warrantyEndsOn: serialNumbers.warrantyEndsOn,
        updatedAt: serialNumbers.updatedAt,
      })
      .from(serialNumbers)
      .innerJoin(productVariants, eq(productVariants.id, serialNumbers.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(locations, eq(locations.id, serialNumbers.locationId))
      .where(where)
      .orderBy(desc(serialNumbers.updatedAt))
      .limit(q.limit)
      .offset(offsetFor(q.page, q.limit)),
    db
      .select({ total: countAll })
      .from(serialNumbers)
      .innerJoin(productVariants, eq(productVariants.id, serialNumbers.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(where),
  ]);
  return pageOf(items, total, q.page, q.limit);
}

// ── movement history ─────────────────────────────────────────
export async function listMovements(auth: AuthContext, q: z.infer<typeof movementsQuery>) {
  const settings = await getSettings(db, auth.organizationId);
  const locationId = await resolveLocationFilter(db, auth, q.locationId);
  const day = sql`(${stockMovements.occurredAt} at time zone ${settings.timezone})::date`;
  const where = and(
    eq(stockMovements.organizationId, auth.organizationId),
    locationId ? eq(stockMovements.locationId, locationId) : undefined,
    q.variantId ? eq(stockMovements.variantId, q.variantId) : undefined,
    q.productId ? eq(productVariants.productId, q.productId) : undefined,
    q.type ? eq(stockMovements.type, q.type) : undefined,
    q.from ? gte(day, q.from) : undefined,
    q.to ? lte(day, q.to) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: stockMovements.id,
        occurredAt: stockMovements.occurredAt,
        type: stockMovements.type,
        variantId: stockMovements.variantId,
        displayName,
        sku: productVariants.sku,
        unitCode: units.code,
        locationId: stockMovements.locationId,
        locationName: locations.name,
        lotId: stockMovements.lotId,
        lotNumber: stockLots.lotNumber,
        quantity: stockMovements.quantity,
        unitCost: stockMovements.unitCost,
        balanceAfter: stockMovements.balanceAfter,
        referenceType: stockMovements.referenceType,
        referenceId: stockMovements.referenceId,
        note: stockMovements.note,
        userName: users.name,
      })
      .from(stockMovements)
      .innerJoin(productVariants, eq(productVariants.id, stockMovements.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .innerJoin(locations, eq(locations.id, stockMovements.locationId))
      .leftJoin(stockLots, eq(stockLots.id, stockMovements.lotId))
      .leftJoin(users, eq(users.id, stockMovements.createdByUserId))
      .where(where)
      .orderBy(desc(stockMovements.occurredAt), desc(stockMovements.id))
      .limit(q.limit)
      .offset(offsetFor(q.page, q.limit)),
    db
      .select({ total: countAll })
      .from(stockMovements)
      .innerJoin(productVariants, eq(productVariants.id, stockMovements.variantId))
      .where(where),
  ]);
  const items = rows.map((r) => ({
    ...r,
    quantity: num(r.quantity),
    unitCost: num(r.unitCost),
    balanceAfter: num(r.balanceAfter),
  }));
  return pageOf(items, total, q.page, q.limit);
}
