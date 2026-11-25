import { z } from "zod";
import { dateRange, isoDate, money, nullableText, pagination, paymentMethod, uuid } from "./common";

export const directions = ["RECEIVED_FROM_CUSTOMER", "PAID_TO_SUPPLIER", "REFUND_TO_CUSTOMER", "REFUND_FROM_SUPPLIER"] as const;

export const partyPaymentSchema = z.object({
  partyId: uuid,
  direction: z.enum(directions),
  amount: money.refine((n) => n > 0, "Amount must be greater than zero"),
  method: paymentMethod.default("CASH"),
  paymentDate: isoDate.optional(),
  referenceNumber: nullableText(100),
  notes: nullableText(500),
  locationId: uuid.optional(),
  // settle the oldest unpaid invoices/bills first; any remainder stays on account
  allocate: z.boolean().default(true),
});
export type PartyPaymentInput = z.infer<typeof partyPaymentSchema>;

export const paymentsQuery = z.object({
  search: z.string().trim().max(100).optional(),
  partyId: uuid.optional(),
  direction: z.enum(directions).optional(),
  method: paymentMethod.optional(),
  status: z.enum(["POSTED", "VOID"]).optional(),
  locationId: z.string().optional(),
  ...dateRange,
  ...pagination,
});

export const voidPaymentSchema = z.object({ reason: z.string().trim().max(500).optional() });

export const financeCategorySchema = z.object({
  kind: z.enum(["INCOME", "EXPENSE"]),
  name: z.string().trim().min(1).max(150),
});
export const updateFinanceCategorySchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  isActive: z.boolean().optional(),
});

export const financeEntrySchema = z.object({
  kind: z.enum(["INCOME", "EXPENSE"]),
  categoryId: uuid.nullable().optional(),
  partyId: uuid.nullable().optional(),
  locationId: uuid.nullable().optional(),
  amount: money.refine((n) => n > 0, "Amount must be greater than zero"),
  entryDate: isoDate.optional(),
  method: paymentMethod.default("CASH"),
  referenceNumber: nullableText(100),
  description: z.string().trim().min(1).max(255),
  note: nullableText(2000),
});
export const updateFinanceEntrySchema = financeEntrySchema.partial();

export const financeEntriesQuery = z.object({
  kind: z.enum(["INCOME", "EXPENSE"]).optional(),
  categoryId: uuid.optional(),
  search: z.string().trim().max(100).optional(),
  locationId: z.string().optional(),
  ...dateRange,
  ...pagination,
});

export const outstandingQuery = z.object({
  type: z.enum(["receivables", "payables"]),
  partyId: uuid.optional(),
  search: z.string().trim().max(100).optional(),
  ...pagination,
});
