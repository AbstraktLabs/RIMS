import { and, desc, eq, gte, ilike, inArray, lte, ne, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { db, type Tx } from "@/db";
import {
  locations,
  parties,
  payments,
  productVariants,
  products,
  purchaseItems,
  purchaseOrderItems,
  purchaseOrders,
  purchaseReturns,
  purchases,
  serialNumbers,
  stockLots,
  units,
  users,
} from "@/db/schema";
import type { AuthContext } from "@/lib/api/handler";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { costStr, money, num, qtyStr, round2, round3 } from "@/lib/num";
import type { PaymentInput, PurchaseInput, purchasesQuery } from "@/lib/validation/purchasing";
import { todayIn } from "../_shared/dates";
import { countAll, likePattern, offsetFor, pageOf } from "../_shared/paging";
import { loadParty } from "../_shared/parties";
import { recordPayment, refreshPurchasePayment, voidPaymentsFor } from "../_shared/payments";
import { nextDocumentNumber } from "../_shared/sequences";
import { issueStock, loadVariants, receiveStock } from "../_shared/stock";
import { landedUnitCosts, totalsOrBadRequest } from "../_shared/totals";
import { getSettings, resolveLocationFilter, resolveLocationId } from "../_shared/tenant";
import { toBaseUnits } from "./lines";
import { refreshOrderReceipt } from "./orders";
import { qcol } from "../_shared/sql";

export async function createPurchase(auth: AuthContext, input: PurchaseInput) {
  const id = await db.transaction((tx) => writePurchase(tx, auth, input, null));
  return getPurchase(auth, id);
}

/**
 * Inserts a purchase, or (when `existing` is given) rewrites one in place after its old
 * stock and payments have been reversed. Keeps the purchase number on edit.
 */
async function writePurchase(
  tx: Tx,
  auth: AuthContext,
  input: PurchaseInput,
  existing: { id: string; number: string; locationId: string } | null,
) {
  {
    const settings = await getSettings(tx, auth.organizationId);
    const party = await loadParty(tx, auth.organizationId, input.partyId, "SUPPLIER");
    const locationId = existing ? existing.locationId : await resolveLocationId(tx, auth, input.locationId);
    const today = todayIn(settings.timezone);
    const purchaseDate = input.purchaseDate ?? today;
    const variants = await loadVariants(
      tx,
      auth.organizationId,
      input.items.map((i) => i.variantId),
    );

    // receiving against a purchase order
    let orderItems = new Map<string, typeof purchaseOrderItems.$inferSelect>();
    if (input.purchaseOrderId) {
      const [po] = await tx
        .select()
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.id, input.purchaseOrderId), eq(purchaseOrders.organizationId, auth.organizationId)))
        .for("update");
      if (!po) throw notFound("Purchase order");
      if (po.partyId !== party.id) throw badRequest("The purchase order belongs to a different supplier");
      if (po.status === "CANCELLED" || po.status === "RECEIVED") {
        throw conflict(`This purchase order is ${po.status.toLowerCase()}`);
      }
      const rows = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, po.id));
      orderItems = new Map(rows.map((r) => [r.id, r]));
    }

    const taxMode = input.taxMode ?? (settings.pricesIncludeTax ? "INCLUSIVE" : "EXCLUSIVE");
    const lines = input.items.map((l) => {
      const v = variants.get(l.variantId)!;
      const base = toBaseUnits(l, v);
      if (l.purchaseOrderItemId) {
        const oi = orderItems.get(l.purchaseOrderItemId);
        if (!oi || oi.variantId !== v.id) throw badRequest(`${v.displayName} is not on the selected purchase order`);
      } else if (input.purchaseOrderId) {
        // match by variant when the client didn't send the order line id
        const oi = [...orderItems.values()].find((o) => o.variantId === v.id);
        if (oi) l.purchaseOrderItemId = oi.id;
      }
      return { ...l, ...base, variant: v };
    });

    const totals = totalsOrBadRequest(
      lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitCost, discount: l.discount, taxRate: l.taxRate })),
      { taxMode, discount: input.discount, otherCharges: input.otherCharges, roundOff: input.roundOff },
    );
    const landed = landedUnitCosts(
      lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitCost, discount: l.discount, taxRate: l.taxRate })),
      totals,
      taxMode,
      { taxIsCost: !settings.taxRegistered },
    );

    const paid = round2(input.payments.reduce((s, p) => s + p.amount, 0));
    if (paid > totals.grandTotal + 0.004) throw badRequest("Payment is more than the bill total");

    const number = existing ? existing.number : await nextDocumentNumber(tx, auth.organizationId, "PURCHASE");
    const header = {
        organizationId: auth.organizationId,
        locationId,
        partyId: party.id,
        purchaseOrderId: input.purchaseOrderId ?? null,
        number,
        supplierInvoiceNumber: input.supplierInvoiceNumber ?? null,
        purchaseDate,
        dueDate: input.dueDate ?? null,
        taxMode,
        subtotal: money(totals.subtotal),
        discount: money(totals.discount),
        otherCharges: money(totals.otherCharges),
        taxAmount: money(totals.taxAmount),
        roundOff: money(totals.roundOff),
        grandTotal: money(totals.grandTotal),
        paymentType: input.paymentType ?? null,
        note: input.note ?? null,
    };
    const [purchase] = existing
      ? await tx.update(purchases).set(header).where(eq(purchases.id, existing.id)).returning({ id: purchases.id })
      : await tx.insert(purchases).values({ ...header, createdByUserId: auth.userId }).returning({ id: purchases.id });

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const t = totals.lines[i];
      const v = l.variant;
      if (!v.trackBatches && (l.lotNumber || l.expiryDate)) {
        throw badRequest(`${v.displayName} doesn't track batches; remove the batch details`);
      }
      const [item] = await tx
        .insert(purchaseItems)
        .values({
          purchaseId: purchase.id,
          position: i,
          purchaseOrderItemId: l.purchaseOrderItemId ?? null,
          variantId: v.id,
          quantity: qtyStr(l.quantity),
          unitCost: costStr(l.unitCost),
          discount: money(l.discount),
          taxRateId: v.taxRateId,
          taxRate: String(t.taxRate),
          taxAmount: money(t.taxAmount),
          lineTotal: money(t.lineTotal),
          landedUnitCost: costStr(landed[i]),
          lotNumber: l.lotNumber ?? null,
          manufacturingDate: l.manufacturingDate ?? null,
          expiryDate: l.expiryDate ?? null,
        })
        .returning({ id: purchaseItems.id });

      const { lotId } = await receiveStock(tx, {
        organizationId: auth.organizationId,
        locationId,
        variant: v,
        quantity: l.quantity,
        unitCost: landed[i],
        movementType: "PURCHASE",
        referenceType: "PURCHASE",
        referenceId: purchase.id,
        userId: auth.userId,
        lot: {
          lotNumber: l.lotNumber ?? null,
          manufacturingDate: l.manufacturingDate ?? null,
          expiryDate: l.expiryDate ?? null,
          supplierId: party.id,
          purchaseItemId: item.id,
          note: l.lotNote ?? null,
        },
        serials: v.trackSerials ? { numbers: l.serials, mode: "create", purchaseItemId: item.id } : undefined,
      });
      if (lotId) await tx.update(purchaseItems).set({ lotId }).where(eq(purchaseItems.id, item.id));

      // last purchase cost becomes the variant's reference cost
      // (the bill can also set the item's MRP and sale price, like the pharmacy batch form)
      await tx
        .update(productVariants)
        .set({
          costPrice: money(landed[i]),
          ...(l.mrp !== undefined ? { mrp: l.mrp === null ? null : money(l.mrp) } : {}),
          ...(l.sellingPrice !== undefined ? { sellingPrice: money(l.sellingPrice) } : {}),
        })
        .where(eq(productVariants.id, v.id));

      if (l.purchaseOrderItemId) {
        await tx
          .update(purchaseOrderItems)
          .set({ quantityReceived: sql`${purchaseOrderItems.quantityReceived} + ${qtyStr(l.quantity)}` })
          .where(eq(purchaseOrderItems.id, l.purchaseOrderItemId));
      }
    }

    for (const p of input.payments) {
      await recordPayment(tx, {
        organizationId: auth.organizationId,
        locationId,
        direction: "PAID_TO_SUPPLIER",
        partyId: party.id,
        purchaseId: purchase.id,
        amount: p.amount,
        paymentDate: p.paymentDate ?? purchaseDate,
        method: p.method,
        referenceNumber: p.referenceNumber,
        notes: p.notes,
        userId: auth.userId,
      });
    }
    await refreshPurchasePayment(tx, purchase.id);
    if (input.purchaseOrderId) await refreshOrderReceipt(tx, input.purchaseOrderId);
    return purchase.id;
  }
}

