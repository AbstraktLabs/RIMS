import { z } from "zod";
import { dateRange, isoDate, money, nullableText, pagination, paymentMethod, paymentType, percent, quantity, serialList, signedMoney, taxMode, uuid } from "./common";
import { paymentInput } from "./purchasing";

export const saleSchema = z.object({
  channel: z.enum(["POS", "INVOICE"]).default("POS"),
  partyId: uuid.optional(),
  customerName: nullableText(255),
  customerPhone: nullableText(30),
  locationId: uuid.optional(),
  saleDate: isoDate.optional(), // back-dating an invoice; POS uses "now"
  dueDate: isoDate.nullable().optional(),
  taxMode: taxMode.optional(),
  priceLevel: z.enum(["RETAIL", "WHOLESALE"]).default("RETAIL"),
  discount: money.default(0),
  otherCharges: money.default(0),
  roundOff: signedMoney.default(0),
  paymentType: paymentType.optional(),
  note: nullableText(2000),
  items: z
    .array(
      z.object({
        variantId: uuid,
        quantity,
        unitPrice: money.optional(), // defaults to the variant's price for the price level
        discount: money.default(0),
        taxRate: percent.optional(), // defaults to the product's tax rate
        lotId: uuid.nullable().optional(),
        serials: serialList,
      }),
    )
    .min(1)
    .max(500),
  payments: z
    .array(
      z.object({
        amount: money.refine((n) => n > 0, "Amount must be greater than zero"),
        method: paymentMethod.default("CASH"),
        referenceNumber: nullableText(100),
      }),
    )
    .max(10)
    .default([]),
});
export type SaleInput = z.infer<typeof saleSchema>;

export const saleReturnSchema = z.object({
  saleId: uuid,
  returnDate: isoDate.optional(),
  resolution: z.enum(["REFUND", "STORE_CREDIT"]).optional(), // default: refund if paid, else store credit
  refundMethod: paymentMethod.default("CASH"),
  reason: nullableText(255),
  note: nullableText(2000),
  items: z
    .array(
      z.object({
        saleItemId: uuid,
        quantity,
        condition: z.enum(["RESELLABLE", "DAMAGED"]).default("RESELLABLE"),
        serials: serialList,
      }),
    )
    .min(1)
    .max(500),
});
export type SaleReturnInput = z.infer<typeof saleReturnSchema>;

export { paymentInput };

export const salesQuery = z.object({
  search: z.string().trim().max(100).optional(),
  partyId: uuid.optional(),
  locationId: z.string().optional(),
  channel: z.enum(["POS", "INVOICE"]).optional(),
  status: z.enum(["POSTED", "VOID"]).optional(),
  paymentStatus: z.enum(["UNPAID", "PARTIAL", "PAID"]).optional(),
  userId: uuid.optional(),
  ...dateRange,
  ...pagination,
});

export const saleReturnsQuery = z.object({
  search: z.string().trim().max(100).optional(),
  saleId: uuid.optional(),
  partyId: uuid.optional(),
  locationId: z.string().optional(),
  status: z.enum(["POSTED", "VOID"]).optional(),
  ...dateRange,
  ...pagination,
});
