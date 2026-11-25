import { pgTable, uuid, varchar, text, date, timestamp, index, uniqueIndex, check, jsonb, type AnyPgColumn } from "drizzle-orm/pg-core";
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
  purchaseOrderStatusEnum,
  purchaseReturnResolutionEnum,
  purchaseReturnStatusEnum,
  taxModeEnum,
} from "./enums";

// ── Purchase orders — no stock effect; goods arrive via a purchase ──
export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id),
    number: varchar("number", { length: 40 }).notNull(),
    orderDate: date("order_date").notNull(),
    expectedDate: date("expected_date"),
    status: purchaseOrderStatusEnum("status").notNull().default("DRAFT"),
    taxMode: taxModeEnum("tax_mode").notNull().default("EXCLUSIVE"),
    subtotal: money("subtotal").notNull().default("0"),
    discount: money("discount").notNull().default("0"),
    otherCharges: money("other_charges").notNull().default("0"),
    taxAmount: money("tax_amount").notNull().default("0"),
    grandTotal: money("grand_total").notNull().default("0"),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("purchase_orders_org_number_idx").on(t.organizationId, t.number),
    index("purchase_orders_org_status_idx").on(t.organizationId, t.status),
    index("purchase_orders_org_party_idx").on(t.organizationId, t.partyId),
  ],
);

export const purchaseOrderItems = pgTable(
  "purchase_order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    quantity: qty("quantity").notNull(),
    quantityReceived: qty("quantity_received").notNull().default("0"),
    unitCost: unitCost("unit_cost").notNull(),
    discount: money("discount").notNull().default("0"),
    taxRate: percent("tax_rate").notNull().default("0"),
    taxAmount: money("tax_amount").notNull().default("0"),
    lineTotal: money("line_total").notNull(),
  },
  (t) => [
    index("purchase_order_items_order_idx").on(t.purchaseOrderId),
    check("purchase_order_items_qty_chk", sql`${t.quantity} > 0 and ${t.quantityReceived} >= 0`),
  ],
);

// ── Purchases — the supplier bill + goods received. Posting one increases stock. ──
export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id),
    purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id, {
      onDelete: "set null",
    }),
    number: varchar("number", { length: 40 }).notNull(), // internal reference
    supplierInvoiceNumber: varchar("supplier_invoice_number", { length: 100 }),
    purchaseDate: date("purchase_date").notNull(),
    dueDate: date("due_date"),
    status: documentStatusEnum("status").notNull().default("POSTED"),
    taxMode: taxModeEnum("tax_mode").notNull().default("EXCLUSIVE"),
    subtotal: money("subtotal").notNull(),
    discount: money("discount").notNull().default("0"),
    otherCharges: money("other_charges").notNull().default("0"), // freight, handling…
    taxAmount: money("tax_amount").notNull().default("0"),
    roundOff: money("round_off").notNull().default("0"),
    grandTotal: money("grand_total").notNull(),
    paidAmount: money("paid_amount").notNull().default("0"),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("UNPAID"),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedByUserId: uuid("voided_by_user_id").references(() => users.id, { onDelete: "set null" }),
    voidReason: text("void_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("purchases_org_number_idx").on(t.organizationId, t.number),
    index("purchases_org_date_idx").on(t.organizationId, t.purchaseDate),
    index("purchases_org_party_idx").on(t.organizationId, t.partyId),
    index("purchases_org_payment_status_idx").on(t.organizationId, t.paymentStatus),
    check("purchases_amounts_chk", sql`${t.grandTotal} >= 0 and ${t.paidAmount} >= 0 and ${t.discount} >= 0`),
  ],
);

export const purchaseItems = pgTable(
  "purchase_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    purchaseOrderItemId: uuid("purchase_order_item_id").references(() => purchaseOrderItems.id, {
      onDelete: "set null",
    }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    quantity: qty("quantity").notNull(), // in the product's base unit
    unitCost: unitCost("unit_cost").notNull(), // supplier price per base unit, before tax
    discount: money("discount").notNull().default("0"),
    taxRateId: uuid("tax_rate_id").references(() => taxRates.id, { onDelete: "set null" }),
    taxRate: percent("tax_rate").notNull().default("0"), // snapshot at posting time
    taxAmount: money("tax_amount").notNull().default("0"),
    lineTotal: money("line_total").notNull(),
    // cost per unit after spreading bill-level discount / other charges; feeds avg cost
    landedUnitCost: unitCost("landed_unit_cost").notNull(),
    // optional lot details — only for batch/expiry-tracked products
    lotId: uuid("lot_id").references((): AnyPgColumn => stockLots.id, { onDelete: "set null" }),
    lotNumber: varchar("lot_number", { length: 100 }),
    manufacturingDate: date("manufacturing_date"),
    expiryDate: date("expiry_date"),
    quantityReturned: qty("quantity_returned").notNull().default("0"),
  },
  (t) => [
    index("purchase_items_purchase_idx").on(t.purchaseId),
    index("purchase_items_variant_idx").on(t.variantId),
    check(
      "purchase_items_qty_chk",
      sql`${t.quantity} > 0 and ${t.quantityReturned} >= 0 and ${t.quantityReturned} <= ${t.quantity}`,
    ),
  ],
);

// ── Purchase returns — goods sent back to a supplier; stock leaves on creation ──
export const purchaseReturns = pgTable(
  "purchase_returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id),
    purchaseId: uuid("purchase_id").references(() => purchases.id, { onDelete: "set null" }),
    number: varchar("number", { length: 40 }).notNull(),
    returnDate: date("return_date").notNull(),
    status: purchaseReturnStatusEnum("status").notNull().default("PENDING"),
    resolution: purchaseReturnResolutionEnum("resolution"), // set when completed
    subtotal: money("subtotal").notNull(),
    taxAmount: money("tax_amount").notNull().default("0"),
    grandTotal: money("grand_total").notNull(),
    reason: varchar("reason", { length: 255 }),
    note: text("note"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("purchase_returns_org_number_idx").on(t.organizationId, t.number),
    index("purchase_returns_org_status_idx").on(t.organizationId, t.status),
    index("purchase_returns_org_party_idx").on(t.organizationId, t.partyId),
    check(
      "purchase_returns_resolution_chk",
      sql`${t.status} <> 'COMPLETED' or ${t.resolution} is not null`,
    ),
  ],
);

export const purchaseReturnItems = pgTable(
  "purchase_return_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseReturnId: uuid("purchase_return_id")
      .notNull()
      .references(() => purchaseReturns.id, { onDelete: "cascade" }),
    purchaseItemId: uuid("purchase_item_id").references(() => purchaseItems.id, { onDelete: "set null" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    lotId: uuid("lot_id").references((): AnyPgColumn => stockLots.id, { onDelete: "set null" }),
    quantity: qty("quantity").notNull(),
    unitCost: unitCost("unit_cost").notNull(),
    taxRate: percent("tax_rate").notNull().default("0"),
    taxAmount: money("tax_amount").notNull().default("0"),
    lineTotal: money("line_total").notNull(),
    // serial numbers involved (serial-tracked products only)
    serialNumbers: jsonb("serial_numbers").$type<string[]>().notNull().default([]),
  },
  (t) => [
    index("purchase_return_items_return_idx").on(t.purchaseReturnId),
    check("purchase_return_items_qty_chk", sql`${t.quantity} > 0`),
  ],
);
