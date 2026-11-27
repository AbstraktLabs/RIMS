import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { parties, payments, productVariants, purchaseItems, purchases, stockLots } from "@/db/schema";
import type { AuthContext } from "@/lib/api/handler";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { num, round2 } from "@/lib/num";
import { isoDate, money, nullableText, quantity } from "@/lib/validation/common";
import type { PurchaseInput } from "@/lib/validation/purchasing";
import { countAll, offsetFor } from "../_shared/paging";
import { refreshPurchasePayment, voidPaymentsFor } from "../_shared/payments";
import { totalsOrBadRequest } from "../_shared/totals";
import { resolveLocationId } from "../_shared/tenant";
import { addPurchasePayment, createPurchase, updatePurchase, voidPurchase } from "../purchasing/purchases";
import {
  amount2,
  capPayments,
  fromMethod,
  optionalDate,
  toMethod,
  uuid,
  voucherAdjustments,
  voucherPaymentType,
  type StatusInput,
} from "./common";

// The pharmacy-style Purchase screen talks to these. Each "product" on the
// screen is one sellable item (a size/colour of a retail product is its own row),
// and every purchase line is received as its own batch.

const purcType = z.enum(["VAT_EXEMPT", "VAT_ITEM_WISE", "VAT_TAX_INCL"]);

export const purchaseVoucherSchema = z.object({
  partyId: uuid,
  supplierInvoiceNumber: nullableText(100),
  purchaseDate: isoDate.optional(),
  purcType: purcType.default("VAT_EXEMPT"),
  paymentType: voucherPaymentType.default("CASH"),
  ...voucherAdjustments,
  note: nullableText(2000),
  items: z
    .array(
      z.object({
        purchaseItemId: uuid.optional(),
        productId: uuid, // the variant id
        purchaseRate: money,
        vatApplicable: z.boolean().default(true),
        batch: z.object({
          batchNumber: z.string().trim().max(100).default(""),
          quantity,
          expiryDate: optionalDate,
          manufacturingDate: optionalDate,
          mrp: money.optional(),
          salePrice: money.optional(),
          note: nullableText(500),
        }),
      }),
    )
    .min(1)
    .max(500),
});
export type PurchaseVoucherInput = z.infer<typeof purchaseVoucherSchema>;

const TAX_MODE = { VAT_EXEMPT: "EXEMPT", VAT_ITEM_WISE: "EXCLUSIVE", VAT_TAX_INCL: "INCLUSIVE" } as const;
const PURC_TYPE = { EXEMPT: "VAT_EXEMPT", EXCLUSIVE: "VAT_ITEM_WISE", INCLUSIVE: "VAT_TAX_INCL" } as const;

type CarriedPayment = PurchaseInput["payments"][number];

function toPurchaseInput(v: PurchaseVoucherInput, carried: CarriedPayment[] | null): PurchaseInput {
  const taxMode = TAX_MODE[v.purcType];
  const items = v.items.map((it) => ({
    variantId: it.productId,
    quantity: it.batch.quantity,
    unitCost: it.purchaseRate,
    discount: 0,
    taxRate: taxMode === "EXEMPT" ? 0 : taxMode === "INCLUSIVE" || it.vatApplicable ? v.vatRate : 0,
    inPurchaseUnits: false,
    lotNumber: it.batch.batchNumber || null,
    manufacturingDate: it.batch.manufacturingDate ?? null,
    expiryDate: it.batch.expiryDate ?? null,
    serials: [],
    lotNote: it.batch.note ?? null,
    ...(it.batch.mrp !== undefined ? { mrp: it.batch.mrp } : {}),
    ...(it.batch.salePrice !== undefined ? { sellingPrice: it.batch.salePrice } : {}),
  }));
  const doc = { taxMode, discount: v.discount, otherCharges: v.freightCharges, roundOff: v.roundOff };
  const { grandTotal } = totalsOrBadRequest(
    items.map((l) => ({ quantity: l.quantity, unitPrice: l.unitCost, discount: 0, taxRate: l.taxRate })),
    doc,
  );
  // cash / bank / cheque / mobile = paid in full; credit = unpaid (earlier part-payments are kept on edit)
  const pays: CarriedPayment[] =
    v.paymentType === "CREDIT"
      ? capPayments(carried ?? [], grandTotal)
      : grandTotal > 0
        ? [{ amount: grandTotal, method: toMethod(v.paymentType), paymentDate: v.purchaseDate, referenceNumber: null, notes: null }]
        : [];
  return {
    partyId: v.partyId,
    supplierInvoiceNumber: v.supplierInvoiceNumber ?? null,
    purchaseDate: v.purchaseDate,
    paymentType: v.paymentType,
    note: v.note ?? null,
    items,
    payments: pays,
    ...doc,
  };
}

