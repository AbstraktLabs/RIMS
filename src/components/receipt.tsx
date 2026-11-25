"use client";

import { createPortal } from "react-dom";
import { useSession, useFmt } from "@/lib/client/session";
import { PAYMENT_METHOD_LABELS } from "@/lib/client/labels";

export interface ReceiptSale {
  invoiceNumber: string;
  saleDate: string;
  customerName?: string | null;
  partyName?: string | null;
  cashierName?: string | null;
  locationName?: string | null;
  subtotal: number;
  discount: number;
  otherCharges: number;
  taxAmount: number;
  taxMode: string;
  roundOff: number;
  grandTotal: number;
  paidAmount: number;
  amountTendered: number | null;
  changeGiven: number;
  items: { id: string; displayName: string; productId?: string; quantity: number; unitPrice: number; discount: number; lineTotal: number; unitCode: string; serials?: string[] }[];
  payments: { id: string; amount: number; method: string; status: string }[];
}

/** 80mm thermal-style receipt, rendered off-screen and printed on demand. */
export function Receipt({ sale }: { sale: ReceiptSale }) {
  const { org, settings } = useSession();
  const { money, dateTime, qty } = useFmt();
  if (typeof document === "undefined") return null;
  const row = "flex justify-between gap-2";
  return createPortal(
    <div id="print-receipt" className="font-mono text-black">
      <div className="text-center">
        <div className="text-sm font-bold">{org.legalName || org.name}</div>
        {sale.locationName && <div>{sale.locationName}</div>}
        {org.address && <div className="whitespace-pre-line">{org.address}</div>}
        {org.phone && <div>{org.phone}</div>}
        {org.taxId && <div>{settings.taxIdLabel}: {org.taxId}</div>}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      <div className={row}><span>Invoice</span><span>{sale.invoiceNumber}</span></div>
      <div className={row}><span>Date</span><span>{dateTime(sale.saleDate)}</span></div>
      <div className={row}><span>Customer</span><span>{sale.partyName ?? sale.customerName ?? "Walk-in"}</span></div>
      {sale.cashierName && <div className={row}><span>Cashier</span><span>{sale.cashierName}</span></div>}
      <div className="my-2 border-t border-dashed border-black" />
      {sale.items.map((i) => (
        <div key={i.id} className="mb-1">
          <div>{i.displayName}</div>
          <div className={row}>
            <span>{qty(i.quantity, i.unitCode)} × {money(i.unitPrice)}{i.discount > 0 ? ` −${money(i.discount)}` : ""}</span>
            <span>{money(i.lineTotal)}</span>
          </div>
          {i.serials && i.serials.length > 0 && <div className="text-[10px]">S/N: {i.serials.join(", ")}</div>}
        </div>
      ))}
      <div className="my-2 border-t border-dashed border-black" />
      <div className={row}><span>Subtotal</span><span>{money(sale.subtotal)}</span></div>
      {sale.discount > 0 && <div className={row}><span>Discount</span><span>−{money(sale.discount)}</span></div>}
      {sale.otherCharges > 0 && <div className={row}><span>Charges</span><span>{money(sale.otherCharges)}</span></div>}
      {sale.taxAmount > 0 && <div className={row}><span>{settings.taxLabel}{sale.taxMode === "INCLUSIVE" ? " (incl.)" : ""}</span><span>{money(sale.taxAmount)}</span></div>}
      {sale.roundOff !== 0 && <div className={row}><span>Round off</span><span>{money(sale.roundOff)}</span></div>}
      <div className={`${row} text-sm font-bold`}><span>TOTAL</span><span>{money(sale.grandTotal)}</span></div>
      <div className="my-2 border-t border-dashed border-black" />
      {sale.payments.filter((p) => p.status !== "VOID").map((p) => (
        <div key={p.id} className={row}><span>{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</span><span>{money(p.amount)}</span></div>
      ))}
      {sale.amountTendered !== null && sale.amountTendered > 0 && <div className={row}><span>Cash tendered</span><span>{money(sale.amountTendered)}</span></div>}
      {sale.changeGiven > 0 && <div className={row}><span>Change</span><span>{money(sale.changeGiven)}</span></div>}
      {sale.grandTotal - sale.paidAmount > 0.004 && <div className={`${row} font-bold`}><span>Balance due</span><span>{money(sale.grandTotal - sale.paidAmount)}</span></div>}
      <div className="my-2 border-t border-dashed border-black" />
      <div className="whitespace-pre-line text-center">{settings.receiptFooter || "Thank you for shopping with us!"}</div>
    </div>,
    document.body,
  );
}

export function printReceipt() {
  document.body.classList.add("printing-receipt");
  const done = () => {
    document.body.classList.remove("printing-receipt");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
  setTimeout(done, 1000);
}
