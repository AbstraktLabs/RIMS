"use client";

import Link from "next/link";
import { useSession } from "@/lib/client/session";

/** A product's name on a document line, linking to the product when the viewer may open it. */
export function ProductName({ productId, name, className = "font-semibold text-slate-800" }: { productId?: string | null; name: string; className?: string }) {
  const { base, can } = useSession();
  if (!productId || !can("products.view")) return <div className={className}>{name}</div>;
  return (
    <div className={className}>
      <Link
        href={`${base}/products/${productId}`}
        onClick={(e) => e.stopPropagation()}
        className="hover:text-[#044d73] hover:underline print:no-underline"
      >
        {name}
      </Link>
    </div>
  );
}
