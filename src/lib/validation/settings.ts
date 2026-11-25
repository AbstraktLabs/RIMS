import { z } from "zod";
import { nullableText, percent } from "./common";

export const updateBusinessSchema = z.object({
  organization: z
    .object({
      name: z.string().trim().min(2).max(255),
      legalName: nullableText(255),
      taxId: nullableText(50),
      email: z.string().trim().email().max(255).nullable().optional(),
      phone: nullableText(30),
      address: nullableText(1000),
    })
    .partial()
    .optional(),
  settings: z
    .object({
      currencyCode: z.string().trim().length(3).toUpperCase(),
      currencySymbol: z.string().trim().min(1).max(8),
      currencyDecimals: z.coerce.number().int().min(0).max(4),
      locale: z.string().trim().min(2).max(20),
      timezone: z
        .string()
        .trim()
        .min(1)
        .max(64)
        .refine((tz) => {
          try {
            new Intl.DateTimeFormat("en-US", { timeZone: tz });
            return true;
          } catch {
            return false;
          }
        }, "Unknown time zone"),
      calendarSystem: z.enum(["AD", "BS"]),
      fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
      fiscalYearStartDay: z.coerce.number().int().min(1).max(32),
      taxLabel: z.string().trim().min(1).max(30),
      taxIdLabel: z.string().trim().min(1).max(30),
      taxRegistered: z.boolean(),
      pricesIncludeTax: z.boolean(),
      enableVariants: z.boolean(),
      enableBatchTracking: z.boolean(),
      enableExpiryTracking: z.boolean(),
      enableSerialTracking: z.boolean(),
      enableMultiLocation: z.boolean(),
      enableWholesalePricing: z.boolean(),
      allowNegativeStock: z.boolean(),
      expiryAlertDays: z.coerce.number().int().min(0).max(3650),
      invoiceFooter: nullableText(2000),
      receiptFooter: nullableText(2000),
    })
    .partial()
    .optional(),
});

export const locationSchema = z.object({
  name: z.string().trim().min(1).max(255),
  code: nullableText(30),
  type: z.enum(["STORE", "WAREHOUSE"]).default("STORE"),
  address: nullableText(1000),
  phone: nullableText(30),
  isDefault: z.boolean().optional(),
});
export const updateLocationSchema = locationSchema
  .partial()
  .extend({ isActive: z.boolean().optional(), type: z.enum(["STORE", "WAREHOUSE"]).optional() });

export const taxRateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  rate: percent,
  isDefault: z.boolean().optional(),
});
export const updateTaxRateSchema = taxRateSchema.partial().extend({ isActive: z.boolean().optional() });

export const unitSchema = z.object({
  name: z.string().trim().min(1).max(50),
  code: z.string().trim().min(1).max(15),
  allowDecimal: z.boolean().default(false),
});
export const updateUnitSchema = unitSchema.partial().extend({ isActive: z.boolean().optional() });

export const documentTypes = [
  "SALE",
  "SALE_RETURN",
  "PURCHASE",
  "PURCHASE_ORDER",
  "PURCHASE_RETURN",
  "STOCK_ADJUSTMENT",
  "STOCK_TRANSFER",
  "PAYMENT",
] as const;

export const updateSequenceSchema = z.object({
  documentType: z.enum(documentTypes),
  prefix: z
    .string()
    .trim()
    .max(20)
    .regex(/^[A-Za-z0-9\-\/_.]*$/, "Prefix may contain letters, digits and - / _ . only")
    .optional(),
  nextNumber: z.coerce.number().int().min(1).max(2_000_000_000).optional(),
  padding: z.coerce.number().int().min(1).max(12).optional(),
});