async function lockPurchase(tx: Tx, auth: AuthContext, id: string) {
  const [p] = await tx
    .select()
    .from(purchases)
    .where(and(eq(purchases.id, id), eq(purchases.organizationId, auth.organizationId)))
    .for("update");
  if (!p) throw notFound("Purchase");
  return p;
}

/** Takes the purchase's goods back off the shelf and voids its payments. */
async function reversePurchaseEffects(tx: Tx, auth: AuthContext, p: typeof purchases.$inferSelect, note: string, verb: string) {
  const id = p.id;
  {
    const [{ returns }] = await tx
      .select({ returns: sql<number>`count(*)::int` })
      .from(purchaseReturns)
      .where(and(eq(purchaseReturns.purchaseId, id), ne(purchaseReturns.status, "VOID")));
    if (returns > 0) throw conflict(`Can't ${verb}: goods from this purchase were returned to the supplier. Delete that return first`);

    const items = await tx.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, id));
    const variants = await loadVariants(
      tx,
      auth.organizationId,
      items.map((i) => i.variantId),
    );
    for (const item of items) {
      const v = variants.get(item.variantId)!;
      const serials = v.trackSerials
        ? (
            await tx
              .select({ serialNumber: serialNumbers.serialNumber })
              .from(serialNumbers)
              .where(eq(serialNumbers.purchaseItemId, item.id))
          ).map((s) => s.serialNumber)
        : undefined;
      // take the received goods back out; fails if they've already been sold
      await issueStock(tx, {
        organizationId: auth.organizationId,
        locationId: p.locationId,
        variant: v,
        quantity: num(item.quantity),
        movementType: "PURCHASE_RETURN",
        referenceType: "PURCHASE",
        referenceId: id,
        userId: auth.userId,
        note,
        lotId: item.lotId,
        serials,
        serialStatus: "RETURNED_TO_SUPPLIER",
        allowNegative: false,
        allowExpired: true,
      }).catch((err) => {
        throw conflict(
          `Can't ${verb}: ${v.displayName} from this purchase has already been sold or moved. ${err instanceof Error ? err.message : ""}`.trim(),
        );
      });
      if (item.purchaseOrderItemId) {
        await tx
          .update(purchaseOrderItems)
          .set({ quantityReceived: sql`greatest(${purchaseOrderItems.quantityReceived} - ${item.quantity}, 0)` })
          .where(eq(purchaseOrderItems.id, item.purchaseOrderItemId));
      }
    }
    await voidPaymentsFor(tx, { purchaseId: id }, auth.userId);
  }
}

