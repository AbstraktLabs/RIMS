import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import {
  locations,
  parties,
  payments,
  productVariants,
  products,
  saleItems,
  saleReturnItems,
  saleReturns,
  sales,
  serialNumbers,
  units,
  users,
} from "@/db/schema";
import type { AuthContext } from "@/lib/api/handler";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { costStr, money, num, qtyStr, round2, round3 } from "@/lib/num";
import type { SaleReturnInput, saleReturnsQuery } from "@/lib/validation/sales";
import { todayIn } from "../_shared/dates";
import { countAll, likePattern, offsetFor, pageOf } from "../_shared/paging";
import { recordPayment, refreshSalePayment, voidPaymentsFor } from "../_shared/payments";
import { nextDocumentNumber } from "../_shared/sequences";
import { issueStock, loadVariants, receiveStock } from "../_shared/stock";
import { getSettings, resolveLocationFilter, resolveLocationId } from "../_shared/tenant";

// A sale return credits the customer for what they actually paid per unit
// (after their share of any bill discount). Resellable goods go back into the
// batch they were sold from; damaged goods are recorded but not restocked.
// Resolution: REFUND (cash back, capped at what was paid) or STORE_CREDIT
// (reduces what the customer owes / builds credit on their account).

export async function createSaleReturn(auth: AuthContext, input: SaleReturnInput) {
  const id = await db.transaction(async (tx) => {
    const settings = await getSettings(tx, auth.organizationId);
    const [sale] = await tx
      .select()
      .from(sales)
      .where(and(eq(sales.id, input.saleId), eq(sales.organizationId, auth.organizationId)))
      .for("update");
    if (!sale) throw notFound("Sale");
    if (sale.status === "VOID") throw conflict("Can't return items from a void sale");
    await resolveLocationId(tx, auth, sale.locationId);

    const ids = input.items.map((i) => i.saleItemId);
    if (new Set(ids).size !== ids.length) throw badRequest("Each sale line can appear once");
    const rows = await tx
      .select()
      .from(saleItems)
      .where(and(eq(saleItems.saleId, sale.id), inArray(saleItems.id, ids)))
      .for("update");
    if (rows.length !== ids.length) throw badRequest("Some items are not on this sale");
    const byId = new Map(rows.map((r) => [r.id, r]));
    const variants = await loadVariants(
      tx,
      auth.organizationId,
      rows.map((r) => r.variantId),
    );

    const billFactor = num(sale.subtotal) > 0 ? 1 - num(sale.discount) / num(sale.subtotal) : 1;
    const number = await nextDocumentNumber(tx, auth.organizationId, "SALE_RETURN");
    const [ret] = await tx
      .insert(saleReturns)
      .values({
        organizationId: auth.organizationId,
        locationId: sale.locationId,
        saleId: sale.id,
        partyId: sale.partyId,
        number,
        returnDate: input.returnDate ?? todayIn(settings.timezone),
        resolution: "REFUND", // final value set below once the total is known
        subtotal: "0",
        grandTotal: "0",
        reason: input.reason ?? null,
        note: input.note ?? null,
        createdByUserId: auth.userId,
      })
      .returning({ id: saleReturns.id });

    let subtotal = 0;
    let taxTotal = 0;
    let costTotal = 0;
    for (const line of input.items) {
      const item = byId.get(line.saleItemId)!;
      const v = variants.get(item.variantId)!;
      const sold = num(item.quantity);
      const returnable = round3(sold - num(item.quantityReturned));
      if (line.quantity > returnable + 1e-9) {
        throw badRequest(`Only ${returnable} of ${v.displayName} can still be returned`);
      }
      if (v.trackSerials) {
        if (line.serials.length !== line.quantity) {
          throw badRequest(`Enter the ${line.quantity} serial number(s) being returned for ${v.displayName}`);
        }
        const linked = await tx
          .select({ serialNumber: serialNumbers.serialNumber })
          .from(serialNumbers)
          .where(
            and(
              eq(serialNumbers.saleItemId, item.id),
              eq(serialNumbers.status, "SOLD"),
              inArray(serialNumbers.serialNumber, line.serials),
            ),
          );
        if (linked.length !== line.serials.length) throw badRequest(`Some serial numbers weren't sold on this line`);
      }

      // what the customer paid per unit, after the bill discount
      const netPerUnit = (num(item.lineTotal) / sold) * billFactor;
      const taxPerUnit = num(item.taxAmount) / sold;
      const net = round2(netPerUnit * line.quantity);
      const tax = round2(taxPerUnit * line.quantity);
      const lineTotal = sale.taxMode === "EXCLUSIVE" ? round2(net + tax) : net;
      const exTax = sale.taxMode === "INCLUSIVE" ? round2(net - tax) : net;
      subtotal += exTax;
      taxTotal += tax;

      const restock = line.condition === "RESELLABLE";
      if (restock) {
        costTotal += line.quantity * num(item.unitCost);
        await receiveStock(tx, {
          organizationId: auth.organizationId,
          locationId: sale.locationId,
          variant: v,
          quantity: line.quantity,
          unitCost: num(item.unitCost),
          movementType: "SALE_RETURN",
          referenceType: "SALE_RETURN",
          referenceId: ret.id,
          userId: auth.userId,
          lot: item.lotId ? { existingLotId: item.lotId } : undefined,
          serials: v.trackSerials ? { numbers: line.serials, mode: "restock" } : undefined,
        });
      } else if (v.trackSerials) {
        await tx
          .update(serialNumbers)
          .set({ status: "DAMAGED", locationId: sale.locationId })
          .where(and(eq(serialNumbers.saleItemId, item.id), inArray(serialNumbers.serialNumber, line.serials)));
      }

      await tx.insert(saleReturnItems).values({
        saleReturnId: ret.id,
        saleItemId: item.id,
        variantId: v.id,
        lotId: item.lotId,
        quantity: qtyStr(line.quantity),
        unitPrice: item.unitPrice,
        taxAmount: money(tax),
        lineTotal: money(lineTotal),
        unitCost: costStr(num(item.unitCost)),
        condition: line.condition,
        restocked: restock,
        serialNumbers: line.serials,
      });
      await tx
        .update(saleItems)
        .set({ quantityReturned: sql`${saleItems.quantityReturned} + ${qtyStr(line.quantity)}` })
        .where(eq(saleItems.id, item.id));
    }

    const grandTotal = round2(subtotal + taxTotal);

    // how much cash can still be handed back for this sale
    const [paidRow] = await tx
      .select({
        paid: sql<string>`coalesce((select sum(amount) from ${payments} where sale_id = ${sale.id} and status = 'POSTED'), 0)`,
        refunded: sql<string>`coalesce((select sum(p.amount) from ${payments} p join ${saleReturns} r on r.id = p.sale_return_id
          where r.sale_id = ${sale.id} and p.status = 'POSTED'), 0)`,
      })
      .from(sql`(select 1) as one`);
    const refundable = round2(num(paidRow.paid) - num(paidRow.refunded));

    let resolution = input.resolution ?? (refundable + 0.004 >= grandTotal || !sale.partyId ? "REFUND" : "STORE_CREDIT");
    if (resolution === "STORE_CREDIT" && !sale.partyId) {
      throw badRequest("Store credit needs a customer account; this was a walk-in sale");
    }
    if (resolution === "REFUND" && grandTotal > refundable + 0.004) {
      if (!sale.partyId) {
        throw badRequest(`Only ${refundable.toFixed(2)} was paid on this sale and can be refunded`);
      }
      if (input.resolution === "REFUND") {
        throw badRequest(`Only ${refundable.toFixed(2)} can be refunded; use store credit for the rest`);
      }
      resolution = "STORE_CREDIT";
    }

    await tx
      .update(saleReturns)
      .set({
        resolution,
        subtotal: money(subtotal),
        taxAmount: money(taxTotal),
        grandTotal: money(grandTotal),
        totalCost: money(costTotal),
      })
      .where(eq(saleReturns.id, ret.id));

    if (resolution === "REFUND" && grandTotal > 0) {
      await recordPayment(tx, {
        organizationId: auth.organizationId,
        locationId: sale.locationId,
        direction: "REFUND_TO_CUSTOMER",
        partyId: sale.partyId,
        saleReturnId: ret.id,
        amount: grandTotal,
        paymentDate: input.returnDate ?? todayIn(settings.timezone),
        method: input.refundMethod,
        userId: auth.userId,
      });
    }
    await refreshSalePayment(tx, sale.id);
    return ret.id;
  });
  return getSaleReturn(auth, id);
}

