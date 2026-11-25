"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Minus, Plus, Tags } from "lucide-react";
import { CategoriesModal, EntryModal, type FinanceCategory, type FinanceEntry } from "@/components/finance";
import { ShareBars } from "@/components/ui/charts";
import { DateRangeInputs, FilterSelect, SearchInput } from "@/components/ui/form";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, StatCard, Tabs } from "@/components/ui/primitives";
import { DataTable, Pagination, TableCard } from "@/components/ui/table";
import { useApi, useList } from "@/lib/client/hooks";
import { PAYMENT_METHOD_LABELS } from "@/lib/client/labels";
import { useFmt, useSession } from "@/lib/client/session";

interface Summary {
  income: number;
  expense: number;
  net: number;
  byCategory: { kind: string; categoryName: string; amount: number }[];
}

export default function EntriesPage() {
  const { base, can, readOnly } = useSession();
  const { money, date } = useFmt();
  const router = useRouter();
  const [modal, setModal] = useState<"INCOME" | "EXPENSE" | "categories" | null>(null);
  const list = useList<FinanceEntry, { kind: string; categoryId: string; search: string; from: string; to: string }>("/api/finance/entries", { kind: "", categoryId: "", search: "", from: "", to: "" });
  const cats = useApi<{ items: FinanceCategory[] }>("/api/finance/categories");
  const { filters: f, set, setFilters } = list;
  const sum = list.data?.summary as Summary | undefined;
  const canManage = can("finance.manage") && !readOnly;
  const catOptions = (cats.data?.items ?? []).filter((c) => !f.kind || c.kind === f.kind);
  const expenseCats = (sum?.byCategory ?? []).filter((c) => c.kind === "EXPENSE").sort((a, b) => b.amount - a.amount);

  return (
    <div>
      <PageHeader
        title="Income & expenses"
        subtitle="Rent, salaries, utilities and other money that isn’t a sale or purchase"
        actions={
          <>
            <Button variant="ghost" icon={Tags} onClick={() => setModal("categories")}>Categories</Button>
            {canManage && <Button variant="secondary" icon={Plus} onClick={() => setModal("INCOME")}>Income</Button>}
            {canManage && <Button icon={Minus} onClick={() => setModal("EXPENSE")}>Expense</Button>}
          </>
        }
      />
      {sum && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Other income" value={money(sum.income)} accent="green" />
          <StatCard label="Expenses" value={money(sum.expense)} accent="amber" />
          <StatCard label="Net" value={money(sum.net)} accent={sum.net >= 0 ? "green" : "red"} />
          <Card>
            <CardHeader title="Biggest expenses" />
            {expenseCats.length ? <ShareBars items={expenseCats.slice(0, 4).map((c) => ({ label: c.categoryName, value: c.amount }))} format={money} /> : <p className="text-xs text-slate-400">No expenses in this period</p>}
          </Card>
        </div>
      )}
      <div className="mb-4">
        <Tabs value={f.kind} onChange={(v) => { setFilters((x) => ({ ...x, kind: v, categoryId: "" })); list.setPage(1); }} tabs={[{ value: "", label: "All" }, { value: "EXPENSE", label: "Expenses" }, { value: "INCOME", label: "Income" }]} />
      </div>
      <TableCard
        toolbar={
          <>
            <SearchInput className="w-full sm:w-56" value={f.search} onChange={(v) => set("search", v)} placeholder="Description or reference…" />
            <FilterSelect label="Category" value={f.categoryId} onChange={(v) => set("categoryId", v)} options={[{ value: "", label: "All categories" }, ...catOptions.map((c) => ({ value: c.id, label: c.name }))]} />
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
          onRowClick={(r) => router.push(`${base}/finance/entries/${r.id}`)}
          empty={
            <EmptyState
              icon={FileText}
              title="Nothing recorded"
              description="Record shop expenses like rent, wages and electricity so profit & loss shows the real picture."
              action={canManage && <Button icon={Minus} onClick={() => setModal("EXPENSE")}>Record expense</Button>}
            />
          }
          columns={[
            { key: "d", header: "Date", cell: (r) => date(r.entryDate) },
            {
              key: "desc",
              header: "Description",
              cell: (r) => (
                <div>
                  <div className="font-semibold text-slate-800">{r.description}</div>
                  {(r.partyName || r.referenceNumber) && <div className="text-xs text-slate-400">{[r.partyName, r.referenceNumber].filter(Boolean).join(" · ")}</div>}
                </div>
              ),
            },
            { key: "c", header: "Category", hideBelow: "md", cell: (r) => <Badge tone={r.kind === "INCOME" ? "green" : "slate"}>{r.categoryName ?? "Uncategorised"}</Badge> },
            { key: "m", header: "Method", hideBelow: "lg", cell: (r) => PAYMENT_METHOD_LABELS[r.method] ?? r.method },
            {
              key: "a",
              header: "Amount",
              align: "right",
              cell: (r) => <span className={`font-semibold ${r.kind === "INCOME" ? "text-emerald-700" : "text-amber-700"}`}>{r.kind === "INCOME" ? "+" : "−"} {money(r.amount)}</span>,
            },
          ]}
          footer={list.data && <Pagination page={list.page} totalPages={list.data.totalPages} total={list.data.total} onPage={list.setPage} />}
        />
      </TableCard>
      {(modal === "INCOME" || modal === "EXPENSE") && <EntryModal kind={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); list.reload(); }} />}
      {modal === "categories" && <CategoriesModal readOnly={!canManage} onClose={() => { setModal(null); cats.reload(); }} />}
    </div>
  );
}
