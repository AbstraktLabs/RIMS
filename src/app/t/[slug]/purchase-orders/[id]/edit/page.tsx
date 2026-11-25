"use client";

import { use } from "react";
import { PurchaseOrderForm, type PurchaseOrder } from "@/components/po-form";
import { Alert, Card, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/primitives";
import { useApi } from "@/lib/client/hooks";
import { useSession } from "@/lib/client/session";

export default function EditPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { base } = useSession();
  const { data, error, loading, reload } = useApi<{ purchaseOrder: PurchaseOrder }>(`/api/purchase-orders/${id}`);
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (loading || !data) return <LoadingBlock />;
  const po = data.purchaseOrder;
  return (
    <div>
      <PageHeader title={`Edit ${po.number}`} back={{ href: `${base}/purchase-orders/${po.id}`, label: po.number }} />
      {po.status === "DRAFT" || po.status === "SENT" ? <PurchaseOrderForm order={po} /> : <Alert tone="amber">Only draft or sent orders can be edited.</Alert>}
    </div>
  );
}
