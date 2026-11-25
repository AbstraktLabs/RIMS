import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { db, type Tx } from "@/db";
import {
  locations,
  parties,
  payments,
  productVariants,
  products,
  saleItems,
  saleReturns,
  sales,
  serialNumbers,
  stockLots,
  units,
  users,
} from "@/db/schema";
import type { AuthContext } from "@/lib/api/handler";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { costStr, money, num, qtyStr, round2, round3 } from "@/lib/num";
import type { PaymentInput } from "@/lib/validation/purchasing";
import type { SaleInput, salesQuery } from "@/lib/validation/sales";
import { todayIn } from "../_shared/dates";
import { partyBalance } from "../_shared/ledger";
import { countAll, likePattern, offsetFor, pageOf } from "../_shared/paging";
import { loadParty } from "../_shared/parties";
import { recordPayment, refreshSalePayment, voidPaymentsFor } from "../_shared/payments";
import { nextDocumentNumber } from "../_shared/sequences";
import { issueStock, linkSerials, loadVariants, receiveStock } from "../_shared/stock";
import { totalsOrBadRequest } from "../_shared/totals";
import { getSettings, resolveLocationFilter, resolveLocationId } from "../_shared/tenant";
import { qcol } from "../_shared/sql";

/** Split an amount across parts in proportion to their quantities; last part takes the remainder. */
function splitAmount(total: number, parts: number[]): number[] {
  const qty = parts.reduce((a, b) => a + b, 0);
  let used = 0;
  return parts.map((p, i) => {
    if (i === parts.length - 1) return round2(total - used);
    const share = qty > 0 ? round2((total * p) / qty) : 0;
    used += share;
    return share;
  });
}