export async function voidSaleReturn(auth: AuthContext, id: string) {
  await db.transaction(async (tx) => {
    const [r] = await tx
      .select()
      .from(saleReturns)
      .where(and(eq(saleReturns.id, id), eq(saleReturns.organizationId, auth.organizationId)))
      .for("update");
    if (!r) throw notFound("Sale return");
    if (r.status === "VOID") throw conflict("This return is already void");
    await resolveLocationId(tx, auth, r.locationId);

    const items = await tx.select().from(saleReturnItems).where(eq(saleReturnItems.saleReturnId, id));
    const variants = await loadVariants(
      tx,
      auth.organizationId,
      items.map((i) => i.variantId),
    );
    for (const item of items) {
      const v = variants.get(item.variantId)!;
      if (item.restocked) {
        await issueStock(tx, {
          organizationId: auth.organizationId,
          locationId: r.locationId,
          variant: v,
          quantity: num(item.quantity),
          movementType: "SALE",
          referenceType: "SALE_RETURN",
          referenceId: id,
          userId: auth.userId,
          note: `Return ${r.number} voided`,
          lotId: item.lotId,
          serials: item.serialNumbers,
          serialStatus: "SOLD",
          allowNegative: false,
          allowExpired: true,
        });
      } else if (v.trackSerials && item.serialNumbers.length) {
        await tx
          .update(serialNumbers)
          .set({ status: "SOLD", locationId: null })
          .where(and(eq(serialNumbers.saleItemId, item.saleItemId), inArray(serialNumbers.serialNumber, item.serialNumbers)));
      }
      await tx
        .update(saleItems)
        .set({ quantityReturned: sql`greatest(${saleItems.quantityReturned} - ${item.quantity}, 0)` })
        .where(eq(saleItems.id, item.saleItemId));
    }
    await voidPaymentsFor(tx, { saleReturnId: id }, auth.userId);
    await tx.update(saleReturns).set({ status: "VOID" }).where(eq(saleReturns.id, id));
    await refreshSalePayment(tx, r.saleId);
  });
  return getSaleReturn(auth, id);
}

