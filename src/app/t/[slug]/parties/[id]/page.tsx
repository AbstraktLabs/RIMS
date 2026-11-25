"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Mail, MapPin, Pencil, Phone, Printer, ShoppingCart, Truck, Wallet } from "lucide-react";
import { PARTY_TYPE_LABELS, PartyFormModal, PartyPaymentModal, type PartyDetail } from "@/components/party";
import { PrintHeader } from "@/components/print-header";
import { DateRangeInputs } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/modal";
import { Alert, Badge, Button, Card, CardHeader, DetailList, EmptyState, ErrorState, LinkButton, LoadingBlock, PageHeader, StatCard } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { del } from "@/lib/client/api";
import { useAction, useApi } from "@/lib/client/hooks";
import { docHref } from "@/lib/client/labels";
import { useFmt, useSession } from "@/lib/client/session";

interface Ledger {
  from: string | null;
  to: string | null;
  openingBalance: number;
  entries: { date: string; type: string; documentId: string | null; number: string; description: string; debit: number; credit: number; balance: number }[];
  totals: { debit: number; credit: number };
  closingBalance: number;
}

const LEDGER_TYPES: Record<string, string> = {
  OPENING: "Opening balance",
  SALE: "Sale",
  SALE_RETURN: "Sale return",
  PURCHASE: "Purchase",
  PURCHASE_RETURN: "Return to supplier",
  PAYMENT: "Payment",
  FINANCE_ENTRY: "Income / expense",
};

function Bal({ v }: { v: number }) {
  const { money } = useFmt();
  if (Math.abs(v) < 0.005) return <span className="text-slate-400">0</span>;
  return v > 0 ? <span>{money(v)} <span className="text-[10px] font-bold text-emerald-700">DR</span></span> : <span>{money(-v)} <span className="text-[10px] font-bold text-amber-700">CR</span></span>;
}