export async function createSale(auth: AuthContext, input: SaleInput) {
  const id = await db.transaction(async (tx) => {
    const settings = await getSettings(tx, auth.organizationId);
    const locationId = await resolveLocationId(tx, auth, input.locationId);
    const party = input.partyId ? await loadParty(tx, auth.organizationId, input.partyId, "CUSTOMER") : null;
    const today = todayIn(settings.timezone);
    const variants = await loadVariants(
      tx,
      auth.organizationId,
      input.items.map((i) => i.variantId),
    );

    const lines = input.items.map((l) => {
      const v = variants.get(l.variantId)!;
      if (!v.isActive) throw badRequest(`${v.displayName} is no longer sold`);
      const listPrice =
        input.priceLevel === "WHOLESALE" && v.wholesalePrice !== null ? v.wholesalePrice : v.sellingPrice;
      return { ...l, variant: v, unitPrice: l.unitPrice ?? listPrice };
    });

    const taxMode = input.taxMode ?? (settings.pricesIncludeTax ? "INCLUSIVE" : "EXCLUSIVE");
    const totals = totalsOrBadRequest(
      lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount, taxRate: l.variant.taxRate })),
      { taxMode: settings.taxRegistered ? taxMode : "EXEMPT", discount: input.discount, otherCharges: input.otherCharges, roundOff: input.roundOff },
    );
    const effectiveTaxMode = settings.taxRegistered ? taxMode : "EXEMPT";

    // payments: anything over the total must be cash, and is handed back as change
    const tendered = round2(input.payments.reduce((s, p) => s + p.amount, 0));
    const cashTendered = round2(input.payments.filter((p) => p.method === "CASH").reduce((s, p) => s + p.amount, 0));
    const change = Math.max(0, round2(tendered - totals.grandTotal));
    if (change > cashTendered + 0.004) throw badRequest("Only cash payments can exceed the total (to give change)");
    const paid = round2(tendered - change);
    const unpaid = round2(totals.grandTotal - paid);

    if (unpaid > 0.004) {
      if (!party) throw badRequest("Select a customer to sell on credit; walk-in sales must be paid in full");
      if (party.creditLimit !== null) {
        const balance = await partyBalance(tx, auth.organizationId, party.id);
        if (balance + unpaid > num(party.creditLimit) + 0.004) {
          throw badRequest(
            `${party.name}'s credit limit is ${num(party.creditLimit).toFixed(2)}; current balance ${balance.toFixed(2)} plus this sale's ${unpaid.toFixed(2)} would exceed it`,
          );
        }
      }
    }

    const saleDay = input.saleDate ?? today;
    if (saleDay > today) throw badRequest("Sale date can't be in the future");
    const invoiceNumber = await nextDocumentNumber(tx, auth.organizationId, "SALE");
    const [sale] = await tx
      .insert(sales)
      .values({
        organizationId: auth.organizationId,
        locationId,
        invoiceNumber,
        channel: input.channel,
        partyId: party?.id ?? null,
        customerName: input.customerName ?? party?.name ?? null,
        customerPhone: input.customerPhone ?? party?.phone ?? null,
        // back-dated invoices are stamped at noon local time on that day
        saleDate: saleDay === today ? new Date() : sql`(${saleDay}::date + time '12:00') at time zone ${settings.timezone}`,
        dueDate: input.dueDate ?? null,
        taxMode: effectiveTaxMode,
        subtotal: money(totals.subtotal),
        discount: money(totals.discount),
        otherCharges: money(totals.otherCharges),
        taxAmount: money(totals.taxAmount),
        roundOff: money(totals.roundOff),
        grandTotal: money(totals.grandTotal),
        amountTendered: cashTendered > 0 ? money(cashTendered) : null,
        changeGiven: money(change),
        note: input.note ?? null,
        createdByUserId: auth.userId,
      })
      .returning({ id: sales.id });

    let totalCost = 0;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const t = totals.lines[i];
      const v = l.variant;
      const allocations = await issueStock(tx, {
        organizationId: auth.organizationId,
        locationId,
        variant: v,
        quantity: l.quantity,
        movementType: "SALE",
        referenceType: "SALE",
        referenceId: sale.id,
        userId: auth.userId,
        lotId: l.lotId ?? null,
        serials: l.serials,
        serialStatus: "SOLD",
        allowNegative: settings.allowNegativeStock,
      });

      // one sale line per batch so each keeps its own cost (and expiry for recalls)
      const qtys = allocations.map((a) => a.quantity);
      const discounts = splitAmount(l.discount, qtys);
      const taxes = splitAmount(t.taxAmount, qtys);
      const lineTotals = splitAmount(t.lineTotal, qtys);
      for (let k = 0; k < allocations.length; k++) {
        const a = allocations[k];
        totalCost += a.quantity * a.unitCost;
        const [item] = await tx
          .insert(saleItems)
          .values({
            saleId: sale.id,
            variantId: v.id,
            lotId: a.lotId,
            quantity: qtyStr(a.quantity),
            unitPrice: money(l.unitPrice),
            discount: money(discounts[k]),
            taxRateId: v.taxRateId,
            taxRate: String(t.taxRate),
            taxAmount: money(taxes[k]),
            lineTotal: money(lineTotals[k]),
            unitCost: costStr(a.unitCost),
          })
          .returning({ id: saleItems.id });
        if (k === 0 && v.trackSerials) await linkSerials(tx, auth.organizationId, v.id, l.serials, { saleItemId: item.id });
      }
    }
    await tx.update(sales).set({ totalCost: money(totalCost) }).where(eq(sales.id, sale.id));

    // record tender, reducing cash by the change handed back
    let changeLeft = change;
    for (const p of input.payments) {
      let amount = p.amount;
      if (p.method === "CASH" && changeLeft > 0) {
        const cut = Math.min(changeLeft, amount);
        amount = round2(amount - cut);
        changeLeft = round2(changeLeft - cut);
      }
      if (amount <= 0) continue;
      await recordPayment(tx, {
        organizationId: auth.organizationId,
        locationId,
        direction: "RECEIVED_FROM_CUSTOMER",
        partyId: party?.id ?? null,
        saleId: sale.id,
        amount,
        paymentDate: saleDay,
        method: p.method,
        referenceNumber: p.referenceNumber,
        userId: auth.userId,
      });
    }
    await refreshSalePayment(tx, sale.id);
    return sale.id;
  });
  return getSale(auth, id);
}

async function lockSale(tx: Tx, auth: AuthContext, id: string) {
  const [s] = await tx
    .select()
    .from(sales)
    .where(and(eq(sales.id, id), eq(sales.organizationId, auth.organizationId)))
    .for("update");
  if (!s) throw notFound("Sale");
  await resolveLocationId(tx, auth, s.locationId);
  return s;
}

