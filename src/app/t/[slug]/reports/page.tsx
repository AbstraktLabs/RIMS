"use client";

import Link from "next/link";
import { ArrowRight, Boxes, CalendarClock, ChartLine, Landmark, Receipt, ShoppingCart, Truck, type LucideIcon } from "lucide-react";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { useSession } from "@/lib/client/session";

const REPORTS: { slug: string; title: string; description: string; icon: LucideIcon; needs?: "expiry" }[] = [
  { slug: "profit-loss", title: "Profit & loss", description: "Revenue, cost of goods sold, expenses and net profit, compared with the previous period.", icon: ChartLine },
  { slug: "sales", title: "Sales", description: "Revenue, cost and margin by day, month, product, category, brand, customer, staff or payment method.", icon: ShoppingCart },
  { slug: "purchases", title: "Purchases", description: "What you bought, by day, month, supplier, product or category, with paid and unpaid totals.", icon: Truck },
  { slug: "valuation", title: "Stock valuation", description: "What your stock is worth at cost and at selling price, and the profit sitting on the shelves.", icon: Boxes },
  { slug: "movements", title: "Stock movement summary", description: "Opening, in, out and closing quantities per item — purchases, sales, returns, adjustments and transfers.", icon: Receipt },
  { slug: "tax", title: "Tax summary", description: "Tax collected on sales against tax paid on purchases, by month or by rate.", icon: Landmark },
  { slug: "expiry", title: "Expiry", description: "Batches that have expired or are about to, and the stock value at risk.", icon: CalendarClock, needs: "expiry" },
];

export default function ReportsPage() {
  const { base, settings, can } = useSession();
  if (!can("reports.view")) return <Alert tone="amber">You don’t have permission to view reports.</Alert>;
  const list = REPORTS.filter((r) => r.needs !== "expiry" || settings.enableExpiryTracking);
  return (
    <div>
      <PageHeader title="Reports" subtitle="Every report can be filtered by period and location and printed or saved as PDF" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((r) => (
          <Link
            key={r.slug}
            href={`${base}/reports/${r.slug}`}
            className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#044d73]/30 hover:shadow-md"
          >
            <span className="mb-3 inline-flex size-10 items-center justify-center rounded-xl bg-[#044d73]/10 text-[#044d73]">
              <r.icon className="size-5" />
            </span>
            <span className="text-base font-bold text-slate-900">{r.title}</span>
            <span className="mt-1 flex-1 text-sm text-slate-500">{r.description}</span>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#044d73]">
              Open report <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
