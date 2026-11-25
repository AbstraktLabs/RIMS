import { z } from "zod";
import { booleanString, money, nullableText, pagination, uuid } from "./common";

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(150),
  parentId: uuid.nullable().optional(),
  description: nullableText(1000),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
});
export const updateCategorySchema = categorySchema.partial().extend({ isActive: z.boolean().optional() });

export const brandSchema = z.object({ name: z.string().trim().min(1).max(150) });
export const updateBrandSchema = brandSchema.partial().extend({ isActive: z.boolean().optional() });

const optionalQty = z.coerce.number().min(0).max(99_999_999_999).nullable().optional();

export const variantInputSchema = z.object({
  id: uuid.optional(), // present when updating an existing variant
  name: z.string().trim().max(255).optional(),
  sku: z.string().trim().max(80).optional(),
  barcode: nullableText(80),
  optionValues: z.record(z.string().trim().min(1).max(60), z.string().trim().min(1).max(60)).default({}),
  costPrice: money.default(0),
  sellingPrice: money,
  wholesalePrice: money.nullable().optional(),
  mrp: money.nullable().optional(),
  lowStockThreshold: optionalQty,
  isActive: z.boolean().default(true),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

const variantOption = z.object({
  name: z.string().trim().min(1).max(60),
  values: z.array(z.string().trim().min(1).max(60)).min(1).max(100),
});

const productFields = {
  name: z.string().trim().min(1).max(255),
  description: nullableText(5000),
  categoryId: uuid.nullable().optional(),
  brandId: uuid.nullable().optional(),
  model: nullableText(120),
  hsCode: nullableText(20),
  unitId: uuid,
  purchaseUnitId: uuid.nullable().optional(),
  purchaseUnitFactor: z.coerce.number().positive().max(1_000_000).nullable().optional(),
  taxRateId: uuid.nullable().optional(),
  trackBatches: z.boolean().default(false),
  trackExpiry: z.boolean().default(false),
  trackSerials: z.boolean().default(false),
  variantOptions: z.array(variantOption).max(3).default([]),
  attributes: z.record(z.string().trim().min(1).max(60), z.string().trim().max(500)).default({}),
  lowStockThreshold: optionalQty,
  isActive: z.boolean().default(true),
};

export const createProductSchema = z.object({
  ...productFields,
  variants: z.array(variantInputSchema).min(1).max(500),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const listProductsQuery = z.object({
  search: z.string().trim().max(100).optional(),
  categoryId: uuid.optional(),
  brandId: uuid.optional(),
  status: z.enum(["active", "inactive", "all"]).default("active"),
  stock: z.enum(["low", "out", "in"]).optional(),
  locationId: z.string().optional(), // uuid or "all"
  tracking: z.enum(["batches", "serials", "expiry"]).optional(),
  sort: z.enum(["name", "-name", "createdAt", "-createdAt", "stock", "-stock"]).default("name"),
  ...pagination,
});

export const searchVariantsQuery = z.object({
  q: z.string().trim().max(100).default(""),
  locationId: uuid.optional(),
  inStockOnly: booleanString.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const reorderQuery = z.object({
  locationId: uuid.optional(),
});

export const lookupQuery = z.object({
  code: z.string().trim().min(1).max(120),
  locationId: uuid.optional(),
});