export async function voidSale(auth: AuthContext, id: string, reason: string) {
  await db.transaction(async (tx) => {
    const s = await lockSale(tx, auth, id);
    if (s.status === "VOID") throw conflict("This sale is already void");
    const [{ returns }] = await tx
      .select({ returns: sql<number>`count(*)::int` })
      .from(saleReturns)
      .where(and(eq(saleReturns.saleId, id), eq(saleReturns.status, "POSTED")));
    if (returns > 0) throw conflict("Void the returns made against this sale first");

    const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, id));
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
              .where(eq(serialNumbers.saleItemId, item.id))
          ).map((r) => r.serialNumber)
        : [];
      await receiveStock(tx, {
        organizationId: auth.organizationId,
        locationId: s.locationId,
        variant: v,
        quantity: num(item.quantity),
        unitCost: num(item.unitCost),
        movementType: "SALE_RETURN",
        referenceType: "SALE",
        referenceId: id,
        userId: auth.userId,
        note: `Void: ${reason}`,
        lot: item.lotId ? { existingLotId: item.lotId } : undefined,
        serials: v.trackSerials && serials.length ? { numbers: serials, mode: "restock" } : undefined,
      });
    }
    await voidPaymentsFor(tx, { saleId: id }, auth.userId);
    await tx
      .update(sales)
      .set({ status: "VOID", voidedAt: new Date(), voidedByUserId: auth.userId, voidReason: reason })
      .where(eq(sales.id, id));
    await refreshSalePayment(tx, id);
  });
  return getSale(auth, id);
}

export async function addSalePayment(auth: AuthContext, id: string, input: PaymentInput) {
  await db.transaction(async (tx) => {
    const s = await lockSale(tx, auth, id);
    if (s.status === "VOID") throw conflict("Can't take payment for a void sale");
    const state = await refreshSalePayment(tx, id);
    if (state && input.amount > state.balance + 0.004) {
      throw badRequest(`Only ${state.balance.toFixed(2)} is outstanding on this invoice`);
    }
    const settings = await getSettings(tx, auth.organizationId);
    await recordPayment(tx, {
      organizationId: auth.organizationId,
      locationId: s.locationId,
      direction: "RECEIVED_FROM_CUSTOMER",
      partyId: s.partyId,
      saleId: id,
      amount: input.amount,
      paymentDate: input.paymentDate ?? todayIn(settings.timezone),
      method: input.method,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      userId: auth.userId,
    });
    await refreshSalePayment(tx, id);
  });
  return getSale(auth, id);
}

const displayName = sql<string>`case when ${productVariants.isDefault} then ${products.name} else ${products.name} || ' (' || ${productVariants.name} || ')' end`;