export async function voidPurchase(auth: AuthContext, id: string, reason: string) {
  await db.transaction(async (tx) => {
    const p = await lockPurchase(tx, auth, id);
    if (p.status === "VOID") throw conflict("This purchase is already void");
    await resolveLocationId(tx, auth, p.locationId);
    await reversePurchaseEffects(tx, auth, p, `Void: ${reason}`, reason === "Deleted" ? "delete" : "void");
    await tx
      .update(purchases)
      .set({ status: "VOID", voidedAt: new Date(), voidedByUserId: auth.userId, voidReason: reason })
      .where(eq(purchases.id, id));
    await refreshPurchasePayment(tx, id);
    if (p.purchaseOrderId) await refreshOrderReceipt(tx, p.purchaseOrderId);
  });
  return getPurchase(auth, id);
}

/** Edits a posted purchase: fails if any of its goods were already sold or moved. */
export async function updatePurchase(auth: AuthContext, id: string, input: PurchaseInput) {
  await db.transaction(async (tx) => {
    const p = await lockPurchase(tx, auth, id);
    if (p.status === "VOID") throw conflict("A deleted purchase can't be edited");
    await resolveLocationId(tx, auth, p.locationId);
    await reversePurchaseEffects(tx, auth, p, "Edited", "edit");
    if (p.purchaseOrderId) await refreshOrderReceipt(tx, p.purchaseOrderId);
    await tx.delete(purchaseItems).where(eq(purchaseItems.purchaseId, id));
    await writePurchase(tx, auth, { ...input, purchaseOrderId: p.purchaseOrderId ?? undefined }, { id, number: p.number, locationId: p.locationId });
    if (p.purchaseOrderId) await refreshOrderReceipt(tx, p.purchaseOrderId);
  });
  return getPurchase(auth, id);
}

