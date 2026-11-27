import { z } from "zod";
import {
  dateRange,
  isoDate,
  money,
  nullableText,
  pagination,
  paymentMethod,
  paymentType,
  percent,
  quantity,
  serialList,
  signedMoney,
  taxMode,
  uuid,
} from "./common";

export const paymentInput = z.object({
  amount: money.refine((n) => n > 0, "Amount must be greater than zero"),
  method: paymentMethod.default("CASH"),
  paymentDate: isoDate.optional(),
  referenceNumber: nullableText(100),
  notes: nullableText(500),
});
export type PaymentInput = z.infer<typeof paymentInput>;

const orderLine = z.object({
  variantId: uuid,
  quantity,
  unitCost: money,
  discount: money.default(0),
  taxRate: percent.optional(), // defaults to the product's tax rate
  inPurchaseUnits: z.boolean().default(false), // quantity/cost given per purchase unit (e.g. carton)
});

export const purchaseOrderSchema = z.object({
  partyId: uuid,
  locationId: uuid.optional(),
  orderDate: isoDate.optional(),
  expectedDate: isoDate.nullable().optional(),
  taxMode: taxMode.optional(),
  discount: money.default(0),
  otherCharges: money.default(0),
  note: nullableText(2000),
  status: z.enum(["DRAFT", "SENT"]).default("DRAFT"),
  items: z.array(orderLine).min(1).max(500),
});
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;

export const purchaseOrderStatusSchema = z.object({ status: z.enum(["DRAFT", "SENT", "CANCELLED", "RECEIVED"]) });

export const purchaseLine = orderLine.extend({
  purchaseOrderItemId: uuid.optional(),
  lotNumber: nullableText(100),
  manufacturingDate: isoDate.nullable().optional(),
  expiryDate: isoDate.nullable().optional(),
  serials: serialList,
  lotNote: nullableText(500),
  mrp: money.nullable().optional(), // updates the variant's MRP
  sellingPrice: money.optional(), // updates the variant's sale price
});

export const purchaseSchema = z.object({
  partyId: uuid,
  locationId: uuid.optional(),
  purchaseOrderId: uuid.optional(),
  supplierInvoiceNumber: nullableText(100),
  purchaseDate: isoDate.optional(),
  dueDate: isoDate.nullable().optional(),
  taxMode: taxMode.optional(),
  discount: money.default(0),
  otherCharges: money.default(0),
  roundOff: signedMoney.default(0),
  paymentType: paymentType.optional(),
  note: nullableText(2000),
  items: z.array(purchaseLine).min(1).max(500),
  payments: z.array(paymentInput).max(10).default([]),
});
export type PurchaseInput = z.infer<typeof purchaseSchema>;

export const voidSchema = z.object({ reason: z.string().trim().min(3).max(500) });

export const purchaseReturnSchema = z
  .object({
    purchaseId: uuid.optional(),
    partyId: uuid.optional(),
    locationId: uuid.optional(),
    returnDate: isoDate.optional(),
    reason: nullableText(255),
    note: nullableText(2000),
    items: z
      .array(
        z.object({
          purchaseItemId: uuid.optional(),
          variantId: uuid,
          quantity,
          unitCost: money.optional(),
          taxRate: percent.optional(),
          lotId: uuid.nullable().optional(),
          serials: serialList,
        }),
      )
      .min(1)
      .max(500),
  })
  .refine((r) => r.purchaseId || r.partyId, "Choose the supplier or the original purchase");
export type PurchaseReturnInput = z.infer<typeof purchaseReturnSchema>;

export const completePurchaseReturnSchema = z.object({
  resolution: z.enum(["REFUND", "CREDIT_NOTE", "REPLACEMENT"]),
  refund: paymentInput.partial({ amount: true }).optional(),
  replacements: z
    .array(
      z.object({
        returnItemId: uuid,
        lotNumber: nullableText(100),
        manufacturingDate: isoDate.nullable().optional(),
        expiryDate: isoDate.nullable().optional(),
        serials: serialList,
      }),
    )
    .default([]),
});
export type CompletePurchaseReturnInput = z.infer<typeof completePurchaseReturnSchema>;

const docList = {
  search: z.string().trim().max(100).optional(),
  partyId: uuid.optional(),
  locationId: z.string().optional(),
  ...dateRange,
  ...pagination,
};

export const purchaseOrdersQuery = z.object({
  ...docList,
  status: z.enum(["DRAFT", "SENT", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED", "OPEN"]).optional(),
});
export const purchasesQuery = z.object({
  ...docList,
  status: z.enum(["POSTED", "VOID"]).optional(),
  paymentStatus: z.enum(["UNPAID", "PARTIAL", "PAID"]).optional(),
  overdue: z.enum(["true", "false"]).optional(),
});
export const purchaseReturnsQuery = z.object({
  ...docList,
  status: z.enum(["PENDING", "COMPLETED", "VOID"]).optional(),
});
