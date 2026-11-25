import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  boolean,
  integer,
  index,
  uniqueIndex,
  primaryKey,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, money, updatedAt } from "./_columns";
import { organizations, locations } from "./tenancy";
import { users } from "./users";
import { parties } from "./parties";
import { sales, saleReturns } from "./sales";
import { purchases, purchaseReturns } from "./purchases";
import {
  documentStatusEnum,
  documentTypeEnum,
  financeEntryKindEnum,
  paymentDirectionEnum,
  paymentMethodEnum,
} from "./enums";

// Money moving between the business and a party. A payment may settle one
// document (sale / purchase / return) or be "on account" (no document).
// A POS sale with split tender has several payment rows.
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    number: varchar("number", { length: 40 }).notNull(),
    direction: paymentDirectionEnum("direction").notNull(),
    partyId: uuid("party_id").references(() => parties.id),
    saleId: uuid("sale_id").references(() => sales.id),
    purchaseId: uuid("purchase_id").references(() => purchases.id),
    saleReturnId: uuid("sale_return_id").references(() => saleReturns.id),
    purchaseReturnId: uuid("purchase_return_id").references(() => purchaseReturns.id),
    amount: money("amount").notNull(),
    paymentDate: date("payment_date").notNull(),
    method: paymentMethodEnum("method").notNull().default("CASH"),
    referenceNumber: varchar("reference_number", { length: 100 }), // cheque no., txn id
    notes: text("notes"),
    // payments are voided (never deleted) — e.g. when their sale/purchase is voided
    status: documentStatusEnum("status").notNull().default("POSTED"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedByUserId: uuid("voided_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("payments_org_number_idx").on(t.organizationId, t.number),
    index("payments_org_date_idx").on(t.organizationId, t.paymentDate),
    index("payments_org_party_idx").on(t.organizationId, t.partyId),
    index("payments_sale_idx").on(t.saleId),
    index("payments_purchase_idx").on(t.purchaseId),
    check("payments_amount_chk", sql`${t.amount} > 0`),
    // at most one source document
    check(
      "payments_single_document_chk",
      sql`(case when ${t.saleId} is null then 0 else 1 end
         + case when ${t.purchaseId} is null then 0 else 1 end
         + case when ${t.saleReturnId} is null then 0 else 1 end
         + case when ${t.purchaseReturnId} is null then 0 else 1 end) <= 1`,
    ),
    // direction must match the document it settles
    check(
      "payments_direction_document_chk",
      sql`(${t.saleId} is null or ${t.direction} = 'RECEIVED_FROM_CUSTOMER')
      and (${t.purchaseId} is null or ${t.direction} = 'PAID_TO_SUPPLIER')
      and (${t.saleReturnId} is null or ${t.direction} = 'REFUND_TO_CUSTOMER')
      and (${t.purchaseReturnId} is null or ${t.direction} = 'REFUND_FROM_SUPPLIER')`,
    ),
  ],
);

// Income / expense categories (rent, salaries, utilities, commission income…).
export const financeCategories = pgTable(
  "finance_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: financeEntryKindEnum("kind").notNull(),
    name: varchar("name", { length: 150 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("finance_categories_org_kind_name_idx").on(t.organizationId, t.kind, sql`lower(${t.name})`)],
);

// Operating income and expenses that are not sales or stock purchases.
// (Stock purchases are NOT expenses here — they become inventory and reach
//  the P&L as cost of goods sold when sold.)
export const financeEntries = pgTable(
  "finance_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    kind: financeEntryKindEnum("kind").notNull(),
    categoryId: uuid("category_id").references(() => financeCategories.id, { onDelete: "set null" }),
    partyId: uuid("party_id").references(() => parties.id, { onDelete: "set null" }),
    amount: money("amount").notNull(),
    entryDate: date("entry_date").notNull(),
    method: paymentMethodEnum("method").notNull().default("CASH"),
    referenceNumber: varchar("reference_number", { length: 100 }),
    description: varchar("description", { length: 255 }).notNull(),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("finance_entries_org_kind_date_idx").on(t.organizationId, t.kind, t.entryDate),
    index("finance_entries_org_category_idx").on(t.organizationId, t.categoryId),
    check("finance_entries_amount_chk", sql`${t.amount} > 0`),
  ],
);

// Gap-free, per-tenant document numbering. Incremented with
// UPDATE … SET next_number = next_number + 1 RETURNING inside the same
// transaction that creates the document.
export const documentSequences = pgTable(
  "document_sequences",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentType: documentTypeEnum("document_type").notNull(),
    prefix: varchar("prefix", { length: 20 }).notNull(),
    nextNumber: integer("next_number").notNull().default(1),
    padding: integer("padding").notNull().default(5),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.documentType] }),
    check("document_sequences_next_chk", sql`${t.nextNumber} >= 1`),
    check("document_sequences_padding_chk", sql`${t.padding} between 1 and 12`),
  ],
);
