"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Field, FormGrid, Input, Select } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Alert, Button, SummaryRow } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { post } from "@/lib/client/api";
import { todayIso } from "@/lib/client/format";
import { useAction } from "@/lib/client/hooks";
import { PAYMENT_METHOD_LABELS } from "@/lib/client/labels";
import { useFmt, useSession } from "@/lib/client/session";
import { PAYMENT_METHODS } from "@/lib/client/types";
import type { DocTotals } from "@/lib/totals";

/** Editable totals block for document forms. */
export function TotalsBox({
  totals,
  discount,
  onDiscount,
  otherCharges,
  onOtherCharges,
  roundOff,
  onRoundOff,
  otherChargesLabel = "Other charges",
  taxIncluded,
}: {
  totals: DocTotals | null;
  discount: string;
  onDiscount: (v: string) => void;
  otherCharges?: string;
  onOtherCharges?: (v: string) => void;
  roundOff?: string;
  onRoundOff?: (v: string) => void;
  otherChargesLabel?: string;
  taxIncluded?: boolean;
}) {
  const { money } = useFmt();
  const { settings } = useSession();
  const inline = "h-8 w-28 rounded-lg border border-slate-200 bg-white px-2 text-right text-sm focus:border-[#044d73] focus:outline-none";
  return (
    <div className="space-y-1">
      <SummaryRow label="Subtotal" value={money(totals?.subtotal ?? 0)} />
      <div className="flex items-center justify-between gap-4 py-1 text-sm text-slate-600">
        <span>Discount</span>
        <input aria-label="Bill discount" inputMode="decimal" className={inline} value={discount} onChange={(e) => onDiscount(e.target.value)} placeholder="0" />
      </div>
      {onOtherCharges && (
        <div className="flex items-center justify-between gap-4 py-1 text-sm text-slate-600">
          <span>{otherChargesLabel}</span>
          <input aria-label={otherChargesLabel} inputMode="decimal" className={inline} value={otherCharges} onChange={(e) => onOtherCharges(e.target.value)} placeholder="0" />
        </div>
      )}
      {settings.taxRegistered && (totals?.taxAmount ?? 0) > 0 && (
        <SummaryRow label={`${settings.taxLabel}${taxIncluded ? " (included)" : ""}`} value={money(totals?.taxAmount ?? 0)} muted={taxIncluded} />
      )}
      {onRoundOff && (
        <div className="flex items-center justify-between gap-4 py-1 text-sm text-slate-600">
          <span>Round off</span>
          <input aria-label="Round off" inputMode="decimal" className={inline} value={roundOff} onChange={(e) => onRoundOff(e.target.value)} placeholder="0" />
        </div>
      )}
      <div className="mt-2 border-t border-slate-200 pt-2">
        <SummaryRow label="Total" value={money(totals?.grandTotal ?? 0)} strong />
      </div>
    </div>
  );
}

export interface PaymentRow {
  amount: string;
  method: string;
  referenceNumber: string;
}

