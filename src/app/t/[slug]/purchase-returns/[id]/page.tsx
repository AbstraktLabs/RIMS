"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Ban, CheckCircle2, Printer } from "lucide-react";
import { VoidDialog } from "@/components/doc";
import { PrintHeader } from "@/components/print-header";
import { parseSerials } from "@/components/stock-pickers";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Button, Card, CardHeader, DetailList, ErrorState, LoadingBlock, PageHeader, StatusBadge, SummaryRow } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { post } from "@/lib/client/api";
import { todayIso } from "@/lib/client/format";
import { useAction, useApi } from "@/lib/client/hooks";
import { PAYMENT_METHOD_LABELS } from "@/lib/client/labels";
import { useFmt, useSession } from "@/lib/client/session";
import { PAYMENT_METHODS } from "@/lib/client/types";
import { ProductName } from "@/components/product-name";

interface RItem {
  id: string;
  displayName: string; productId?: string;
  sku: string;
  unitCode: string;
  trackBatches: boolean;
  trackExpiry: boolean;
  trackSerials: boolean;
  lotNumber: string | null;
  expiryDate: string | null;
  quantity: number;
  unitCost: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  serialNumbers: string[];
}
interface PReturn {
  id: string;
  number: string;
  returnDate: string;
  status: "PENDING" | "COMPLETED" | "VOID";
  resolution: "REFUND" | "CREDIT_NOTE" | "REPLACEMENT" | null;
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  reason: string | null;
  note: string | null;
  completedAt: string | null;
  createdAt: string;
  partyId: string;
  partyName: string;
  locationName: string;
  purchaseId: string | null;
  purchaseNumber: string | null;
  createdByName: string | null;
  items: RItem[];
  refunds: { id: string; number: string; amount: number; method: string; paymentDate: string; referenceNumber: string | null; status: string }[];
}

const OUTCOME: Record<string, string> = {
  REFUND: "The supplier paid the money back.",
  CREDIT_NOTE: "The value was taken off what you owe this supplier.",
  REPLACEMENT: "The supplier sent replacement goods, which were added back to stock.",
};

