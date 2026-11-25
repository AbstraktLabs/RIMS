"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Printer, Trash2 } from "lucide-react";
import { EntryModal, type FinanceEntry } from "@/components/finance";
import { PrintHeader } from "@/components/print-header";
import { ConfirmDialog } from "@/components/ui/modal";
import { Badge, Button, Card, DetailList, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { del } from "@/lib/client/api";
import { useAction, useApi } from "@/lib/client/hooks";
import { PAYMENT_METHOD_LABELS } from "@/lib/client/labels";
import { useFmt, useSession } from "@/lib/client/session";

export default function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { base, can, readOnly } = useSession();
  const { money, date, dateTime } = useFmt();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useApi<{ entry: FinanceEntry }>(`/api/finance/entries/${id}`);
  const [modal, setModal] = useState<"edit" | "delete" | null>(null);
  const action = useAction();
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (loading && !data) return <LoadingBlock />;
  if (!data) return null;
  const e = data.entry;
  const canManage = can("finance.manage") && !readOnly;
  const income = e.kind === "INCOME";
  return (
    <div>
      <PageHeader
        back={{ href: `${base}/finance/entries`, label: "Income & expenses" }}
        title={e.description}
        subtitle={<span className="flex items-center gap-2"><Badge tone={income ? "green" : "amber"}>{income ? "Income" : "Expense"}</Badge> {e.categoryName ?? "Uncategorised"}</span>}
        actions={
          <>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print voucher</Button>
            {canManage && <Button variant="secondary" icon={Pencil} onClick={() => setModal("edit")}>Edit</Button>}
            {canManage && <Button variant="ghost" icon={Trash2} onClick={() => setModal("delete")}>Delete</Button>}
          </>
        }
      />
      <Card className="max-w-2xl print:border-0 print:shadow-none">
        <PrintHeader screen title={income ? "Income voucher" : "Expense voucher"} number={e.referenceNumber ?? ""} meta={[["Date", date(e.entryDate)]]} />
        <div className="mb-5 text-center">
          <div className={`text-3xl font-bold ${income ? "text-emerald-700" : "text-amber-700"}`}>{money(e.amount)}</div>
          <div className="text-sm text-slate-500">{income ? "received" : "paid"} by {PAYMENT_METHOD_LABELS[e.method] ?? e.method}</div>
        </div>
        <DetailList
          items={[
            ["Description", e.description],
            ["Category", e.categoryName ?? "Uncategorised"],
            ["Date", date(e.entryDate)],
            [income ? "Received from" : "Paid to", e.partyId ? <Link href={`${base}/parties/${e.partyId}`} className="font-semibold text-[#044d73] hover:underline print:text-slate-800">{e.partyName}</Link> : "—"],
            ["Reference", e.referenceNumber ?? "—"],
            ["Location", e.locationName ?? "—"],
            ["Recorded by", `${e.createdByName ?? "—"} · ${dateTime(e.createdAt)}`],
          ]}
        />
        {e.note && <p className="mt-4 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{e.note}</p>}
      </Card>
      {modal === "edit" && <EntryModal entry={e} onClose={() => setModal(null)} onSaved={(x) => { setData({ entry: x }); setModal(null); }} />}
      {modal === "delete" && (
        <ConfirmDialog
          open
          onClose={() => setModal(null)}
          title="Delete this entry?"
          message="It will be removed from income & expenses and from profit & loss."
          confirmLabel="Delete"
          danger
          busy={action.busy}
          error={action.error}
          onConfirm={() =>
            action.run(async () => {
              await del(`/api/finance/entries/${e.id}`);
              toast("Entry deleted");
              router.push(`${base}/finance/entries`);
            })
          }
        />
      )}
    </div>
  );
}
