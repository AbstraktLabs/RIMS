import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { parties, payments, saleItems, sales, stockLots } from "@/db/schema";
import type { AuthContext } from "@/lib/api/handler";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { num, round2 } from "@/lib/num";
import { isoDate, money, nullableText, quantity } from "@/lib/validation/common";
import type { SaleInput } from "@/lib/validation/sales";
import { countAll, offsetFor } from "../_shared/paging";
import { refreshSalePayment, voidPaymentsFor } from "../_shared/payments";
import { totalsOrBadRequest } from "../_shared/totals";
import { resolveLocationId } from "../_shared/tenant";
import { addSalePayment, createSale, updateSale, voidSale } from "../sales/sales";
import { amount2, capPayments, fromMethod, toMethod, uuid, voucherAdjustments, voucherPaymentType, type StatusInput } from "./common";

// The pharmacy-style Sales screen: every line is sold from a batch the user picks.

export const saleVoucherSchema = z.object({
  partyId: uuid.optional().nullable(),
  saleDate: isoDate.optional(),
  paymentType: voucherPaymentType.default("CASH"),
  ...voucherAdjustments,
  prescriptionNote: nullableText(2000), // shown as "Note" for retail
  items: z
    .array(
      z.object({
        productId: uuid, // the variant id
        batchId: uuid,
        quantity,
        salePrice: money,
        vatApplicable: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(500),
});
export type SaleVoucherInput = z.infer<typeof saleVoucherSchema>;

type CarriedPayment = SaleInput["payments"][number];

function toSaleInput(v: SaleVoucherInput, carried: CarriedPayment[] | null): SaleInput {
  const taxed = v.vatRate > 0 && v.items.some((i) => i.vatApplicable);
  const taxMode = taxed ? "EXCLUSIVE" : "EXEMPT";
  const items = v.items.map((i) => ({
    variantId: i.productId,
    quantity: i.quantity,
    unitPrice: i.salePrice,
    discount: 0,
    taxRate: i.vatApplicable ? v.vatRate : 0,
    lotId: i.batchId,
    serials: [],
  }));
  const doc = { taxMode, discount: v.discount, otherCharges: v.freightCharges, roundOff: v.roundOff } as const;
  const { grandTotal } = totalsOrBadRequest(
    items.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discount: 0, taxRate: l.taxRate })),
    doc,
  );
  const pays: CarriedPayment[] =
    v.paymentType === "CREDIT"
      ? capPayments(carried ?? [], grandTotal)
      : grandTotal > 0
        ? [{ amount: grandTotal, method: toMethod(v.paymentType), referenceNumber: null }]
        : [];
  return {
    channel: "INVOICE",
    partyId: v.partyId ?? undefined,
    customerName: null,
    customerPhone: null,
    saleDate: v.saleDate,
    priceLevel: "RETAIL",
    paymentType: v.paymentType,
    note: v.prescriptionNote ?? null,
    items,
    payments: pays,
    ...doc,
  };
}

async function records(where: ReturnType<typeof and>, page?: { page: number; limit: number }) {
  const base = db
    .select({ s: sales, partyName: parties.name, partyPhone: parties.phone, partyAddress: parties.address, partyTaxId: parties.taxId })
    .from(sales)
    .leftJoin(parties, eq(parties.id, sales.partyId))
    .where(where)
    .orderBy(desc(sales.saleDate), desc(sales.createdAt));
  const rows = page ? await base.limit(page.limit).offset(offsetFor(page.page, page.limit)) : await base;
  const ids = rows.map((r) => r.s.id);
  if (!ids.length) return [];
  const [items, pays] = await Promise.all([
    db
      .select({
        id: saleItems.id,
        saleId: saleItems.saleId,
        variantId: saleItems.variantId,
        lotId: saleItems.lotId,
        quantity: saleItems.quantity,
        unitPrice: saleItems.unitPrice,
        taxRate: saleItems.taxRate,
        lineTotal: saleItems.lineTotal,
        lotNumber: stockLots.lotNumber,
        expiryDate: stockLots.expiryDate,
      })
      .from(saleItems)
      .leftJoin(stockLots, eq(stockLots.id, saleItems.lotId))
      .where(inArray(saleItems.saleId, ids))
      .orderBy(asc(saleItems.position), asc(saleItems.id)),
    db
      .select()
      .from(payments)
      .where(and(inArray(payments.saleId, ids), eq(payments.status, "POSTED")))
      .orderBy(desc(payments.paymentDate), desc(payments.createdAt)),
  ]);
  return rows.map(({ s, ...party }) => ({
    id: s.id,
    invoiceNumber: s.invoiceNumber,
    saleDate: s.saleDate.toISOString(),
    createdAt: s.createdAt,
    paymentType: (s.paymentType ?? (s.paymentStatus === "PAID" ? "CASH" : "CREDIT")) as z.infer<typeof voucherPaymentType>,
    paymentStatus: s.paymentStatus,
    roundingDirection: num(s.roundOff) > 0 ? "UP" : "DOWN",
    partyId: s.partyId,
    subtotal: amount2(num(s.subtotal)),
    discount: amount2(num(s.discount)),
    freightCharges: amount2(num(s.otherCharges)),
    vatRefund: "0.00",
    roundOff: amount2(num(s.roundOff)),
    vatAmount: amount2(num(s.taxAmount)),
    grandTotal: amount2(num(s.grandTotal)),
    paidAmount: amount2(num(s.paidAmount)),
    prescriptionNote: s.note,
    party: s.partyId
      ? { id: s.partyId, name: party.partyName ?? "", phone: party.partyPhone, address: party.partyAddress, panVatNumber: party.partyTaxId }
      : null,
    items: items
      .filter((i) => i.saleId === s.id)
      .map((i) => ({
        id: i.id,
        productId: i.variantId,
        batchId: i.lotId ?? "",
        quantity: num(i.quantity),
        salePrice: amount2(num(i.unitPrice)),
        lineTotal: amount2(num(i.lineTotal)),
        vatApplicable: num(i.taxRate) > 0,
        batch: i.lotId ? { batchNumber: i.lotNumber ?? "—", expiryDate: i.expiryDate ?? "" } : null,
      })),
    payments: pays
      .filter((x) => x.saleId === s.id)
      .map((x) => ({
        id: x.id,
        amount: amount2(num(x.amount)),
        paymentDate: x.paymentDate,
        method: fromMethod(x.method),
        referenceNumber: x.referenceNumber,
        notes: x.notes,
        createdAt: x.createdAt,
      })),
  }));
}