const displayName = sql<string>`case when ${productVariants.isDefault} then ${products.name} else ${products.name} || ' (' || ${productVariants.name} || ')' end`;

export async function getSaleReturn(auth: AuthContext, id: string) {
  const [row] = await db
    .select({
      ret: saleReturns,
      invoiceNumber: sales.invoiceNumber,
      customerName: sql<string>`coalesce(${parties.name}, ${sales.customerName}, 'Walk-in customer')`,
      locationName: locations.name,
      createdByName: users.name,
    })
    .from(saleReturns)
    .innerJoin(sales, eq(sales.id, saleReturns.saleId))
    .leftJoin(parties, eq(parties.id, saleReturns.partyId))
    .innerJoin(locations, eq(locations.id, saleReturns.locationId))
    .leftJoin(users, eq(users.id, saleReturns.createdByUserId))
    .where(and(eq(saleReturns.id, id), eq(saleReturns.organizationId, auth.organizationId)));
  if (!row) throw notFound("Sale return");
  if (!auth.isOwner) await resolveLocationId(db, auth, row.ret.locationId);

  const [items, refunds] = await Promise.all([
    db
      .select({
        id: saleReturnItems.id,
        saleItemId: saleReturnItems.saleItemId,
        variantId: saleReturnItems.variantId,
        displayName,
        sku: productVariants.sku,
        unitCode: units.code,
        quantity: saleReturnItems.quantity,
        unitPrice: saleReturnItems.unitPrice,
        taxAmount: saleReturnItems.taxAmount,
        lineTotal: saleReturnItems.lineTotal,
        condition: saleReturnItems.condition,
        restocked: saleReturnItems.restocked,
        serialNumbers: saleReturnItems.serialNumbers,
      })
      .from(saleReturnItems)
      .innerJoin(productVariants, eq(productVariants.id, saleReturnItems.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .where(eq(saleReturnItems.saleReturnId, id)),
    db
      .select({ id: payments.id, number: payments.number, amount: payments.amount, method: payments.method, paymentDate: payments.paymentDate, status: payments.status })
      .from(payments)
      .where(eq(payments.saleReturnId, id)),
  ]);
  const r = row.ret;
  const canSeeCost = auth.isOwner || auth.permissions.includes("reports.view");
  return {
    saleReturn: {
      ...r,
      subtotal: num(r.subtotal),
      taxAmount: num(r.taxAmount),
      grandTotal: num(r.grandTotal),
      totalCost: canSeeCost ? num(r.totalCost) : undefined,
      invoiceNumber: row.invoiceNumber,
      customerName: row.customerName,
      locationName: row.locationName,
      createdByName: row.createdByName,
      items: items.map((i) => ({
        ...i,
        quantity: num(i.quantity),
        unitPrice: num(i.unitPrice),
        taxAmount: num(i.taxAmount),
        lineTotal: num(i.lineTotal),
      })),
      refunds: refunds.map((p) => ({ ...p, amount: num(p.amount) })),
    },
  };
}

export async function listSaleReturns(auth: AuthContext, q: z.infer<typeof saleReturnsQuery>) {
  const locationId = await resolveLocationFilter(db, auth, q.locationId);
  const where = and(
    eq(saleReturns.organizationId, auth.organizationId),
    locationId ? eq(saleReturns.locationId, locationId) : undefined,
    q.saleId ? eq(saleReturns.saleId, q.saleId) : undefined,
    q.partyId ? eq(saleReturns.partyId, q.partyId) : undefined,
    q.status ? eq(saleReturns.status, q.status) : undefined,
    q.search
      ? or(ilike(saleReturns.number, likePattern(q.search)), ilike(sales.invoiceNumber, likePattern(q.search)))
      : undefined,
    q.from ? gte(saleReturns.returnDate, q.from) : undefined,
    q.to ? lte(saleReturns.returnDate, q.to) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: saleReturns.id,
        number: saleReturns.number,
        returnDate: saleReturns.returnDate,
        status: saleReturns.status,
        resolution: saleReturns.resolution,
        grandTotal: saleReturns.grandTotal,
        reason: saleReturns.reason,
        saleId: saleReturns.saleId,
        invoiceNumber: sales.invoiceNumber,
        customerName: sql<string>`coalesce(${parties.name}, ${sales.customerName}, 'Walk-in customer')`,
        locationName: locations.name,
        createdAt: saleReturns.createdAt,
      })
      .from(saleReturns)
      .innerJoin(sales, eq(sales.id, saleReturns.saleId))
      .leftJoin(parties, eq(parties.id, saleReturns.partyId))
      .innerJoin(locations, eq(locations.id, saleReturns.locationId))
      .where(where)
      .orderBy(desc(saleReturns.returnDate), desc(saleReturns.createdAt))
      .limit(q.limit)
      .offset(offsetFor(q.page, q.limit)),
    db
      .select({ total: countAll })
      .from(saleReturns)
      .innerJoin(sales, eq(sales.id, saleReturns.saleId))
      .where(where),
  ]);
  return pageOf(
    rows.map((r) => ({ ...r, grandTotal: num(r.grandTotal) })),
    total,
    q.page,
    q.limit,
  );
}
