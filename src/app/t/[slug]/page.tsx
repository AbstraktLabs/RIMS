"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CalendarClock,
  DollarSign,
  HandCoins,
  PackageX,
  Receipt,
  ScanBarcode,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";
import { BarChart, ShareBars } from "@/components/ui/charts";
import { Card, CardHeader, EmptyState, ErrorState, LinkButton, LoadingBlock, PageHeader, StatCard, StatusBadge } from "@/components/ui/primitives";
import { FilterSelect } from "@/components/ui/form";
import { useLocations } from "@/components/pickers";
import { useApi } from "@/lib/client/hooks";
import { titleCase } from "@/lib/client/format";
import { useFmt, useSession } from "@/lib/client/session";
import { useState } from "react";

interface Dashboard {
  today: string;
  kpis: {
    today: { sales: number; amount: number; returns: number };
    month: { sales: number; amount: number; purchases: number; expenses: number; netRevenue?: number; grossProfit?: number };
    receivable: number;
    payable: number;
    stockValue?: number;
    retailValue: number;
    lowStock: number;
    outOfStock: number;
    expiringSoon: number;
    expired: number;
  };
  attention: {
    openPurchaseOrders: number;
    pendingPurchaseReturns: number;
    transfersInTransit: number;
    overdueSales: number;
    overduePurchases: number;
  };
  salesTrend: { date: string; sales: number; amount: number }[];
  topProducts: { variantId: string; label: string; quantity: number; revenue: number; profit?: number }[];
  recentSales: { id: string; invoiceNumber: string; saleDate: string; customer: string; grandTotal: number; paymentStatus: string; channel: string }[];
  paymentMethodsToday: { method: string; amount: number }[];
}