/** Purchases in the pharmacy screen's shape, newest first. */
async function records(where: ReturnType<typeof and>, page?: { page: number; limit: number }) {
  const base = db
    .select({
      p: purchases,
      partyName: parties.name,
      partyPhone: parties.phone,
      partyEmail: parties.email,
      partyAddress: parties.address,
      partyTaxId: parties.taxId,
      partyContact: parties.contactPerson,
    })
    .from(purchases)
    .innerJoin(parties, eq(parties.id, purchases.partyId))
    .where(where)
    .orderBy(desc(purchases.createdAt));
  const rows = page ? await base.limit(page.limit).offset(offsetFor(page.page, page.limit)) : await base;
  const ids = rows.map((r) => r.p.id);
  if (!ids.length) return [];

  const [items, pays] = await Promise.all([
    db
      .select({
        id: purchaseItems.id,
        purchaseId: purchaseItems.purchaseId,
        variantId: purchaseItems.variantId,
        lotNumber: purchaseItems.lotNumber,
        manufacturingDate: purchaseItems.manufacturingDate,
        expiryDate: purchaseItems.expiryDate,
        quantity: purchaseItems.quantity,
        unitCost: purchaseItems.unitCost,
        taxRate: purchaseItems.taxRate,
        lineTotal: purchaseItems.lineTotal,
        mrp: productVariants.mrp,
        sellingPrice: productVariants.sellingPrice,
        lotNote: stockLots.note,
      })
      .from(purchaseItems)
      .innerJoin(productVariants, eq(productVariants.id, purchaseItems.variantId))
      .leftJoin(stockLots, eq(stockLots.id, purchaseItems.lotId))
      .where(inArray(purchaseItems.purchaseId, ids))
      .orderBy(asc(purchaseItems.position), asc(purchaseItems.id)),
    db
      .select()
      .from(payments)
      .where(and(inArray(payments.purchaseId, ids), eq(payments.status, "POSTED")))
      .orderBy(desc(payments.paymentDate), desc(payments.createdAt)),
  ]);

  return rows.map(({ p, ...party }) => ({
    id: p.id,
    number: p.number,
    purchaseDate: p.purchaseDate,
    createdAt: p.createdAt,
    supplierInvoiceNumber: p.supplierInvoiceNumber,
    paymentType: (p.paymentType ?? (p.paymentStatus === "PAID" ? "CASH" : "CREDIT")) as z.infer<typeof voucherPaymentType>,
    paymentStatus: p.paymentStatus,
    purcType: PURC_TYPE[p.taxMode],
    roundingDirection: num(p.roundOff) > 0 ? "UP" : "DOWN",
    subtotal: amount2(num(p.subtotal)),
    discount: amount2(num(p.discount)),
    freightCharges: amount2(num(p.otherCharges)),
    vatAmount: amount2(num(p.taxAmount)),
    vatRefund: "0.00",
    roundOff: amount2(num(p.roundOff)),
    grandTotal: amount2(num(p.grandTotal)),
    paidAmount: amount2(num(p.paidAmount)),
    note: p.note,
    party: {
      id: p.partyId,
      name: party.partyName,
      phone: party.partyPhone,
      email: party.partyEmail,
      address: party.partyAddress,
      panVatNumber: party.partyTaxId,
      contactPerson: party.partyContact,
    },
    items: items
      .filter((i) => i.purchaseId === p.id)
      .map((i) => ({
        id: i.id,
        productId: i.variantId,
        batchNumber: i.lotNumber ?? "",
        manufacturingDate: i.manufacturingDate,
        expiryDate: i.expiryDate ?? "",
        quantity: num(i.quantity),
        purchaseRate: amount2(num(i.unitCost)),
        mrp: amount2(i.mrp === null ? 0 : num(i.mrp)),
        vatApplicable: num(i.taxRate) > 0,
        lineTotal: amount2(num(i.lineTotal)),
        batch: { salePrice: amount2(num(i.sellingPrice)), note: i.lotNote },
      })),
    payments: pays
      .filter((x) => x.purchaseId === p.id)
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
  return and(eq(purchases.organizationId, auth.organizationId), eq(purchases.locationId, locationId), eq(purchases.status, "POSTED"));
}

export async function listPurchaseVouchers(auth: AuthContext, q: { page: number; limit: number }) {
  const where = await scope(auth);
  const [list, [{ total }]] = await Promise.all([
    records(where, q),
    db.select({ total: countAll }).from(purchases).where(where),
  ]);
  return { purchases: list, pagination: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) } };
}

export async function getPurchaseVoucher(auth: AuthContext, id: string) {
  const [rec] = await records(and(await scope(auth), eq(purchases.id, id)));
  if (!rec) throw notFound("Purchase");
  return { purchase: rec };
}

export async function createPurchaseVoucher(auth: AuthContext, v: PurchaseVoucherInput) {
  const { purchase } = await createPurchase(auth, toPurchaseInput(v, null));
  return { purchaseId: purchase.id, ...(await getPurchaseVoucher(auth, purchase.id)) };
}

export async function updatePurchaseVoucher(auth: AuthContext, id: string, v: PurchaseVoucherInput) {
  const [old] = await db
    .select({ paymentType: purchases.paymentType })
    .from(purchases)
    .where(and(eq(purchases.id, id), eq(purchases.organizationId, auth.organizationId)));
  if (!old) throw notFound("Purchase");
  // a credit bill keeps the part-payments already made against it
  const carried =
    old.paymentType === "CREDIT"
      ? (
          await db
            .select()
            .from(payments)
            .where(and(eq(payments.purchaseId, id), eq(payments.status, "POSTED")))
            .orderBy(asc(payments.createdAt))
        ).map((x) => ({
          amount: num(x.amount),
          method: x.method,
          paymentDate: x.paymentDate,
          referenceNumber: x.referenceNumber,
          notes: x.notes,
        }))
      : null;
  await updatePurchase(auth, id, toPurchaseInput(v, carried));
  return getPurchaseVoucher(auth, id);
}

export async function deletePurchaseVoucher(auth: AuthContext, id: string) {
  await voidPurchase(auth, id, "Deleted");
  return { deleted: true };
}

/**
 * The status dropdown and the payment pop-up. A payment amount records a payment;
 * "Paid" with no amount settles the balance; "Unpaid" clears the payments.
 */
export async function setPurchasePaymentStatus(auth: AuthContext, id: string, input: StatusInput) {
  const [p] = await db
    .select()
    .from(purchases)
    .where(and(eq(purchases.id, id), eq(purchases.organizationId, auth.organizationId)));
  if (!p || p.status === "VOID") throw notFound("Purchase");
  const balance = round2(num(p.grandTotal) - num(p.paidAmount));
  const method = toMethod(input.method ?? p.paymentType);
  const pay = (amount: number) =>
    addPurchasePayment(auth, id, {
      amount,
      method,
      paymentDate: input.paymentDate,
      referenceNumber: input.referenceNumber ?? null,
      notes: input.notes ?? null,
    });

  if (input.amount && input.amount > 0) {
    if (input.amount > balance + 0.004) throw badRequest(`Only ${balance.toFixed(2)} is outstanding on this bill`);
    await pay(input.amount);
  } else if (input.paymentStatus === "PAID") {
    if (balance > 0.004) await pay(balance);
  } else if (input.paymentStatus === "UNPAID") {
    await resolveLocationId(db, auth, p.locationId);
    await db.transaction(async (tx) => {
      await voidPaymentsFor(tx, { purchaseId: id }, auth.userId);
      await refreshPurchasePayment(tx, id);
    });
  } else if (num(p.paidAmount) <= 0.004) {
    throw conflict("Enter the amount paid so far");
  }
  return getPurchaseVoucher(auth, id);
}
