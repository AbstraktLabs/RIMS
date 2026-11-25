import type { Tone } from "@/components/ui/primitives";

export const MOVEMENT_LABELS: Record<string, { label: string; tone: Tone }> = {
  OPENING: { label: "Opening", tone: "slate" },
  PURCHASE: { label: "Purchase", tone: "green" },
  PURCHASE_RETURN: { label: "Purchase return", tone: "amber" },
  SALE: { label: "Sale", tone: "blue" },
  SALE_RETURN: { label: "Sale return", tone: "amber" },
  ADJUSTMENT_IN: { label: "Adjustment +", tone: "green" },
  ADJUSTMENT_OUT: { label: "Adjustment −", tone: "red" },
  DAMAGE: { label: "Damage", tone: "red" },
  TRANSFER_OUT: { label: "Transfer out", tone: "slate" },
  TRANSFER_IN: { label: "Transfer in", tone: "slate" },
};

export const ADJUSTMENT_REASONS: Record<string, string> = {
  OPENING_STOCK: "Opening stock",
  COUNT_CORRECTION: "Stock count correction",
  DAMAGED: "Damaged",
  EXPIRED: "Expired",
  LOST: "Lost",
  THEFT: "Theft",
  INTERNAL_USE: "Internal use",
  FOUND: "Found",
  OTHER: "Other",
};

export const SERIAL_STATUS: Record<string, { label: string; tone: Tone }> = {
  IN_STOCK: { label: "In stock", tone: "green" },
  SOLD: { label: "Sold", tone: "blue" },
  RETURNED_TO_SUPPLIER: { label: "Returned to supplier", tone: "amber" },
  DAMAGED: { label: "Damaged", tone: "red" },
  IN_TRANSIT: { label: "In transit", tone: "slate" },
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  MOBILE_WALLET: "Mobile wallet",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

export const PAYMENT_DIRECTION_LABELS: Record<string, string> = {
  RECEIVED_FROM_CUSTOMER: "Received from customer",
  PAID_TO_SUPPLIER: "Paid to supplier",
  REFUND_TO_CUSTOMER: "Refund to customer",
  REFUND_FROM_SUPPLIER: "Refund from supplier",
};

/** Link to the page for a stock / finance reference. */
export function docHref(base: string, type: string | null | undefined, id: string | null | undefined): string | null {
  if (!type || !id) return null;
  const path: Record<string, string> = {
    SALE: "sales",
    SALE_RETURN: "sale-returns",
    PURCHASE: "purchases",
    PURCHASE_ORDER: "purchase-orders",
    PURCHASE_RETURN: "purchase-returns",
    ADJUSTMENT: "inventory/adjustments",
    STOCK_ADJUSTMENT: "inventory/adjustments",
    TRANSFER: "inventory/transfers",
    STOCK_TRANSFER: "inventory/transfers",
    PAYMENT: "finance/payments",
    FINANCE_ENTRY: "finance/entries",
  };
  return path[type] ? `${base}/${path[type]}/${id}` : null;
}