async function scope(auth: AuthContext) {
  const locationId = await resolveLocationId(db, auth);
  return and(eq(sales.organizationId, auth.organizationId), eq(sales.locationId, locationId), eq(sales.status, "POSTED"));
}

export async function listSaleVouchers(auth: AuthContext, q: { page: number; limit: number }) {
  const where = await scope(auth);
  const [list, [{ total }]] = await Promise.all([records(where, q), db.select({ total: countAll }).from(sales).where(where)]);
  return { sales: list, pagination: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) } };
}

export async function saleVoucherStats(auth: AuthContext) {
  // older sales have no payment type: paid ones count as cash, the rest as credit
  const type = sql`coalesce(${sales.paymentType}, case when ${sales.paymentStatus} = 'PAID' then 'CASH' else 'CREDIT' end)`;
  const [r] = await db
    .select({
      totalCount: countAll,
      totalRevenue: sql<string>`coalesce(sum(${sales.grandTotal}), 0)`,
      cashCount: sql<number>`(count(*) filter (where ${type} = 'CASH'))::int`,
      cashRevenue: sql<string>`coalesce(sum(${sales.grandTotal}) filter (where ${type} = 'CASH'), 0)`,
      creditCount: sql<number>`(count(*) filter (where ${type} = 'CREDIT'))::int`,
      creditRevenue: sql<string>`coalesce(sum(${sales.grandTotal}) filter (where ${type} = 'CREDIT'), 0)`,
    })
    .from(sales)
    .where(await scope(auth));
  return {
    stats: {
      totalCount: r.totalCount,
      totalRevenue: num(r.totalRevenue),
      cashCount: r.cashCount,
      cashRevenue: num(r.cashRevenue),
      creditCount: r.creditCount,
      creditRevenue: num(r.creditRevenue),
    },
  };
}

export async function getSaleVoucher(auth: AuthContext, id: string) {
  const [rec] = await records(and(await scope(auth), eq(sales.id, id)));
  if (!rec) throw notFound("Sale");
  return { sale: rec };
}

export async function createSaleVoucher(auth: AuthContext, v: SaleVoucherInput) {
  const { sale } = await createSale(auth, toSaleInput(v, null));
  return { saleId: sale.id, ...(await getSaleVoucher(auth, sale.id)) };
}

export async function updateSaleVoucher(auth: AuthContext, id: string, v: SaleVoucherInput) {
  const [old] = await db
    .select({ paymentType: sales.paymentType })
    .from(sales)
    .where(and(eq(sales.id, id), eq(sales.organizationId, auth.organizationId)));
  if (!old) throw notFound("Sale");
  const carried =
    old.paymentType === "CREDIT"
      ? (
          await db
            .select()
            .from(payments)
            .where(and(eq(payments.saleId, id), eq(payments.status, "POSTED")))
            .orderBy(asc(payments.createdAt))
        ).map((x) => ({ amount: num(x.amount), method: x.method, referenceNumber: x.referenceNumber }))
      : null;
  await updateSale(auth, id, toSaleInput(v, carried));
  return getSaleVoucher(auth, id);
}

export async function deleteSaleVoucher(auth: AuthContext, id: string) {
  await voidSale(auth, id, "Deleted");
  return { deleted: true };
}

export async function setSalePaymentStatus(auth: AuthContext, id: string, input: StatusInput) {
  const [s] = await db
    .select()
    .from(sales)
    .where(and(eq(sales.id, id), eq(sales.organizationId, auth.organizationId)));
  if (!s || s.status === "VOID") throw notFound("Sale");
  const balance = round2(num(s.grandTotal) - num(s.paidAmount));
  const method = toMethod(input.method ?? s.paymentType);
  const pay = (amount: number) =>
    addSalePayment(auth, id, {
      amount,
      method,
      paymentDate: input.paymentDate,
      referenceNumber: input.referenceNumber ?? null,
      notes: input.notes ?? null,
    });

  if (input.amount && input.amount > 0) {
    if (input.amount > balance + 0.004) throw badRequest(`Only ${balance.toFixed(2)} is outstanding on this invoice`);
    await pay(input.amount);
  } else if (input.paymentStatus === "PAID") {
    if (balance > 0.004) await pay(balance);
  } else if (input.paymentStatus === "UNPAID") {
    if (!s.partyId) throw badRequest("A walk-in sale must be paid; choose a customer to sell on credit");
    await resolveLocationId(db, auth, s.locationId);
    await db.transaction(async (tx) => {
      await voidPaymentsFor(tx, { saleId: id }, auth.userId);
      await refreshSalePayment(tx, id);
    });
  } else if (num(s.paidAmount) <= 0.004) {
    throw conflict("Enter the amount received so far");
  }
  return getSaleVoucher(auth, id);
}
