import { round2, sum } from "@/lib/num";

// Document totals shared by sales, purchases and purchase orders.
//
// EXCLUSIVE  prices exclude tax: tax = (line net − share of bill discount) × rate
// INCLUSIVE  prices include tax: tax = taxable − taxable / (1 + rate)
// EXEMPT     no tax at all
// Bill-level discount is spread across lines in proportion to line net amounts,
// so tax is charged on what the customer actually pays. Other charges
// (delivery, freight) are not taxed.

export type TaxMode = "EXCLUSIVE" | "INCLUSIVE" | "EXEMPT";

export interface LineInput {
  quantity: number;
  unitPrice: number; // selling price (sales) or unit cost (purchases)
  discount: number; // line-level discount amount
  taxRate: number; // percent
}

export interface DocInput {
  taxMode: TaxMode;
  discount: number;
  otherCharges: number;
  roundOff: number;
}

export interface LineResult {
  lineTotal: number; // qty × price − line discount
  billDiscountShare: number;
  taxAmount: number;
  netAmount: number; // what this line contributes to the grand total, excl. other charges / round-off
  taxRate: number;
}

export interface DocTotals {
  lines: LineResult[];
  subtotal: number;
  discount: number;
  otherCharges: number;
  taxAmount: number;
  roundOff: number;
  grandTotal: number;
}

export function calculateTotals(lines: LineInput[], doc: DocInput): DocTotals {
  const lineTotals = lines.map((l) => round2(l.quantity * l.unitPrice - l.discount));
  if (lineTotals.some((t) => t < 0)) throw new Error("Line discount cannot exceed the line amount");

  const subtotal = round2(sum(lineTotals));
  if (doc.discount > subtotal) throw new Error("Discount cannot exceed the subtotal");

  // spread bill discount; the last line absorbs rounding so shares add up exactly
  let allocated = 0;
  const shares = lineTotals.map((t, i) => {
    if (i === lineTotals.length - 1) return round2(doc.discount - allocated);
    const share = subtotal > 0 ? round2((doc.discount * t) / subtotal) : 0;
    allocated += share;
    return share;
  });

  const results: LineResult[] = lines.map((l, i) => {
    const taxable = lineTotals[i] - shares[i];
    const rate = doc.taxMode === "EXEMPT" ? 0 : l.taxRate;
    let tax = 0;
    if (doc.taxMode === "EXCLUSIVE") tax = round2((taxable * rate) / 100);
    if (doc.taxMode === "INCLUSIVE") tax = round2(taxable - taxable / (1 + rate / 100));
    const net = doc.taxMode === "EXCLUSIVE" ? taxable + tax : taxable;
    return { lineTotal: lineTotals[i], billDiscountShare: shares[i], taxAmount: tax, netAmount: round2(net), taxRate: rate };
  });

  const taxAmount = round2(sum(results.map((r) => r.taxAmount)));
  const grandTotal = round2(
    subtotal - doc.discount + doc.otherCharges + (doc.taxMode === "EXCLUSIVE" ? taxAmount : 0) + doc.roundOff,
  );
  if (grandTotal < 0) throw new Error("Grand total cannot be negative");

  return {
    lines: results,
    subtotal,
    discount: round2(doc.discount),
    otherCharges: round2(doc.otherCharges),
    taxAmount,
    roundOff: round2(doc.roundOff),
    grandTotal,
  };
}
