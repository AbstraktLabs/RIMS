"use client";

import { useRouter } from "next/navigation";
import { ClipboardList, Plus } from "lucide-react";
import { DateRangeInputs, FilterSelect, SearchInput } from "@/components/ui/form";
import { EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { DataTable, Pagination, TableCard } from "@/components/ui/table";
import { useList } from "@/lib/client/hooks";
import { useFmt, useSession } from "@/lib/client/session";

interface Row {
  id: string;
  number: string;
  status: string;
  orderDate: string;
  expectedDate: string | null;
  partyName: string;
  grandTotal: number;
  itemCount?: number;
  locationName?: string;
}

export default function PurchaseOrdersPage() {
  const { base, can, readOnly } = useSession();
  const { money, date } = useFmt();
  const router = useRouter();
  const list = useList<Row, { search: string; status: string; from: string; to: string }>("/api/purchase-orders", { search: "", status: "OPEN", from: "", to: "" });
  const { filters: f, set, setFilters } = list;
  const canManage = can("purchases.manage") && !readOnly;
  return (
    <div>
      <PageHeader
        title="Purchase orders"
        subtitle="What you’ve ordered from suppliers and what’s still to arrive"
        actions={canManage && <LinkButton href={`${base}/purchase-orders/new`} icon={Plus}>New order</LinkButton>}
      />
      <TableCard
        toolbar={
          <>
            <SearchInput className="w-full sm:w-60" value={f.search} onChange={(v) => set("search", v)} placeholder="Order no. or supplier…" />
            <FilterSelect
              label="Status"
              value={f.status}
              onChange={(v) => set("status", v)}
              options={[
                { value: "OPEN", label: "Open orders" },
                { value: "", label: "All orders" },
                { value: "DRAFT", label: "Draft" },
                { value: "SENT", label: "Sent" },
                { value: "PARTIALLY_RECEIVED", label: "Partly received" },
                { value: "RECEIVED", label: "Received" },
                { value: "CANCELLED", label: "Cancelled" },
              ]}
            />
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
          onRowClick={(r) => router.push(`${base}/purchase-orders/${r.id}`)}
          empty={
            <EmptyState
              icon={ClipboardList}
              title={f.status === "OPEN" ? "No open orders" : "No purchase orders"}
              description="Create an order to send to a supplier, then receive the goods against it."
              action={canManage && <LinkButton href={`${base}/purchase-orders/new`} icon={Plus}>New order</LinkButton>}
            />
          }
          columns={[
            { key: "n", header: "Order", cell: (r) => <span className="font-semibold text-[#044d73]">{r.number}</span> },
            { key: "d", header: "Date", cell: (r) => date(r.orderDate) },
            { key: "p", header: "Supplier", cell: (r) => r.partyName },
            { key: "e", header: "Expected", hideBelow: "md", cell: (r) => (r.expectedDate ? date(r.expectedDate) : "—") },
            { key: "t", header: "Total", align: "right", cell: (r) => <span className="font-semibold">{money(r.grandTotal)}</span> },
            { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
          ]}
          footer={list.data && <Pagination page={list.page} totalPages={list.data.totalPages} total={list.data.total} onPage={list.setPage} />}
        />
      </TableCard>
    </div>
  );
}
