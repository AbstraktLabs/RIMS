import { pgEnum } from "drizzle-orm/pg-core";

// ── Tenancy / SaaS ───────────────────────────────────────────
export const orgStatusEnum = pgEnum("org_status", ["TRIAL", "ACTIVE", "SUSPENDED"]);
export const planEnum = pgEnum("plan", ["BASIC", "STANDARD", "PRO"]);

// Informational only — used to pre-fill sensible defaults at sign-up.
// The system itself never branches on business type; it uses feature flags.
export const businessTypeEnum = pgEnum("business_type", [
  "GROCERY",
  "FASHION",
  "ELECTRONICS",
  "COSMETICS",
  "CONVENIENCE",
  "FOOD",
  "GENERAL",
  "OTHER",
]);

export const calendarSystemEnum = pgEnum("calendar_system", ["AD", "BS"]);
export const locationTypeEnum = pgEnum("location_type", ["STORE", "WAREHOUSE"]);

// ── Catalogue / tax ──────────────────────────────────────────
// EXCLUSIVE: tax added on top of prices. INCLUSIVE: prices already contain tax.
// EXEMPT: no tax on the whole document.
export const taxModeEnum = pgEnum("tax_mode", ["EXCLUSIVE", "INCLUSIVE", "EXEMPT"]);

// ── Inventory ────────────────────────────────────────────────
export const lotStatusEnum = pgEnum("lot_status", ["ACTIVE", "EXPIRED", "DEPLETED"]);

export const serialStatusEnum = pgEnum("serial_status", [
  "IN_STOCK",
  "SOLD",
  "RETURNED_TO_SUPPLIER",
  "DAMAGED",
  "IN_TRANSIT",
]);

export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
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
]);

export const stockReferenceTypeEnum = pgEnum("stock_reference_type", [
  "PURCHASE",
  "PURCHASE_RETURN",
  "SALE",
  "SALE_RETURN",
  "ADJUSTMENT",
  "TRANSFER",
]);

export const adjustmentReasonEnum = pgEnum("adjustment_reason", [
  "OPENING_STOCK",
  "COUNT_CORRECTION",
  "DAMAGED",
  "EXPIRED",
  "LOST",
  "THEFT",
  "INTERNAL_USE",
  "FOUND",
  "OTHER",
]);

export const transferStatusEnum = pgEnum("transfer_status", [
  "DRAFT",
  "IN_TRANSIT",
  "RECEIVED",
  "CANCELLED",
]);

// ── Parties ──────────────────────────────────────────────────
export const partyTypeEnum = pgEnum("party_type", ["SUPPLIER", "CUSTOMER", "BOTH"]);
export const balanceTypeEnum = pgEnum("balance_type", ["DR", "CR"]);

// ── Documents ────────────────────────────────────────────────
// Posted documents are never hard-deleted once they move stock or money;
// they are voided so the audit trail stays intact.
export const documentStatusEnum = pgEnum("document_status", ["POSTED", "VOID"]);

export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", [
  "DRAFT",
  "SENT",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CANCELLED",
]);

export const documentTypeEnum = pgEnum("document_type", [
  "SALE",
  "SALE_RETURN",
  "PURCHASE",
  "PURCHASE_ORDER",
  "PURCHASE_RETURN",
  "STOCK_ADJUSTMENT",
  "STOCK_TRANSFER",
  "PAYMENT",
]);

export const saleChannelEnum = pgEnum("sale_channel", ["POS", "INVOICE"]);

export const purchaseReturnResolutionEnum = pgEnum("purchase_return_resolution", [
  "REFUND", // supplier pays money back
  "CREDIT_NOTE", // supplier credits our account (ledger only)
  "REPLACEMENT", // supplier sends the same goods again
]);

export const purchaseReturnStatusEnum = pgEnum("purchase_return_status", [
  "PENDING",
  "COMPLETED",
  "VOID",
]);

export const saleReturnResolutionEnum = pgEnum("sale_return_resolution", [
  "REFUND", // money handed back
  "STORE_CREDIT", // credited to the customer's ledger balance
]);

export const returnConditionEnum = pgEnum("return_condition", ["RESELLABLE", "DAMAGED"]);

// ── Finance ──────────────────────────────────────────────────
export const paymentStatusEnum = pgEnum("payment_status", ["UNPAID", "PARTIAL", "PAID"]);

export const paymentDirectionEnum = pgEnum("payment_direction", [
  "RECEIVED_FROM_CUSTOMER",
  "PAID_TO_SUPPLIER",
  "REFUND_TO_CUSTOMER",
  "REFUND_FROM_SUPPLIER",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "CHEQUE",
  "MOBILE_WALLET",
  "OTHER",
]);

export const financeEntryKindEnum = pgEnum("finance_entry_kind", ["INCOME", "EXPENSE"]);
