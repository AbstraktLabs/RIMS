import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { payments, purchaseReturns, purchases, saleReturns, sales } from "@/db/schema";
import { money, num, round2 } from "@/lib/num";
import { nextDocumentNumber } from "./sequences";
import { qcol } from "./sql";

type PaymentInsert = typeof payments.$inferInsert;
type PaymentMethod = NonNullable<PaymentInsert["method"]>;

export interface RecordPaymentInput {
  organizationId: string;
  locationId?: string | null;
  direction: PaymentInsert["direction"];
  partyId?: string | null;
  saleId?: string | null;
  purchaseId?: string | null;
  saleReturnId?: string | null;
  purchaseReturnId?: string | null;
  amount: number;
  paymentDate: string;
  method: PaymentMethod;
  referenceNumber?: string | null;
  notes?: string | null;
  userId: string | null;
}

export async function recordPayment(tx: Tx, input: RecordPaymentInput) {
  const number = await nextDocumentNumber(tx, input.organizationId, "PAYMENT");
  const [row] = await tx
    .insert(payments)
    .values({
      organizationId: input.organizationId,
      locationId: input.locationId ?? null,
      number,
      direction: input.direction,
      partyId: input.partyId ?? null,
      saleId: input.saleId ?? null,
      purchaseId: input.purchaseId ?? null,
      saleReturnId: input.saleReturnId ?? null,
      purchaseReturnId: input.purchaseReturnId ?? null,
      amount: money(input.amount),
      paymentDate: input.paymentDate,
      method: input.method,
      referenceNumber: input.referenceNumber ?? null,
      notes: input.notes ?? null,
      createdByUserId: input.userId,
    })
    .returning();
  return row;
}

function statusFor(paid: number, due: number): "UNPAID" | "PARTIAL" | "PAID" {
  if (due <= 0.004) return "PAID";
  if (paid <= 0.004) return "UNPAID";
  return paid + 0.004 >= due ? "PAID" : "PARTIAL";
}

/**
 * Recompute a sale's paid amount and payment status.
 * Amount due = grand total − store-credit returns (refunded returns are settled
 * separately by a refund payment, so they don't change what was owed).
 */
export async function refreshSalePayment(tx: Tx, saleId: string) {
  const [row] = await tx
    .select({
      grandTotal: sales.grandTotal,
      paid: sql<string>`coalesce((select sum(${payments.amount}) from ${payments}
        where ${payments.saleId} = ${qcol(sales.id)} and ${payments.status} = 'POSTED'), 0)`,
      credited: sql<string>`coalesce((select sum(${saleReturns.grandTotal}) from ${saleReturns}
        where ${saleReturns.saleId} = ${qcol(sales.id)} and ${saleReturns.status} = 'POSTED'
        and ${saleReturns.resolution} = 'STORE_CREDIT'), 0)`,
    })
    .from(sales)
    .where(eq(sales.id, saleId));
  if (!row) return;
  const paid = round2(num(row.paid));
  const due = round2(num(row.grandTotal) - num(row.credited));
  await tx
    .update(sales)
    .set({ paidAmount: money(paid), paymentStatus: statusFor(paid, due) })
    .where(eq(sales.id, saleId));
  return { paid, due, balance: round2(due - paid) };
}

/** Amount due = grand total − completed credit-note returns against this bill. */
export async function refreshPurchasePayment(tx: Tx, purchaseId: string) {
  const [row] = await tx
    .select({
      grandTotal: purchases.grandTotal,
      paid: sql<string>`coalesce((select sum(${payments.amount}) from ${payments}
        where ${payments.purchaseId} = ${qcol(purchases.id)} and ${payments.status} = 'POSTED'), 0)`,
      credited: sql<string>`coalesce((select sum(${purchaseReturns.grandTotal}) from ${purchaseReturns}
        where ${purchaseReturns.purchaseId} = ${qcol(purchases.id)} and ${purchaseReturns.status} = 'COMPLETED'
        and ${purchaseReturns.resolution} = 'CREDIT_NOTE'), 0)`,
    })
    .from(purchases)
    .where(eq(purchases.id, purchaseId));
  if (!row) return;
  const paid = round2(num(row.paid));
  const due = round2(num(row.grandTotal) - num(row.credited));
  await tx
    .update(purchases)
    .set({ paidAmount: money(paid), paymentStatus: statusFor(paid, due) })
    .where(eq(purchases.id, purchaseId));
  return { paid, due, balance: round2(due - paid) };
}

export async function voidPaymentsFor(
  tx: Tx,
  where: { saleId?: string; purchaseId?: string; saleReturnId?: string; purchaseReturnId?: string },
  userId: string,
) {
  const col = where.saleId
    ? eq(payments.saleId, where.saleId)
    : where.purchaseId
      ? eq(payments.purchaseId, where.purchaseId)
      : where.saleReturnId
        ? eq(payments.saleReturnId, where.saleReturnId)
        : eq(payments.purchaseReturnId, where.purchaseReturnId!);
  await tx
    .update(payments)
    .set({ status: "VOID", voidedAt: new Date(), voidedByUserId: userId })
    .where(and(col, eq(payments.status, "POSTED")));
}
