import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { db, type Tx } from "@/db";
import {
  locations,
  parties,
  payments,
  productVariants,
  products,
  purchaseItems,
  purchaseReturnItems,
  purchaseReturns,
  purchases,
  stockLots,
  units,
  users,
} from "@/db/schema";
import type { AuthContext } from "@/lib/api/handler";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { costStr, money, num, qtyStr, round2, round3, round4 } from "@/lib/num";
import type {
  CompletePurchaseReturnInput,
  PurchaseReturnInput,
  purchaseReturnsQuery,
} from "@/lib/validation/purchasing";
import { todayIn } from "../_shared/dates";
import { countAll, likePattern, offsetFor, pageOf } from "../_shared/paging";
import { loadParty } from "../_shared/parties";
import { recordPayment, refreshPurchasePayment } from "../_shared/payments";
import { nextDocumentNumber } from "../_shared/sequences";
import { issueStock, loadVariants, receiveStock } from "../_shared/stock";
import { getSettings, resolveLocationFilter, resolveLocationId } from "../_shared/tenant";

// Purchase return lifecycle:
//   create → PENDING   goods leave stock immediately (sent back to supplier)
//   complete → COMPLETED with a resolution:
//       REFUND       supplier pays money back (REFUND_FROM_SUPPLIER payment)
//       CREDIT_NOTE  supplier reduces what we owe (ledger only)
//       REPLACEMENT  supplier sends the same goods again (stock comes back in)
//   void (PENDING only) → goods go back into stock

export async function createPurchaseReturn(auth: AuthContext, input: PurchaseReturnInput) {
  const id = await db.transaction(async (tx) => {
    const settings = await getSettings(tx, auth.organizationId);

    let purchase: typeof purchases.$inferSelect | undefined;
    let itemsById = new Map<string, typeof purchaseItems.$inferSelect>();
    if (input.purchaseId) {
      [purchase] = await tx
        .select()
        .from(purchases)
        .where(and(eq(purchases.id, input.purchaseId), eq(purchases.organizationId, auth.organizationId)))
        .for("update");
      if (!purchase) throw notFound("Purchase");
      if (purchase.status === "VOID") throw conflict("Can't return goods from a void purchase");
      if (input.partyId && input.partyId !== purchase.partyId) throw badRequest("Supplier doesn't match the purchase");
      const rows = await tx.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, purchase.id)).for("update");
      itemsById = new Map(rows.map((r) => [r.id, r]));
    }
    const partyId = purchase?.partyId ?? input.partyId!;
    await loadParty(tx, auth.organizationId, partyId, "SUPPLIER");
    const locationId = await resolveLocationId(tx, auth, input.locationId ?? purchase?.locationId);
    if (purchase && purchase.locationId !== locationId) {
      throw badRequest("Return the goods from the location they were received at");
    }

    const variants = await loadVariants(
      tx,
      auth.organizationId,
      input.items.map((i) => i.variantId),
    );
    // bill-level discount reduces what each unit actually cost us
    const billFactor = purchase && num(purchase.subtotal) > 0 ? 1 - num(purchase.discount) / num(purchase.subtotal) : 1;
    const taxMode = purchase?.taxMode ?? "EXCLUSIVE";

    const number = await nextDocumentNumber(tx, auth.organizationId, "PURCHASE_RETURN");
    const [ret] = await tx
      .insert(purchaseReturns)
      .values({
        organizationId: auth.organizationId,
        locationId,
        partyId,
        purchaseId: purchase?.id ?? null,
        number,
        returnDate: input.returnDate ?? todayIn(settings.timezone),
        subtotal: "0",
        grandTotal: "0",
        reason: input.reason ?? null,
        note: input.note ?? null,
        createdByUserId: auth.userId,
      })
      .returning({ id: purchaseReturns.id });

    let subtotal = 0;
    let taxTotal = 0;
    for (const line of input.items) {
      const v = variants.get(line.variantId)!;
      let unitCost: number;
      let taxRate: number;
      let lotId = line.lotId ?? null;
      const src = line.purchaseItemId ? itemsById.get(line.purchaseItemId) : undefined;

      if (line.purchaseItemId) {
        if (!src || src.variantId !== v.id) throw badRequest(`${v.displayName} is not on the selected purchase`);
        const returnable = round3(num(src.quantity) - num(src.quantityReturned));
        if (line.quantity > returnable + 1e-9) {
          throw badRequest(`Only ${returnable} of ${v.displayName} can still be returned from this purchase`);
        }
        unitCost = round4((num(src.lineTotal) / num(src.quantity)) * billFactor);
        taxRate = num(src.taxRate);
        lotId = lotId ?? src.lotId;
        await tx
          .update(purchaseItems)
          .set({ quantityReturned: sql`${purchaseItems.quantityReturned} + ${qtyStr(line.quantity)}` })
          .where(eq(purchaseItems.id, src.id));
      } else {
        if (purchase) throw badRequest(`Pick the purchase line for ${v.displayName}`);
        unitCost = line.unitCost ?? v.costPrice;
        taxRate = line.taxRate ?? v.taxRate;
      }

      const allocations = await issueStock(tx, {
        organizationId: auth.organizationId,
        locationId,
        variant: v,
        quantity: line.quantity,
        movementType: "PURCHASE_RETURN",
        referenceType: "PURCHASE_RETURN",
        referenceId: ret.id,
        userId: auth.userId,
        lotId,
        serials: line.serials,
        serialStatus: "RETURNED_TO_SUPPLIER",
        allowNegative: false,
        allowExpired: true, // expired goods are the classic return to supplier
      });

      for (const a of allocations) {
        const gross = round2(a.quantity * unitCost);
        const tax =
          taxMode === "EXEMPT"
            ? 0
            : taxMode === "INCLUSIVE"
              ? round2(gross - gross / (1 + taxRate / 100))
              : round2((gross * taxRate) / 100);
        const lineTotal = taxMode === "EXCLUSIVE" ? round2(gross + tax) : gross;
        subtotal += taxMode === "INCLUSIVE" ? gross - tax : gross;
        taxTotal += tax;
        await tx.insert(purchaseReturnItems).values({
          purchaseReturnId: ret.id,
          purchaseItemId: src?.id ?? null,
          variantId: v.id,
          lotId: a.lotId,
          quantity: qtyStr(a.quantity),
          unitCost: costStr(unitCost),
          taxRate: String(taxRate),
          taxAmount: money(tax),
          lineTotal: money(lineTotal),
          serialNumbers: allocations.length === 1 ? line.serials : [],
        });
      }
    }

    await tx
      .update(purchaseReturns)
      .set({ subtotal: money(subtotal), taxAmount: money(taxTotal), grandTotal: money(subtotal + taxTotal) })
      .where(eq(purchaseReturns.id, ret.id));
    return ret.id;
  });
  return getPurchaseReturn(auth, id);
}

