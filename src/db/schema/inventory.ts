import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  timestamp,
  index,
  uniqueIndex,
  check, jsonb, type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, money, qty, unitCost, updatedAt } from "./_columns";
import { organizations, locations } from "./tenancy";
import { users } from "./users";
import { productVariants } from "./catalog";
import { parties } from "./parties";
import { purchaseItems } from "./purchases";
import { saleItems } from "./sales";
import {
  adjustmentReasonEnum,
  lotStatusEnum,
  serialStatusEnum,
  stockMovementTypeEnum,
  stockReferenceTypeEnum,
  transferStatusEnum,
} from "./enums";

// ─────────────────────────────────────────────────────────────
// Stock model
//   stock_levels    — authoritative on-hand quantity per variant per location,
//                     plus the moving-average unit cost used for valuation/COGS.
//   stock_lots      — optional; only for products with track_batches. The sum of
//                     a variant's lots at a location equals its stock_level.
//   serial_numbers  — optional; only for products with track_serials.
//   stock_movements — append-only history of every change (the audit trail).
// All writes to these tables happen inside one DB transaction with the
// affected stock_levels rows locked (SELECT … FOR UPDATE).
// ─────────────────────────────────────────────────────────────

export const stockLevels = pgTable(
  "stock_levels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    quantity: qty("quantity").notNull().default("0"),
    avgCost: unitCost("avg_cost").notNull().default("0"),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("stock_levels_variant_location_idx").on(t.variantId, t.locationId),
    index("stock_levels_org_location_idx").on(t.organizationId, t.locationId),
    check("stock_levels_avg_cost_chk", sql`${t.avgCost} >= 0`),
  ],
);

export const stockLots = pgTable(
  "stock_lots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    supplierId: uuid("supplier_id").references(() => parties.id, { onDelete: "set null" }),
    // the purchase line that created this lot (null for opening stock / transfers)
    purchaseItemId: uuid("purchase_item_id").references((): AnyPgColumn => purchaseItems.id, {
      onDelete: "set null",
    }),
    lotNumber: varchar("lot_number", { length: 100 }), // optional even for tracked products
    manufacturingDate: date("manufacturing_date"),
    expiryDate: date("expiry_date"),
    unitCost: unitCost("unit_cost").notNull(),
    quantityReceived: qty("quantity_received").notNull(),
    quantityAvailable: qty("quantity_available").notNull(),
    status: lotStatusEnum("status").notNull().default("ACTIVE"),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // FEFO lookup: earliest expiry first for a variant at a location
    index("stock_lots_variant_location_expiry_idx").on(t.variantId, t.locationId, t.expiryDate),
    index("stock_lots_org_expiry_idx").on(t.organizationId, t.expiryDate),
    index("stock_lots_org_lot_number_idx").on(t.organizationId, t.lotNumber),
    check("stock_lots_qty_chk", sql`${t.quantityAvailable} >= 0 and ${t.quantityReceived} >= 0`),
    check(
      "stock_lots_dates_chk",
      sql`${t.manufacturingDate} is null or ${t.expiryDate} is null or ${t.manufacturingDate} <= ${t.expiryDate}`,
    ),
  ],
);

export const serialNumbers = pgTable(
  "serial_numbers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    serialNumber: varchar("serial_number", { length: 120 }).notNull(),
    status: serialStatusEnum("status").notNull().default("IN_STOCK"),
    purchaseItemId: uuid("purchase_item_id").references((): AnyPgColumn => purchaseItems.id, {
      onDelete: "set null",
    }),
    saleItemId: uuid("sale_item_id").references((): AnyPgColumn => saleItems.id, { onDelete: "set null" }),
    warrantyEndsOn: date("warranty_ends_on"),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("serial_numbers_org_variant_serial_idx").on(t.organizationId, t.variantId, t.serialNumber),
    index("serial_numbers_org_serial_idx").on(t.organizationId, t.serialNumber),
    index("serial_numbers_sale_item_idx").on(t.saleItemId),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    lotId: uuid("lot_id").references(() => stockLots.id, { onDelete: "set null" }),
    type: stockMovementTypeEnum("type").notNull(),
    quantity: qty("quantity").notNull(), // signed: + in, − out
    unitCost: unitCost("unit_cost").notNull(),
    balanceAfter: qty("balance_after").notNull(), // stock_level after this movement
    // polymorphic pointer to the source document (no FK — documents live in several tables)
    referenceType: stockReferenceTypeEnum("reference_type").notNull(),
    referenceId: uuid("reference_id").notNull(),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    index("stock_movements_org_variant_idx").on(t.organizationId, t.variantId, t.occurredAt),
    index("stock_movements_org_location_idx").on(t.organizationId, t.locationId, t.occurredAt),
    index("stock_movements_reference_idx").on(t.referenceType, t.referenceId),
    check("stock_movements_qty_nonzero_chk", sql`${t.quantity} <> 0`),
  ],
);

