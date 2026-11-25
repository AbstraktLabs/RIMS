import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { db, type Tx } from "@/db";
import {
  locations,
  parties,
  productVariants,
  products,
  purchaseOrderItems,
  purchaseOrders,
  purchases,
  units,
  users,
} from "@/db/schema";
import type { AuthContext } from "@/lib/api/handler";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { costStr, money, num, qtyStr, round3 } from "@/lib/num";
import type { PurchaseOrderInput, purchaseOrdersQuery } from "@/lib/validation/purchasing";
import { todayIn } from "../_shared/dates";
import { countAll, likePattern, offsetFor, pageOf } from "../_shared/paging";
import { loadParty } from "../_shared/parties";
import { nextDocumentNumber } from "../_shared/sequences";
import { loadVariants } from "../_shared/stock";
import { totalsOrBadRequest } from "../_shared/totals";
import { getSettings, resolveLocationFilter, resolveLocationId } from "../_shared/tenant";
import { toBaseUnits } from "./lines";
import { qcol } from "../_shared/sql";

type OrderStatus = (typeof purchaseOrders.$inferSelect)["status"];

async function buildOrder(tx: Tx, auth: AuthContext, input: PurchaseOrderInput) {
  const settings = await getSettings(tx, auth.organizationId);
  await loadParty(tx, auth.organizationId, input.partyId, "SUPPLIER");
  const locationId = await resolveLocationId(tx, auth, input.locationId);
  const variants = await loadVariants(
    tx,
    auth.organizationId,
    input.items.map((i) => i.variantId),
  );
  const taxMode = input.taxMode ?? (settings.pricesIncludeTax ? "INCLUSIVE" : "EXCLUSIVE");
  const lines = input.items.map((l) => {
    const v = variants.get(l.variantId)!;
    if (!v.isActive) throw badRequest(`${v.displayName} is archived`);
    const base = toBaseUnits(l, v);
    if (!v.allowDecimal && Math.abs(base.quantity - Math.round(base.quantity)) > 1e-9) {
      throw badRequest(`${v.displayName} is ordered in whole units`);
    }
    return { ...base, variantId: v.id, discount: l.discount };
  });
  const totals = totalsOrBadRequest(
    lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitCost, discount: l.discount, taxRate: l.taxRate })),
    { taxMode, discount: input.discount, otherCharges: input.otherCharges, roundOff: 0 },
  );
  return { locationId, taxMode, lines, totals };
}

function orderValues(built: Awaited<ReturnType<typeof buildOrder>>, input: PurchaseOrderInput) {
  return {
    partyId: input.partyId,
    locationId: built.locationId,
    expectedDate: input.expectedDate ?? null,
    taxMode: built.taxMode,
    subtotal: money(built.totals.subtotal),
    discount: money(built.totals.discount),
    otherCharges: money(built.totals.otherCharges),
    taxAmount: money(built.totals.taxAmount),
    grandTotal: money(built.totals.grandTotal),
    note: input.note ?? null,
  };
}

async function insertLines(tx: Tx, orderId: string, built: Awaited<ReturnType<typeof buildOrder>>) {
  await tx.insert(purchaseOrderItems).values(
    built.lines.map((l, i) => ({
      purchaseOrderId: orderId,
      variantId: l.variantId,
      quantity: qtyStr(l.quantity),
      unitCost: costStr(l.unitCost),
      discount: money(l.discount),
      taxRate: String(built.totals.lines[i].taxRate),
      taxAmount: money(built.totals.lines[i].taxAmount),
      lineTotal: money(built.totals.lines[i].lineTotal),
    })),
  );
}

export async function createPurchaseOrder(auth: AuthContext, input: PurchaseOrderInput) {
  const id = await db.transaction(async (tx) => {
    const settings = await getSettings(tx, auth.organizationId);
    const built = await buildOrder(tx, auth, input);
    const number = await nextDocumentNumber(tx, auth.organizationId, "PURCHASE_ORDER");
    const [po] = await tx
      .insert(purchaseOrders)
      .values({
        ...orderValues(built, input),
        organizationId: auth.organizationId,
        number,
        orderDate: input.orderDate ?? todayIn(settings.timezone),
        status: input.status,
        createdByUserId: auth.userId,
      })
      .returning({ id: purchaseOrders.id });
    await insertLines(tx, po.id, built);
    return po.id;
  });
  return getPurchaseOrder(auth, id);
}

