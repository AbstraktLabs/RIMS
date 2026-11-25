"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { PartyFilterNote } from "@/components/party";
import { FilePlus2, Receipt, ShoppingCart } from "lucide-react";
import { DateRangeInputs, FilterSelect, SearchInput } from "@/components/ui/form";
import { Badge, EmptyState, LinkButton, PageHeader, StatCard, StatusBadge } from "@/components/ui/primitives";
import { DataTable, Pagination, TableCard } from "@/components/ui/table";
import { LocationSelect } from "@/components/pickers";
import { useList } from "@/lib/client/hooks";
import { useFmt, useSession } from "@/lib/client/session";

interface SaleRow {
  id: string;
  invoiceNumber: string;
  channel: "POS" | "INVOICE";
  saleDate: string;
  status: string;
  paymentStatus: string;
  grandTotal: number;
  paidAmount: number;
  customerName: string;
  locationName: string;
  cashierName: string | null;
  itemCount: number;
}

export default function SalesPage() {
  const { base, can, readOnly, settings } = useSession();
  const { money, dateTime } = useFmt();
  const router = useRouter();
  const partyId = useSearchParams().get("partyId");
  const list = useList<SaleRow, { search: string; channel: string; status: string; paymentStatus: string; locationId: string; from: string; to: string }>("/api/sales", {
    search: "",
    channel: "",
    status: "",
    paymentStatus: "",
    locationId: "all",
    from: "",
    to: "",
  }, partyId ? { partyId } : undefined);
  const { filters: f, set, setFilters } = list;
  const summary = list.data?.summary as { totalAmount: number; totalPaid: number } | undefined;
  const canSell = can("sales.manage") && !readOnly;
  return (
    <div>
      <PageHeader
        title="Sales"
        subtitle="POS receipts and invoices"
        actions={
          canSell && (
            <>
              <LinkButton variant="secondary" href={`${base}/sales/new`} icon={FilePlus2}>New invoice</LinkButton>
              <LinkButton href={`${base}/pos`} icon={ShoppingCart}>Open POS</LinkButton>
            </>
          )
        }
      />
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Sales in view" value={summary ? money(summary.totalAmount) : "—"} hint={list.data ? `${list.data.total} documents` : undefined} icon={Receipt} />
        <StatCard label="Collected" value={summary ? money(summary.totalPaid) : "—"} accent="green" />
        <StatCard label="Outstanding" value={summary ? money(summary.totalAmount - summary.totalPaid) : "—"} accent="amber" />
      </div>
      {partyId && <PartyFilterNote partyId={partyId} />}
      <TableCard
        toolbar={
          <>
            <SearchInput className="w-full sm:w-60" value={f.search} onChange={(v) => set("search", v)} placeholder="Invoice no. or customer…" />
            <FilterSelect label="Channel" value={f.channel} onChange={(v) => set("channel", v)} options={[{ value: "", label: "POS & invoices" }, { value: "POS", label: "POS" }, { value: "INVOICE", label: "Invoices" }]} />
            <FilterSelect label="Payment" value={f.paymentStatus} onChange={(v) => set("paymentStatus", v)} options={[{ value: "", label: "Any payment" }, { value: "PAID", label: "Paid" }, { value: "PARTIAL", label: "Partly paid" }, { value: "UNPAID", label: "Unpaid" }]} />
            <FilterSelect label="Status" value={f.status} onChange={(v) => set("status", v)} options={[{ value: "", label: "Posted & void" }, { value: "POSTED", label: "Posted" }, { value: "VOID", label: "Void" }]} />
            {settings.enableMultiLocation && (
              <div className="w-44">
                <LocationSelect includeAll value={f.locationId} onChange={(v) => set("locationId", v)} />
              </div>
            )}
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
          onRowClick={(r) => router.push(`${base}/sales/${r.id}`)}
          empty={
            <EmptyState
              icon={Receipt}
              title="No sales found"
              description={f.search || f.from ? "Try other filters." : "Sales from the POS and invoices appear here."}
              action={canSell && <LinkButton href={`${base}/pos`} icon={ShoppingCart}>Open POS</LinkButton>}
            />
          }
          columns={[
            {
              key: "n",
              header: "Invoice",
              cell: (r) => (
                <div>
                  <span className="font-semibold text-[#044d73]">{r.invoiceNumber}</span>{" "}
                  <Badge tone={r.channel === "POS" ? "slate" : "blue"}>{r.channel === "POS" ? "POS" : "Invoice"}</Badge>
                </div>
              ),
            },
            { key: "d", header: "Date", cell: (r) => <span className="whitespace-nowrap text-slate-600">{dateTime(r.saleDate)}</span> },
            { key: "c", header: "Customer", cell: (r) => r.customerName },
            ...(settings.enableMultiLocation ? [{ key: "l", header: "Location", hideBelow: "lg" as const, cell: (r: SaleRow) => r.locationName }] : []),
            { key: "t", header: "Total", align: "right", cell: (r) => <span className={`font-semibold ${r.status === "VOID" ? "text-slate-400 line-through" : ""}`}>{money(r.grandTotal)}</span> },
            { key: "p", header: "Paid", align: "right", hideBelow: "md", cell: (r) => money(r.paidAmount) },
            { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status === "VOID" ? "VOID" : r.paymentStatus} /> },
            { key: "u", header: "By", hideBelow: "lg", cell: (r) => <span className="text-slate-500">{r.cashierName ?? "—"}</span> },
          ]}
          footer={list.data && <Pagination page={list.page} totalPages={list.data.totalPages} total={list.data.total} onPage={list.setPage} />}
        />
      </TableCard>
    </div>
  );
}