// Opening stock, count corrections, damage, loss, internal use …
export const stockAdjustments = pgTable(
  "stock_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    number: varchar("number", { length: 40 }).notNull(),
    adjustmentDate: date("adjustment_date").notNull(),
    reason: adjustmentReasonEnum("reason").notNull(),
    // signed sum of line values: negative = stock loss (shown in P&L)
    totalValue: money("total_value").notNull().default("0"),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("stock_adjustments_org_number_idx").on(t.organizationId, t.number),
    index("stock_adjustments_org_date_idx").on(t.organizationId, t.adjustmentDate),
  ],
);

export const stockAdjustmentItems = pgTable(
  "stock_adjustment_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adjustmentId: uuid("adjustment_id")
      .notNull()
      .references(() => stockAdjustments.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    // existing lot for decreases; the lot created for increases of tracked items
    lotId: uuid("lot_id").references(() => stockLots.id, { onDelete: "set null" }),
    quantity: qty("quantity").notNull(), // signed
    unitCost: unitCost("unit_cost").notNull(),
    lineValue: money("line_value").notNull(),
    // lot details when an increase creates a new lot (opening stock of tracked items)
    lotNumber: varchar("lot_number", { length: 100 }),
    manufacturingDate: date("manufacturing_date"),
    expiryDate: date("expiry_date"),
    // serial numbers involved (serial-tracked products only)
    serialNumbers: jsonb("serial_numbers").$type<string[]>().notNull().default([]),
    note: text("note"),
  },
  (t) => [
    index("stock_adjustment_items_adjustment_idx").on(t.adjustmentId),
    check("stock_adjustment_items_qty_chk", sql`${t.quantity} <> 0`),
  ],
);

export const stockTransfers = pgTable(
  "stock_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    number: varchar("number", { length: 40 }).notNull(),
    fromLocationId: uuid("from_location_id")
      .notNull()
      .references(() => locations.id),
    toLocationId: uuid("to_location_id")
      .notNull()
      .references(() => locations.id),
    status: transferStatusEnum("status").notNull().default("DRAFT"),
    transferDate: date("transfer_date").notNull(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    receivedByUserId: uuid("received_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("stock_transfers_org_number_idx").on(t.organizationId, t.number),
    index("stock_transfers_org_status_idx").on(t.organizationId, t.status),
    check("stock_transfers_locations_chk", sql`${t.fromLocationId} <> ${t.toLocationId}`),
  ],
);

export const stockTransferItems = pgTable(
  "stock_transfer_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transferId: uuid("transfer_id")
      .notNull()
      .references(() => stockTransfers.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    sourceLotId: uuid("source_lot_id").references(() => stockLots.id, { onDelete: "set null" }),
    destinationLotId: uuid("destination_lot_id").references(() => stockLots.id, { onDelete: "set null" }),
    quantity: qty("quantity").notNull(),
    unitCost: unitCost("unit_cost").notNull().default("0"), // filled when dispatched
    // serial numbers involved (serial-tracked products only)
    serialNumbers: jsonb("serial_numbers").$type<string[]>().notNull().default([]),
  },
  (t) => [
    index("stock_transfer_items_transfer_idx").on(t.transferId),
    check("stock_transfer_items_qty_chk", sql`${t.quantity} > 0`),
  ],
);
