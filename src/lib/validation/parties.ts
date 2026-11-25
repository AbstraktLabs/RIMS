import { z } from "zod";
import { dateRange, money, nullableText, pagination } from "./common";

export const partySchema = z.object({
  name: z.string().trim().min(1).max(255),
  partyType: z.enum(["SUPPLIER", "CUSTOMER", "BOTH"]).default("CUSTOMER"),
  code: nullableText(40),
  contactPerson: nullableText(255),
  taxId: nullableText(50),
  phone: nullableText(30),
  email: z.string().trim().email().max(255).nullable().optional().or(z.literal("").transform(() => null)),
  address: nullableText(1000),
  paymentTerms: nullableText(255),
  creditLimit: money.nullable().optional(),
  openingBalance: money.default(0),
  openingBalanceType: z.enum(["DR", "CR"]).default("DR"),
  notes: nullableText(2000),
});
export const updatePartySchema = partySchema.partial().extend({ isActive: z.boolean().optional() });

export const partiesQuery = z.object({
  search: z.string().trim().max(100).optional(),
  type: z.enum(["SUPPLIER", "CUSTOMER", "BOTH"]).optional(), // SUPPLIER/CUSTOMER include BOTH
  status: z.enum(["active", "inactive", "all"]).default("active"),
  balance: z.enum(["receivable", "payable", "settled"]).optional(),
  sort: z.enum(["name", "-balance", "balance", "-createdAt"]).default("name"),
  ...pagination,
});

export const ledgerQuery = z.object({ ...dateRange });