async function lockOrder(tx: Tx, auth: AuthContext, id: string) {
  const [po] = await tx
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.organizationId, auth.organizationId)))
    .for("update");
  if (!po) throw notFound("Purchase order");
  return po;
}

export async function updatePurchaseOrder(auth: AuthContext, id: string, input: PurchaseOrderInput) {
  await db.transaction(async (tx) => {
    const po = await lockOrder(tx, auth, id);
    if (po.status !== "DRAFT" && po.status !== "SENT") {
      throw conflict("Only draft or sent orders can be edited");
    }
    const [{ received }] = await tx
      .select({ received: sql<number>`count(*)::int` })
      .from(purchases)
      .where(and(eq(purchases.purchaseOrderId, id), eq(purchases.status, "POSTED")));
    if (received > 0) throw conflict("Goods have already been received against this order");

    const built = await buildOrder(tx, auth, input);
    await tx
      .update(purchaseOrders)
      .set({ ...orderValues(built, input), orderDate: input.orderDate ?? po.orderDate, status: input.status })
      .where(eq(purchaseOrders.id, id));
    await tx.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, id));
    await insertLines(tx, id, built);
  });
  return getPurchaseOrder(auth, id);
}

const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["DRAFT", "CANCELLED"],
  PARTIALLY_RECEIVED: ["RECEIVED"], // close an order that will not be fully delivered
  RECEIVED: [],
  CANCELLED: [],
};

export async function setPurchaseOrderStatus(auth: AuthContext, id: string, status: OrderStatus) {
  await db.transaction(async (tx) => {
    const po = await lockOrder(tx, auth, id);
    if (!ALLOWED[po.status].includes(status)) {
      throw conflict(`Can't change a ${po.status.toLowerCase().replace("_", " ")} order to ${status.toLowerCase()}`);
    }
    await tx.update(purchaseOrders).set({ status }).where(eq(purchaseOrders.id, id));
  });
  return getPurchaseOrder(auth, id);
}

export async function deletePurchaseOrder(auth: AuthContext, id: string) {
  await db.transaction(async (tx) => {
    const po = await lockOrder(tx, auth, id);
    if (po.status !== "DRAFT" && po.status !== "CANCELLED") {
      throw conflict("Only draft or cancelled orders can be deleted");
    }
    const [{ linked }] = await tx
      .select({ linked: sql<number>`count(*)::int` })
      .from(purchases)
      .where(eq(purchases.purchaseOrderId, id));
    if (linked > 0) throw conflict("Purchases reference this order; cancel it instead");
    await tx.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
  });
  return { success: true };
}

/** Recalculate received quantities + status after a purchase is posted or voided. */
export async function refreshOrderReceipt(tx: Tx, orderId: string) {
  const items = await tx
    .select({ quantity: purchaseOrderItems.quantity, received: purchaseOrderItems.quantityReceived })
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, orderId));
  const [po] = await tx.select({ status: purchaseOrders.status }).from(purchaseOrders).where(eq(purchaseOrders.id, orderId));
  if (!po || po.status === "CANCELLED") return;
  const anyReceived = items.some((i) => num(i.received) > 0);
  const allReceived = items.every((i) => round3(num(i.received)) >= num(i.quantity));
  const status: OrderStatus = allReceived ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : "SENT";
  await tx.update(purchaseOrders).set({ status }).where(eq(purchaseOrders.id, orderId));
}

const displayName = sql<string>`case when ${productVariants.isDefault} then ${products.name} else ${products.name} || ' (' || ${productVariants.name} || ')' end`;