export default function PartyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { base, can, readOnly } = useSession();
  const { money, date } = useFmt();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useApi<{ party: PartyDetail }>(`/api/parties/${id}`);
  const [range, setRange] = useState({ from: "", to: "" });
  const ledger = useApi<Ledger>(`/api/parties/${id}/ledger`, { from: range.from || undefined, to: range.to || undefined });
  const [modal, setModal] = useState<"edit" | "pay" | "delete" | null>(null);
  const action = useAction();
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (loading && !data) return <LoadingBlock />;
  if (!data) return null;
  const p = data.party;
  const canManage = can("parties.manage") && !readOnly;
  const canPay = can("finance.manage") && !readOnly;
  const isCustomer = p.partyType !== "SUPPLIER";
  const isSupplier = p.partyType !== "CUSTOMER";
  const refresh = () => { reload(); ledger.reload(); };

  return (
    <div>
      <PageHeader
        back={{ href: `${base}/parties`, label: "Customers & suppliers" }}
        title={<span className="flex flex-wrap items-center gap-2">{p.name} <Badge tone={p.partyType === "SUPPLIER" ? "violet" : p.partyType === "BOTH" ? "blue" : "slate"}>{PARTY_TYPE_LABELS[p.partyType]}</Badge>{!p.isActive && <Badge tone="red">Inactive</Badge>}</span>}
        subtitle={[p.code, p.contactPerson, p.paymentTerms].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print statement</Button>
            {canPay && <Button icon={Wallet} onClick={() => setModal("pay")}>Record payment</Button>}
            {isCustomer && can("sales.manage") && !readOnly && <LinkButton variant="secondary" icon={ShoppingCart} href={`${base}/sales/new?partyId=${p.id}`}>New invoice</LinkButton>}
            {isSupplier && can("purchases.manage") && !readOnly && <LinkButton variant="secondary" icon={Truck} href={`${base}/purchase-orders/new?partyId=${p.id}`}>New order</LinkButton>}
            {canManage && <Button variant="ghost" icon={Pencil} onClick={() => setModal("edit")}>Edit</Button>}
            {canManage && <Button variant="ghost" icon={Archive} onClick={() => setModal("delete")}>Delete</Button>}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 print:hidden">
        <StatCard
          label={p.balance > 0.004 ? "They owe you" : p.balance < -0.004 ? "You owe them" : "Balance"}
          value={money(Math.abs(p.balance))}
          accent={p.balance > 0.004 ? "green" : p.balance < -0.004 ? "amber" : "primary"}
          hint={p.balanceType === "SETTLED" ? "All settled" : p.balanceType === "RECEIVABLE" ? "Receivable" : "Payable"}
        />
        {isCustomer && (
          <StatCard label="Credit available" value={p.creditLimit === null ? "No limit" : money(p.availableCredit ?? 0)} hint={p.creditLimit === null ? undefined : `Limit ${money(p.creditLimit)}`} />
        )}
        {isCustomer && <StatCard label="Sales" value={money(p.stats.salesTotal)} hint={`${p.stats.salesCount} invoices${p.stats.unpaidSales ? ` · ${p.stats.unpaidSales} unpaid` : ""}`} />}
        {isSupplier && <StatCard label="Purchases" value={money(p.stats.purchasesTotal)} hint={`${p.stats.purchasesCount} bills${p.stats.unpaidPurchases ? ` · ${p.stats.unpaidPurchases} unpaid` : ""}`} />}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card padded={false} className="xl:col-span-2 print:border-0 print:shadow-none">
          <div className="p-4 sm:p-5">
            <PrintHeader title="Statement of account" number={p.name} meta={[["Period", range.from || range.to ? `${range.from ? date(range.from) : "Start"} – ${range.to ? date(range.to) : "Today"}` : "All time"]]} />
            <CardHeader
              title="Account ledger"
              subtitle="Every invoice, bill, return and payment in date order"
              actions={<div className="print:hidden"><DateRangeInputs from={range.from} to={range.to} onChange={(r) => setRange((x) => ({ ...x, ...r }))} /></div>}
            />
          </div>
          {ledger.error ? (
            <ErrorState message={ledger.error} onRetry={ledger.reload} />
          ) : !ledger.data ? (
            <LoadingBlock />
          ) : (
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 sm:pl-5">Date</th>
                    <th className="px-3 py-2.5">Details</th>
                    <th className="px-3 py-2.5 text-right">Debit</th>
                    <th className="px-3 py-2.5 text-right">Credit</th>
                    <th className="px-4 py-2.5 text-right sm:pr-5">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(ledger.data.from || ledger.data.openingBalance !== 0) && (
                    <tr className="bg-slate-50/50">
                      <td className="px-4 py-2.5 text-slate-500 sm:pl-5">{ledger.data.from ? date(ledger.data.from) : ""}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-600" colSpan={3}>Balance brought forward</td>
                      <td className="px-4 py-2.5 text-right font-semibold sm:pr-5"><Bal v={ledger.data.openingBalance} /></td>
                    </tr>
                  )}
                  {ledger.data.entries.length === 0 && (
                    <tr><td colSpan={5}><EmptyState title="No activity in this period" className="py-10" /></td></tr>
                  )}
                  {ledger.data.entries.map((e, i) => {
                    const href = docHref(base, e.type, e.documentId);
                    return (
                      <tr key={i}>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-600 sm:pl-5">{date(e.date)}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-slate-800">
                            {href ? <Link href={href} className="text-[#044d73] hover:underline print:text-slate-800 print:no-underline">{e.number || LEDGER_TYPES[e.type]}</Link> : e.number || LEDGER_TYPES[e.type] || e.type}
                          </div>
                          <div className="text-xs text-slate-500">{e.description || LEDGER_TYPES[e.type]}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right">{e.debit ? money(e.debit) : ""}</td>
                        <td className="px-3 py-2.5 text-right">{e.credit ? money(e.credit) : ""}</td>
                        <td className="px-4 py-2.5 text-right font-semibold sm:pr-5"><Bal v={e.balance} /></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                  <tr>
                    <td className="px-4 py-2.5 sm:pl-5" colSpan={2}>Closing balance</td>
                    <td className="px-3 py-2.5 text-right">{money(ledger.data.totals.debit)}</td>
                    <td className="px-3 py-2.5 text-right">{money(ledger.data.totals.credit)}</td>
                    <td className="px-4 py-2.5 text-right sm:pr-5"><Bal v={ledger.data.closingBalance} /></td>
                  </tr>
                </tfoot>
              </table>
              <p className="px-5 py-3 text-xs text-slate-400">DR = they owe you · CR = you owe them</p>
            </div>
          )}
        </Card>
        <div className="space-y-6 print:hidden">
          <Card>
            <CardHeader title="Contact" />
            <ul className="space-y-2 text-sm text-slate-700">
              {p.phone && <li className="flex items-center gap-2"><Phone className="size-4 text-slate-400" /><a href={`tel:${p.phone}`} className="hover:underline">{p.phone}</a></li>}
              {p.email && <li className="flex items-center gap-2"><Mail className="size-4 text-slate-400" /><a href={`mailto:${p.email}`} className="hover:underline">{p.email}</a></li>}
              {p.address && <li className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" /><span className="whitespace-pre-line">{p.address}</span></li>}
              {!p.phone && !p.email && !p.address && <li className="text-slate-400">No contact details yet.</li>}
            </ul>
          </Card>
          <Card>
            <DetailList
              items={[
                ["Tax ID", p.taxId ?? "—"],
                ["Payment terms", p.paymentTerms ?? "—"],
                ["Opening balance", p.openingBalance ? `${money(p.openingBalance)} ${p.openingBalanceType}` : "—"],
                ...(isCustomer ? ([["Last sale", p.stats.lastSaleAt ? date(p.stats.lastSaleAt) : "—"]] as [string, React.ReactNode][]) : []),
                ...(isSupplier ? ([["Last purchase", p.stats.lastPurchaseAt ? date(p.stats.lastPurchaseAt) : "—"]] as [string, React.ReactNode][]) : []),
                ["Added", date(p.createdAt)],
              ]}
            />
            {p.notes && <p className="mt-3 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{p.notes}</p>}
          </Card>
          <Card>
            <CardHeader title="Documents" />
            <div className="flex flex-wrap gap-2">
              {isCustomer && <LinkButton size="sm" variant="secondary" href={`${base}/sales?partyId=${p.id}`}>Sales</LinkButton>}
              {isSupplier && <LinkButton size="sm" variant="secondary" href={`${base}/purchases?partyId=${p.id}`}>Purchases</LinkButton>}
              <LinkButton size="sm" variant="secondary" href={`${base}/finance/payments?partyId=${p.id}`}>Payments</LinkButton>
            </div>
          </Card>
        </div>
      </div>
      {modal === "edit" && <PartyFormModal party={p} onClose={() => setModal(null)} onSaved={(x) => { setData({ party: x }); setModal(null); ledger.reload(); }} />}
      {modal === "pay" && <PartyPaymentModal party={p} onClose={() => setModal(null)} onDone={() => { setModal(null); refresh(); }} />}
      {modal === "delete" && (
        <ConfirmDialog
          open
          onClose={() => setModal(null)}
          title={`Delete ${p.name}?`}
          message={<>If they have any invoices, bills or payments they’ll be marked inactive instead, so their history stays intact.</>}
          confirmLabel="Delete"
          danger
          busy={action.busy}
          error={action.error}
          onConfirm={() =>
            action.run(async () => {
              const r = await del<{ deleted: boolean; archived: boolean }>(`/api/parties/${p.id}`);
              toast(r.archived ? "Marked inactive — they have history" : "Deleted");
              if (r.archived) { setModal(null); reload(); } else router.push(`${base}/parties`);
            })
          }
        />
      )}
      {!p.isActive && <div className="mt-4 print:hidden"><Alert tone="amber">This contact is inactive and won’t appear in pickers. Edit them to reactivate.</Alert></div>}
    </div>
  );
}