async function lockReturn(tx: Tx, auth: AuthContext, id: string) {
  const [r] = await tx
    .select()
    .from(purchaseReturns)
    .where(and(eq(purchaseReturns.id, id), eq(purchaseReturns.organizationId, auth.organizationId)))
    .for("update");
  if (!r) throw notFound("Purchase return");
  await resolveLocationId(tx, auth, r.locationId);
  return r;
}

export async function completePurchaseReturn(auth: AuthContext, id: string, input: CompletePurchaseReturnInput) {
  await db.transaction(async (tx) => {
    const r = await lockReturn(tx, auth, id);
    if (r.status !== "PENDING") throw conflict(`This return is already ${r.status.toLowerCase()}`);
    const settings = await getSettings(tx, auth.organizationId);
    const today = todayIn(settings.timezone);

    if (input.resolution === "REFUND") {
      const amount = round2(input.refund?.amount ?? num(r.grandTotal));
      if (amount <= 0) throw badRequest("Refund amount must be greater than zero");
      if (amount > num(r.grandTotal) + 0.004) throw badRequest("Refund can't exceed the return total");
      await recordPayment(tx, {
        organizationId: auth.organizationId,
        locationId: r.locationId,
        direction: "REFUND_FROM_SUPPLIER",
        partyId: r.partyId,
        purchaseReturnId: r.id,
        amount,
        paymentDate: input.refund?.paymentDate ?? today,
        method: input.refund?.method ?? "CASH",
        referenceNumber: input.refund?.referenceNumber,
        notes: input.refund?.notes,
        userId: auth.userId,
      });
    }

    if (input.resolution === "REPLACEMENT") {
      const items = await tx.select().from(purchaseReturnItems).where(eq(purchaseReturnItems.purchaseReturnId, id));
      const variants = await loadVariants(
        tx,
        auth.organizationId,
        items.map((i) => i.variantId),
      );
      const details = new Map(input.replacements.map((x) => [x.returnItemId, x]));
      for (const item of items) {
        const v = variants.get(item.variantId)!;
        const d = details.get(item.id);
        const original = item.lotId ? await tx.query.stockLots.findFirst({ where: eq(stockLots.id, item.lotId) }) : undefined;
        await receiveStock(tx, {
          organizationId: auth.organizationId,
          locationId: r.locationId,
          variant: v,
          quantity: num(item.quantity),
          unitCost: num(item.unitCost),
          movementType: "PURCHASE",
          referenceType: "PURCHASE_RETURN",
          referenceId: r.id,
          userId: auth.userId,
          note: `Replacement for ${r.number}`,
          lot: {
            lotNumber: d?.lotNumber ?? original?.lotNumber ?? null,
            manufacturingDate: d?.manufacturingDate ?? original?.manufacturingDate ?? null,
            expiryDate: d?.expiryDate ?? original?.expiryDate ?? null,
            supplierId: r.partyId,
            purchaseItemId: original?.purchaseItemId ?? null,
          },
          serials: v.trackSerials ? { numbers: d?.serials ?? [], mode: "create" } : undefined,
        });
      }
    }

    await tx
      .update(purchaseReturns)
      .set({ status: "COMPLETED", resolution: input.resolution, completedAt: new Date() })
      .where(eq(purchaseReturns.id, id));
    if (r.purchaseId) await refreshPurchasePayment(tx, r.purchaseId);
  });
  return getPurchaseReturn(auth, id);
}

