import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { locations, parties, payments, purchaseReturns, purchases, saleReturns, sales, users } from "@/db/schema";
import type { AuthContext } from "@/lib/api/handler";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { num, round2 } from "@/lib/num";
import type { PartyPaymentInput, paymentsQuery } from "@/lib/validation/finance";
import { todayIn } from "../_shared/dates";
import { countAll, likePattern, offsetFor, pageOf } from "../_shared/paging";
import { loadParty } from "../_shared/parties";
import { recordPayment, refreshPurchasePayment, refreshSalePayment } from "../_shared/payments";
import { getSettings, resolveLocationFilter, resolveLocationId } from "../_shared/tenant";

/**
 * Money in from a customer / out to a supplier that isn't taken at the till or
 * on a bill screen. With `allocate`, it pays off the oldest open documents
 * first (one payment row per document); the remainder is recorded on account.
 */
export async function recordPartyPayment(auth: AuthContext, input: PartyPaymentInput) {
  const created = await db.transaction(async (tx) => {
    const settings = await getSettings(tx, auth.organizationId);
    const role = input.direction === "RECEIVED_FROM_CUSTOMER" || input.direction === "REFUND_TO_CUSTOMER" ? "CUSTOMER" : "SUPPLIER";
    const party = await loadParty(tx, auth.organizationId, input.partyId, role);
    const locationId = await resolveLocationId(tx, auth, input.locationId);
    const paymentDate = input.paymentDate ?? todayIn(settings.timezone);
    const base = {
      organizationId: auth.organizationId,
      locationId,
      direction: input.direction,
      partyId: party.id,
      paymentDate,
      method: input.method,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      userId: auth.userId,
    };

    let remaining = round2(input.amount);
    const rows: { id: string; number: string; amount: string; saleId: string | null; purchaseId: string | null }[] = [];

    if (input.allocate && input.direction === "RECEIVED_FROM_CUSTOMER") {
      const open = await tx
        .select({ id: sales.id })
        .from(sales)
        .where(
          and(
            eq(sales.organizationId, auth.organizationId),
            eq(sales.partyId, party.id),
            eq(sales.status, "POSTED"),
            inArray(sales.paymentStatus, ["UNPAID", "PARTIAL"]),
          ),
        )
        .orderBy(asc(sales.saleDate))
        .for("update");
      for (const s of open) {
        if (remaining <= 0) break;
        const state = await refreshSalePayment(tx, s.id);
        if (!state || state.balance <= 0) continue;
        const amount = Math.min(remaining, state.balance);
        rows.push(await recordPayment(tx, { ...base, saleId: s.id, amount }));
        await refreshSalePayment(tx, s.id);
        remaining = round2(remaining - amount);
      }
    }
    if (input.allocate && input.direction === "PAID_TO_SUPPLIER") {
      const open = await tx
        .select({ id: purchases.id })
        .from(purchases)
        .where(
          and(
            eq(purchases.organizationId, auth.organizationId),
            eq(purchases.partyId, party.id),
            eq(purchases.status, "POSTED"),
            inArray(purchases.paymentStatus, ["UNPAID", "PARTIAL"]),
          ),
        )
        .orderBy(asc(purchases.dueDate), asc(purchases.purchaseDate))
        .for("update");
      for (const p of open) {
        if (remaining <= 0) break;
        const state = await refreshPurchasePayment(tx, p.id);
        if (!state || state.balance <= 0) continue;
        const amount = Math.min(remaining, state.balance);
        rows.push(await recordPayment(tx, { ...base, purchaseId: p.id, amount }));
        await refreshPurchasePayment(tx, p.id);
        remaining = round2(remaining - amount);
      }
    }
    if (remaining > 0) rows.push(await recordPayment(tx, { ...base, amount: remaining }));
    return rows;
  });

  return {
    payments: created.map((p) => ({ id: p.id, number: p.number, amount: num(p.amount), saleId: p.saleId, purchaseId: p.purchaseId })),
    onAccount: round2(created.filter((p) => !p.saleId && !p.purchaseId).reduce((s, p) => s + num(p.amount), 0)),
  };
}

export async function voidPayment(auth: AuthContext, id: string) {
  await db.transaction(async (tx) => {
    const [p] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.id, id), eq(payments.organizationId, auth.organizationId)))
      .for("update");
    if (!p) throw notFound("Payment");
    if (p.status === "VOID") throw conflict("This payment is already void");
    if (p.saleReturnId || p.purchaseReturnId) {
      throw badRequest("Refunds belong to their return — void the return instead");
    }
    if (p.locationId) await resolveLocationId(tx, auth, p.locationId);
    await tx
      .update(payments)
      .set({ status: "VOID", voidedAt: new Date(), voidedByUserId: auth.userId })
      .where(eq(payments.id, id));
    if (p.saleId) await refreshSalePayment(tx, p.saleId);
    if (p.purchaseId) await refreshPurchasePayment(tx, p.purchaseId);
  });
  return getPayment(auth, id);
}