/** Up-front payments entered on a new purchase / invoice. */
export function PaymentRows({ value, onChange, total, label = "Payment" }: { value: PaymentRow[]; onChange: (v: PaymentRow[]) => void; total: number; label?: string }) {
  const { money } = useFmt();
  const paid = value.reduce((s, p) => s + Number(p.amount || 0), 0);
  const set = (i: number, p: Partial<PaymentRow>) => onChange(value.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <div className="space-y-2">
      {value.map((p, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Select value={p.method} onChange={(e) => set(i, { method: e.target.value })} aria-label="Method">
            {PAYMENT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Input inputMode="decimal" placeholder="Amount" value={p.amount} onChange={(e) => set(i, { amount: e.target.value })} aria-label="Amount" />
          <Button variant="ghost" icon={Trash2} aria-label="Remove payment" onClick={() => onChange(value.filter((_, j) => j !== i))} />
          {p.method !== "CASH" && (
            <Input className="col-span-2" placeholder="Reference (cheque no., transaction id…)" value={p.referenceNumber} onChange={(e) => set(i, { referenceNumber: e.target.value })} />
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" icon={Plus} onClick={() => onChange([...value, { amount: value.length ? "" : String(Math.max(0, total - paid) || ""), method: "CASH", referenceNumber: "" }])}>
          Add {label.toLowerCase()}
        </Button>
        {value.length === 0 && total > 0 && (
          <Button size="sm" variant="ghost" onClick={() => onChange([{ amount: String(total), method: "CASH", referenceNumber: "" }])}>
            Paid in full
          </Button>
        )}
        <span className="ml-auto text-xs text-slate-500">
          Paid {money(paid)} · Balance <b className={total - paid > 0.004 ? "text-amber-600" : "text-emerald-600"}>{money(Math.max(0, total - paid))}</b>
        </span>
      </div>
    </div>
  );
}

export const paymentBody = (rows: PaymentRow[]) =>
  rows
    .filter((p) => Number(p.amount) > 0)
    .map((p) => ({ amount: Number(p.amount), method: p.method, referenceNumber: p.referenceNumber || null }));

/** Record a payment against an existing invoice / bill. */
export function RecordPaymentModal({
  open,
  onClose,
  path,
  balance,
  title = "Record payment",
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
  balance: number;
  title?: string;
  onDone: (r: unknown) => void;
}) {
  const { settings } = useSession();
  const { money } = useFmt();
  const toast = useToast();
  const [f, setF] = useState({ amount: String(balance), method: "CASH", paymentDate: todayIso(settings.timezone), referenceNumber: "", notes: "" });
  const { busy, error, run } = useAction();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={`Outstanding ${money(balance)}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            disabled={!(Number(f.amount) > 0)}
            onClick={() =>
              run(async () => {
                const r = await post(path, {
                  amount: Number(f.amount),
                  method: f.method,
                  paymentDate: f.paymentDate,
                  referenceNumber: f.referenceNumber || null,
                  notes: f.notes || null,
                });
                toast("Payment recorded");
                onDone(r);
              })
            }
          >
            Save payment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <FormGrid>
          <Field label="Amount" required>
            <Input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} autoFocus />
          </Field>
          <Field label="Method">
            <Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={f.paymentDate} onChange={(e) => setF({ ...f, paymentDate: e.target.value })} />
          </Field>
          <Field label="Reference">
            <Input value={f.referenceNumber} onChange={(e) => setF({ ...f, referenceNumber: e.target.value })} />
          </Field>
        </FormGrid>
        <Field label="Notes">
          <Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

/** Void a posted document with a required reason. */
export function VoidDialog({ open, onClose, path, what, message, onDone }: { open: boolean; onClose: () => void; path: string; what: string; message: React.ReactNode; onDone: (r: unknown) => void }) {
  const { busy, error, run } = useAction();
  const toast = useToast();
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={`Void ${what}?`}
      message={message}
      confirmLabel="Void"
      reason={{ label: "Reason", required: true }}
      busy={busy}
      error={error}
      onConfirm={(reason) =>
        run(async () => {
          const r = await post(path, { reason });
          toast(`${what.charAt(0).toUpperCase()}${what.slice(1)} voided`);
          onDone(r);
        })
      }
    />
  );
}

/** Read-only totals for document detail pages. */
export function DocTotalsView({
  subtotal,
  discount,
  otherCharges,
  taxAmount,
  taxMode,
  roundOff,
  grandTotal,
  paid,
  credited,
  balance,
}: {
  subtotal: number;
  discount: number;
  otherCharges?: number;
  taxAmount: number;
  taxMode: string;
  roundOff?: number;
  grandTotal: number;
  paid?: number;
  credited?: number;
  balance?: number;
}) {
  const { money } = useFmt();
  const { settings } = useSession();
  return (
    <div className="ml-auto w-full max-w-xs space-y-0.5">
      <SummaryRow label="Subtotal" value={money(subtotal)} />
      {discount > 0 && <SummaryRow label="Discount" value={`− ${money(discount)}`} />}
      {!!otherCharges && <SummaryRow label="Other charges" value={money(otherCharges)} />}
      {taxAmount > 0 && <SummaryRow label={`${settings.taxLabel}${taxMode === "INCLUSIVE" ? " (included)" : ""}`} value={money(taxAmount)} muted={taxMode === "INCLUSIVE"} />}
      {!!roundOff && <SummaryRow label="Round off" value={money(roundOff)} />}
      <div className="border-t border-slate-200 pt-1">
        <SummaryRow label="Total" value={money(grandTotal)} strong />
      </div>
      {paid !== undefined && <SummaryRow label="Paid" value={money(paid)} />}
      {!!credited && <SummaryRow label="Returns credited" value={`− ${money(credited)}`} />}
      {balance !== undefined && (
        <SummaryRow label="Balance due" value={<span className={balance > 0.004 ? "font-bold text-amber-600" : "font-bold text-emerald-600"}>{money(balance)}</span>} />
      )}
    </div>
  );
}