export async function addPurchasePayment(auth: AuthContext, id: string, input: PaymentInput) {
  await db.transaction(async (tx) => {
    const p = await lockPurchase(tx, auth, id);
    if (p.status === "VOID") throw conflict("Can't pay a void purchase");
    const state = await refreshPurchasePayment(tx, id);
    if (state && input.amount > state.balance + 0.004) {
      throw badRequest(`Only ${state.balance.toFixed(2)} is outstanding on this bill`);
    }
    const settings = await getSettings(tx, auth.organizationId);
    await recordPayment(tx, {
      organizationId: auth.organizationId,
      locationId: p.locationId,
      direction: "PAID_TO_SUPPLIER",
      partyId: p.partyId,
      purchaseId: id,
      amount: input.amount,
      paymentDate: input.paymentDate ?? todayIn(settings.timezone),
      method: input.method,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      userId: auth.userId,
    });
    await refreshPurchasePayment(tx, id);
  });
  return getPurchase(auth, id);
}

const displayName = sql<string>`case when ${productVariants.isDefault} then ${products.name} else ${products.name} || ' (' || ${productVariants.name} || ')' end`;

export async function getPurchase(auth: AuthContext, id: string) {
  const [row] = await db
    .select({
      purchase: purchases,
      partyName: parties.name,
      partyPhone: parties.phone,
      partyTaxId: parties.taxId,
      partyAddress: parties.address,
      locationName: locations.name,
      orderNumber: purchaseOrders.number,
      createdByName: users.name,
    })
    .from(purchases)
    .innerJoin(parties, eq(parties.id, purchases.partyId))
    .innerJoin(locations, eq(locations.id, purchases.locationId))
    .leftJoin(purchaseOrders, eq(purchaseOrders.id, purchases.purchaseOrderId))
    .leftJoin(users, eq(users.id, purchases.createdByUserId))
    .where(and(eq(purchases.id, id), eq(purchases.organizationId, auth.organizationId)));
  if (!row) throw notFound("Purchase");
  if (!auth.isOwner) await resolveLocationId(db, auth, row.purchase.locationId);

  const [items, pays, returns] = await Promise.all([
    db
      .select({
        id: purchaseItems.id,
        variantId: purchaseItems.variantId,
        displayName,
        productId: productVariants.productId,
        sku: productVariants.sku,
        unitCode: units.code,
        trackSerials: products.trackSerials,
        quantity: purchaseItems.quantity,
        quantityReturned: purchaseItems.quantityReturned,
        unitCost: purchaseItems.unitCost,
        discount: purchaseItems.discount,
        taxRate: purchaseItems.taxRate,
        taxAmount: purchaseItems.taxAmount,
        lineTotal: purchaseItems.lineTotal,
        landedUnitCost: purchaseItems.landedUnitCost,
        lotId: purchaseItems.lotId,
        lotNumber: purchaseItems.lotNumber,
        manufacturingDate: purchaseItems.manufacturingDate,
        expiryDate: purchaseItems.expiryDate,
        lotAvailable: stockLots.quantityAvailable,
        serials: sql<string[]>`coalesce((select array_agg(s.serial_number order by s.serial_number) from ${serialNumbers} s where s.purchase_item_id = ${qcol(purchaseItems.id)}), '{}')`,
      })
      .from(purchaseItems)
      .innerJoin(productVariants, eq(productVariants.id, purchaseItems.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .leftJoin(stockLots, eq(stockLots.id, purchaseItems.lotId))
      .where(eq(purchaseItems.purchaseId, id)),
    db
      .select({
        id: payments.id,
        number: payments.number,
        amount: payments.amount,
        method: payments.method,
        paymentDate: payments.paymentDate,
        referenceNumber: payments.referenceNumber,
        status: payments.status,
      })
      .from(payments)
      .where(eq(payments.purchaseId, id))
      .orderBy(payments.createdAt),
    db
      .select({
        id: purchaseReturns.id,
        number: purchaseReturns.number,
        returnDate: purchaseReturns.returnDate,
        status: purchaseReturns.status,
        resolution: purchaseReturns.resolution,
        grandTotal: purchaseReturns.grandTotal,
      })
      .from(purchaseReturns)
      .where(eq(purchaseReturns.purchaseId, id))
      .orderBy(purchaseReturns.createdAt),
  ]);

  const p = row.purchase;
  const credited = returns
    .filter((r) => r.status === "COMPLETED" && r.resolution === "CREDIT_NOTE")
    .reduce((s, r) => s + num(r.grandTotal), 0);
  const due = round2(num(p.grandTotal) - credited);
  return {
    purchase: {
      ...p,
      subtotal: num(p.subtotal),
      discount: num(p.discount),
      otherCharges: num(p.otherCharges),
      taxAmount: num(p.taxAmount),
      roundOff: num(p.roundOff),
      grandTotal: num(p.grandTotal),
      paidAmount: num(p.paidAmount),
      creditedAmount: round2(credited),
      balanceDue: p.status === "VOID" ? 0 : Math.max(0, round2(due - num(p.paidAmount))),
      partyName: row.partyName,
      partyPhone: row.partyPhone,
      partyTaxId: row.partyTaxId,
      partyAddress: row.partyAddress,
      locationName: row.locationName,
      purchaseOrderNumber: row.orderNumber,
      createdByName: row.createdByName,
      items: items.map((i) => ({
        ...i,
        quantity: num(i.quantity),
        quantityReturned: num(i.quantityReturned),
        returnableQuantity: round3(num(i.quantity) - num(i.quantityReturned)),
        unitCost: num(i.unitCost),
        discount: num(i.discount),
        taxRate: num(i.taxRate),
        taxAmount: num(i.taxAmount),
        lineTotal: num(i.lineTotal),
        landedUnitCost: num(i.landedUnitCost),
        lotAvailable: i.lotAvailable === null ? null : num(i.lotAvailable),
      })),
      payments: pays.map((x) => ({ ...x, amount: num(x.amount) })),
      returns: returns.map((r) => ({ ...r, grandTotal: num(r.grandTotal) })),
    },
  };
}

export async function listPurchases(auth: AuthContext, q: z.infer<typeof purchasesQuery>) {
  const settings = await getSettings(db, auth.organizationId);
  const locationId = await resolveLocationFilter(db, auth, q.locationId);
  const where = and(
    eq(purchases.organizationId, auth.organizationId),
    locationId ? eq(purchases.locationId, locationId) : undefined,
    q.partyId ? eq(purchases.partyId, q.partyId) : undefined,
    q.status ? eq(purchases.status, q.status) : undefined,
    q.paymentStatus ? eq(purchases.paymentStatus, q.paymentStatus) : undefined,
    q.overdue === "true"
      ? and(
          eq(purchases.status, "POSTED"),
          inArray(purchases.paymentStatus, ["UNPAID", "PARTIAL"]),
          sql`${purchases.dueDate} < ${todayIn(settings.timezone)}`,
        )
      : undefined,
    q.search
      ? or(
          ilike(purchases.number, likePattern(q.search)),
          ilike(purchases.supplierInvoiceNumber, likePattern(q.search)),
          ilike(parties.name, likePattern(q.search)),
        )
      : undefined,
    q.from ? gte(purchases.purchaseDate, q.from) : undefined,
    q.to ? lte(purchases.purchaseDate, q.to) : undefined,
  );
  const [rows, [summary]] = await Promise.all([
    db
      .select({
        id: purchases.id,
        number: purchases.number,
        supplierInvoiceNumber: purchases.supplierInvoiceNumber,
        purchaseDate: purchases.purchaseDate,
        dueDate: purchases.dueDate,
        status: purchases.status,
        paymentStatus: purchases.paymentStatus,
        grandTotal: purchases.grandTotal,
        paidAmount: purchases.paidAmount,
        partyId: purchases.partyId,
        partyName: parties.name,
        locationName: locations.name,
        itemCount: sql<number>`(select count(*)::int from ${purchaseItems} i where i.purchase_id = ${qcol(purchases.id)})`,
        createdAt: purchases.createdAt,
      })
      .from(purchases)
      .innerJoin(parties, eq(parties.id, purchases.partyId))
      .innerJoin(locations, eq(locations.id, purchases.locationId))
      .where(where)
      .orderBy(desc(purchases.purchaseDate), desc(purchases.createdAt))
      .limit(q.limit)
      .offset(offsetFor(q.page, q.limit)),
    db
      .select({
        total: countAll,
        totalAmount: sql<string>`coalesce(sum(${purchases.grandTotal}) filter (where ${purchases.status} = 'POSTED'), 0)`,
        totalPaid: sql<string>`coalesce(sum(${purchases.paidAmount}) filter (where ${purchases.status} = 'POSTED'), 0)`,
      })
      .from(purchases)
      .innerJoin(parties, eq(parties.id, purchases.partyId))
      .where(where),
  ]);
  return {
    ...pageOf(
      rows.map((r) => ({ ...r, grandTotal: num(r.grandTotal), paidAmount: num(r.paidAmount) })),
      summary.total,
      q.page,
      q.limit,
    ),
    summary: { totalAmount: num(summary.totalAmount), totalPaid: num(summary.totalPaid) },
  };
}
