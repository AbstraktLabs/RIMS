"use client";

import { ProductForm } from "@/components/product-form";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { useSession } from "@/lib/client/session";

export default function NewProductPage() {
  const { base, can, readOnly } = useSession();
  return (
    <div>
      <PageHeader title="Add product" back={{ href: `${base}/products`, label: "Products" }} />
      {can("products.manage") && !readOnly ? <ProductForm /> : <Alert tone="amber">You don’t have permission to add products.</Alert>}
    </div>
  );
}