export async function getPurchaseOrder(auth: AuthContext, id: string) {
  const [po] = await db
    .select({
      order: purchaseOrders,
      partyName: parties.name,
      partyPhone: parties.phone,
      locationName: locations.name,
      createdByName: users.name,
    })
    .from(purchaseOrders)
    .innerJoin(parties, eq(parties.id, purchaseOrders.partyId))
    .innerJoin(locations, eq(locations.id, purchaseOrders.locationId))
    .leftJoin(users, eq(users.id, purchaseOrders.createdByUserId))
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.organizationId, auth.organizationId)));
  if (!po) throw notFound("Purchase order");
  if (!auth.isOwner) await resolveLocationId(db, auth, po.order.locationId);

  const items = await db
    .select({
      id: purchaseOrderItems.id,
      variantId: purchaseOrderItems.variantId,
      displayName,
      sku: productVariants.sku,
      unitCode: units.code,
      trackBatches: products.trackBatches,
      trackExpiry: products.trackExpiry,
      trackSerials: products.trackSerials,
      quantity: purchaseOrderItems.quantity,
      quantityReceived: purchaseOrderItems.quantityReceived,
      unitCost: purchaseOrderItems.unitCost,
      discount: purchaseOrderItems.discount,
      taxRate: purchaseOrderItems.taxRate,
      taxAmount: purchaseOrderItems.taxAmount,
      lineTotal: purchaseOrderItems.lineTotal,
    })
    .from(purchaseOrderItems)
    .innerJoin(productVariants, eq(productVariants.id, purchaseOrderItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(units, eq(units.id, products.unitId))
    .where(eq(purchaseOrderItems.purchaseOrderId, id));

  const receipts = await db
    .select({ id: purchases.id, number: purchases.number, purchaseDate: purchases.purchaseDate, status: purchases.status, grandTotal: purchases.grandTotal })
    .from(purchases)
    .where(eq(purchases.purchaseOrderId, id))
    .orderBy(desc(purchases.createdAt));

  const o = po.order;
  return {
    purchaseOrder: {
      ...o,
      subtotal: num(o.subtotal),
      discount: num(o.discount),
      otherCharges: num(o.otherCharges),
      taxAmount: num(o.taxAmount),
      grandTotal: num(o.grandTotal),
      partyName: po.partyName,
      partyPhone: po.partyPhone,
      locationName: po.locationName,
      createdByName: po.createdByName,
      items: items.map((i) => ({
        ...i,
        quantity: num(i.quantity),
        quantityReceived: num(i.quantityReceived),
        quantityPending: Math.max(0, round3(num(i.quantity) - num(i.quantityReceived))),
        unitCost: num(i.unitCost),
        discount: num(i.discount),
        taxRate: num(i.taxRate),
        taxAmount: num(i.taxAmount),
        lineTotal: num(i.lineTotal),
      })),
      receipts: receipts.map((r) => ({ ...r, grandTotal: num(r.grandTotal) })),
    },
  };
}

export async function listPurchaseOrders(auth: AuthContext, q: z.infer<typeof purchaseOrdersQuery>) {
  const locationId = await resolveLocationFilter(db, auth, q.locationId);
  const statusCond =
    q.status === "OPEN"
      ? inArray(purchaseOrders.status, ["DRAFT", "SENT", "PARTIALLY_RECEIVED"])
      : q.status
        ? eq(purchaseOrders.status, q.status)
        : undefined;
  const where = and(
    eq(purchaseOrders.organizationId, auth.organizationId),
    locationId ? eq(purchaseOrders.locationId, locationId) : undefined,
    q.partyId ? eq(purchaseOrders.partyId, q.partyId) : undefined,
    statusCond,
    q.search ? or(ilike(purchaseOrders.number, likePattern(q.search)), ilike(parties.name, likePattern(q.search))) : undefined,
    q.from ? gte(purchaseOrders.orderDate, q.from) : undefined,
    q.to ? lte(purchaseOrders.orderDate, q.to) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: purchaseOrders.id,
        number: purchaseOrders.number,
        orderDate: purchaseOrders.orderDate,
        expectedDate: purchaseOrders.expectedDate,
        status: purchaseOrders.status,
        grandTotal: purchaseOrders.grandTotal,
        partyId: purchaseOrders.partyId,
        partyName: parties.name,
        locationName: locations.name,
        itemCount: sql<number>`(select count(*)::int from ${purchaseOrderItems} i where i.purchase_order_id = ${qcol(purchaseOrders.id)})`,
        createdAt: purchaseOrders.createdAt,
      })
      .from(purchaseOrders)
      .innerJoin(parties, eq(parties.id, purchaseOrders.partyId))
      .innerJoin(locations, eq(locations.id, purchaseOrders.locationId))
      .where(where)
      .orderBy(desc(purchaseOrders.orderDate), desc(purchaseOrders.createdAt))
      .limit(q.limit)
      .offset(offsetFor(q.page, q.limit)),
    db
      .select({ total: countAll })
      .from(purchaseOrders)
      .innerJoin(parties, eq(parties.id, purchaseOrders.partyId))
      .where(where),
  ]);
  return pageOf(
    rows.map((r) => ({ ...r, grandTotal: num(r.grandTotal) })),
    total,
    q.page,
    q.limit,
  );
}