export async function getSale(auth: AuthContext, id: string) {
  const [row] = await db
    .select({
      sale: sales,
      partyName: parties.name,
      partyPhone: parties.phone,
      partyTaxId: parties.taxId,
      partyAddress: parties.address,
      locationName: locations.name,
      locationAddress: locations.address,
      locationPhone: locations.phone,
      cashierName: users.name,
    })
    .from(sales)
    .leftJoin(parties, eq(parties.id, sales.partyId))
    .innerJoin(locations, eq(locations.id, sales.locationId))
    .leftJoin(users, eq(users.id, sales.createdByUserId))
    .where(and(eq(sales.id, id), eq(sales.organizationId, auth.organizationId)));
  if (!row) throw notFound("Sale");
  if (!auth.isOwner) await resolveLocationId(db, auth, row.sale.locationId);

  const [items, pays, returns] = await Promise.all([
    db
      .select({
        id: saleItems.id,
        variantId: saleItems.variantId,
        displayName,
        sku: productVariants.sku,
        unitCode: units.code,
        trackSerials: products.trackSerials,
        lotId: saleItems.lotId,
        lotNumber: stockLots.lotNumber,
        expiryDate: stockLots.expiryDate,
        quantity: saleItems.quantity,
        quantityReturned: saleItems.quantityReturned,
        unitPrice: saleItems.unitPrice,
        discount: saleItems.discount,
        taxRate: saleItems.taxRate,
        taxAmount: saleItems.taxAmount,
        lineTotal: saleItems.lineTotal,
        unitCost: saleItems.unitCost,
        serials: sql<string[]>`coalesce((select array_agg(s.serial_number order by s.serial_number) from ${serialNumbers} s where s.sale_item_id = ${qcol(saleItems.id)}), '{}')`,
      })
      .from(saleItems)
      .innerJoin(productVariants, eq(productVariants.id, saleItems.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .leftJoin(stockLots, eq(stockLots.id, saleItems.lotId))
      .where(eq(saleItems.saleId, id)),
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
      .where(eq(payments.saleId, id))
      .orderBy(payments.createdAt),
    db
      .select({
        id: saleReturns.id,
        number: saleReturns.number,
        returnDate: saleReturns.returnDate,
        status: saleReturns.status,
        resolution: saleReturns.resolution,
        grandTotal: saleReturns.grandTotal,
      })
      .from(saleReturns)
      .where(eq(saleReturns.saleId, id))
      .orderBy(saleReturns.createdAt),
  ]);

  const s = row.sale;
  const credited = returns
    .filter((r) => r.status === "POSTED" && r.resolution === "STORE_CREDIT")
    .reduce((t, r) => t + num(r.grandTotal), 0);
  const due = round2(num(s.grandTotal) - credited);
  const canSeeCost = auth.isOwner || auth.permissions.includes("reports.view");
  return {
    sale: {
      ...s,
      subtotal: num(s.subtotal),
      discount: num(s.discount),
      otherCharges: num(s.otherCharges),
      taxAmount: num(s.taxAmount),
      roundOff: num(s.roundOff),
      grandTotal: num(s.grandTotal),
      totalCost: canSeeCost ? num(s.totalCost) : undefined,
      grossProfit: canSeeCost ? round2(num(s.grandTotal) - num(s.taxAmount) - num(s.otherCharges) - num(s.totalCost)) : undefined,
      paidAmount: num(s.paidAmount),
      amountTendered: s.amountTendered === null ? null : num(s.amountTendered),
      changeGiven: num(s.changeGiven),
      creditedAmount: round2(credited),
      balanceDue: s.status === "VOID" ? 0 : Math.max(0, round2(due - num(s.paidAmount))),
      partyName: row.partyName,
      partyPhone: row.partyPhone,
      partyTaxId: row.partyTaxId,
      partyAddress: row.partyAddress,
      locationName: row.locationName,
      locationAddress: row.locationAddress,
      locationPhone: row.locationPhone,
      cashierName: row.cashierName,
      items: items.map((i) => ({
        ...i,
        quantity: num(i.quantity),
        quantityReturned: num(i.quantityReturned),
        returnableQuantity: round3(num(i.quantity) - num(i.quantityReturned)),
        unitPrice: num(i.unitPrice),
        discount: num(i.discount),
        taxRate: num(i.taxRate),
        taxAmount: num(i.taxAmount),
        lineTotal: num(i.lineTotal),
        unitCost: canSeeCost ? num(i.unitCost) : undefined,
      })),
      payments: pays.map((p) => ({ ...p, amount: num(p.amount) })),
      returns: returns.map((r) => ({ ...r, grandTotal: num(r.grandTotal) })),
    },
  };
}

export async function listSales(auth: AuthContext, q: z.infer<typeof salesQuery>) {
  const settings = await getSettings(db, auth.organizationId);
  const locationId = await resolveLocationFilter(db, auth, q.locationId);
  const day = sql`(${sales.saleDate} at time zone ${settings.timezone})::date`;
  const where = and(
    eq(sales.organizationId, auth.organizationId),
    locationId ? eq(sales.locationId, locationId) : undefined,
    q.partyId ? eq(sales.partyId, q.partyId) : undefined,
    q.channel ? eq(sales.channel, q.channel) : undefined,
    q.status ? eq(sales.status, q.status) : undefined,
    q.paymentStatus ? eq(sales.paymentStatus, q.paymentStatus) : undefined,
    q.userId ? eq(sales.createdByUserId, q.userId) : undefined,
    q.search
      ? or(
          ilike(sales.invoiceNumber, likePattern(q.search)),
          ilike(sales.customerName, likePattern(q.search)),
          ilike(sales.customerPhone, likePattern(q.search)),
        )
      : undefined,
    q.from ? gte(day, q.from) : undefined,
    q.to ? lte(day, q.to) : undefined,
  );
  const [rows, [summary]] = await Promise.all([
    db
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        channel: sales.channel,
        saleDate: sales.saleDate,
        status: sales.status,
        paymentStatus: sales.paymentStatus,
        grandTotal: sales.grandTotal,
        paidAmount: sales.paidAmount,
        partyId: sales.partyId,
        customerName: sql<string>`coalesce(${parties.name}, ${sales.customerName}, 'Walk-in customer')`,
        locationName: locations.name,
        cashierName: users.name,
        itemCount: sql<number>`(select coalesce(sum(i.quantity), 0)::float from ${saleItems} i where i.sale_id = ${qcol(sales.id)})`,
      })
      .from(sales)
      .leftJoin(parties, eq(parties.id, sales.partyId))
      .innerJoin(locations, eq(locations.id, sales.locationId))
      .leftJoin(users, eq(users.id, sales.createdByUserId))
      .where(where)
      .orderBy(desc(sales.saleDate))
      .limit(q.limit)
      .offset(offsetFor(q.page, q.limit)),
    db
      .select({
        total: countAll,
        totalAmount: sql<string>`coalesce(sum(${sales.grandTotal}) filter (where ${sales.status} = 'POSTED'), 0)`,
        totalPaid: sql<string>`coalesce(sum(${sales.paidAmount}) filter (where ${sales.status} = 'POSTED'), 0)`,
      })
      .from(sales)
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
