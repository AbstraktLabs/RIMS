import { badRequest } from "@/lib/errors";
import { round3, round4 } from "@/lib/num";
import type { VariantInfo } from "../_shared/stock";

export interface PricedLineInput {
  variantId: string;
  quantity: number;
  unitCost: number;
  discount: number;
  taxRate?: number;
  inPurchaseUnits: boolean;
}

/**
 * Convert purchase-unit entries (e.g. 2 cartons @ 480) to base units
 * (48 pcs @ 20) and fill in the product's tax rate where none was given.
 */
export function toBaseUnits(line: PricedLineInput, v: VariantInfo): { quantity: number; unitCost: number; taxRate: number } {
  const purchaseUnitFactor = v.purchaseUnitFactor;
  let quantity = line.quantity;
  let unitCost = line.unitCost;
  if (line.inPurchaseUnits) {
    if (!purchaseUnitFactor) throw badRequest(`${v.displayName} has no purchase unit set up`);
    quantity = round3(quantity * purchaseUnitFactor);
    unitCost = round4(unitCost / purchaseUnitFactor);
  }
  return { quantity, unitCost, taxRate: line.taxRate ?? v.taxRate };
}
