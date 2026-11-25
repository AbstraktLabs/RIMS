"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { PARTY_TYPE_LABELS, PartyFormModal, type PartyType } from "@/components/party";
import { FilterSelect, SearchInput } from "@/components/ui/form";
import { Badge, Button, EmptyState, PageHeader, StatCard, Tabs } from "@/components/ui/primitives";
import { DataTable, Pagination, TableCard } from "@/components/ui/table";
import { useList } from "@/lib/client/hooks";
import { useFmt, useSession } from "@/lib/client/session";
import type { PartyRow } from "@/lib/client/types";

export default function PartiesPage() {
  const { base, can, readOnly } = useSession();
  const { money } = useFmt();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const list = useList<PartyRow, { search: string; type: string; balance: string; status: string; sort: string }>("/api/parties", {
    search: "",
    type: "",
    balance: "",
    status: "active",
    sort: "name",
  });
  const { filters: f, set } = list;
  const canManage = can("parties.manage") && !readOnly;
  const sum = (list.data as { summary?: { receivable: number; payable: number } } | null)?.summary;
  const addType: PartyType = f.type === "SUPPLIER" ? "SUPPLIER" : "CUSTOMER";

  return (
    <div>
      <PageHeader
        title="Customers & suppliers"
        subtitle="Everyone you sell to or buy from, with what they owe and what you owe them"
        actions={canManage && <Button icon={Plus} onClick={() => setAdding(true)}>Add {f.type === "SUPPLIER" ? "supplier" : f.type === "CUSTOMER" ? "customer" : "contact"}</Button>}
      />
      {sum && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard label="Customers owe you" value={money(sum.receivable)} accent="green" hint="Receivable" />
          <StatCard label="You owe suppliers" value={money(sum.payable)} accent="amber" hint="Payable" />
        </div>
      )}
      <div className="mb-4">
        <Tabs value={f.type} onChange={(v) => set("type", v)} tabs={[{ value: "", label: "All" }, { value: "CUSTOMER", label: "Customers" }, { value: "SUPPLIER", label: "Suppliers" }]} />
      </div>
      <TableCard
        toolbar={
          <>
            <SearchInput className="w-full sm:w-64" value={f.search} onChange={(v) => set("search", v)} placeholder="Name, phone, code, tax ID…" />
            <FilterSelect label="Balance" value={f.balance} onChange={(v) => set("balance", v)} options={[{ value: "", label: "Any balance" }, { value: "receivable", label: "Owes you" }, { value: "payable", label: "You owe" }, { value: "settled", label: "Settled" }]} />
            <FilterSelect label="Status" value={f.status} onChange={(v) => set("status", v)} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "all", label: "All" }]} />
            <FilterSelect label="Sort" value={f.sort} onChange={(v) => set("sort", v)} options={[{ value: "name", label: "Name" }, { value: "-balance", label: "Owes you most" }, { value: "balance", label: "You owe most" }, { value: "-createdAt", label: "Newest" }]} />
          </>
        }
      >
        <DataTable
          rows={list.data?.items}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`${base}/parties/${r.id}`)}
          empty={
            <EmptyState
              icon={Users}
              title={f.search ? "No one matches that search" : "No customers or suppliers yet"}
              description="Add the people you buy from and sell to on credit so you can track balances and statements."
              action={canManage && <Button icon={Plus} onClick={() => setAdding(true)}>Add contact</Button>}
            />
          }
          columns={[
            {
              key: "n",
              header: "Name",
              cell: (r) => (
                <div>
                  <div className="font-semibold text-slate-800">{r.name} {!r.isActive && <Badge>Inactive</Badge>}</div>
                  {r.code && <div className="text-xs text-slate-400">{r.code}</div>}
                </div>
              ),
            },
            { key: "t", header: "Type", hideBelow: "md", cell: (r) => <Badge tone={r.partyType === "SUPPLIER" ? "violet" : r.partyType === "BOTH" ? "blue" : "slate"}>{PARTY_TYPE_LABELS[r.partyType]}</Badge> },
            { key: "p", header: "Phone", hideBelow: "sm", cell: (r) => r.phone ?? "—" },
            { key: "c", header: "Credit limit", align: "right", hideBelow: "lg", cell: (r) => (r.creditLimit === null ? "—" : money(r.creditLimit)) },
            {
              key: "b",
              header: "Balance",
              align: "right",
              cell: (r) =>
                Math.abs(r.balance) < 0.005 ? (
                  <span className="text-slate-400">Settled</span>
                ) : r.balance > 0 ? (
                  <span className="font-semibold text-emerald-700" title="They owe you">{money(r.balance)} <span className="text-[10px] font-bold">DR</span></span>
                ) : (
                  <span className="font-semibold text-amber-700" title="You owe them">{money(-r.balance)} <span className="text-[10px] font-bold">CR</span></span>
                ),
            },
          ]}
          footer={list.data && <Pagination page={list.page} totalPages={list.data.totalPages} total={list.data.total} onPage={list.setPage} />}
        />
      </TableCard>
      {adding && <PartyFormModal defaultType={addType} onClose={() => setAdding(false)} onSaved={(p) => router.push(`${base}/parties/${p.id}`)} />}
    </div>
  );
}
