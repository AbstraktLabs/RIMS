"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { LocationSelect } from "@/components/pickers";
import { DateRangeInputs, FilterSelect, SearchInput } from "@/components/ui/form";
import { Badge, EmptyState, PageHeader, StatCard, type Tone } from "@/components/ui/primitives";
import { DataTable, Pagination, TableCard } from "@/components/ui/table";
import { useList } from "@/lib/client/hooks";
import { PAYMENT_DIRECTION_LABELS, PAYMENT_METHOD_LABELS, docHref } from "@/lib/client/labels";
import { STATUS_LABELS } from "@/components/ui/primitives";
import { useFmt, useSession } from "@/lib/client/session";

interface Row {
  type: string;
  id: string;
  number: string;
  date: string;
  createdAt: string;
  partyId: string | null;
  party: string | null;
  amount: number;
  flow: "IN" | "OUT" | "NONE";
  status: string;
  location: string;
  detail: string;
}

const TYPES: Record<string, { label: string; tone: Tone; doc: string }> = {
  SALE: { label: "Sale", tone: "green", doc: "SALE" },
  SALE_RETURN: { label: "Sale return", tone: "amber", doc: "SALE_RETURN" },
  PURCHASE: { label: "Purchase", tone: "blue", doc: "PURCHASE" },
  PURCHASE_RETURN: { label: "Supplier return", tone: "violet", doc: "PURCHASE_RETURN" },
  PAYMENT: { label: "Payment", tone: "slate", doc: "PAYMENT" },
  INCOME: { label: "Income", tone: "green", doc: "FINANCE_ENTRY" },
  EXPENSE: { label: "Expense", tone: "red", doc: "FINANCE_ENTRY" },
  ADJUSTMENT: { label: "Adjustment", tone: "slate", doc: "ADJUSTMENT" },
  TRANSFER: { label: "Transfer", tone: "slate", doc: "TRANSFER" },
};

/** Turns enum codes in the detail line ("RECEIVED_FROM_CUSTOMER · CASH") into words. */
function readable(detail: string): string {
  return detail
    .split(" · ")
    .map((part) =>
      /^[A-Z][A-Z0-9_]+$/.test(part)
        ? PAYMENT_DIRECTION_LABELS[part] ?? PAYMENT_METHOD_LABELS[part] ?? STATUS_LABELS[part] ?? part.charAt(0) + part.slice(1).toLowerCase().replace(/_/g, " ")
        : part,
    )
    .join(" · ");
}

export default function TransactionsPage() {
  const { base, settings } = useSession();
  const { money, date } = useFmt();
  const router = useRouter();
  const list = useList<Row, { type: string; search: string; locationId: string; from: string; to: string }>("/api/transactions", { type: "", search: "", locationId: "all", from: "", to: "" });
  const { filters: f, set, setFilters } = list;
  const data = list.data as (typeof list.data & { summary?: { in: number; out: number; net: number }; range?: { from: string; to: string } }) | null;
  const sum = data?.summary;
  return (
    <div>
      <PageHeader title="All transactions" subtitle={data?.range ? `Everything that happened from ${date(data.range.from)} to ${date(data.range.to)}` : "Everything that happened, in one place"} />
      {sum && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Money in" value={money(sum.in)} accent="green" />
          <StatCard label="Money out" value={money(sum.out)} accent="amber" />
          <StatCard label="Net" value={money(sum.net)} accent={sum.net >= 0 ? "green" : "red"} />
        </div>
      )}
      <TableCard
        toolbar={
          <>
            <SearchInput className="w-full sm:w-56" value={f.search} onChange={(v) => set("search", v)} placeholder="Number, party, detail…" />
            <FilterSelect label="Type" value={f.type} onChange={(v) => set("type", v)} options={[{ value: "", label: "All types" }, ...Object.entries(TYPES).map(([value, t]) => ({ value, label: t.label }))]} />
            {settings.enableMultiLocation && <div className="w-44"><LocationSelect includeAll value={f.locationId} onChange={(v) => set("locationId", v)} /></div>}
            <DateRangeInputs from={f.from} to={f.to} onChange={(r) => { setFilters((x) => ({ ...x, ...r })); list.setPage(1); }} />
          </>
        }
      >
        <DataTable
          rows={list.data?.items}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          rowKey={(r) => `${r.type}:${r.id}`}
          onRowClick={(r) => {
            const href = docHref(base, TYPES[r.type]?.doc ?? r.type, r.id);
            if (href) router.push(href);
          }}
          empty={<EmptyState icon={ArrowLeftRight} title="No transactions in this period" description="Try a wider date range." />}
          columns={[
            { key: "d", header: "Date", cell: (r) => <span className="whitespace-nowrap">{date(r.date)}</span> },
            { key: "t", header: "Type", cell: (r) => <Badge tone={TYPES[r.type]?.tone ?? "slate"}>{TYPES[r.type]?.label ?? r.type}</Badge> },
            {
              key: "n",
              header: "Details",
              cell: (r) => (
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800">{r.number || readable(r.detail)}</div>
                  {r.number && r.detail && <div className="truncate text-xs text-slate-500">{readable(r.detail)}</div>}
                </div>
              ),
            },
            { key: "p", header: "Party", hideBelow: "md", cell: (r) => r.party ?? "—" },
            ...(settings.enableMultiLocation ? [{ key: "l", header: "Location", hideBelow: "lg" as const, cell: (r: Row) => r.location }] : []),
            {
              key: "a",
              header: "Amount",
              align: "right",
              cell: (r) => (
                <span className={`font-semibold ${r.status === "VOID" ? "text-slate-400 line-through" : r.flow === "IN" ? "text-emerald-700" : r.flow === "OUT" ? "text-amber-700" : "text-slate-700"}`}>
                  {r.flow === "IN" ? "+ " : r.flow === "OUT" ? "− " : ""}
                  {money(r.amount)}
                </span>
              ),
            },
            { key: "s", header: "", cell: (r) => r.status === "VOID" && <Badge tone="red">Void</Badge> },
          ]}
          footer={list.data && <Pagination page={list.page} totalPages={list.data.totalPages} total={list.data.total} onPage={list.setPage} />}
        />
      </TableCard>
    </div>
  );
}
