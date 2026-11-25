import { pgTable, uuid, varchar, text, boolean, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, money, updatedAt } from "./_columns";
import { organizations } from "./tenancy";
import { balanceTypeEnum, partyTypeEnum } from "./enums";

// Everyone the business trades with: suppliers, customers, or both.
// Walk-in POS customers need no party row (sales.party_id is nullable).
export const parties = pgTable(
  "parties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 40 }),
    name: varchar("name", { length: 255 }).notNull(),
    partyType: partyTypeEnum("party_type").notNull().default("CUSTOMER"),
    contactPerson: varchar("contact_person", { length: 255 }),
    taxId: varchar("tax_id", { length: 50 }),
    phone: varchar("phone", { length: 30 }),
    email: varchar("email", { length: 255 }),
    address: text("address"),
    paymentTerms: varchar("payment_terms", { length: 255 }),
    creditLimit: money("credit_limit"),
    // balance carried in from before the system was used
    openingBalance: money("opening_balance").notNull().default("0"),
    openingBalanceType: balanceTypeEnum("opening_balance_type").notNull().default("DR"),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("parties_org_type_idx").on(t.organizationId, t.partyType),
    index("parties_org_name_idx").on(t.organizationId, t.name),
    index("parties_org_phone_idx").on(t.organizationId, t.phone),
    uniqueIndex("parties_org_code_idx").on(t.organizationId, t.code).where(sql`${t.code} is not null`),
    check("parties_amounts_chk", sql`${t.openingBalance} >= 0 and coalesce(${t.creditLimit}, 0) >= 0`),
  ],
);
