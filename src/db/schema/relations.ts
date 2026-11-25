import { relations } from "drizzle-orm";
import { organizations, organizationSettings, locations } from "./tenancy";
import { users, refreshTokens, passwordResets, emailVerificationTokens } from "./users";
import { permissions, roles, rolePermissions, userLocations } from "./rbac";
import { categories, brands, units, taxRates, products, productVariants } from "./catalog";
import {
  stockLevels,
  stockLots,
  serialNumbers,
  stockMovements,
  stockAdjustments,
  stockAdjustmentItems,
  stockTransfers,
  stockTransferItems,
} from "./inventory";
import { parties } from "./parties";
import {
  purchaseOrders,
  purchaseOrderItems,
  purchases,
  purchaseItems,
  purchaseReturns,
  purchaseReturnItems,
} from "./purchases";
import { sales, saleItems, saleReturns, saleReturnItems } from "./sales";
import { payments, financeCategories, financeEntries } from "./finance";

// Relations power Drizzle's relational query API (db.query.x.findMany({ with })).
// They do not create constraints — the foreign keys in each table do that.

// ── Tenancy & access ─────────────────────────────────────────
export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  settings: one(organizationSettings, {
    fields: [organizations.id],
    references: [organizationSettings.organizationId],
  }),
  locations: many(locations),
  users: many(users),
}));

export const organizationSettingsRelations = relations(organizationSettings, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationSettings.organizationId],
    references: [organizations.id],
  }),
}));

export const locationsRelations = relations(locations, ({ one, many }) => ({
  organization: one(organizations, { fields: [locations.organizationId], references: [organizations.id] }),
  userLocations: many(userLocations),
  stockLevels: many(stockLevels),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, { fields: [users.organizationId], references: [organizations.id] }),
  userLocations: many(userLocations),
  refreshTokens: many(refreshTokens),
  passwordResets: many(passwordResets),
  emailVerificationTokens: many(emailVerificationTokens),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
  activeLocation: one(locations, { fields: [refreshTokens.activeLocationId], references: [locations.id] }),
}));

export const passwordResetsRelations = relations(passwordResets, ({ one }) => ({
  user: one(users, { fields: [passwordResets.userId], references: [users.id] }),
}));

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, { fields: [emailVerificationTokens.userId], references: [users.id] }),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  organization: one(organizations, { fields: [roles.organizationId], references: [organizations.id] }),
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, { fields: [rolePermissions.permissionId], references: [permissions.id] }),
}));

export const userLocationsRelations = relations(userLocations, ({ one }) => ({
  user: one(users, { fields: [userLocations.userId], references: [users.id] }),
  location: one(locations, { fields: [userLocations.locationId], references: [locations.id] }),
  role: one(roles, { fields: [userLocations.roleId], references: [roles.id] }),
}));

// ── Catalogue ────────────────────────────────────────────────
export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "category_parent",
  }),
  children: many(categories, { relationName: "category_parent" }),
  products: many(products),
}));

export const brandsRelations = relations(brands, ({ many }) => ({
  products: many(products),
}));

export const unitsRelations = relations(units, ({ many }) => ({
  products: many(products, { relationName: "product_unit" }),
}));

export const taxRatesRelations = relations(taxRates, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  brand: one(brands, { fields: [products.brandId], references: [brands.id] }),
  unit: one(units, { fields: [products.unitId], references: [units.id], relationName: "product_unit" }),
  purchaseUnit: one(units, {
    fields: [products.purchaseUnitId],
    references: [units.id],
    relationName: "product_purchase_unit",
  }),
  taxRate: one(taxRates, { fields: [products.taxRateId], references: [taxRates.id] }),
  variants: many(productVariants),
}));

export const productVariantsRelations = relations(productVariants, ({ one, many }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
  stockLevels: many(stockLevels),
  lots: many(stockLots),
  serialNumbers: many(serialNumbers),
}));

// ── Inventory ────────────────────────────────────────────────
export const stockLevelsRelations = relations(stockLevels, ({ one }) => ({
  variant: one(productVariants, { fields: [stockLevels.variantId], references: [productVariants.id] }),
  location: one(locations, { fields: [stockLevels.locationId], references: [locations.id] }),
}));

