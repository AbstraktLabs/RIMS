"use client";

import { useRouter } from "next/navigation";
import { Plus, Undo2 } from "lucide-react";
import { DateRangeInputs, FilterSelect, SearchInput } from "@/components/ui/form";
import { EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { DataTable, Pagination, TableCard } from "@/components/ui/table";
import { useList } from "@/lib/client/hooks";
import { useFmt, useSession } from "@/lib/client/session";

interface Row {
  id: string;
  number: string;
  returnDate: string;
  status: string;
  resolution: string | null;
  grandTotal: number;
  reason: string | null;
  partyName: string;
  purchaseNumber: string | null;
  locationName: string;
}

export default function PurchaseReturnsPage() {
  const { base, can, readOnly } = useSession();
  const { money, date } = useFmt();
  const router = useRouter();
  const list = useList<Row, { search: string; status: string; from: string; to: string }>("/api/purchase-returns", { search: "", status: "", from: "", to: "" });
  const { filters: f, set, setFilters } = list;
  const canManage = can("purchases.manage") && !readOnly;
  return (
    <div>
      <PageHeader
        title="Returns to suppliers"
        subtitle="Damaged, expired or wrong goods sent back — settled by refund, credit note or replacement"
        actions={canManage && <LinkButton href={`${base}/purchase-returns/new`} icon={Plus}>New return</LinkButton>}
      />
      <TableCard
        toolbar={
          <>
            <SearchInput className="w-full sm:w-60" value={f.search} onChange={(v) => set("search", v)} placeholder="Return no., supplier…" />
            <FilterSelect label="Status" value={f.status} onChange={(v) => set("status", v)} options={[{ value: "", label: "Any status" }, { value: "PENDING", label: "Awaiting supplier" }, { value: "COMPLETED", label: "Settled" }, { value: "VOID", label: "Void" }]} />
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
          onRowClick={(r) => router.push(`${base}/purchase-returns/${r.id}`)}
          empty={
            <EmptyState
              icon={Undo2}
              title="No supplier returns"
              description="When goods go back to a supplier, record it here so stock and the supplier’s balance stay right."
              action={canManage && <LinkButton href={`${base}/purchase-returns/new`} icon={Plus}>New return</LinkButton>}
            />
          }
          columns={[
            { key: "n", header: "Return", cell: (r) => <span className="font-semibold text-[#044d73]">{r.number}</span> },
            { key: "d", header: "Date", cell: (r) => date(r.returnDate) },
            { key: "p", header: "Supplier", cell: (r) => r.partyName },
            { key: "b", header: "Purchase", hideBelow: "md", cell: (r) => r.purchaseNumber ?? "—" },
            { key: "r", header: "Reason", hideBelow: "lg", cell: (r) => <span className="text-slate-500">{r.reason ?? "—"}</span> },
            { key: "t", header: "Value", align: "right", cell: (r) => <span className="font-semibold">{money(r.grandTotal)}</span> },
            { key: "s", header: "Status", cell: (r) => (r.status === "COMPLETED" && r.resolution ? <StatusBadge status={r.resolution} /> : <StatusBadge status={r.status} />) },
          ]}
          footer={list.data && <Pagination page={list.page} totalPages={list.data.totalPages} total={list.data.total} onPage={list.setPage} />}
        />
      </TableCard>
    </div>
  );
}