export async function voidPurchaseReturn(auth: AuthContext, id: string) {
  await db.transaction(async (tx) => {
    const r = await lockReturn(tx, auth, id);
    if (r.status !== "PENDING") {
      throw conflict("Only pending returns can be voided — completed returns are settled with the supplier");
    }
    const items = await tx.select().from(purchaseReturnItems).where(eq(purchaseReturnItems.purchaseReturnId, id));
    const variants = await loadVariants(
      tx,
      auth.organizationId,
      items.map((i) => i.variantId),
    );
    for (const item of items) {
      const v = variants.get(item.variantId)!;
      await receiveStock(tx, {
        organizationId: auth.organizationId,
        locationId: r.locationId,
        variant: v,
        quantity: num(item.quantity),
        unitCost: item.lotId
          ? num((await tx.query.stockLots.findFirst({ where: eq(stockLots.id, item.lotId) }))?.unitCost)
          : num(item.unitCost),
        movementType: "PURCHASE",
        referenceType: "PURCHASE_RETURN",
        referenceId: r.id,
        userId: auth.userId,
        note: `Return ${r.number} voided`,
        lot: item.lotId ? { existingLotId: item.lotId } : undefined,
        serials: v.trackSerials ? { numbers: item.serialNumbers, mode: "restock" } : undefined,
      });
      if (item.purchaseItemId) {
        await tx
          .update(purchaseItems)
          .set({ quantityReturned: sql`greatest(${purchaseItems.quantityReturned} - ${item.quantity}, 0)` })
          .where(eq(purchaseItems.id, item.purchaseItemId));
      }
    }
    await tx.update(purchaseReturns).set({ status: "VOID" }).where(eq(purchaseReturns.id, id));
  });
  return getPurchaseReturn(auth, id);
}

const displayName = sql<string>`case when ${productVariants.isDefault} then ${products.name} else ${products.name} || ' (' || ${productVariants.name} || ')' end`;