export const stockLotsRelations = relations(stockLots, ({ one }) => ({
  variant: one(productVariants, { fields: [stockLots.variantId], references: [productVariants.id] }),
  location: one(locations, { fields: [stockLots.locationId], references: [locations.id] }),
  supplier: one(parties, { fields: [stockLots.supplierId], references: [parties.id] }),
}));

export const serialNumbersRelations = relations(serialNumbers, ({ one }) => ({
  variant: one(productVariants, { fields: [serialNumbers.variantId], references: [productVariants.id] }),
  location: one(locations, { fields: [serialNumbers.locationId], references: [locations.id] }),
  saleItem: one(saleItems, { fields: [serialNumbers.saleItemId], references: [saleItems.id] }),
  purchaseItem: one(purchaseItems, { fields: [serialNumbers.purchaseItemId], references: [purchaseItems.id] }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  variant: one(productVariants, { fields: [stockMovements.variantId], references: [productVariants.id] }),
  location: one(locations, { fields: [stockMovements.locationId], references: [locations.id] }),
  lot: one(stockLots, { fields: [stockMovements.lotId], references: [stockLots.id] }),
  createdBy: one(users, { fields: [stockMovements.createdByUserId], references: [users.id] }),
}));

export const stockAdjustmentsRelations = relations(stockAdjustments, ({ one, many }) => ({
  location: one(locations, { fields: [stockAdjustments.locationId], references: [locations.id] }),
  items: many(stockAdjustmentItems),
  createdBy: one(users, { fields: [stockAdjustments.createdByUserId], references: [users.id] }),
}));

export const stockAdjustmentItemsRelations = relations(stockAdjustmentItems, ({ one }) => ({
  adjustment: one(stockAdjustments, {
    fields: [stockAdjustmentItems.adjustmentId],
    references: [stockAdjustments.id],
  }),
  variant: one(productVariants, { fields: [stockAdjustmentItems.variantId], references: [productVariants.id] }),
  lot: one(stockLots, { fields: [stockAdjustmentItems.lotId], references: [stockLots.id] }),
}));

export const stockTransfersRelations = relations(stockTransfers, ({ one, many }) => ({
  fromLocation: one(locations, {
    fields: [stockTransfers.fromLocationId],
    references: [locations.id],
    relationName: "transfer_from",
  }),
  toLocation: one(locations, {
    fields: [stockTransfers.toLocationId],
    references: [locations.id],
    relationName: "transfer_to",
  }),
  items: many(stockTransferItems),
}));

export const stockTransferItemsRelations = relations(stockTransferItems, ({ one }) => ({
  transfer: one(stockTransfers, { fields: [stockTransferItems.transferId], references: [stockTransfers.id] }),
  variant: one(productVariants, { fields: [stockTransferItems.variantId], references: [productVariants.id] }),
}));

// ── Parties ──────────────────────────────────────────────────
export const partiesRelations = relations(parties, ({ many }) => ({
  purchases: many(purchases),
  purchaseOrders: many(purchaseOrders),
  purchaseReturns: many(purchaseReturns),
  sales: many(sales),
  saleReturns: many(saleReturns),
  payments: many(payments),
}));

// ── Purchasing ───────────────────────────────────────────────
export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  party: one(parties, { fields: [purchaseOrders.partyId], references: [parties.id] }),
  location: one(locations, { fields: [purchaseOrders.locationId], references: [locations.id] }),
  items: many(purchaseOrderItems),
  purchases: many(purchases),
}));

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({ one }) => ({
  purchaseOrder: one(purchaseOrders, {
    fields: [purchaseOrderItems.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
  variant: one(productVariants, { fields: [purchaseOrderItems.variantId], references: [productVariants.id] }),
}));

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  party: one(parties, { fields: [purchases.partyId], references: [parties.id] }),
  location: one(locations, { fields: [purchases.locationId], references: [locations.id] }),
  purchaseOrder: one(purchaseOrders, { fields: [purchases.purchaseOrderId], references: [purchaseOrders.id] }),
  items: many(purchaseItems),
  payments: many(payments),
  returns: many(purchaseReturns),
}));

