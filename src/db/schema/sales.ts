import { pgTable, uuid, varchar, text, date, timestamp, boolean, index, uniqueIndex, check, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, money, percent, qty, unitCost, updatedAt } from "./_columns";
import { organizations, locations } from "./tenancy";
import { users } from "./users";
import { productVariants, taxRates } from "./catalog";
import { parties } from "./parties";
import { stockLots } from "./inventory";
import {
  documentStatusEnum,
  paymentStatusEnum,
  returnConditionEnum,
  saleChannelEnum,
  saleReturnResolutionEnum,
  taxModeEnum,
} from "./enums";

// A sale is either a POS receipt or a credit/tax invoice. Stock leaves on posting.
// Payments (possibly several — split tender) live in `payments`.
export const sales = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    invoiceNumber: varchar("invoice_number", { length: 40 }).notNull(),
    channel: saleChannelEnum("channel").notNull().default("POS"),
    // null = walk-in customer; name/phone may still be captured for the receipt
    partyId: uuid("party_id").references(() => parties.id),
    customerName: varchar("customer_name", { length: 255 }),
    customerPhone: varchar("customer_phone", { length: 30 }),
    saleDate: timestamp("sale_date", { withTimezone: true }).notNull().defaultNow(),
    dueDate: date("due_date"),
    status: documentStatusEnum("status").notNull().default("POSTED"),
    taxMode: taxModeEnum("tax_mode").notNull().default("EXCLUSIVE"),
    subtotal: money("subtotal").notNull(), // sum of line totals before bill-level adjustments
    discount: money("discount").notNull().default("0"), // bill-level discount
    otherCharges: money("other_charges").notNull().default("0"), // delivery, packing…
    taxAmount: money("tax_amount").notNull().default("0"),
    roundOff: money("round_off").notNull().default("0"),
    grandTotal: money("grand_total").notNull(),
    // cost of goods sold for this sale (sum of qty × unit_cost) — drives profit reports
    totalCost: money("total_cost").notNull().default("0"),
    paidAmount: money("paid_amount").notNull().default("0"),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("UNPAID"),
    amountTendered: money("amount_tendered"), // POS cash handed over
    changeGiven: money("change_given").notNull().default("0"),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedByUserId: uuid("voided_by_user_id").references(() => users.id, { onDelete: "set null" }),
    voidReason: text("void_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("sales_org_invoice_number_idx").on(t.organizationId, t.invoiceNumber),
    index("sales_org_date_idx").on(t.organizationId, t.saleDate),
    index("sales_org_location_date_idx").on(t.organizationId, t.locationId, t.saleDate),
    index("sales_org_party_idx").on(t.organizationId, t.partyId),
    index("sales_org_payment_status_idx").on(t.organizationId, t.paymentStatus),
    check(
      "sales_amounts_chk",
      sql`${t.grandTotal} >= 0 and ${t.paidAmount} >= 0 and ${t.discount} >= 0 and ${t.changeGiven} >= 0`,
    ),
  ],
);

// One line per variant per lot. A lot-tracked variant sold across two lots
// produces two lines so each keeps its own cost and expiry.
export const saleItems = pgTable(
  "sale_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    lotId: uuid("lot_id").references((): AnyPgColumn => stockLots.id),
    quantity: qty("quantity").notNull(),
    unitPrice: money("unit_price").notNull(),
    discount: money("discount").notNull().default("0"), // line-level discount (amount)
    taxRateId: uuid("tax_rate_id").references(() => taxRates.id, { onDelete: "set null" }),
    taxRate: percent("tax_rate").notNull().default("0"),
    taxAmount: money("tax_amount").notNull().default("0"),
    lineTotal: money("line_total").notNull(),
    unitCost: unitCost("unit_cost").notNull().default("0"), // COGS snapshot
    quantityReturned: qty("quantity_returned").notNull().default("0"),
  },
  (t) => [
    index("sale_items_sale_idx").on(t.saleId),
    index("sale_items_variant_idx").on(t.variantId),
    check(
      "sale_items_qty_chk",
      sql`${t.quantity} > 0 and ${t.quantityReturned} >= 0 and ${t.quantityReturned} <= ${t.quantity}`,
    ),
    check("sale_items_amounts_chk", sql`${t.unitPrice} >= 0 and ${t.discount} >= 0`),
  ],
);

export const saleReturns = pgTable(
  "sale_returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id),
    partyId: uuid("party_id").references(() => parties.id),
    number: varchar("number", { length: 40 }).notNull(),
    returnDate: date("return_date").notNull(),
    status: documentStatusEnum("status").notNull().default("POSTED"),
    resolution: saleReturnResolutionEnum("resolution").notNull().default("REFUND"),
    subtotal: money("subtotal").notNull(),
    taxAmount: money("tax_amount").notNull().default("0"),
    grandTotal: money("grand_total").notNull(),
    totalCost: money("total_cost").notNull().default("0"), // COGS reversed
    reason: varchar("reason", { length: 255 }),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("sale_returns_org_number_idx").on(t.organizationId, t.number),
    index("sale_returns_org_date_idx").on(t.organizationId, t.returnDate),
    index("sale_returns_sale_idx").on(t.saleId),
  ],
);

export const saleReturnItems = pgTable(
  "sale_return_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleReturnId: uuid("sale_return_id")
      .notNull()
      .references(() => saleReturns.id, { onDelete: "cascade" }),
    saleItemId: uuid("sale_item_id")
      .notNull()
      .references(() => saleItems.id),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    lotId: uuid("lot_id").references((): AnyPgColumn => stockLots.id, { onDelete: "set null" }),
    quantity: qty("quantity").notNull(),
    unitPrice: money("unit_price").notNull(),
    taxAmount: money("tax_amount").notNull().default("0"),
    lineTotal: money("line_total").notNull(),
    unitCost: unitCost("unit_cost").notNull().default("0"),
    condition: returnConditionEnum("condition").notNull().default("RESELLABLE"),
    restocked: boolean("restocked").notNull().default(true), // false for damaged goods
  },
  (t) => [
    index("sale_return_items_return_idx").on(t.saleReturnId),
    check("sale_return_items_qty_chk", sql`${t.quantity} > 0`),
  ],
);
