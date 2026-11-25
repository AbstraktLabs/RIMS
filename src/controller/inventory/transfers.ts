import { aliasedTable, and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { db, type Tx } from "@/db";
import {
  locations,
  productVariants,
  products,
  stockLots,
  stockTransferItems,
  stockTransfers,
  units,
  users,
} from "@/db/schema";
import type { AuthContext } from "@/lib/api/handler";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { costStr, num, qtyStr } from "@/lib/num";
import type { CreateTransferInput, transfersQuery } from "@/lib/validation/inventory";
import { todayIn } from "../_shared/dates";
import { countAll, likePattern, offsetFor, pageOf } from "../_shared/paging";
import { nextDocumentNumber } from "../_shared/sequences";
import { assertQuantity, issueStock, loadVariants, receiveStock } from "../_shared/stock";
import { getSettings, resolveLocationId } from "../_shared/tenant";
import { qcol } from "../_shared/sql";

// Stock transfer lifecycle:
//   DRAFT ──dispatch──▶ IN_TRANSIT ──receive──▶ RECEIVED
//     └────cancel────▶ CANCELLED ◀──cancel──┘ (stock goes back to the source)

async function lockTransfer(tx: Tx, auth: AuthContext, id: string) {
  const [t] = await tx
    .select()
    .from(stockTransfers)
    .where(and(eq(stockTransfers.id, id), eq(stockTransfers.organizationId, auth.organizationId)))
    .for("update");
  if (!t) throw notFound("Stock transfer");
  return t;
}

async function dispatchInTx(tx: Tx, auth: AuthContext, transferId: string) {
  const t = await lockTransfer(tx, auth, transferId);
  if (t.status !== "DRAFT") throw conflict(`Only draft transfers can be dispatched (this one is ${t.status.toLowerCase()})`);
  await resolveLocationId(tx, auth, t.fromLocationId); // must have access to the source

  const settings = await getSettings(tx, auth.organizationId);
  const items = await tx.select().from(stockTransferItems).where(eq(stockTransferItems.transferId, transferId));
  const variants = await loadVariants(
    tx,
    auth.organizationId,
    items.map((i) => i.variantId),
  );

  // re-write the lines split by source batch, with the cost each unit carried
  await tx.delete(stockTransferItems).where(eq(stockTransferItems.transferId, transferId));
  for (const item of items) {
    const v = variants.get(item.variantId)!;
    const allocations = await issueStock(tx, {
      organizationId: auth.organizationId,
      locationId: t.fromLocationId,
      variant: v,
      quantity: num(item.quantity),
      movementType: "TRANSFER_OUT",
      referenceType: "TRANSFER",
      referenceId: transferId,
      userId: auth.userId,
      lotId: item.sourceLotId,
      serials: item.serialNumbers,
      serialStatus: "IN_TRANSIT",
      allowNegative: settings.allowNegativeStock,
      allowExpired: true,
    });
    for (const a of allocations) {
      await tx.insert(stockTransferItems).values({
        transferId,
        variantId: v.id,
        sourceLotId: a.lotId,
        quantity: qtyStr(a.quantity),
        unitCost: costStr(a.unitCost),
        serialNumbers: allocations.length === 1 ? item.serialNumbers : [],
      });
    }
  }
  await tx
    .update(stockTransfers)
    .set({ status: "IN_TRANSIT", dispatchedAt: new Date() })
    .where(eq(stockTransfers.id, transferId));
}

export async function createTransfer(auth: AuthContext, input: CreateTransferInput) {
  const id = await db.transaction(async (tx) => {
    const settings = await getSettings(tx, auth.organizationId);
    const fromLocationId = await resolveLocationId(tx, auth, input.fromLocationId);
    // destination only needs to exist and be active; staff may send to stores they don't work at
    const [dest] = await tx
      .select({ id: locations.id, isActive: locations.isActive })
      .from(locations)
      .where(and(eq(locations.id, input.toLocationId), eq(locations.organizationId, auth.organizationId)));
    if (!dest) throw notFound("Destination location");
    if (!dest.isActive) throw badRequest("Destination location is inactive");

    const variants = await loadVariants(
      tx,
      auth.organizationId,
      input.items.map((i) => i.variantId),
    );
    for (const item of input.items) {
      const v = variants.get(item.variantId)!;
      if (!v.isActive) throw badRequest(`${v.displayName} is archived`);
      assertQuantity(v, item.quantity, v.trackSerials ? item.serials : undefined);
      if (item.lotId) {
        const [lot] = await tx
          .select({ id: stockLots.id })
          .from(stockLots)
          .where(and(eq(stockLots.id, item.lotId), eq(stockLots.variantId, v.id), eq(stockLots.locationId, fromLocationId)));
        if (!lot) throw badRequest(`Selected batch of ${v.displayName} is not at the source location`);
      }
    }

    const number = await nextDocumentNumber(tx, auth.organizationId, "STOCK_TRANSFER");
    const [t] = await tx
      .insert(stockTransfers)
      .values({
        organizationId: auth.organizationId,
        number,
        fromLocationId,
        toLocationId: dest.id,
        transferDate: input.transferDate ?? todayIn(settings.timezone),
        note: input.note ?? null,
        createdByUserId: auth.userId,
      })
      .returning({ id: stockTransfers.id });

    await tx.insert(stockTransferItems).values(
      input.items.map((i) => ({
        transferId: t.id,
        variantId: i.variantId,
        sourceLotId: i.lotId ?? null,
        quantity: qtyStr(i.quantity),
        serialNumbers: variants.get(i.variantId)!.trackSerials ? i.serials : [],
      })),
    );

    if (input.dispatch) await dispatchInTx(tx, auth, t.id);
    return t.id;
  });
  return getTransfer(auth, id);
}

export async function dispatchTransfer(auth: AuthContext, id: string) {
  await db.transaction((tx) => dispatchInTx(tx, auth, id));
  return getTransfer(auth, id);
}

export async function receiveTransfer(auth: AuthContext, id: string) {
  await db.transaction(async (tx) => {
    const t = await lockTransfer(tx, auth, id);
    if (t.status !== "IN_TRANSIT") throw conflict("Only transfers in transit can be received");
    await resolveLocationId(tx, auth, t.toLocationId); // must have access to the destination

    const items = await tx.select().from(stockTransferItems).where(eq(stockTransferItems.transferId, id));
    const variants = await loadVariants(
      tx,
      auth.organizationId,
      items.map((i) => i.variantId),
    );
    for (const item of items) {
      const v = variants.get(item.variantId)!;
      const source = item.sourceLotId
        ? await tx.query.stockLots.findFirst({ where: eq(stockLots.id, item.sourceLotId) })
        : undefined;
      const { lotId } = await receiveStock(tx, {
        organizationId: auth.organizationId,
        locationId: t.toLocationId,
        variant: v,
        quantity: num(item.quantity),
        unitCost: num(item.unitCost),
        movementType: "TRANSFER_IN",
        referenceType: "TRANSFER",
        referenceId: id,
        userId: auth.userId,
        // the batch keeps its identity (number, dates, supplier) at the new location
        lot: source
          ? {
              lotNumber: source.lotNumber,
              manufacturingDate: source.manufacturingDate,
              expiryDate: source.expiryDate,
              supplierId: source.supplierId,
              purchaseItemId: source.purchaseItemId,
            }
          : undefined,
        serials: v.trackSerials ? { numbers: item.serialNumbers, mode: "restock" } : undefined,
      });
      if (lotId) await tx.update(stockTransferItems).set({ destinationLotId: lotId }).where(eq(stockTransferItems.id, item.id));
    }
    await tx
      .update(stockTransfers)
      .set({ status: "RECEIVED", receivedAt: new Date(), receivedByUserId: auth.userId })
      .where(eq(stockTransfers.id, id));
  });
  return getTransfer(auth, id);
}

export async function cancelTransfer(auth: AuthContext, id: string) {
  await db.transaction(async (tx) => {
    const t = await lockTransfer(tx, auth, id);
    if (t.status === "RECEIVED") throw conflict("A received transfer can't be cancelled — create a transfer back instead");
    if (t.status === "CANCELLED") throw conflict("This transfer is already cancelled");
    await resolveLocationId(tx, auth, t.fromLocationId);

    if (t.status === "IN_TRANSIT") {
      // put everything back where it came from
      const items = await tx.select().from(stockTransferItems).where(eq(stockTransferItems.transferId, id));
      const variants = await loadVariants(
        tx,
        auth.organizationId,
        items.map((i) => i.variantId),
      );
      for (const item of items) {
        const v = variants.get(item.variantId)!;
        await receiveStock(tx, {
          organizationId: auth.organizationId,
          locationId: t.fromLocationId,
          variant: v,
          quantity: num(item.quantity),
          unitCost: num(item.unitCost),
          movementType: "TRANSFER_IN",
          referenceType: "TRANSFER",
          referenceId: id,
          userId: auth.userId,
          note: "Transfer cancelled — returned to source",
          lot: item.sourceLotId ? { existingLotId: item.sourceLotId } : undefined,
          serials: v.trackSerials ? { numbers: item.serialNumbers, mode: "restock" } : undefined,
        });
      }
    }
    await tx.update(stockTransfers).set({ status: "CANCELLED" }).where(eq(stockTransfers.id, id));
  });
  return getTransfer(auth, id);
}

const fromLoc = aliasedTable(locations, "from_loc");
const toLoc = aliasedTable(locations, "to_loc");

export async function getTransfer(auth: AuthContext, id: string) {
  const [t] = await db
    .select({
      id: stockTransfers.id,
      number: stockTransfers.number,
      status: stockTransfers.status,
      transferDate: stockTransfers.transferDate,
      fromLocationId: stockTransfers.fromLocationId,
      fromLocationName: fromLoc.name,
      toLocationId: stockTransfers.toLocationId,
      toLocationName: toLoc.name,
      dispatchedAt: stockTransfers.dispatchedAt,
      receivedAt: stockTransfers.receivedAt,
      note: stockTransfers.note,
      createdByName: users.name,
      createdAt: stockTransfers.createdAt,
    })
    .from(stockTransfers)
    .innerJoin(fromLoc, eq(fromLoc.id, stockTransfers.fromLocationId))
    .innerJoin(toLoc, eq(toLoc.id, stockTransfers.toLocationId))
    .leftJoin(users, eq(users.id, stockTransfers.createdByUserId))
    .where(and(eq(stockTransfers.id, id), eq(stockTransfers.organizationId, auth.organizationId)));
  if (!t) throw notFound("Stock transfer");
  if (!auth.isOwner && auth.locationId !== t.fromLocationId && auth.locationId !== t.toLocationId) {
    await resolveLocationId(db, auth, t.fromLocationId).catch(() => resolveLocationId(db, auth, t.toLocationId));
  }

  const items = await db
    .select({
      id: stockTransferItems.id,
      variantId: stockTransferItems.variantId,
      displayName: sql<string>`case when ${productVariants.isDefault} then ${products.name} else ${products.name} || ' (' || ${productVariants.name} || ')' end`,
      sku: productVariants.sku,
      unitCode: units.code,
      sourceLotId: stockTransferItems.sourceLotId,
      lotNumber: stockLots.lotNumber,
      expiryDate: stockLots.expiryDate,
      quantity: stockTransferItems.quantity,
      unitCost: stockTransferItems.unitCost,
      serialNumbers: stockTransferItems.serialNumbers,
    })
    .from(stockTransferItems)
    .innerJoin(productVariants, eq(productVariants.id, stockTransferItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(units, eq(units.id, products.unitId))
    .leftJoin(stockLots, eq(stockLots.id, stockTransferItems.sourceLotId))
    .where(eq(stockTransferItems.transferId, id));

  const lines = items.map((i) => ({ ...i, quantity: num(i.quantity), unitCost: num(i.unitCost) }));
  return {
    transfer: {
      ...t,
      items: lines,
      totalQuantity: lines.reduce((s, l) => s + l.quantity, 0),
      totalValue: Math.round(lines.reduce((s, l) => s + l.quantity * l.unitCost, 0) * 100) / 100,
    },
  };
}

export async function listTransfers(auth: AuthContext, q: z.infer<typeof transfersQuery>) {
  const scope = auth.isOwner
    ? q.locationId
      ? or(eq(stockTransfers.fromLocationId, q.locationId), eq(stockTransfers.toLocationId, q.locationId))
      : undefined
    : sql`(${stockTransfers.fromLocationId} in (select location_id from user_locations where user_id = ${auth.userId}) or ${stockTransfers.toLocationId} in (select location_id from user_locations where user_id = ${auth.userId}))`;
  const where = and(
    eq(stockTransfers.organizationId, auth.organizationId),
    scope,
    !auth.isOwner && q.locationId
      ? or(eq(stockTransfers.fromLocationId, q.locationId), eq(stockTransfers.toLocationId, q.locationId))
      : undefined,
    q.status ? eq(stockTransfers.status, q.status) : undefined,
    q.search ? ilike(stockTransfers.number, likePattern(q.search)) : undefined,
    q.from ? gte(stockTransfers.transferDate, q.from) : undefined,
    q.to ? lte(stockTransfers.transferDate, q.to) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: stockTransfers.id,
        number: stockTransfers.number,
        status: stockTransfers.status,
        transferDate: stockTransfers.transferDate,
        fromLocationName: fromLoc.name,
        toLocationName: toLoc.name,
        itemCount: sql<number>`(select count(distinct i.variant_id)::int from ${stockTransferItems} i where i.transfer_id = ${qcol(stockTransfers.id)})`,
        totalQuantity: sql<string>`(select coalesce(sum(i.quantity), 0) from ${stockTransferItems} i where i.transfer_id = ${qcol(stockTransfers.id)})`,
        createdByName: users.name,
        createdAt: stockTransfers.createdAt,
      })
      .from(stockTransfers)
      .innerJoin(fromLoc, eq(fromLoc.id, stockTransfers.fromLocationId))
      .innerJoin(toLoc, eq(toLoc.id, stockTransfers.toLocationId))
      .leftJoin(users, eq(users.id, stockTransfers.createdByUserId))
      .where(where)
      .orderBy(desc(stockTransfers.createdAt))
      .limit(q.limit)
      .offset(offsetFor(q.page, q.limit)),
    db.select({ total: countAll }).from(stockTransfers).where(where),
  ]);
  return pageOf(
    rows.map((r) => ({ ...r, totalQuantity: num(r.totalQuantity) })),
    total,
    q.page,
    q.limit,
  );
}
