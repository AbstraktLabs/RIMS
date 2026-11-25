import type { DbOrTx } from "./index";
import {
  documentSequences,
  financeCategories,
  locations,
  organizationSettings,
  taxRates,
  units,
} from "./schema";

// Starter data every new tenant receives at sign-up. Run inside the same
// transaction that creates the organization and owner.

export const DEFAULT_UNITS = [
  { name: "Piece", code: "pcs", allowDecimal: false },
  { name: "Kilogram", code: "kg", allowDecimal: true },
  { name: "Gram", code: "g", allowDecimal: true },
  { name: "Litre", code: "l", allowDecimal: true },
  { name: "Millilitre", code: "ml", allowDecimal: true },
  { name: "Metre", code: "m", allowDecimal: true },
  { name: "Box", code: "box", allowDecimal: false },
  { name: "Pack", code: "pack", allowDecimal: false },
  { name: "Dozen", code: "dozen", allowDecimal: false },
  { name: "Pair", code: "pair", allowDecimal: false },
] as const;

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Rent",
  "Salaries & Wages",
  "Utilities",
  "Transport & Delivery",
  "Marketing",
  "Repairs & Maintenance",
  "Bank Charges",
  "Miscellaneous",
] as const;

export const DEFAULT_INCOME_CATEGORIES = ["Commission", "Interest", "Other Income"] as const;

export const DEFAULT_DOCUMENT_PREFIXES = {
  SALE: "INV-",
  SALE_RETURN: "SR-",
  PURCHASE: "PUR-",
  PURCHASE_ORDER: "PO-",
  PURCHASE_RETURN: "PR-",
  STOCK_ADJUSTMENT: "ADJ-",
  STOCK_TRANSFER: "TRF-",
  PAYMENT: "PAY-",
} as const;

export interface TenantDefaultsInput {
  organizationId: string;
  locationName?: string;
  settings?: Partial<typeof organizationSettings.$inferInsert>;
  // e.g. { name: "VAT 13%", rate: "13" }; omit for no default tax rate
  defaultTaxRate?: { name: string; rate: string };
}

export async function createTenantDefaults(tx: DbOrTx, input: TenantDefaultsInput) {
  const { organizationId } = input;

  await tx.insert(organizationSettings).values({ ...input.settings, organizationId });

  const [location] = await tx
    .insert(locations)
    .values({ organizationId, name: input.locationName ?? "Main Store", isDefault: true })
    .returning({ id: locations.id });

  await tx.insert(units).values(DEFAULT_UNITS.map((u) => ({ ...u, organizationId })));

  if (input.defaultTaxRate) {
    await tx.insert(taxRates).values({ organizationId, ...input.defaultTaxRate, isDefault: true });
  }

  await tx.insert(financeCategories).values([
    ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ organizationId, kind: "EXPENSE" as const, name })),
    ...DEFAULT_INCOME_CATEGORIES.map((name) => ({ organizationId, kind: "INCOME" as const, name })),
  ]);

  await tx.insert(documentSequences).values(
    Object.entries(DEFAULT_DOCUMENT_PREFIXES).map(([documentType, prefix]) => ({
      organizationId,
      documentType: documentType as keyof typeof DEFAULT_DOCUMENT_PREFIXES,
      prefix,
    })),
  );

  return { defaultLocationId: location.id };
}
