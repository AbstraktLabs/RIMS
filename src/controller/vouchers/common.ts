import { z } from "zod";
import { isoDate, money, signedMoney, uuid } from "@/lib/validation/common";

// Shared pieces of the pharmacy-style Purchase and Sales screens: payment types,
// the VAT modes and the bill adjustments (discount, freight, round-off).

export const voucherPaymentType = z.enum(["CASH", "CREDIT", "BANK_TRANSFER", "CHEQUE", "MOBILE_PAYMENT"]);
export type VoucherPaymentType = z.infer<typeof voucherPaymentType>;
export const voucherPaymentStatus = z.enum(["PAID", "UNPAID", "PARTIAL"]);

type Method = "CASH" | "CARD" | "BANK_TRANSFER" | "CHEQUE" | "MOBILE_WALLET" | "OTHER";

/** Payment type / modal method → stored payment method. */
export function toMethod(t: string | null | undefined): Method {
  switch (t) {
    case "BANK_TRANSFER":
    case "CHEQUE":
    case "CARD":
    case "OTHER":
      return t;
    case "MOBILE_PAYMENT":
    case "MOBILE_WALLET":
      return "MOBILE_WALLET";
    default:
      return "CASH";
  }
}

/** Stored payment method → what the pharmacy screens show. */
export const fromMethod = (m: string) => (m === "MOBILE_WALLET" ? "MOBILE_PAYMENT" : m);

export const amount2 = (v: number) => v.toFixed(2);

export const voucherAdjustments = {
  discount: money.default(0),
  freightCharges: money.default(0),
  vatRefund: money.default(0), // accepted for compatibility, not stored
  roundOff: signedMoney.default(0),
  roundingDirection: z.enum(["UP", "DOWN"]).optional(),
  vatRate: z.coerce.number().min(0).max(100).default(13),
};

export const statusSchema = z.object({
  paymentStatus: voucherPaymentStatus,
  amount: z.coerce.number().min(0).optional(),
  method: z.string().max(30).optional(),
  paymentDate: isoDate.optional().or(z.literal("").transform(() => undefined)),
  referenceNumber: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});
export type StatusInput = z.infer<typeof statusSchema>;

export const optionalDate = isoDate.optional().nullable().or(z.literal("").transform(() => null));
export { uuid };

/** Payments carried over on edit: same rows, trimmed so they never exceed the new total. */
export function capPayments<T extends { amount: number }>(rows: T[], total: number): T[] {
  let left = total;
  const out: T[] = [];
  for (const r of rows) {
    if (left <= 0.004) break;
    const amount = Math.min(r.amount, Math.round(left * 100) / 100);
    out.push({ ...r, amount });
    left -= amount;
  }
  return out;
}
