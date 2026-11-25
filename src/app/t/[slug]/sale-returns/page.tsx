"use client";

import { useRouter } from "next/navigation";
import { Plus, Undo2 } from "lucide-react";
import { DateRangeInputs, FilterSelect, SearchInput } from "@/components/ui/form";
import { Badge, EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { DataTable, Pagination, TableCard } from "@/components/ui/table";
import { useList } from "@/lib/client/hooks";
import { useFmt, useSession } from "@/lib/client/session";

interface Row {
  id: string;
  number: string;
  returnDate: string;
  status: string;
  resolution: "REFUND" | "STORE_CREDIT";
  grandTotal: number;
  reason: string | null;
  invoiceNumber: string;
  customerName: string;
}

export default function SaleReturnsPage() {
  const { base, can, readOnly } = useSession();
  const { money, date } = useFmt();
  const router = useRouter();
  const list = useList<Row, { search: string; status: string; from: string; to: string }>("/api/sale-returns", { search: "", status: "", from: "", to: "" });
  const { filters: f, set, setFilters } = list;
  return (
    <div>
      <PageHeader
        title="Sale returns"
        subtitle="Goods customers brought back, refunds and store credit"
        actions={can("sales.manage") && !readOnly && <LinkButton href={`${base}/sale-returns/new`} icon={Plus}>New return</LinkButton>}
      />
      <TableCard
        toolbar={
          <>
            <SearchInput className="w-full sm:w-60" value={f.search} onChange={(v) => set("search", v)} placeholder="Return / invoice no. or customer…" />
            <FilterSelect label="Status" value={f.status} onChange={(v) => set("status", v)} options={[{ value: "", label: "Posted & void" }, { value: "POSTED", label: "Posted" }, { value: "VOID", label: "Void" }]} />
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
          onRowClick={(r) => router.push(`${base}/sale-returns/${r.id}`)}
          empty={<EmptyState icon={Undo2} title="No returns" description="Start a return from the sale’s invoice page or with “New return”." />}
          columns={[
            { key: "n", header: "Return", cell: (r) => <span className="font-semibold text-[#044d73]">{r.number}</span> },
            { key: "d", header: "Date", cell: (r) => date(r.returnDate) },
            { key: "i", header: "Invoice", cell: (r) => r.invoiceNumber },
            { key: "c", header: "Customer", hideBelow: "md", cell: (r) => r.customerName },
            { key: "r", header: "Resolution", hideBelow: "sm", cell: (r) => <Badge tone={r.resolution === "REFUND" ? "amber" : "blue"}>{r.resolution === "REFUND" ? "Refund" : "Store credit"}</Badge> },
            { key: "t", header: "Amount", align: "right", cell: (r) => <span className={r.status === "VOID" ? "text-slate-400 line-through" : "font-semibold"}>{money(r.grandTotal)}</span> },
            { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
          ]}
          footer={list.data && <Pagination page={list.page} totalPages={list.data.totalPages} total={list.data.total} onPage={list.setPage} />}
        />
      </TableCard>
    </div>
  );
}