export async function getPurchaseReturn(auth: AuthContext, id: string) {
  const [row] = await db
    .select({
      ret: purchaseReturns,
      partyName: parties.name,
      locationName: locations.name,
      purchaseNumber: purchases.number,
      createdByName: users.name,
    })
    .from(purchaseReturns)
    .innerJoin(parties, eq(parties.id, purchaseReturns.partyId))
    .innerJoin(locations, eq(locations.id, purchaseReturns.locationId))
    .leftJoin(purchases, eq(purchases.id, purchaseReturns.purchaseId))
    .leftJoin(users, eq(users.id, purchaseReturns.createdByUserId))
    .where(and(eq(purchaseReturns.id, id), eq(purchaseReturns.organizationId, auth.organizationId)));
  if (!row) throw notFound("Purchase return");
  if (!auth.isOwner) await resolveLocationId(db, auth, row.ret.locationId);

  const [items, refunds] = await Promise.all([
    db
      .select({
        id: purchaseReturnItems.id,
        variantId: purchaseReturnItems.variantId,
        displayName,
        sku: productVariants.sku,
        unitCode: units.code,
        trackBatches: products.trackBatches,
        trackExpiry: products.trackExpiry,
        trackSerials: products.trackSerials,
        lotId: purchaseReturnItems.lotId,
        lotNumber: stockLots.lotNumber,
        expiryDate: stockLots.expiryDate,
        quantity: purchaseReturnItems.quantity,
        unitCost: purchaseReturnItems.unitCost,
        taxRate: purchaseReturnItems.taxRate,
        taxAmount: purchaseReturnItems.taxAmount,
        lineTotal: purchaseReturnItems.lineTotal,
        serialNumbers: purchaseReturnItems.serialNumbers,
      })
      .from(purchaseReturnItems)
      .innerJoin(productVariants, eq(productVariants.id, purchaseReturnItems.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .leftJoin(stockLots, eq(stockLots.id, purchaseReturnItems.lotId))
      .where(eq(purchaseReturnItems.purchaseReturnId, id)),
    db
      .select({ id: payments.id, number: payments.number, amount: payments.amount, method: payments.method, paymentDate: payments.paymentDate, status: payments.status })
      .from(payments)
      .where(eq(payments.purchaseReturnId, id)),
  ]);
  const r = row.ret;
  return {
    purchaseReturn: {
      ...r,
      subtotal: num(r.subtotal),
      taxAmount: num(r.taxAmount),
      grandTotal: num(r.grandTotal),
      partyName: row.partyName,
      locationName: row.locationName,
      purchaseNumber: row.purchaseNumber,
      createdByName: row.createdByName,
      items: items.map((i) => ({
        ...i,
        quantity: num(i.quantity),
        unitCost: num(i.unitCost),
        taxRate: num(i.taxRate),
        taxAmount: num(i.taxAmount),
        lineTotal: num(i.lineTotal),
      })),
      refunds: refunds.map((p) => ({ ...p, amount: num(p.amount) })),
    },
  };
}

export async function listPurchaseReturns(auth: AuthContext, q: z.infer<typeof purchaseReturnsQuery>) {
  const locationId = await resolveLocationFilter(db, auth, q.locationId);
  const where = and(
    eq(purchaseReturns.organizationId, auth.organizationId),
    locationId ? eq(purchaseReturns.locationId, locationId) : undefined,
    q.partyId ? eq(purchaseReturns.partyId, q.partyId) : undefined,
    q.status ? eq(purchaseReturns.status, q.status) : undefined,
    q.search ? or(ilike(purchaseReturns.number, likePattern(q.search)), ilike(parties.name, likePattern(q.search))) : undefined,
    q.from ? gte(purchaseReturns.returnDate, q.from) : undefined,
    q.to ? lte(purchaseReturns.returnDate, q.to) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: purchaseReturns.id,
        number: purchaseReturns.number,
        returnDate: purchaseReturns.returnDate,
        status: purchaseReturns.status,
        resolution: purchaseReturns.resolution,
        grandTotal: purchaseReturns.grandTotal,
        reason: purchaseReturns.reason,
        partyName: parties.name,
        purchaseNumber: purchases.number,
        locationName: locations.name,
        createdAt: purchaseReturns.createdAt,
      })
      .from(purchaseReturns)
      .innerJoin(parties, eq(parties.id, purchaseReturns.partyId))
      .innerJoin(locations, eq(locations.id, purchaseReturns.locationId))
      .leftJoin(purchases, eq(purchases.id, purchaseReturns.purchaseId))
      .where(where)
      .orderBy(desc(purchaseReturns.returnDate), desc(purchaseReturns.createdAt))
      .limit(q.limit)
      .offset(offsetFor(q.page, q.limit)),
    db
      .select({ total: countAll })
      .from(purchaseReturns)
      .innerJoin(parties, eq(parties.id, purchaseReturns.partyId))
      .where(where),
  ]);
  return pageOf(
    rows.map((r) => ({ ...r, grandTotal: num(r.grandTotal) })),
    total,
    q.page,
    q.limit,
  );
}
