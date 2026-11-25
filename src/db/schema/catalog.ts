import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, money, percent, qty, updatedAt } from "./_columns";
import { organizations } from "./tenancy";

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // null = top-level category; set = subcategory
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, {
      onDelete: "restrict",
    }),
    name: varchar("name", { length: 150 }).notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("categories_org_parent_idx").on(t.organizationId, t.parentId),
    uniqueIndex("categories_org_root_name_idx")
      .on(t.organizationId, sql`lower(${t.name})`)
      .where(sql`${t.parentId} is null`),
    uniqueIndex("categories_org_child_name_idx")
      .on(t.organizationId, t.parentId, sql`lower(${t.name})`)
      .where(sql`${t.parentId} is not null`),
    check("categories_not_own_parent_chk", sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
  ],
);

export const brands = pgTable(
  "brands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 150 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("brands_org_name_idx").on(t.organizationId, sql`lower(${t.name})`)],
);

// Units of measure, per tenant: pcs, kg, g, l, ml, m, box, pack, dozen …
// allow_decimal decides whether quantities like 1.250 kg are permitted.
export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 50 }).notNull(),
    code: varchar("code", { length: 15 }).notNull(),
    allowDecimal: boolean("allow_decimal").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("units_org_code_idx").on(t.organizationId, sql`lower(${t.code})`)],
);

export const taxRates = pgTable(
  "tax_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 60 }).notNull(), // e.g. "VAT 13%", "GST 18%", "Zero rated"
    rate: percent("rate").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("tax_rates_org_name_idx").on(t.organizationId, sql`lower(${t.name})`),
    uniqueIndex("tax_rates_org_default_idx").on(t.organizationId).where(sql`${t.isDefault}`),
    check("tax_rates_rate_chk", sql`${t.rate} >= 0 and ${t.rate} <= 100`),
  ],
);

export type VariantOption = { name: string; values: string[] };

// Product = the shared definition (name, category, brand, tracking rules).
// Everything that is stocked, priced and sold is a product_variant.
// A simple product has exactly one default variant.
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
    model: varchar("model", { length: 120 }), // electronics model number etc.
    hsCode: varchar("hs_code", { length: 20 }), // optional customs / tax classification
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
    // Optional bulk purchase unit: 1 purchase unit = purchase_unit_factor base units
    // (e.g. buy by the carton of 24, sell by the piece).
    purchaseUnitId: uuid("purchase_unit_id").references(() => units.id, { onDelete: "set null" }),
    purchaseUnitFactor: qty("purchase_unit_factor"),
    // null = not taxable
    taxRateId: uuid("tax_rate_id").references(() => taxRates.id, { onDelete: "set null" }),
    imageUrl: text("image_url"),
    imagePublicId: text("image_public_id"),

    // Opt-in tracking — never forced on businesses that don't need it.
    trackBatches: boolean("track_batches").notNull().default(false),
    trackExpiry: boolean("track_expiry").notNull().default(false),
    trackSerials: boolean("track_serials").notNull().default(false),
    hasVariants: boolean("has_variants").notNull().default(false),

    // e.g. [{ name: "Size", values: ["S","M","L"] }, { name: "Color", values: ["Red"] }]
    variantOptions: jsonb("variant_options").$type<VariantOption[]>().notNull().default([]),
    // Free-form attributes: material, warranty, origin, shade …
    attributes: jsonb("attributes").$type<Record<string, string>>().notNull().default({}),

    lowStockThreshold: qty("low_stock_threshold"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("products_org_name_idx").on(t.organizationId, t.name),
    index("products_org_category_idx").on(t.organizationId, t.categoryId),
    index("products_org_brand_idx").on(t.organizationId, t.brandId),
    // expiry needs a lot to hang the date on
    check("products_expiry_needs_batches_chk", sql`not ${t.trackExpiry} or ${t.trackBatches}`),
    check(
      "products_purchase_unit_chk",
      sql`(${t.purchaseUnitId} is null) = (${t.purchaseUnitFactor} is null) and (${t.purchaseUnitFactor} is null or ${t.purchaseUnitFactor} > 0)`,
    ),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(), // "Default", "M / Red", "500 g"
    sku: varchar("sku", { length: 80 }).notNull(),
    barcode: varchar("barcode", { length: 80 }),
    // e.g. { Size: "M", Color: "Red" } — keys match products.variant_options names
    optionValues: jsonb("option_values").$type<Record<string, string>>().notNull().default({}),
    costPrice: money("cost_price").notNull().default("0"), // last/standard purchase cost
    sellingPrice: money("selling_price").notNull(),
    wholesalePrice: money("wholesale_price"),
    mrp: money("mrp"), // printed maximum retail price, where applicable
    lowStockThreshold: qty("low_stock_threshold"), // overrides the product's
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("product_variants_org_sku_idx").on(t.organizationId, sql`lower(${t.sku})`),
    uniqueIndex("product_variants_org_barcode_idx")
      .on(t.organizationId, t.barcode)
      .where(sql`${t.barcode} is not null`),
    index("product_variants_product_idx").on(t.productId),
    uniqueIndex("product_variants_product_default_idx").on(t.productId).where(sql`${t.isDefault}`),
    check(
      "product_variants_prices_chk",
      sql`${t.costPrice} >= 0 and ${t.sellingPrice} >= 0 and coalesce(${t.wholesalePrice}, 0) >= 0 and coalesce(${t.mrp}, 0) >= 0`,
    ),
  ],
);
