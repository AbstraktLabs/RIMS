import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, updatedAt } from "./_columns";
import {
  businessTypeEnum,
  calendarSystemEnum,
  locationTypeEnum,
  orgStatusEnum,
  planEnum,
} from "./enums";

// ─────────────────────────────────────────────────────────────
// Multi-tenant SaaS: one row per tenant (business). Every tenant-owned
// table carries organization_id and every query must be scoped by it.
// Tenants are addressed in URLs by `slug` (/t/<slug>/...).
// ─────────────────────────────────────────────────────────────
export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    businessType: businessTypeEnum("business_type").notNull().default("GENERAL"),

    // SaaS lifecycle
    plan: planEnum("plan").notNull().default("BASIC"),
    status: orgStatusEnum("status").notNull().default("TRIAL"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),

    // Business profile (shown on invoices)
    legalName: varchar("legal_name", { length: 255 }),
    taxId: varchar("tax_id", { length: 50 }), // PAN / VAT / GSTIN / EIN …
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 30 }),
    address: text("address"),
    logoUrl: text("logo_url"),
    logoPublicId: text("logo_public_id"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("organizations_slug_idx").on(t.slug), index("organizations_status_idx").on(t.status)],
);

// Per-tenant configuration. Kept separate from `organizations` so tenancy /
// billing fields and business settings evolve independently. 1:1 with org.
export const organizationSettings = pgTable(
  "organization_settings",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Locale — everything configurable, nothing hardcoded to one country.
    currencyCode: varchar("currency_code", { length: 3 }).notNull().default("NPR"),
    currencySymbol: varchar("currency_symbol", { length: 8 }).notNull().default("Rs."),
    currencyDecimals: integer("currency_decimals").notNull().default(2),
    locale: varchar("locale", { length: 20 }).notNull().default("en-US"),
    timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
    calendarSystem: calendarSystemEnum("calendar_system").notNull().default("AD"),
    // 1–12, interpreted in the chosen calendar (e.g. 4 = Shrawan for BS).
    fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(1),
    fiscalYearStartDay: integer("fiscal_year_start_day").notNull().default(1),

    // Tax labels — "VAT", "GST", "Sales Tax" …
    taxLabel: varchar("tax_label", { length: 30 }).notNull().default("VAT"),
    taxIdLabel: varchar("tax_id_label", { length: 30 }).notNull().default("Tax ID"),
    taxRegistered: boolean("tax_registered").notNull().default(false),
    pricesIncludeTax: boolean("prices_include_tax").notNull().default(false),

    // Feature toggles — a clothing shop and a grocery need different things.
    enableVariants: boolean("enable_variants").notNull().default(true),
    enableBatchTracking: boolean("enable_batch_tracking").notNull().default(false),
    enableExpiryTracking: boolean("enable_expiry_tracking").notNull().default(false),
    enableSerialTracking: boolean("enable_serial_tracking").notNull().default(false),
    enableMultiLocation: boolean("enable_multi_location").notNull().default(false),
    enableWholesalePricing: boolean("enable_wholesale_pricing").notNull().default(false),
    allowNegativeStock: boolean("allow_negative_stock").notNull().default(false),
    expiryAlertDays: integer("expiry_alert_days").notNull().default(30),

    // Printed document text
    invoiceFooter: text("invoice_footer"),
    receiptFooter: text("receipt_footer"),

    updatedAt: updatedAt(),
  },
  (t) => [
    check("org_settings_fy_month_chk", sql`${t.fiscalYearStartMonth} between 1 and 12`),
    check("org_settings_fy_day_chk", sql`${t.fiscalYearStartDay} between 1 and 32`),
    check("org_settings_decimals_chk", sql`${t.currencyDecimals} between 0 and 4`),
    check("org_settings_expiry_days_chk", sql`${t.expiryAlertDays} >= 0`),
  ],
);

// Stores / warehouses. Every tenant gets one default location at sign-up,
// so single-shop tenants never have to think about locations.
export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    code: varchar("code", { length: 30 }),
    type: locationTypeEnum("type").notNull().default("STORE"),
    address: text("address"),
    phone: varchar("phone", { length: 30 }),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("locations_org_idx").on(t.organizationId),
    uniqueIndex("locations_org_name_idx").on(t.organizationId, t.name),
    // at most one default location per tenant
    uniqueIndex("locations_org_default_idx").on(t.organizationId).where(sql`${t.isDefault}`),
  ],
);

// Platform operators (not tenant users). Separate login, separate token secret.
export const superAdmins = pgTable(
  "super_admins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("super_admins_email_idx").on(t.email)],
);