export default function DashboardPage() {
  const { base, session, can, settings } = useSession();
  const fmt = useFmt();
  const { locations } = useLocations();
  const [loc, setLoc] = useState(session.user.isOwner ? "all" : session.activeLocationId);
  const { data, error, loading, reload } = useApi<Dashboard>(can("dashboard.view") ? "/api/dashboard" : null, { locationId: loc });

  if (!can("dashboard.view")) {
    return <EmptyState title="Welcome" description="Use the menu to get started." />;
  }

  const k = data?.kpis;
  const a = data?.attention;
  const attention = a
    ? ([
        [a.overdueSales, "overdue customer invoices", `${base}/finance/outstanding`],
        [a.overduePurchases, "overdue supplier bills", `${base}/finance/outstanding?type=payables`],
        [a.openPurchaseOrders, "open purchase orders", `${base}/purchase-orders`],
        [a.pendingPurchaseReturns, "supplier returns awaiting completion", `${base}/purchase-returns`],
        [a.transfersInTransit, "transfers in transit", `${base}/inventory/transfers`],
      ] as [number, string, string][]).filter(([n]) => n > 0)
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={data ? `${fmt.date(data.today)} · ${session.user.name}` : undefined}
        actions={
          <>
            {session.user.isOwner && locations.length > 1 && (
              <FilterSelect
                label="Location"
                value={loc}
                onChange={setLoc}
                options={[{ value: "all", label: "All locations" }, ...locations.map((l) => ({ value: l.id, label: l.name }))]}
              />
            )}
            {can("sales.manage") && (
              <LinkButton href={`${base}/pos`} icon={ScanBarcode}>
                Open POS
              </LinkButton>
            )}
          </>
        }
      />

      {error && !data ? (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      ) : !data || !k ? (
        <LoadingBlock text="Loading dashboard…" />
      ) : (
        <div className={`space-y-6 ${loading ? "opacity-70" : ""}`}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Sales today"
              value={fmt.money(k.today.amount)}
              icon={DollarSign}
              hint={`${k.today.sales} sale${k.today.sales === 1 ? "" : "s"}${k.today.returns ? ` · returns ${fmt.money(k.today.returns)}` : ""}`}
              href={`${base}/sales`}
            />
            {k.month.grossProfit !== undefined ? (
              <StatCard
                label="Gross profit (month)"
                value={fmt.money(k.month.grossProfit)}
                accent="green"
                icon={TrendingUp}
                hint={
                  k.month.netRevenue
                    ? `${((k.month.grossProfit / k.month.netRevenue) * 100).toFixed(1)}% margin on ${fmt.moneyShort(k.month.netRevenue)}`
                    : "No sales yet this month"
                }
                href={`${base}/reports?tab=profit-loss`}
              />
            ) : (
              <StatCard label="Sales (month)" value={fmt.money(k.month.amount)} accent="green" icon={TrendingUp} hint={`${k.month.sales} sales`} />
            )}
            <StatCard
              label="Receivable"
              value={fmt.money(k.receivable)}
              accent="amber"
              icon={HandCoins}
              hint={`Payable ${fmt.money(k.payable)}`}
              href={`${base}/finance/outstanding`}
            />
            <StatCard
              label="Stock"
              value={k.stockValue !== undefined ? fmt.money(k.stockValue) : fmt.money(k.retailValue)}
              accent="red"
              icon={Boxes}
              hint={
                <span className="flex flex-wrap gap-1.5">
                  <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-bold text-amber-700">{k.lowStock} low</span>
                  <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-bold text-rose-700">{k.outOfStock} out</span>
                  {(k.expiringSoon > 0 || k.expired > 0) && (
                    <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 font-bold text-violet-700">
                      {k.expiringSoon + k.expired} expiry
                    </span>
                  )}
                </span>
              }
              href={`${base}/inventory`}
            />
          </div>

          {attention.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attention.map(([n, label, href]) => (
                <Link
                  key={label}
                  href={href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                >
                  <AlertTriangle className="h-3.5 w-3.5" /> {n} {label}
                </Link>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="min-w-0 lg:col-span-2">
              <CardHeader
                title="Sales — last 30 days"
                subtitle={`Month to date: ${fmt.money(k.month.amount)} from ${k.month.sales} sales`}
                icon={BarChart3}
              />
              {data.salesTrend.every((d) => d.amount === 0) ? (
                <EmptyState title="No sales in the last 30 days" description="Sales you record will show up here." />
              ) : (
                <BarChart
                  format={fmt.money}
                  data={data.salesTrend.map((d) => ({ label: d.date.slice(8), value: d.amount, sub: `${fmt.date(d.date)} · ${d.sales} sales` }))}
                />
              )}
            </Card>
            <Card className="min-w-0">
              <CardHeader title="Payments received today" icon={Wallet} />
              {data.paymentMethodsToday.length === 0 ? (
                <EmptyState title="No payments yet today" className="py-8" />
              ) : (
                <ShareBars format={fmt.money} items={data.paymentMethodsToday.map((m) => ({ label: titleCase(m.method), value: m.amount }))} />
              )}
              <div className="mt-5 space-y-1 border-t border-slate-100 pt-3 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5" /> Purchases this month
                  </span>
                  <span className="font-semibold text-slate-800">{fmt.money(k.month.purchases)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Receipt className="h-3.5 w-3.5" /> Expenses this month
                  </span>
                  <span className="font-semibold text-slate-800">{fmt.money(k.month.expenses)}</span>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader
                title="Recent sales"
                actions={
                  <Link href={`${base}/sales`} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-[#044d73]">
                    View all <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              {data.recentSales.length === 0 ? (
                <EmptyState title="No sales yet" description="Ring up your first sale from the POS." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.recentSales.map((s) => (
                    <li key={s.id}>
                      <Link href={`${base}/sales/${s.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50/80">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{s.invoiceNumber}</p>
                          <p className="truncate text-xs text-slate-400">
                            {s.customer} · {fmt.dateTime(s.saleDate)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <StatusBadge status={s.paymentStatus} />
                          <span className="text-sm font-semibold tabular-nums text-slate-800">{fmt.money(s.grandTotal)}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="min-w-0">
              <CardHeader title="Top products — last 30 days" icon={TrendingUp} />
              {data.topProducts.length === 0 ? (
                <EmptyState title="No product sales yet" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.topProducts.map((p, i) => (
                    <li key={p.variantId} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#044d73]/10 text-xs font-bold text-[#044d73]">{i + 1}</span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{p.label}</p>
                          <p className="text-xs text-slate-400">{fmt.qty(p.quantity)} sold</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums text-slate-800">{fmt.money(p.revenue)}</p>
                        {p.profit !== undefined && <p className="text-[11px] text-emerald-600">+{fmt.money(p.profit)} profit</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {(k.expiringSoon > 0 || k.expired > 0 || k.outOfStock > 0) && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {k.expiringSoon + k.expired > 0 && (
                    <Link href={`${base}/inventory/lots?expiring=${settings.expiryAlertDays}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 hover:underline">
                      <CalendarClock className="h-3.5 w-3.5" /> {k.expired} expired, {k.expiringSoon} expiring within {settings.expiryAlertDays} days
                    </Link>
                  )}
                  {k.outOfStock > 0 && (
                    <Link href={`${base}/inventory?status=out`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 hover:underline">
                      <PackageX className="h-3.5 w-3.5" /> {k.outOfStock} out of stock
                    </Link>
                  )}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
