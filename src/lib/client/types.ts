// Shapes returned by the API (only the fields the UI uses).

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SearchVariant {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  isDefault: boolean;
  displayName: string;
  sku: string;
  barcode: string | null;
  optionValues: Record<string, string>;
  sellingPrice: number;
  wholesalePrice: number | null;
  costPrice: number;
  mrp: number | null;
  imageUrl: string | null;
  unitId: string;
  unitCode: string;
  allowDecimal: boolean;
  purchaseUnitId: string | null;
  purchaseUnitFactor: number | null;
  taxRateId: string | null;
  taxRate: number;
  trackBatches: boolean;
  trackExpiry: boolean;
  trackSerials: boolean;
  stock: number;
  avgCost: number;
}

export interface Lot {
  id: string;
  variantId: string;
  lotNumber: string | null;
  expiryDate: string | null;
  quantityAvailable: number;
  status: string;
  unitCost: number;
}

export interface PartyRow {
  id: string;
  code: string | null;
  name: string;
  partyType: "SUPPLIER" | "CUSTOMER" | "BOTH";
  phone: string | null;
  email: string | null;
  taxId: string | null;
  creditLimit: number | null;
  isActive: boolean;
  balance: number;
  createdAt: string;
}

export interface Location {
  id: string;
  name: string;
  code: string | null;
  type: "STORE" | "WAREHOUSE";
  address: string | null;
  phone: string | null;
  isDefault: boolean;
  isActive: boolean;
  staffCount: number;
}

export interface Unit {
  id: string;
  name: string;
  code: string;
  allowDecimal: boolean;
  isActive: boolean;
  productCount: number;
}

export interface TaxRate {
  id: string;
  name: string;
  rate: string;
  isDefault: boolean;
  isActive: boolean;
  productCount: number;
}

export const PAYMENT_METHODS = [
  ["CASH", "Cash"],
  ["CARD", "Card"],
  ["BANK_TRANSFER", "Bank transfer"],
  ["MOBILE_WALLET", "Mobile wallet"],
  ["CHEQUE", "Cheque"],
  ["OTHER", "Other"],
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number][0];
