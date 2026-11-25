"use client";

import { PurchaseOrderForm } from "@/components/po-form";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { useSession } from "@/lib/client/session";

export default function NewPurchaseOrderPage() {
  const { base, can, readOnly } = useSession();
  return (
    <div>
      <PageHeader title="New purchase order" back={{ href: `${base}/purchase-orders`, label: "Purchase orders" }} />
      {can("purchases.manage") && !readOnly ? <PurchaseOrderForm /> : <Alert tone="amber">You don’t have permission to create purchase orders.</Alert>}
    </div>
  );
}
