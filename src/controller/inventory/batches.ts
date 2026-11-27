import { and, desc, eq, lt, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  parties,
  productVariants,
  products,
  purchaseItems,
  purchaseReturnItems,
  purchaseReturns,
  purchases,
  stockAdjustmentItems,
  stockAdjustments,
  stockLots,
  units,
} from "@/db/schema";
import type { AuthContext } from "@/lib/api/handler";
import { badRequest, notFound } from "@/lib/errors";
import { num, round2 } from "@/lib/num";
import { isoDate, nullableText, paymentMethod, quantity, uuid } from "@/lib/validation/common";
import { addDays, todayIn } from "../_shared/dates";
import { refreshExpiredLots } from "../_shared/stock";
import { getSettings, resolveLocationId } from "../_shared/tenant";
import { createAdjustment } from "./adjustments";
import { completePurchaseReturn, createPurchaseReturn } from "../purchasing/returns";

// The pharmacy-style Batches screen: every batch at the active store with its
// expiry countdown, plus "return to supplier" and "write off" on each batch.

const productLabel = sql<string>`case when ${products.hasVariants} then ${products.name} || ' (' || ${productVariants.name} || ')' else ${products.name} end`;

export const batchesQuery = z.object({
  status: z.enum(["all", "expired", "near", "ok"]).default("all"),
  withinDays: z.coerce.number().int().min(0).max(3650).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export async function listBatches(auth: AuthContext, q: z.infer<typeof batchesQuery>) {
  await refreshExpiredLots(db, auth.organizationId);
  const settings = await getSettings(db, auth.organizationId);
  const locationId = await resolveLocationId(db, auth);
  const today = todayIn(settings.timezone);
  const withinDays = q.withinDays ?? settings.expiryAlertDays;
  const soon = addDays(today, withinDays);

  const base: SQL[] = [eq(stockLots.organizationId, auth.organizationId), eq(stockLots.locationId, locationId)];
  if (q.search) {
    const p = `%${q.search.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    base.push(sql`(${products.name} ilike ${p} or ${productVariants.name} ilike ${p} or ${stockLots.lotNumber} ilike ${p} or ${parties.name} ilike ${p})`);
  }
  const expired = sql`${stockLots.expiryDate} is not null and ${stockLots.expiryDate} < ${today}`;
  const near = sql`${stockLots.expiryDate} is not null and ${stockLots.expiryDate} >= ${today} and ${stockLots.expiryDate} <= ${soon}`;
  const filter = { all: undefined, expired, near, ok: sql`not (${expired}) and not (${near})` }[q.status];
  const where = and(...base, filter);

  const [rows, [summary]] = await Promise.all([
    db
      .select({
        batchId: stockLots.id,
        lotNumber: stockLots.lotNumber,
        productId: products.id,
        variantId: stockLots.variantId,
        productName: productLabel,
        unit: units.code,
        partyId: stockLots.supplierId,
        partyName: parties.name,
        expiryDate: stockLots.expiryDate,
        manufacturingDate: stockLots.manufacturingDate,
        quantityReceived: stockLots.quantityReceived,
        quantityAvailable: stockLots.quantityAvailable,
        purchasePrice: stockLots.unitCost,
        mrp: productVariants.mrp,
        salePrice: productVariants.sellingPrice,
        note: stockLots.note,
      })
      .from(stockLots)
      .innerJoin(productVariants, eq(productVariants.id, stockLots.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .leftJoin(parties, eq(parties.id, stockLots.supplierId))
      .where(where)
      .orderBy(sql`${stockLots.expiryDate} asc nulls last`, desc(stockLots.createdAt), stockLots.id)
      .limit(q.limit)
      .offset((q.page - 1) * q.limit),
    db
      .select({
        total: sql<number>`count(*) filter (where ${filter ?? sql`true`})::int`,
        all: sql<number>`count(*)::int`,
        expiredCount: sql<number>`count(*) filter (where ${expired})::int`,
        expiredValue: sql<string>`coalesce(sum(${stockLots.quantityAvailable} * ${stockLots.unitCost}) filter (where ${expired}), 0)`,
        nearCount: sql<number>`count(*) filter (where ${near})::int`,
        nearValue: sql<string>`coalesce(sum(${stockLots.quantityAvailable} * ${stockLots.unitCost}) filter (where ${near}), 0)`,
      })
      .from(stockLots)
      .innerJoin(productVariants, eq(productVariants.id, stockLots.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(parties, eq(parties.id, stockLots.supplierId))
      .where(and(...base)),
  ]);

  return {
    batches: rows.map((r) => {
      const qty = num(r.quantityAvailable);
      const cost = num(r.purchasePrice);
      const daysLeft = r.expiryDate ? Math.round((Date.parse(r.expiryDate) - Date.parse(today)) / 86_400_000) : null;
      const status =
        r.expiryDate && r.expiryDate < today ? "EXPIRED" : r.expiryDate && r.expiryDate <= soon ? "NEAR_EXPIRY" : "ACTIVE";
      return {
        ...r,
        batchNumber: r.lotNumber ?? "—",
        quantityReceived: num(r.quantityReceived),
        quantityAvailable: qty,
        purchasePrice: cost,
        mrp: r.mrp === null ? null : num(r.mrp),
        salePrice: num(r.salePrice),
        valueAtRisk: round2(qty * cost),
        daysLeft,
        status,
      };
    }),
    summary: {
      expired: { count: summary.expiredCount, value: num(summary.expiredValue) },
      nearExpiry: { count: summary.nearCount, value: num(summary.nearValue) },
      total: summary.all,
      withinDays,
    },
    pagination: { page: q.page, limit: q.limit, total: summary.total, totalPages: Math.max(1, Math.ceil(summary.total / q.limit)) },
  };
}

// ── supplier returns, one batch at a time ───────────────────
export async function listBatchReturns(auth: AuthContext) {
  const locationId = await resolveLocationId(db, auth);
  const rows = await db
    .select({
      id: purchaseReturns.id,
      number: purchaseReturns.number,
      batchId: purchaseReturnItems.lotId,
      productId: productVariants.productId,
      quantity: purchaseReturnItems.quantity,
      lineTotal: purchaseReturnItems.lineTotal,
      reason: purchaseReturns.reason,
      status: purchaseReturns.status,
      returnDate: purchaseReturns.returnDate,
      batchNumber: stockLots.lotNumber,
      productName: productLabel,
      partyName: parties.name,
      resolution: purchaseReturns.resolution,
      grandTotal: purchaseReturns.grandTotal,
      refunded: sql<string>`coalesce((select sum(p.amount) from payments p where p.purchase_return_id = ${purchaseReturns.id} and p.status <> 'VOID'), 0)`,
    })
    .from(purchaseReturnItems)
    .innerJoin(purchaseReturns, eq(purchaseReturns.id, purchaseReturnItems.purchaseReturnId))
    .innerJoin(productVariants, eq(productVariants.id, purchaseReturnItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(parties, eq(parties.id, purchaseReturns.partyId))
    .leftJoin(stockLots, eq(stockLots.id, purchaseReturnItems.lotId))
    .where(
      and(
        eq(purchaseReturns.organizationId, auth.organizationId),
        eq(purchaseReturns.locationId, locationId),
        sql`${purchaseReturns.status} <> 'VOID'`,
      ),
    )
    .orderBy(desc(purchaseReturns.createdAt))
    .limit(500);

  return {
    items: rows.map((r) => ({
      ...r,
      quantity: num(r.quantity),
      lineTotal: num(r.lineTotal),
      batchNumber: r.batchNumber ?? "—",
      resolutionType: r.resolution === null ? null : r.resolution === "REPLACEMENT" ? "QUANTITY" : "MONEY",
      resolutionAmount: r.resolution === "REFUND" ? num(r.refunded) : r.resolution === "CREDIT_NOTE" ? num(r.grandTotal) : null,
    })),
  };
}

export const batchReturnSchema = z.object({
  batchId: uuid,
  quantity,
  reason: nullableText(255),
});

export async function returnBatch(auth: AuthContext, input: z.infer<typeof batchReturnSchema>) {
  const locationId = await resolveLocationId(db, auth);
  const [lot] = await db
    .select({ lot: stockLots, purchaseId: purchases.id, purchaseStatus: purchases.status, purchaseLocationId: purchases.locationId })
    .from(stockLots)
    .leftJoin(purchaseItems, eq(purchaseItems.id, stockLots.purchaseItemId))
    .leftJoin(purchases, eq(purchases.id, purchaseItems.purchaseId))
    .where(and(eq(stockLots.id, input.batchId), eq(stockLots.organizationId, auth.organizationId), eq(stockLots.locationId, locationId)));
  if (!lot) throw notFound("Batch");
  if (!lot.lot.supplierId) throw badRequest("This batch isn't linked to a supplier, so it can't be returned. Write it off instead.");
  if (input.quantity > num(lot.lot.quantityAvailable) + 1e-9) {
    throw badRequest(`Only ${num(lot.lot.quantityAvailable)} left on this batch`);
  }
  // Link the return to the original bill when the batch is still where it was bought.
  const fromBill = lot.purchaseId && lot.purchaseStatus === "POSTED" && lot.purchaseLocationId === locationId;
  return createPurchaseReturn(auth, {
    purchaseId: fromBill ? lot.purchaseId! : undefined,
    partyId: fromBill ? undefined : lot.lot.supplierId,
    reason: input.reason ?? null,
    note: null,
    items: [
      {
        purchaseItemId: fromBill ? lot.lot.purchaseItemId! : undefined,
        variantId: lot.lot.variantId,
        quantity: input.quantity,
        unitCost: fromBill ? undefined : num(lot.lot.unitCost),
        lotId: lot.lot.id,
        serials: [],
      },
    ],
  });
}

export const settleReturnSchema = z.discriminatedUnion("resolutionType", [
  z.object({
    resolutionType: z.literal("MONEY"),
    settleAs: z.enum(["REFUND", "CREDIT_NOTE"]).default("REFUND"),
    resolutionAmount: z.coerce.number().positive().optional(),
    method: paymentMethod.default("CASH"),
  }),
  z.object({
    resolutionType: z.literal("QUANTITY"),
    expiryDate: isoDate.nullable().optional(),
    manufacturingDate: isoDate.nullable().optional(),
  }),
]);

export async function settleReturn(auth: AuthContext, id: string, input: z.infer<typeof settleReturnSchema>) {
  if (input.resolutionType === "MONEY") {
    return completePurchaseReturn(auth, id, {
      resolution: input.settleAs,
      refund: input.settleAs === "REFUND" ? { amount: input.resolutionAmount, method: input.method, referenceNumber: null, notes: null } : undefined,
      replacements: [],
    });
  }
  const items = await db
    .select({ id: purchaseReturnItems.id })
    .from(purchaseReturnItems)
    .innerJoin(purchaseReturns, eq(purchaseReturns.id, purchaseReturnItems.purchaseReturnId))
    .where(and(eq(purchaseReturnItems.purchaseReturnId, id), eq(purchaseReturns.organizationId, auth.organizationId)));
  return completePurchaseReturn(auth, id, {
    resolution: "REPLACEMENT",
    replacements: items.map((i) => ({
      returnItemId: i.id,
      lotNumber: undefined,
      expiryDate: input.expiryDate ?? null,
      manufacturingDate: input.manufacturingDate ?? null,
      serials: [],
    })),
  });
}

// ── write-offs: the whole remaining stock of a batch ────────
export async function listWriteOffs(auth: AuthContext) {
  const locationId = await resolveLocationId(db, auth);
  const rows = await db
    .select({
      id: stockAdjustmentItems.id,
      batchId: stockAdjustmentItems.lotId,
      quantity: stockAdjustmentItems.quantity,
      lineValue: stockAdjustmentItems.lineValue,
      reason: stockAdjustments.reason,
      note: stockAdjustments.note,
      createdAt: stockAdjustments.createdAt,
    })
    .from(stockAdjustmentItems)
    .innerJoin(stockAdjustments, eq(stockAdjustments.id, stockAdjustmentItems.adjustmentId))
    .where(
      and(
        eq(stockAdjustments.organizationId, auth.organizationId),
        eq(stockAdjustments.locationId, locationId),
        lt(stockAdjustmentItems.quantity, "0"),
        sql`${stockAdjustmentItems.lotId} is not null`,
      ),
    )
    .orderBy(desc(stockAdjustments.createdAt));
  return {
    writeOffs: rows.map((r) => ({
      ...r,
      quantity: Math.abs(num(r.quantity)),
      totalLoss: Math.abs(num(r.lineValue)),
    })),
  };
}

export const writeOffSchema = z.object({
  batchId: uuid,
  reason: nullableText(1000),
});

export async function writeOffBatch(auth: AuthContext, input: z.infer<typeof writeOffSchema>) {
  const settings = await getSettings(db, auth.organizationId);
  const locationId = await resolveLocationId(db, auth);
  const lot = await db.query.stockLots.findFirst({
    where: and(eq(stockLots.id, input.batchId), eq(stockLots.organizationId, auth.organizationId), eq(stockLots.locationId, locationId)),
  });
  if (!lot) throw notFound("Batch");
  const qty = num(lot.quantityAvailable);
  if (qty <= 0) throw badRequest("This batch has no stock left to write off");
  const expired = lot.expiryDate !== null && lot.expiryDate < todayIn(settings.timezone);
  return createAdjustment(auth, {
    reason: expired ? "EXPIRED" : "DAMAGED",
    note: input.reason ?? null,
    items: [{ variantId: lot.variantId, quantity: -qty, lotId: lot.id, lotNumber: null, note: null, serials: [] }],
  });
}