const documentNumber = sql<string | null>`coalesce(${sales.invoiceNumber}, ${purchases.number}, ${saleReturns.number}, ${purchaseReturns.number})`;

function paymentSelect() {
  return db
    .select({
      id: payments.id,
      number: payments.number,
      direction: payments.direction,
      amount: payments.amount,
      method: payments.method,
      paymentDate: payments.paymentDate,
      referenceNumber: payments.referenceNumber,
      notes: payments.notes,
      status: payments.status,
      partyId: payments.partyId,
      partyName: sql<string | null>`coalesce(${parties.name}, ${sales.customerName})`,
      saleId: payments.saleId,
      purchaseId: payments.purchaseId,
      saleReturnId: payments.saleReturnId,
      purchaseReturnId: payments.purchaseReturnId,
      documentNumber,
      locationName: locations.name,
      createdByName: users.name,
      voidedAt: payments.voidedAt,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .leftJoin(parties, eq(parties.id, payments.partyId))
    .leftJoin(sales, eq(sales.id, payments.saleId))
    .leftJoin(purchases, eq(purchases.id, payments.purchaseId))
    .leftJoin(saleReturns, eq(saleReturns.id, payments.saleReturnId))
    .leftJoin(purchaseReturns, eq(purchaseReturns.id, payments.purchaseReturnId))
    .leftJoin(locations, eq(locations.id, payments.locationId))
    .leftJoin(users, eq(users.id, payments.createdByUserId));
}

export async function getPayment(auth: AuthContext, id: string) {
  const [row] = await paymentSelect().where(and(eq(payments.id, id), eq(payments.organizationId, auth.organizationId)));
  if (!row) throw notFound("Payment");
  return { payment: { ...row, amount: num(row.amount), onAccount: !row.saleId && !row.purchaseId && !row.saleReturnId && !row.purchaseReturnId } };
}

export async function listPayments(auth: AuthContext, q: z.infer<typeof paymentsQuery>) {
  const locationId = await resolveLocationFilter(db, auth, q.locationId);
  const where = and(
    eq(payments.organizationId, auth.organizationId),
    locationId ? or(eq(payments.locationId, locationId), isNull(payments.locationId)) : undefined,
    q.partyId ? eq(payments.partyId, q.partyId) : undefined,
    q.direction ? eq(payments.direction, q.direction) : undefined,
    q.method ? eq(payments.method, q.method) : undefined,
    q.status ? eq(payments.status, q.status) : undefined,
    q.search
      ? or(
          ilike(payments.number, likePattern(q.search)),
          ilike(payments.referenceNumber, likePattern(q.search)),
          ilike(parties.name, likePattern(q.search)),
        )
      : undefined,
    q.from ? gte(payments.paymentDate, q.from) : undefined,
    q.to ? lte(payments.paymentDate, q.to) : undefined,
  );
  const inflow = sql`${payments.direction} in ('RECEIVED_FROM_CUSTOMER', 'REFUND_FROM_SUPPLIER')`;
  const [rows, [summary], byMethod] = await Promise.all([
    paymentSelect()
      .where(where)
      .orderBy(desc(payments.paymentDate), desc(payments.createdAt))
      .limit(q.limit)
      .offset(offsetFor(q.page, q.limit)),
    db
      .select({
        total: countAll,
        moneyIn: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'POSTED' and ${inflow}), 0)`,
        moneyOut: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'POSTED' and not ${inflow}), 0)`,
      })
      .from(payments)
      .leftJoin(parties, eq(parties.id, payments.partyId))
      .where(where),
    db
      .select({
        method: payments.method,
        moneyIn: sql<string>`coalesce(sum(${payments.amount}) filter (where ${inflow}), 0)`,
        moneyOut: sql<string>`coalesce(sum(${payments.amount}) filter (where not ${inflow}), 0)`,
      })
      .from(payments)
      .leftJoin(parties, eq(parties.id, payments.partyId))
      .where(and(where, eq(payments.status, "POSTED")))
      .groupBy(payments.method),
  ]);
  return {
    ...pageOf(
      rows.map((r) => ({ ...r, amount: num(r.amount) })),
      summary.total,
      q.page,
      q.limit,
    ),
    summary: {
      moneyIn: num(summary.moneyIn),
      moneyOut: num(summary.moneyOut),
      net: round2(num(summary.moneyIn) - num(summary.moneyOut)),
      byMethod: byMethod.map((m) => ({ method: m.method, moneyIn: num(m.moneyIn), moneyOut: num(m.moneyOut) })),
    },
  };
}