export default function PurchaseReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { base, can, readOnly } = useSession();
  const { money, qty, date, dateTime } = useFmt();
  const { data, error, loading, reload, setData } = useApi<{ purchaseReturn: PReturn }>(`/api/purchase-returns/${id}`);
  const [modal, setModal] = useState<"complete" | "void" | null>(null);
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (loading && !data) return <LoadingBlock />;
  if (!data) return null;
  const r = data.purchaseReturn;
  const canManage = can("purchases.manage") && !readOnly;
  const pending = r.status === "PENDING";

  return (
    <div>
      <PageHeader
        back={{ href: `${base}/purchase-returns`, label: "Supplier returns" }}
        title={<span className="flex flex-wrap items-center gap-2">{r.number} <StatusBadge status={r.status === "COMPLETED" && r.resolution ? r.resolution : r.status} /></span>}
        subtitle={`${r.partyName} · ${date(r.returnDate)}${r.reason ? ` · ${r.reason}` : ""}`}
        actions={
          <>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print / PDF</Button>
            {pending && canManage && <Button icon={CheckCircle2} onClick={() => setModal("complete")}>Settle with supplier</Button>}
            {pending && canManage && <Button variant="ghost" icon={Ban} onClick={() => setModal("void")}>Void</Button>}
          </>
        }
      />
      {pending && <div className="mb-4"><Alert tone="amber">Waiting on the supplier. When they refund, issue a credit note or send replacements, settle the return here.</Alert></div>}
      {r.status === "COMPLETED" && r.resolution && <div className="mb-4"><Alert tone="green">Settled{r.completedAt ? ` on ${date(r.completedAt)}` : ""}. {OUTCOME[r.resolution]}</Alert></div>}
      {r.status === "VOID" && <div className="mb-4"><Alert>This return was voided and the goods were put back into stock.</Alert></div>}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2 print:border-0 print:shadow-none">
          <PrintHeader screen title="Return to supplier" number={r.number} meta={[["Date", date(r.returnDate)], ...(r.purchaseNumber ? ([["Purchase", r.purchaseNumber]] as [string, React.ReactNode][]) : [])]} />
          <div className="mb-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Supplier</div>
              <Link href={`${base}/parties/${r.partyId}`} className="font-semibold text-slate-800 hover:underline print:no-underline">{r.partyName}</Link>
            </div>
            <div className="sm:text-right">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sent from</div>
              <div className="text-slate-700">{r.locationName}</div>
              {r.purchaseId && (
                <div className="text-xs text-slate-500">
                  Against <Link href={`${base}/purchases/${r.purchaseId}`} className="font-semibold text-[#044d73] hover:underline">{r.purchaseNumber}</Link>
                </div>
              )}
            </div>
          </div>
          <div className="-mx-4 overflow-x-auto sm:-mx-5">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 sm:pl-5">Item</th>
                  <th className="px-3 py-2.5 text-right">Qty</th>
                  <th className="px-3 py-2.5 text-right">Unit cost</th>
                  <th className="px-4 py-2.5 text-right sm:pr-5">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.items.map((i) => (
                  <tr key={i.id} className="align-top">
                    <td className="px-4 py-3 sm:pl-5">
                      <ProductName productId={i.productId} name={i.displayName} />
                      <div className="text-xs text-slate-400">
                        {i.sku}
                        {i.lotNumber && ` · Batch ${i.lotNumber}`}
                        {i.expiryDate && ` · Exp ${date(i.expiryDate)}`}
                      </div>
                      {i.serialNumbers.length > 0 && <div className="mt-1 text-xs text-slate-500">S/N: {i.serialNumbers.join(", ")}</div>}
                    </td>
                    <td className="px-3 py-3 text-right">{qty(i.quantity, i.unitCode)}</td>
                    <td className="px-3 py-3 text-right">{money(i.unitCost)}</td>
                    <td className="px-4 py-3 text-right font-semibold sm:pr-5">{money(i.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ml-auto mt-4 w-full max-w-xs space-y-0.5">
            <SummaryRow label="Subtotal" value={money(r.subtotal)} />
            {r.taxAmount > 0 && <SummaryRow label="Tax" value={money(r.taxAmount)} />}
            <div className="border-t border-slate-200 pt-1"><SummaryRow label="Return value" value={money(r.grandTotal)} strong /></div>
          </div>
          {r.note && <p className="mt-4 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{r.note}</p>}
        </Card>
        <div className="space-y-6 print:hidden">
          {r.refunds.length > 0 && (
            <Card padded={false}>
              <div className="p-4 sm:p-5"><CardHeader title="Refunds received" /></div>
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {r.refunds.map((x) => (
                  <li key={x.id} className={`flex items-center justify-between px-4 py-3 text-sm sm:px-5 ${x.status === "VOID" ? "opacity-50" : ""}`}>
                    <div>
                      <Link href={`${base}/finance/payments/${x.id}`} className="font-semibold text-[#044d73] hover:underline">{x.number}</Link>
                      <div className="text-xs text-slate-500">{date(x.paymentDate)} · {PAYMENT_METHOD_LABELS[x.method] ?? x.method}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{money(x.amount)}</div>
                      {x.status === "VOID" && <Badge tone="red">Void</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <DetailList
              items={[
                ["Reason", r.reason ?? "—"],
                ["Recorded", `${dateTime(r.createdAt)}${r.createdByName ? ` · ${r.createdByName}` : ""}`],
                ...(r.completedAt ? ([["Settled", dateTime(r.completedAt)]] as [string, React.ReactNode][]) : []),
              ]}
            />
          </Card>
        </div>
      </div>
      {modal === "complete" && <CompleteModal ret={r} onClose={() => setModal(null)} onDone={(x) => { setData(x); setModal(null); }} />}
      <VoidDialog
        open={modal === "void"}
        onClose={() => setModal(null)}
        path={`/api/purchase-returns/${r.id}/void`}
        what="return"
        message="The goods go back into stock as if they never left. Use this if the supplier refused the return."
        onDone={() => { setModal(null); reload(); }}
      />
    </div>
  );
}

function CompleteModal({ ret, onClose, onDone }: { ret: PReturn; onClose: () => void; onDone: (r: { purchaseReturn: PReturn }) => void }) {
  const { settings } = useSession();
  const { money } = useFmt();
  const toast = useToast();
  const [resolution, setResolution] = useState<"CREDIT_NOTE" | "REFUND" | "REPLACEMENT">("CREDIT_NOTE");
  const [amount, setAmount] = useState(String(ret.grandTotal));
  const [method, setMethod] = useState("CASH");
  const [paymentDate, setPaymentDate] = useState(todayIso(settings.timezone));
  const [referenceNumber, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [repl, setRepl] = useState<Record<string, { lotNumber: string; manufacturingDate: string; expiryDate: string; serials: string }>>({});
  const { busy, error, run } = useAction();
  const setR = (id: string, p: Partial<(typeof repl)[string]>) => setRepl((x) => ({ ...x, [id]: { ...(x[id] ?? { lotNumber: "", manufacturingDate: "", expiryDate: "", serials: "" }), ...p } }));
  const needsDetail = ret.items.filter((i) => i.trackBatches || i.trackExpiry || i.trackSerials);

  const submit = () =>
    run(async () => {
      let body: Record<string, unknown> = { resolution };
      if (resolution === "REFUND") {
        const a = Number(amount);
        if (!(a > 0)) throw new Error("Enter the refund amount");
        if (a > ret.grandTotal + 0.004) throw new Error(`Refund can’t be more than ${money(ret.grandTotal)}`);
        body = { ...body, refund: { amount: a, method, paymentDate, referenceNumber: referenceNumber || null, notes: notes || null } };
      }
      if (resolution === "REPLACEMENT") {
        const replacements = needsDetail.map((i) => {
          const d = repl[i.id];
          const serials = i.trackSerials ? parseSerials(d?.serials ?? "") : [];
          if (i.trackSerials && serials.length !== i.quantity) throw new Error(`${i.displayName}: enter ${i.quantity} new serial number(s)`);
          if (i.trackExpiry && !d?.expiryDate) throw new Error(`${i.displayName}: enter the expiry date of the replacement`);
          return { returnItemId: i.id, lotNumber: d?.lotNumber || null, manufacturingDate: d?.manufacturingDate || null, expiryDate: d?.expiryDate || null, serials };
        });
        body = { ...body, replacements };
      }
      const x = await post<{ purchaseReturn: PReturn }>(`/api/purchase-returns/${ret.id}/complete`, body);
      toast("Return settled");
      onDone(x);
    });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Settle ${ret.number}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={CheckCircle2} loading={busy} onClick={submit}>Settle return</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(
            [
              ["CREDIT_NOTE", "Credit note", "Reduce what you owe them"],
              ["REFUND", "Refund", "They paid money back"],
              ["REPLACEMENT", "Replacement", "They sent new goods"],
            ] as const
          ).map(([v, l, d]) => (
            <button
              key={v}
              type="button"
              onClick={() => setResolution(v)}
              className={`rounded-xl border p-3 text-left transition ${resolution === v ? "border-[#044d73] bg-[#044d73]/5 ring-1 ring-[#044d73]" : "border-slate-200 hover:border-slate-300"}`}
            >
              <div className="text-sm font-bold text-slate-800">{l}</div>
              <div className="text-xs text-slate-500">{d}</div>
            </button>
          ))}
        </div>
        {resolution === "CREDIT_NOTE" && <p className="text-sm text-slate-600">{money(ret.grandTotal)} will be taken off {ret.partyName}’s balance{ret.purchaseNumber ? ` and ${ret.purchaseNumber}’s amount due` : ""}.</p>}
        {resolution === "REFUND" && (
          <FormGrid cols={2}>
            <Field label="Amount received" required>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Method">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                {PAYMENT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Date">
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </Field>
            <Field label="Reference">
              <Input value={referenceNumber} onChange={(e) => setReference(e.target.value)} placeholder="Cheque / transaction no." />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
            </div>
          </FormGrid>
        )}
        {resolution === "REPLACEMENT" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">The same quantities come back into stock at the original cost.</p>
            {needsDetail.length === 0 ? null : (
              needsDetail.map((i) => {
                const d = repl[i.id];
                return (
                  <div key={i.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="mb-2 text-sm font-semibold text-slate-800">{i.displayName} <span className="font-normal text-slate-500">× {i.quantity}</span></div>
                    <FormGrid cols={3}>
                      {i.trackBatches && <Field label="New batch no."><Input value={d?.lotNumber ?? ""} onChange={(e) => setR(i.id, { lotNumber: e.target.value })} placeholder={i.lotNumber ?? ""} /></Field>}
                      {i.trackBatches && <Field label="Mfg date"><Input type="date" value={d?.manufacturingDate ?? ""} onChange={(e) => setR(i.id, { manufacturingDate: e.target.value })} /></Field>}
                      {i.trackExpiry && <Field label="Expiry" required><Input type="date" value={d?.expiryDate ?? ""} onChange={(e) => setR(i.id, { expiryDate: e.target.value })} /></Field>}
                    </FormGrid>
                    {i.trackSerials && (
                      <div className="mt-2">
                        <Field label={`New serial numbers (${i.quantity})`} hint="One per line, or separated by commas">
                          <Textarea rows={2} value={d?.serials ?? ""} onChange={(e) => setR(i.id, { serials: e.target.value })} />
                        </Field>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
