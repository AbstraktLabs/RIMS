import { z } from "zod";

// Shared Zod building blocks.

export const uuid = z.string().uuid();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" ? undefined : v));
export const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v));

export const money = z.coerce.number().min(0).max(999_999_999_999);
export const signedMoney = z.coerce.number().min(-999_999_999_999).max(999_999_999_999);
export const quantity = z.coerce.number().positive().max(99_999_999_999);
export const signedQuantity = z.coerce
  .number()
  .refine((n) => n !== 0, "Quantity cannot be zero")
  .refine((n) => Math.abs(n) <= 99_999_999_999, "Quantity too large");
export const percent = z.coerce.number().min(0).max(100);

export const paymentMethod = z.enum(["CASH", "CARD", "BANK_TRANSFER", "CHEQUE", "MOBILE_WALLET", "OTHER"]);
export const taxMode = z.enum(["EXCLUSIVE", "INCLUSIVE", "EXEMPT"]);

export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
};

export const dateRange = {
  from: isoDate.optional(),
  to: isoDate.optional(),
};

export const booleanString = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

export const serialList = z.array(z.string().trim().min(1).max(120)).max(10_000).default([]);