export const purchaseItemsRelations = relations(purchaseItems, ({ one, many }) => ({
  purchase: one(purchases, { fields: [purchaseItems.purchaseId], references: [purchases.id] }),
  variant: one(productVariants, { fields: [purchaseItems.variantId], references: [productVariants.id] }),
  lot: one(stockLots, { fields: [purchaseItems.lotId], references: [stockLots.id] }),
  serialNumbers: many(serialNumbers),
}));

export const purchaseReturnsRelations = relations(purchaseReturns, ({ one, many }) => ({
  party: one(parties, { fields: [purchaseReturns.partyId], references: [parties.id] }),
  purchase: one(purchases, { fields: [purchaseReturns.purchaseId], references: [purchases.id] }),
  location: one(locations, { fields: [purchaseReturns.locationId], references: [locations.id] }),
  items: many(purchaseReturnItems),
  payments: many(payments),
}));

export const purchaseReturnItemsRelations = relations(purchaseReturnItems, ({ one }) => ({
  purchaseReturn: one(purchaseReturns, {
    fields: [purchaseReturnItems.purchaseReturnId],
    references: [purchaseReturns.id],
  }),
  variant: one(productVariants, { fields: [purchaseReturnItems.variantId], references: [productVariants.id] }),
  lot: one(stockLots, { fields: [purchaseReturnItems.lotId], references: [stockLots.id] }),
}));

// ── Sales ────────────────────────────────────────────────────
export const salesRelations = relations(sales, ({ one, many }) => ({
  party: one(parties, { fields: [sales.partyId], references: [parties.id] }),
  location: one(locations, { fields: [sales.locationId], references: [locations.id] }),
  createdBy: one(users, { fields: [sales.createdByUserId], references: [users.id] }),
  items: many(saleItems),
  payments: many(payments),
  returns: many(saleReturns),
}));

export const saleItemsRelations = relations(saleItems, ({ one, many }) => ({
  sale: one(sales, { fields: [saleItems.saleId], references: [sales.id] }),
  variant: one(productVariants, { fields: [saleItems.variantId], references: [productVariants.id] }),
  lot: one(stockLots, { fields: [saleItems.lotId], references: [stockLots.id] }),
  serialNumbers: many(serialNumbers),
}));

export const saleReturnsRelations = relations(saleReturns, ({ one, many }) => ({
  sale: one(sales, { fields: [saleReturns.saleId], references: [sales.id] }),
  party: one(parties, { fields: [saleReturns.partyId], references: [parties.id] }),
  location: one(locations, { fields: [saleReturns.locationId], references: [locations.id] }),
  items: many(saleReturnItems),
  payments: many(payments),
}));

export const saleReturnItemsRelations = relations(saleReturnItems, ({ one }) => ({
  saleReturn: one(saleReturns, { fields: [saleReturnItems.saleReturnId], references: [saleReturns.id] }),
  saleItem: one(saleItems, { fields: [saleReturnItems.saleItemId], references: [saleItems.id] }),
  variant: one(productVariants, { fields: [saleReturnItems.variantId], references: [productVariants.id] }),
}));

// ── Finance ──────────────────────────────────────────────────
export const paymentsRelations = relations(payments, ({ one }) => ({
  party: one(parties, { fields: [payments.partyId], references: [parties.id] }),
  sale: one(sales, { fields: [payments.saleId], references: [sales.id] }),
  purchase: one(purchases, { fields: [payments.purchaseId], references: [purchases.id] }),
  saleReturn: one(saleReturns, { fields: [payments.saleReturnId], references: [saleReturns.id] }),
  purchaseReturn: one(purchaseReturns, {
    fields: [payments.purchaseReturnId],
    references: [purchaseReturns.id],
  }),
  createdBy: one(users, { fields: [payments.createdByUserId], references: [users.id] }),
}));

export const financeCategoriesRelations = relations(financeCategories, ({ many }) => ({
  entries: many(financeEntries),
}));

export const financeEntriesRelations = relations(financeEntries, ({ one }) => ({
  category: one(financeCategories, { fields: [financeEntries.categoryId], references: [financeCategories.id] }),
  party: one(parties, { fields: [financeEntries.partyId], references: [parties.id] }),
  location: one(locations, { fields: [financeEntries.locationId], references: [locations.id] }),
  createdBy: one(users, { fields: [financeEntries.createdByUserId], references: [users.id] }),
}));
