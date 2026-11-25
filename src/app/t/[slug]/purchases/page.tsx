"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { PartyFilterNote } from "@/components/party";
import { Plus, Truck } from "lucide-react";
import { DateRangeInputs, FilterSelect, SearchInput, Toggle } from "@/components/ui/form";
import { EmptyState, LinkButton, PageHeader, StatCard, StatusBadge } from "@/components/ui/primitives";
import { DataTable, Pagination, TableCard } from "@/components/ui/table";
import { useList } from "@/lib/client/hooks";
import { useFmt, useSession } from "@/lib/client/session";

interface Row {
  id: string;
  number: string;
  supplierInvoiceNumber: string | null;
  purchaseDate: string;
  dueDate: string | null;
  status: string;
  paymentStatus: string;
  grandTotal: number;
  paidAmount: number;
  partyName: string;
  locationName: string;
  itemCount: number;
}

export default function PurchasesPage() {
  const { base, can, readOnly, settings } = useSession();
  const { money, date } = useFmt();
  const router = useRouter();
  const partyId = useSearchParams().get("partyId");
  const list = useList<Row, { search: string; status: string; paymentStatus: string; overdue: string; from: string; to: string }>("/api/purchases", {
    search: "",
    status: "",
    paymentStatus: "",
    overdue: "",
    from: "",
    to: "",
  }, partyId ? { partyId } : undefined);
  const { filters: f, set, setFilters } = list;
  const canManage = can("purchases.manage") && !readOnly;
  const sum = (list.data as { summary?: { totalAmount: number; totalPaid: number } } | null)?.summary;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div>
      <PageHeader
        title="Purchases"
        subtitle="Goods received from suppliers and what you still owe them"
        actions={canManage && <LinkButton href={`${base}/purchases/new`} icon={Plus}>Record purchase</LinkButton>}
      />
      {sum && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Purchased" value={money(sum.totalAmount)} hint={`${list.data?.total ?? 0} bills`} />
          <StatCard label="Paid" value={money(sum.totalPaid)} accent="green" />
          <StatCard label="Unpaid" value={money(Math.max(0, sum.totalAmount - sum.totalPaid))} accent="amber" hint="Before supplier return credits" />
        </div>
      )}
      {partyId && <PartyFilterNote partyId={partyId} />}
      <TableCard
        toolbar={
          <>
            <SearchInput className="w-full sm:w-60" value={f.search} onChange={(v) => set("search", v)} placeholder="Bill, supplier invoice, supplier…" />
            <FilterSelect label="Payment" value={f.paymentStatus} onChange={(v) => set("paymentStatus", v)} options={[{ value: "", label: "Any payment" }, { value: "UNPAID", label: "Unpaid" }, { value: "PARTIAL", label: "Part paid" }, { value: "PAID", label: "Paid" }]} />
            <FilterSelect label="Status" value={f.status} onChange={(v) => set("status", v)} options={[{ value: "", label: "Any status" }, { value: "POSTED", label: "Posted" }, { value: "VOID", label: "Void" }]} />
            <DateRangeInputs from={f.from} to={f.to} onChange={(r) => { setFilters((x) => ({ ...x, ...r })); list.setPage(1); }} />
            <Toggle checked={f.overdue === "true"} onChange={(v) => set("overdue", v ? "true" : "")} label="Overdue only" />
          </>
        }
      >
        <DataTable
          rows={list.data?.items}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`${base}/purchases/${r.id}`)}
          empty={
            <EmptyState
              icon={Truck}
              title="No purchases found"
              description="Record goods received from a supplier to add stock and track what you owe."
              action={canManage && <LinkButton href={`${base}/purchases/new`} icon={Plus}>Record purchase</LinkButton>}
            />
          }
          columns={[
            {
              key: "n",
              header: "Bill",
              cell: (r) => (
                <div>
                  <div className="font-semibold text-[#044d73]">{r.number}</div>
                  {r.supplierInvoiceNumber && <div className="text-xs text-slate-400">Inv. {r.supplierInvoiceNumber}</div>}
                </div>
              ),
            },
            { key: "d", header: "Date", cell: (r) => date(r.purchaseDate) },
            { key: "p", header: "Supplier", cell: (r) => r.partyName },
            ...(settings.enableMultiLocation ? [{ key: "l", header: "Location", hideBelow: "lg" as const, cell: (r: Row) => r.locationName }] : []),
            {
              key: "due",
              header: "Due",
              hideBelow: "md",
              cell: (r) =>
                r.dueDate ? <span className={r.paymentStatus !== "PAID" && r.status === "POSTED" && r.dueDate < today ? "font-semibold text-rose-600" : ""}>{date(r.dueDate)}</span> : "—",
            },
            { key: "t", header: "Total", align: "right", cell: (r) => <span className="font-semibold">{money(r.grandTotal)}</span> },
            { key: "b", header: "Unpaid", align: "right", hideBelow: "md", cell: (r) => (r.status === "VOID" ? "—" : money(Math.max(0, r.grandTotal - r.paidAmount))) },
            { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status === "VOID" ? "VOID" : r.paymentStatus} /> },
          ]}
          footer={list.data && <Pagination page={list.page} totalPages={list.data.totalPages} total={list.data.total} onPage={list.setPage} />}
        />
      </TableCard>
    </div>
  );
}
