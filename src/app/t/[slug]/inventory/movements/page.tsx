"use client";

import { MovementsTable } from "@/components/movements-table";
import { PageHeader } from "@/components/ui/primitives";

export default function MovementsPage() {
  return (
    <div>
      <PageHeader title="Stock movements" subtitle="Every change to stock, with a running balance" />
      <MovementsTable />
    </div>
  );
}
