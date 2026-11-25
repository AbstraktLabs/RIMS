"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, Printer } from "lucide-react";
import { PrintHeader } from "@/components/print-header";
import { SearchInput } from "@/components/ui/form";
import { Badge, Button, EmptyState, PageHeader, Tabs } from "@/components/ui/primitives";
import { DataTable, Pagination, TableCard } from "@/components/ui/table";
import { useList } from "@/lib/client/hooks";
import { useFmt, useSession } from "@/lib/client/session";

interface Row {
  id: string;
  number: string;
  date: string;
  dueDate: string | null;
  partyId: string | null;
  partyName: string;
  total: number;
  paid: number;
  due: number;
  daysOverdue: number;
}
interface Summary {
  totalDue: number;
  ageing: { current: number; d1_30: number; d31_60: number; d61_90: number; d90plus: number };
}

const BUCKETS: [keyof Summary["ageing"], string, string][] = [
  ["current", "Not yet due", "text-slate-800"],
  ["d1_30", "1–30 days late", "text-amber-600"],
  ["d31_60", "31–60 days", "text-orange-600"],
  ["d61_90", "61–90 days", "text-rose-600"],
  ["d90plus", "90+ days", "text-rose-700"],
];

export default function OutstandingPage() {
  const { base } = useSession();
  const { money, date } = useFmt();
  const router = useRouter();
  const list = useList<Row, { type: "receivables" | "payables"; search: string }>("/api/finance/outstanding", { type: "receivables", search: "" });
  const { filters: f, set } = list;
  const sum = list.data?.summary as Summary | undefined;
  const recv = f.type === "receivables";
  return (
    <div>
      <PageHeader
        title="Outstanding"
        subtitle="Unpaid invoices and bills, by how late they are"
        actions={<Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print / PDF</Button>}
      />
      <PrintHeader title={recv ? "Receivables ageing" : "Payables ageing"} number="" meta={[["As of", date(new Date().toISOString())]]} />
      <div className="mb-4 print:hidden">
        <Tabs value={f.type} onChange={(v) => set("type", v)} tabs={[{ value: "receivables", label: "Customers owe you" }, { value: "payables", label: "You owe suppliers" }]} />
      </div>
      {sum && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total</div>
            <div className="mt-1 text-xl font-bold text-[#044d73]">{money(sum.totalDue)}</div>
          </div>
          {BUCKETS.map(([k, label, cls]) => (
            <div key={k} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
              <div className={`mt-1 text-lg font-bold ${sum.ageing[k] > 0 ? cls : "text-slate-300"}`}>{money(sum.ageing[k])}</div>
            </div>
          ))}
        </div>
      )}
      <TableCard toolbar={<SearchInput className="w-full sm:w-64" value={f.search} onChange={(v) => set("search", v)} placeholder={recv ? "Invoice no. or customer…" : "Bill no. or supplier…"} />}>
        <DataTable
          rows={list.data?.items}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`${base}/${recv ? "sales" : "purchases"}/${r.id}`)}
          empty={<EmptyState icon={CheckCircle2} title={recv ? "No unpaid invoices" : "No unpaid bills"} description={recv ? "Every customer is paid up." : "You’re all paid up with your suppliers."} />}
          columns={[
            { key: "n", header: recv ? "Invoice" : "Bill", cell: (r) => <span className="font-semibold text-[#044d73]">{r.number}</span> },
            { key: "d", header: "Date", cell: (r) => date(r.date) },
            {
              key: "p",
              header: recv ? "Customer" : "Supplier",
              cell: (r) =>
                r.partyId ? (
                  <button type="button" className="text-left hover:underline" onClick={(e) => { e.stopPropagation(); router.push(`${base}/parties/${r.partyId}`); }}>{r.partyName}</button>
                ) : (
                  r.partyName
                ),
            },
            { key: "due", header: "Due date", hideBelow: "md", cell: (r) => (r.dueDate ? date(r.dueDate) : "—") },
            { key: "t", header: "Total", align: "right", hideBelow: "lg", cell: (r) => money(r.total) },
            { key: "pd", header: "Paid", align: "right", hideBelow: "lg", cell: (r) => money(r.paid) },
            { key: "b", header: "Outstanding", align: "right", cell: (r) => <span className="font-semibold">{money(r.due)}</span> },
            { key: "o", header: "", cell: (r) => (r.daysOverdue > 0 ? <Badge tone={r.daysOverdue > 60 ? "red" : "amber"}>{r.daysOverdue}d late</Badge> : <Badge tone="green">Current</Badge>) },
          ]}
          footer={list.data && <Pagination page={list.page} totalPages={list.data.totalPages} total={list.data.total} onPage={list.setPage} />}
        />
      </TableCard>
    </div>
  );
}
