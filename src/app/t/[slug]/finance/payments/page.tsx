"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Wallet } from "lucide-react";
import { PartyFilterNote, PartyPaymentModal } from "@/components/party";
import { DateRangeInputs, FilterSelect, SearchInput } from "@/components/ui/form";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui/primitives";
import { DataTable, Pagination, TableCard } from "@/components/ui/table";
import { useList } from "@/lib/client/hooks";
import { PAYMENT_DIRECTION_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/client/labels";
import { useFmt, useSession } from "@/lib/client/session";

interface Row {
  id: string;
  number: string;
  direction: string;
  amount: number;
  method: string;
  paymentDate: string;
  referenceNumber: string | null;
  status: string;
  partyName: string | null;
  documentNumber: string | null;
  locationName: string;
}
interface Summary {
  moneyIn: number;
  moneyOut: number;
  net: number;
  byMethod: { method: string; moneyIn: number; moneyOut: number }[];
}

const isIn = (d: string) => d === "RECEIVED_FROM_CUSTOMER" || d === "REFUND_FROM_SUPPLIER";

export default function PaymentsPage() {
  const { base, can, readOnly } = useSession();
  const { money, date } = useFmt();
  const router = useRouter();
  const partyId = useSearchParams().get("partyId");
  const [adding, setAdding] = useState(false);
  const list = useList<Row, { search: string; direction: string; method: string; status: string; from: string; to: string }>(
    "/api/payments",
    { search: "", direction: "", method: "", status: "", from: "", to: "" },
    partyId ? { partyId } : undefined,
  );
  const { filters: f, set, setFilters } = list;
  const sum = list.data?.summary as Summary | undefined;
  const canManage = can("finance.manage") && !readOnly;
  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Money received from customers and paid to suppliers"
        actions={canManage && <Button icon={Plus} onClick={() => setAdding(true)}>Record payment</Button>}
      />
      {sum && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Money in" value={money(sum.moneyIn)} accent="green" />
          <StatCard label="Money out" value={money(sum.moneyOut)} accent="amber" />
          <StatCard label="Net" value={money(sum.net)} accent={sum.net >= 0 ? "green" : "red"} />
          <Card>
            <CardHeader title="By method" />
            <ul className="space-y-1 text-xs">
              {sum.byMethod.length === 0 && <li className="text-slate-400">No payments</li>}
              {sum.byMethod.map((m) => (
                <li key={m.method} className="flex justify-between">
                  <span className="text-slate-600">{PAYMENT_METHOD_LABELS[m.method] ?? m.method}</span>
                  <span className="font-semibold">{money(m.moneyIn - m.moneyOut)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
      {partyId && <PartyFilterNote partyId={partyId} />}
      <TableCard
        toolbar={
          <>
            <SearchInput className="w-full sm:w-56" value={f.search} onChange={(v) => set("search", v)} placeholder="Payment no., reference, party…" />
            <FilterSelect label="Type" value={f.direction} onChange={(v) => set("direction", v)} options={[{ value: "", label: "In & out" }, ...Object.entries(PAYMENT_DIRECTION_LABELS).map(([value, label]) => ({ value, label }))]} />
            <FilterSelect label="Method" value={f.method} onChange={(v) => set("method", v)} options={[{ value: "", label: "Any method" }, ...Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label }))]} />
            <FilterSelect label="Status" value={f.status} onChange={(v) => set("status", v)} options={[{ value: "", label: "Any status" }, { value: "POSTED", label: "Posted" }, { value: "VOID", label: "Void" }]} />
            <DateRangeInputs from={f.from} to={f.to} onChange={(r) => { setFilters((x) => ({ ...x, ...r })); list.setPage(1); }} />
          </>
        }
      >
        <DataTable
          rows={list.data?.items}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`${base}/finance/payments/${r.id}`)}
          empty={<EmptyState icon={Wallet} title="No payments found" description="Payments taken on sales and purchases appear here, along with ones you record against an account." />}
          columns={[
            { key: "n", header: "Payment", cell: (r) => <span className="font-semibold text-[#044d73]">{r.number}</span> },
            { key: "d", header: "Date", cell: (r) => date(r.paymentDate) },
            { key: "p", header: "Party", cell: (r) => r.partyName ?? <span className="text-slate-400">Walk-in</span> },
            { key: "t", header: "Type", hideBelow: "md", cell: (r) => <span className="text-slate-600">{PAYMENT_DIRECTION_LABELS[r.direction] ?? r.direction}</span> },
            { key: "m", header: "Method", hideBelow: "lg", cell: (r) => PAYMENT_METHOD_LABELS[r.method] ?? r.method },
            { key: "doc", header: "Against", hideBelow: "lg", cell: (r) => r.documentNumber ?? <span className="text-slate-400">On account</span> },
            {
              key: "a",
              header: "Amount",
              align: "right",
              cell: (r) => (
                <span className={`font-semibold ${r.status === "VOID" ? "text-slate-400 line-through" : isIn(r.direction) ? "text-emerald-700" : "text-amber-700"}`}>
                  {isIn(r.direction) ? "+" : "−"} {money(r.amount)}
                </span>
              ),
            },
            { key: "s", header: "", cell: (r) => r.status === "VOID" && <Badge tone="red">Void</Badge> },
          ]}
          footer={list.data && <Pagination page={list.page} totalPages={list.data.totalPages} total={list.data.total} onPage={list.setPage} />}
        />
      </TableCard>
      {adding && <PartyPaymentModal onClose={() => setAdding(false)} onDone={() => { setAdding(false); list.reload(); }} />}
    </div>
  );
}
