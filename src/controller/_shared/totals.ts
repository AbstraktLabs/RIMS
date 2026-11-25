import { badRequest } from "@/lib/errors";
import { round4, sum } from "@/lib/num";
import { calculateTotals, type DocInput, type DocTotals, type LineInput, type TaxMode } from "@/lib/totals";

export { calculateTotals };
export type { DocInput, DocTotals, LineInput, LineResult, TaxMode } from "@/lib/totals";

/**
 * Landed cost per unit for a purchase line: price after its share of the bill
 * discount, plus its share of other charges (freight). Tax counts as cost only
 * when the business cannot reclaim it (not tax-registered).
 */
export function landedUnitCosts(
  lines: LineInput[],
  totals: DocTotals,
  taxMode: TaxMode,
  options: { taxIsCost: boolean },
): number[] {
  const base = totals.lines.map((l) => l.lineTotal - l.billDiscountShare); // incl. tax when INCLUSIVE
  const baseSum = sum(base);
  return lines.map((l, i) => {
    const chargeShare = baseSum > 0 ? (totals.otherCharges * base[i]) / baseSum : totals.otherCharges / lines.length;
    const tax = totals.lines[i].taxAmount;
    let cost = base[i] + chargeShare;
    if (taxMode === "EXCLUSIVE" && options.taxIsCost) cost += tax; // tax sits on top of the price
    if (taxMode === "INCLUSIVE" && !options.taxIsCost) cost -= tax; // tax sits inside the price
    return round4(cost / l.quantity);
  });
}

/** calculateTotals, with its validation errors turned into 400 responses. */
export function totalsOrBadRequest(lines: LineInput[], doc: DocInput): DocTotals {
  try {
    return calculateTotals(lines, doc);
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : "Invalid amounts");
  }
}
