import { z } from "zod";
import { dateRange, isoDate, money, nullableText, pagination, quantity, serialList, signedQuantity, uuid } from "./common";

export const adjustmentReasons = [
  "OPENING_STOCK",
  "COUNT_CORRECTION",
  "DAMAGED",
  "EXPIRED",
  "LOST",
  "THEFT",
  "INTERNAL_USE",
  "FOUND",
  "OTHER",
] as const;

export const createAdjustmentSchema = z.object({
  locationId: uuid.optional(),
  adjustmentDate: isoDate.optional(),
  reason: z.enum(adjustmentReasons),
  note: nullableText(1000),
  items: z
    .array(
      z.object({
        variantId: uuid,
        quantity: signedQuantity, // + adds stock, − removes stock
        unitCost: money.optional(), // increases only; defaults to current average cost
        lotId: uuid.nullable().optional(), // decreases: take from this batch
        lotNumber: nullableText(100),
        manufacturingDate: isoDate.nullable().optional(),
        expiryDate: isoDate.nullable().optional(),
        serials: serialList,
        note: nullableText(500),
      }),
    )
    .min(1)
    .max(500),
});
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;

export const createTransferSchema = z
  .object({
    fromLocationId: uuid.optional(), // defaults to the active location
    toLocationId: uuid,
    transferDate: isoDate.optional(),
    note: nullableText(1000),
    dispatch: z.boolean().default(false), // dispatch immediately instead of saving a draft
    items: z
      .array(
        z.object({
          variantId: uuid,
          quantity,
          lotId: uuid.nullable().optional(),
          serials: serialList,
        }),
      )
      .min(1)
      .max(500),
  })
  .refine((t) => t.fromLocationId !== t.toLocationId, "Choose two different locations");
export type CreateTransferInput = z.infer<typeof createTransferSchema>;

const locationFilter = z.string().optional(); // uuid or "all"

export const stockQuery = z.object({
  search: z.string().trim().max(100).optional(),
  locationId: locationFilter,
  categoryId: uuid.optional(),
  status: z.enum(["low", "out", "in", "negative"]).optional(),
  sort: z.enum(["name", "quantity", "-quantity", "value", "-value"]).default("name"),
  ...pagination,
});

export const lotsQuery = z.object({
  search: z.string().trim().max(100).optional(),
  locationId: locationFilter,
  variantId: uuid.optional(),
  status: z.enum(["ACTIVE", "EXPIRED", "DEPLETED"]).optional(),
  expiringWithinDays: z.coerce.number().int().min(0).max(3650).optional(),
  ...pagination,
});

export const serialsQuery = z.object({
  search: z.string().trim().max(120).optional(),
  locationId: locationFilter,
  variantId: uuid.optional(),
  status: z.enum(["IN_STOCK", "SOLD", "RETURNED_TO_SUPPLIER", "DAMAGED", "IN_TRANSIT"]).optional(),
  ...pagination,
});

export const movementsQuery = z.object({
  locationId: locationFilter,
  variantId: uuid.optional(),
  productId: uuid.optional(),
  type: z
    .enum([
      "OPENING",
      "PURCHASE",
      "PURCHASE_RETURN",
      "SALE",
      "SALE_RETURN",
      "ADJUSTMENT_IN",
      "ADJUSTMENT_OUT",
      "DAMAGE",
      "TRANSFER_OUT",
      "TRANSFER_IN",
    ])
    .optional(),
  ...dateRange,
  ...pagination,
});

export const adjustmentsQuery = z.object({
  locationId: locationFilter,
  reason: z.enum(adjustmentReasons).optional(),
  search: z.string().trim().max(100).optional(),
  ...dateRange,
  ...pagination,
});

export const transfersQuery = z.object({
  status: z.enum(["DRAFT", "IN_TRANSIT", "RECEIVED", "CANCELLED"]).optional(),
  locationId: uuid.optional(), // either side
  search: z.string().trim().max(100).optional(),
  ...dateRange,
  ...pagination,
});
