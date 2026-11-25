"use client";

import { use, useState } from "react";
import Link from "next/link";
import { PeriodFilter, Pct, ReportFrame, ReportTable, initialPeriod, periodQuery, type Period } from "@/components/reports";
import { ExpiryBadge } from "@/components/stock-pickers";
import { BarChart } from "@/components/ui/charts";
import { FilterSelect, SearchInput, Toggle } from "@/components/ui/form";
import { Alert, Card, CardHeader, StatCard } from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/table";
import { useApi, useDebounced } from "@/lib/client/hooks";
import { PAYMENT_METHOD_LABELS } from "@/lib/client/labels";
import { useFmt, useSession } from "@/lib/client/session";

type Range = { from: string; to: string };

export default function ReportPage({ params }: { params: Promise<{ report: string }> }) {
  const { report } = use(params);
  const { can, base } = useSession();
  if (!can("reports.view")) return <Alert tone="amber">You don’t have permission to view reports.</Alert>;
  switch (report) {
    case "sales":
      return <SalesReport />;
    case "purchases":
      return <PurchasesReport />;
    case "profit-loss":
      return <ProfitLoss />;
    case "valuation":
      return <Valuation />;
    case "movements":
      return <Movements />;
    case "tax":
      return <TaxReport />;
    case "expiry":
      return <ExpiryReport />;
    default:
      return (
        <Alert tone="amber">
          That report doesn’t exist. <Link href={`${base}/reports`} className="font-semibold underline">Back to reports</Link>
        </Alert>
      );
  }
}

// ── Sales ────────────────────────────────────────────────────
interface SalesRow { key: string; label: string; documents: number; quantity: number; revenue: number; tax: number; cost: number; profit: number; margin: number }
interface SalesData {
  range: Range;
  items: SalesRow[];
  summary: { invoices: number; grossSales: number; billDiscounts: number; salesTax: number; returns: number; netRevenue: number; averageSale: number; cost: number; grossProfit: number; margin: number };
}
const SALES_GROUPS = { day: "Day", month: "Month", product: "Product", category: "Category", brand: "Brand", customer: "Customer", user: "Staff", location: "Location", paymentMethod: "Payment method" };

function SalesReport() {
  const { base, settings } = useSession();
  const { money, moneyShort, num, date } = useFmt();
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [groupBy, setGroupBy] = useState<keyof typeof SALES_GROUPS>("day");
  const { data, error, loading, reload } = useApi<SalesData>("/api/reports/sales", { ...periodQuery(period), groupBy, limit: 500 });
  const timeline = groupBy === "day" || groupBy === "month";
  const label = (r: SalesRow) => (groupBy === "paymentMethod" ? PAYMENT_METHOD_LABELS[r.label] ?? r.label : groupBy === "day" ? date(r.label) : r.label);
  const rows = data ? (timeline ? data.items : [...data.items].sort((a, b) => b.revenue - a.revenue)) : [];
  const sum = (k: keyof SalesRow) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);
  return (
    <ReportFrame
      base={base}
      title="Sales report"
      subtitle={`Grouped by ${SALES_GROUPS[groupBy].toLowerCase()}`}
      range={data?.range}
      loading={loading && !data}
      error={error}
      onRetry={reload}
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <PeriodFilter value={period} onChange={setPeriod} />
          <div className="print:hidden"><FilterSelect label="Group by" value={groupBy} onChange={(v) => setGroupBy(v as keyof typeof SALES_GROUPS)} options={Object.entries(SALES_GROUPS).map(([value, label]) => ({ value, label }))} /></div>
        </div>
      }
    >
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Net revenue" value={money(data.summary.netRevenue)} hint={`${data.summary.invoices} invoices · avg ${money(data.summary.averageSale)}`} />
            <StatCard label="Cost of goods" value={money(data.summary.cost)} accent="amber" />
            <StatCard label="Gross profit" value={money(data.summary.grossProfit)} accent={data.summary.grossProfit >= 0 ? "green" : "red"} hint={`${data.summary.margin.toFixed(1)}% margin`} />
            <StatCard label={`${settings.taxLabel} collected`} value={money(data.summary.salesTax)} hint={data.summary.returns ? `Returns ${money(data.summary.returns)}` : undefined} />
          </div>
          {timeline && rows.length > 1 && (
            <Card className="print:hidden">
              <CardHeader title="Revenue" />
              <BarChart data={rows.map((r) => ({ label: groupBy === "day" ? r.label.slice(8) : r.label.slice(2), value: r.revenue, sub: label(r) }))} format={moneyShort} />
            </Card>
          )}
          <ReportTable
            rows={rows}
            rowKey={(r) => r.key}
            columns={[
              { header: SALES_GROUPS[groupBy], cell: (r) => <span className="font-medium text-slate-800">{label(r)}</span> },
              { header: "Invoices", num: true, hideBelow: "md", cell: (r) => r.documents },
              { header: "Qty", num: true, hideBelow: "lg", cell: (r) => num(r.quantity) },
              { header: "Revenue", num: true, cell: (r) => money(r.revenue) },
              { header: "Cost", num: true, hideBelow: "md", cell: (r) => money(r.cost) },
              { header: "Profit", num: true, cell: (r) => <span className={r.profit < 0 ? "text-rose-600" : "text-emerald-700"}>{money(r.profit)}</span> },
              { header: "Margin", num: true, hideBelow: "md", cell: (r) => <Pct v={r.margin} /> },
            ]}
            footer={["Total", sum("documents"), num(sum("quantity")), money(sum("revenue")), money(sum("cost")), money(sum("profit")), <Pct key="m" v={sum("revenue") ? (sum("profit") / sum("revenue")) * 100 : null} />]}
          />
          <p className="text-xs text-slate-400">Revenue is after discounts and returns, before {settings.taxLabel}. Cost is the actual cost of the batches sold (cost of goods sold).</p>
        </div>
      )}
    </ReportFrame>
  );
}

// ── Purchases ────────────────────────────────────────────────
interface PurRow { key: string; label: string; documents: number; quantity: number; amount: number; tax: number; landedCost: number }
interface PurData { range: Range; items: PurRow[]; summary: { bills: number; total: number; tax: number; paid: number; unpaid: number; returns: number } }
const PUR_GROUPS = { day: "Day", month: "Month", supplier: "Supplier", product: "Product", category: "Category" };

function PurchasesReport() {
  const { base, settings } = useSession();
  const { money, moneyShort, num, date } = useFmt();
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [groupBy, setGroupBy] = useState<keyof typeof PUR_GROUPS>("supplier");
  const { data, error, loading, reload } = useApi<PurData>("/api/reports/purchases", { ...periodQuery(period), groupBy, limit: 500 });
  const timeline = groupBy === "day" || groupBy === "month";
  const rows = data ? (timeline ? data.items : [...data.items].sort((a, b) => b.amount - a.amount)) : [];
  const label = (r: PurRow) => (groupBy === "day" ? date(r.label) : r.label);
  const sum = (k: keyof PurRow) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);
  return (
    <ReportFrame
      base={base}
      title="Purchases report"
      subtitle={`Grouped by ${PUR_GROUPS[groupBy].toLowerCase()}`}
      range={data?.range}
      loading={loading && !data}
      error={error}
      onRetry={reload}
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <PeriodFilter value={period} onChange={setPeriod} />
          <div className="print:hidden"><FilterSelect label="Group by" value={groupBy} onChange={(v) => setGroupBy(v as keyof typeof PUR_GROUPS)} options={Object.entries(PUR_GROUPS).map(([value, label]) => ({ value, label }))} /></div>
        </div>
      }
    >
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Purchased" value={money(data.summary.total)} hint={`${data.summary.bills} bills`} />
            <StatCard label="Paid" value={money(data.summary.paid)} accent="green" />
            <StatCard label="Unpaid" value={money(data.summary.unpaid)} accent="amber" />
            <StatCard label={`${settings.taxLabel} paid`} value={money(data.summary.tax)} hint={data.summary.returns ? `Returned ${money(data.summary.returns)}` : undefined} />
          </div>
          {timeline && rows.length > 1 && (
            <Card className="print:hidden">
              <CardHeader title="Purchases" />
              <BarChart color="#6366f1" data={rows.map((r) => ({ label: groupBy === "day" ? r.label.slice(8) : r.label.slice(2), value: r.amount, sub: label(r) }))} format={moneyShort} />
            </Card>
          )}
          <ReportTable
            rows={rows}
            rowKey={(r) => r.key}
            columns={[
              { header: PUR_GROUPS[groupBy], cell: (r) => <span className="font-medium text-slate-800">{label(r)}</span> },
              { header: "Bills", num: true, hideBelow: "md", cell: (r) => r.documents },
              { header: "Qty", num: true, hideBelow: "lg", cell: (r) => num(r.quantity) },
              { header: "Amount", num: true, cell: (r) => money(r.amount) },
              { header: settings.taxLabel, num: true, hideBelow: "md", cell: (r) => money(r.tax) },
              { header: "Landed cost", num: true, hideBelow: "md", cell: (r) => money(r.landedCost) },
            ]}
            footer={["Total", sum("documents"), num(sum("quantity")), money(sum("amount")), money(sum("tax")), money(sum("landedCost"))]}
          />
          <p className="text-xs text-slate-400">Amount is before {settings.taxLabel}. Landed cost includes freight and other charges spread across items.</p>
        </div>
      )}
    </ReportFrame>
  );
}

// ── Profit & loss ────────────────────────────────────────────
interface PL {
  basis: string;
  range: Range;
  revenue: { sales: number; discountsGiven: number; returns: number; netRevenue: number };
  costOfGoodsSold: { cogs: number; damagedReturnsCost: number };
  grossProfit: number;
  grossMargin: number;
  stockAdjustments: { loss: number; gain: number };
  otherIncome: { total: number; byCategory: { category: string; amount: number }[] };
  expenses: { total: number; byCategory: { category: string; amount: number }[] };
  netProfit: number;
  netMargin: number;
  previous?: Omit<PL, "previous" | "changePercent" | "basis">;
  changePercent?: { netRevenue: number | null; grossProfit: number | null; expenses: number | null; netProfit: number | null };
}

function PLLine({ label, cur, old, strong, minus, indent, cmp }: { label: string; cur: number; old?: number; strong?: boolean; minus?: boolean; indent?: boolean; cmp: boolean }) {
  const { money } = useFmt();
  return (
    <tr className={strong ? "border-t border-slate-200 font-bold text-slate-900" : "text-slate-700"}>
      <td className={`py-2 ${indent ? "pl-6" : "pl-4"}`}>{label}</td>
      <td className="px-4 py-2 text-right tabular-nums">{minus && cur ? `(${money(cur)})` : money(cur)}</td>
      {cmp && <td className="px-4 py-2 text-right tabular-nums text-slate-400">{old === undefined ? "" : minus && old ? `(${money(old)})` : money(old)}</td>}
    </tr>
  );
}

function Change({ label, v }: { label: string; v: number | null | undefined }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={v === null || v === undefined ? "text-slate-400" : v >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-rose-600"}>
        {v === null || v === undefined ? "—" : `${v >= 0 ? "▲" : "▼"} ${Math.abs(v).toFixed(1)}%`}
      </span>
    </div>
  );
}

function ProfitLoss() {
  const { base } = useSession();
  const { money, date } = useFmt();
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [compare, setCompare] = useState(true);
  const { data, error, loading, reload } = useApi<PL>("/api/reports/profit-loss", { ...periodQuery(period), compare: compare ? "true" : undefined });
  const prev = data?.previous;
  return (
    <ReportFrame
      base={base}
      title="Profit & loss"
      subtitle="Cost-of-goods-sold basis"
      range={data?.range}
      loading={loading && !data}
      error={error}
      onRetry={reload}
      filters={
        <div className="flex flex-wrap items-center gap-3">
          <PeriodFilter value={period} onChange={setPeriod} />
          <div className="print:hidden"><Toggle checked={compare} onChange={setCompare} label="Compare with previous period" /></div>
        </div>
      }
    >
      {data && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card padded={false} className="xl:col-span-2 print:border-0 print:shadow-none">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2.5 pl-4 text-left" />
                  <th className="px-4 py-2.5 text-right">{date(data.range.from)} – {date(data.range.to)}</th>
                  {prev && <th className="px-4 py-2.5 text-right">{date(prev.range.from)} – {date(prev.range.to)}</th>}
                </tr>
              </thead>
              <tbody>
                <tr><td colSpan={3} className="pl-4 pt-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">Revenue</td></tr>
                <PLLine cmp={!!prev} indent label="Sales" cur={data.revenue.sales} old={prev?.revenue.sales} />
                {(data.revenue.discountsGiven > 0 || !!prev?.revenue.discountsGiven) && <PLLine cmp={!!prev} indent minus label="Discounts given" cur={data.revenue.discountsGiven} old={prev?.revenue.discountsGiven} />}
                <PLLine cmp={!!prev} indent minus label="Sale returns" cur={data.revenue.returns} old={prev?.revenue.returns} />
                <PLLine cmp={!!prev} strong label="Net revenue" cur={data.revenue.netRevenue} old={prev?.revenue.netRevenue} />
                <tr><td colSpan={3} className="pl-4 pt-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">Cost of goods sold</td></tr>
                <PLLine cmp={!!prev} indent minus label="Cost of items sold" cur={data.costOfGoodsSold.cogs} old={prev?.costOfGoodsSold.cogs} />
                <PLLine cmp={!!prev} strong label="Gross profit" cur={data.grossProfit} old={prev?.grossProfit} />
                <tr className="text-xs text-slate-400"><td className="pl-6">Gross margin</td><td className="px-4 text-right">{data.grossMargin.toFixed(1)}%</td>{prev && <td className="px-4 text-right">{prev.grossMargin.toFixed(1)}%</td>}</tr>
                <tr><td colSpan={3} className="pl-4 pt-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">Other income</td></tr>
                {data.otherIncome.byCategory.map((c) => <PLLine cmp={!!prev} key={c.category} indent label={c.category} cur={c.amount} old={prev?.otherIncome.byCategory.find((x) => x.category === c.category)?.amount ?? (prev ? 0 : undefined)} />)}
                {data.stockAdjustments.gain > 0 && <PLLine cmp={!!prev} indent label="Stock found / count gains" cur={data.stockAdjustments.gain} old={prev?.stockAdjustments.gain} />}
                <tr><td colSpan={3} className="pl-4 pt-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">Expenses</td></tr>
                {data.expenses.byCategory.map((c) => <PLLine cmp={!!prev} key={c.category} indent minus label={c.category} cur={c.amount} old={prev?.expenses.byCategory.find((x) => x.category === c.category)?.amount ?? (prev ? 0 : undefined)} />)}
                <PLLine cmp={!!prev} indent minus label="Stock losses (damage, theft, expiry)" cur={data.stockAdjustments.loss} old={prev?.stockAdjustments.loss} />
                {data.costOfGoodsSold.damagedReturnsCost > 0 && <PLLine cmp={!!prev} indent minus label="Damaged returns written off" cur={data.costOfGoodsSold.damagedReturnsCost} old={prev?.costOfGoodsSold.damagedReturnsCost} />}
                <tr className="border-t-2 border-slate-300 bg-slate-50 text-base font-bold">
                  <td className="py-3 pl-4">Net profit</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${data.netProfit < 0 ? "text-rose-600" : "text-emerald-700"}`}>{money(data.netProfit)}</td>
                  {prev && <td className="px-4 py-3 text-right tabular-nums text-slate-500">{money(prev.netProfit)}</td>}
                </tr>
              </tbody>
            </table>
          </Card>
          <div className="space-y-6 print:hidden">
            <StatCard label="Net profit" value={money(data.netProfit)} accent={data.netProfit >= 0 ? "green" : "red"} hint={`${data.netMargin.toFixed(1)}% of net revenue`} />
            {data.changePercent && (
              <Card>
                <CardHeader title="Change vs previous period" />
                <div className="space-y-2">
                  <Change label="Net revenue" v={data.changePercent.netRevenue} />
                  <Change label="Gross profit" v={data.changePercent.grossProfit} />
                  <Change label="Expenses" v={data.changePercent.expenses === null ? null : -data.changePercent.expenses} />
                  <Change label="Net profit" v={data.changePercent.netProfit} />
                </div>
              </Card>
            )}
            <Card>
              <p className="text-xs text-slate-500">{data.basis}</p>
            </Card>
          </div>
        </div>
      )}
    </ReportFrame>
  );
}

// ── Stock valuation ──────────────────────────────────────────
interface ValRow { key: string; label: string; sku?: string; variants?: number; quantity: number; costValue: number; retailValue: number; potentialProfit: number }
interface ValData { items: ValRow[]; page: number; total: number; totalPages: number; summary: { variants: number; costValue: number; retailValue: number; potentialProfit: number; negativeStockLines: number } }
const VAL_GROUPS = { category: "Category", variant: "Item", location: "Location" };

function Valuation() {
  const { base } = useSession();
  const { money, num } = useFmt();
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [groupBy, setGroupBy] = useState<keyof typeof VAL_GROUPS>("category");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<ValData>("/api/reports/inventory-valuation", { locationId: period.locationId, groupBy, page, limit: 100 });
  return (
    <ReportFrame
      base={base}
      title="Stock valuation"
      subtitle={`As of today, by ${VAL_GROUPS[groupBy].toLowerCase()}`}
      loading={loading && !data}
      error={error}
      onRetry={reload}
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <PeriodFilter dates={false} value={period} onChange={(p) => { setPeriod(p); setPage(1); }} />
          <div className="print:hidden"><FilterSelect label="Group by" value={groupBy} onChange={(v) => { setGroupBy(v as keyof typeof VAL_GROUPS); setPage(1); }} options={Object.entries(VAL_GROUPS).map(([value, label]) => ({ value, label }))} /></div>
        </div>
      }
    >
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="At cost" value={money(data.summary.costValue)} hint={`${data.summary.variants} items in stock`} />
            <StatCard label="At selling price" value={money(data.summary.retailValue)} accent="green" />
            <StatCard label="Potential profit" value={money(data.summary.potentialProfit)} accent="green" hint={data.summary.retailValue ? `${((data.summary.potentialProfit / data.summary.retailValue) * 100).toFixed(1)}% of retail` : undefined} />
            <StatCard label="Negative stock" value={data.summary.negativeStockLines} accent={data.summary.negativeStockLines ? "red" : "primary"} hint="Lines below zero" />
          </div>
          <ReportTable
            rows={data.items}
            rowKey={(r) => r.key}
            columns={[
              { header: VAL_GROUPS[groupBy], cell: (r) => <div><div className="font-medium text-slate-800">{r.label}</div>{r.sku && <div className="text-xs text-slate-400">{r.sku}</div>}</div> },
              ...(groupBy !== "variant" ? [{ header: "Items", num: true, hideBelow: "md" as const, cell: (r: ValRow) => r.variants ?? "—" }] : []),
              { header: "Qty", num: true, cell: (r) => num(r.quantity) },
              { header: "Cost value", num: true, cell: (r) => money(r.costValue) },
              { header: "Retail value", num: true, hideBelow: "md", cell: (r) => money(r.retailValue) },
              { header: "Potential profit", num: true, hideBelow: "md", cell: (r) => money(r.potentialProfit) },
            ]}
            empty="No stock on hand"
          />
          {data.totalPages > 1 && <Card padded={false}><Pagination page={page} totalPages={data.totalPages} total={data.total} onPage={setPage} /></Card>}
          <p className="text-xs text-slate-400">Cost value uses the actual cost of each batch in stock.</p>
        </div>
      )}
    </ReportFrame>
  );
}

// ── Stock movement summary ───────────────────────────────────
interface MovRow { variantId: string; label: string; sku: string; opening: number; in: number; out: number; purchases: number; purchaseReturns: number; sales: number; saleReturns: number; adjustments: number; transfers: number; closing: number }
interface MovData { range: Range; items: MovRow[]; page: number; total: number; totalPages: number }

function Movements() {
  const { base } = useSession();
  const { num } = useFmt();
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [search, setSearch] = useState("");
  const dq = useDebounced(search, 300);
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<MovData>("/api/reports/stock-movements", { ...periodQuery(period), search: dq || undefined, page, limit: 100 });
  const sign = (v: number) => (v === 0 ? <span className="text-slate-300">0</span> : <span className={v < 0 ? "text-rose-600" : "text-emerald-700"}>{v > 0 ? "+" : ""}{num(v)}</span>);
  return (
    <ReportFrame
      base={base}
      title="Stock movement summary"
      subtitle="Opening to closing quantity per item"
      range={data?.range}
      loading={loading && !data}
      error={error}
      onRetry={reload}
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <PeriodFilter value={period} onChange={(p) => { setPeriod(p); setPage(1); }} />
          <SearchInput className="w-full sm:w-56 print:hidden" value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Item or SKU…" />
        </div>
      }
    >
      {data && (
        <div className="space-y-4">
          <ReportTable
            rows={data.items}
            rowKey={(r) => r.variantId}
            columns={[
              { header: "Item", cell: (r) => <div><div className="font-medium text-slate-800">{r.label}</div><div className="text-xs text-slate-400">{r.sku}</div></div> },
              { header: "Opening", num: true, cell: (r) => num(r.opening) },
              { header: "Purchased", num: true, hideBelow: "md", cell: (r) => sign(r.purchases) },
              { header: "Ret. to supplier", num: true, hideBelow: "lg", cell: (r) => sign(-Math.abs(r.purchaseReturns)) },
              { header: "Sold", num: true, hideBelow: "md", cell: (r) => sign(-Math.abs(r.sales)) },
              { header: "Sale returns", num: true, hideBelow: "lg", cell: (r) => sign(r.saleReturns) },
              { header: "Adjusted", num: true, hideBelow: "lg", cell: (r) => sign(r.adjustments) },
              { header: "Transfers", num: true, hideBelow: "lg", cell: (r) => sign(r.transfers) },
              { header: "Closing", num: true, cell: (r) => <b>{num(r.closing)}</b> },
            ]}
            empty="No stock moved in this period"
          />
          {data.totalPages > 1 && <Card padded={false}><Pagination page={page} totalPages={data.totalPages} total={data.total} onPage={setPage} /></Card>}
        </div>
      )}
    </ReportFrame>
  );
}

// ── Tax ──────────────────────────────────────────────────────
interface TaxRow { key: string; label: string; taxableSales: number; outputTax: number; taxablePurchases: number; inputTax: number; netPayable: number }
interface TaxData { range: Range; taxLabel: string; taxRegistered: boolean; items: TaxRow[]; summary: Omit<TaxRow, "key" | "label"> }

/** "2026-11" → "November 2026" in the store's locale. */
function monthLabel(key: string, locale?: string | null): string {
  if (!/^\d{4}-\d{2}$/.test(key)) return key;
  const [y, m] = key.split("-").map(Number);
  try {
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale || undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  } catch {
    return key;
  }
}

function TaxReport() {
  const { base, settings } = useSession();
  const { money } = useFmt();
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [groupBy, setGroupBy] = useState<"month" | "rate">("month");
  const { data, error, loading, reload } = useApi<TaxData>("/api/reports/tax", { ...periodQuery(period), groupBy });
  const t = data?.taxLabel ?? "Tax";
  return (
    <ReportFrame
      base={base}
      title={`${t} summary`}
      subtitle={groupBy === "month" ? "By month" : "By rate"}
      range={data?.range}
      loading={loading && !data}
      error={error}
      onRetry={reload}
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <PeriodFilter value={period} onChange={setPeriod} />
          <div className="print:hidden"><FilterSelect label="Group by" value={groupBy} onChange={(v) => setGroupBy(v as "month" | "rate")} options={[{ value: "month", label: "Month" }, { value: "rate", label: "Rate" }]} /></div>
        </div>
      }
    >
      {data && (
        <div className="space-y-6">
          {!data.taxRegistered && <Alert tone="amber">Your business isn’t set as {t}-registered, so sales are recorded without {t}. Change this in Settings → Preferences.</Alert>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard label={`${t} collected on sales`} value={money(data.summary.outputTax)} hint={`on ${money(data.summary.taxableSales)}`} />
            <StatCard label={`${t} paid on purchases`} value={money(data.summary.inputTax)} hint={`on ${money(data.summary.taxablePurchases)}`} />
            <StatCard
              label={data.summary.netPayable >= 0 ? `${t} payable` : `${t} credit`}
              value={money(Math.abs(data.summary.netPayable))}
              accent={data.summary.netPayable >= 0 ? "amber" : "green"}
              hint={data.summary.netPayable >= 0 ? "Collected minus paid" : "Carry forward"}
            />
          </div>
          <ReportTable
            rows={data.items}
            rowKey={(r) => r.key}
            columns={[
              { header: groupBy === "month" ? "Month" : "Rate", cell: (r) => <span className="font-medium text-slate-800">{groupBy === "month" ? monthLabel(r.label, settings.locale) : r.label}</span> },
              { header: "Taxable sales", num: true, hideBelow: "md", cell: (r) => money(r.taxableSales) },
              { header: `Output ${t}`, num: true, cell: (r) => money(r.outputTax) },
              { header: "Taxable purchases", num: true, hideBelow: "md", cell: (r) => money(r.taxablePurchases) },
              { header: `Input ${t}`, num: true, cell: (r) => money(r.inputTax) },
              { header: "Net", num: true, cell: (r) => <span className={r.netPayable < 0 ? "text-emerald-700" : ""}>{money(r.netPayable)}</span> },
            ]}
            footer={["Total", money(data.summary.taxableSales), money(data.summary.outputTax), money(data.summary.taxablePurchases), money(data.summary.inputTax), money(data.summary.netPayable)]}
          />
          <p className="text-xs text-slate-400">Sale returns and supplier returns are netted off. Check figures with your accountant before filing.</p>
        </div>
      )}
    </ReportFrame>
  );
}

// ── Expiry ───────────────────────────────────────────────────
interface ExpRow { lotId: string; lotNumber: string | null; expiryDate: string; daysToExpiry: number; status: string; variantId: string; label: string; sku: string; location: string; supplier: string | null; quantity: number; unitCost: number; costValue: number }
interface ExpData { today: string; until: string; items: ExpRow[]; page: number; total: number; totalPages: number; summary: { expiredLots: number; expiredValue: number; expiringLots: number; expiringValue: number } }

function ExpiryReport() {
  const { base, settings } = useSession();
  const { money, num, date } = useFmt();
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [days, setDays] = useState("90");
  const [includeExpired, setIncludeExpired] = useState(true);
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<ExpData>("/api/reports/expiry", { locationId: period.locationId, days, includeExpired: includeExpired ? "true" : "false", page, limit: 100 });
  if (!settings.enableExpiryTracking) return <Alert tone="amber">Expiry tracking is turned off. Turn it on in Settings → Preferences to use this report.</Alert>;
  return (
    <ReportFrame
      base={base}
      title="Expiry report"
      subtitle={data ? `Batches expiring by ${date(data.until)}` : "Batches about to expire"}
      loading={loading && !data}
      error={error}
      onRetry={reload}
      filters={
        <div className="flex flex-wrap items-center gap-3">
          <PeriodFilter dates={false} value={period} onChange={(p) => { setPeriod(p); setPage(1); }} />
          <div className="print:hidden">
            <FilterSelect label="Within" value={days} onChange={(v) => { setDays(v); setPage(1); }} options={[{ value: "30", label: "30 days" }, { value: "60", label: "60 days" }, { value: "90", label: "90 days" }, { value: "180", label: "6 months" }, { value: "365", label: "1 year" }]} />
          </div>
          <div className="print:hidden"><Toggle checked={includeExpired} onChange={(v) => { setIncludeExpired(v); setPage(1); }} label="Include already expired" /></div>
        </div>
      }
    >
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Expired batches" value={data.summary.expiredLots} accent={data.summary.expiredLots ? "red" : "primary"} />
            <StatCard label="Expired stock value" value={money(data.summary.expiredValue)} accent={data.summary.expiredValue ? "red" : "primary"} />
            <StatCard label="Expiring soon" value={data.summary.expiringLots} accent="amber" />
            <StatCard label="Value at risk" value={money(data.summary.expiringValue)} accent="amber" />
          </div>
          <ReportTable
            rows={data.items}
            rowKey={(r) => r.lotId}
            columns={[
              { header: "Item", cell: (r) => <div><div className="font-medium text-slate-800">{r.label}</div><div className="text-xs text-slate-400">{r.sku}{r.lotNumber ? ` · Batch ${r.lotNumber}` : ""}</div></div> },
              { header: "Expiry", cell: (r) => <div className="flex flex-col gap-1"><span>{date(r.expiryDate)}</span><ExpiryBadge days={r.daysToExpiry} /></div> },
              ...(settings.enableMultiLocation ? [{ header: "Location", hideBelow: "lg" as const, cell: (r: ExpRow) => r.location }] : []),
              { header: "Supplier", hideBelow: "md", cell: (r) => r.supplier ?? "—" },
              { header: "Qty", num: true, cell: (r) => num(r.quantity) },
              { header: "Value", num: true, cell: (r) => money(r.costValue) },
            ]}
            empty="Nothing expiring in this window"
          />
          {data.totalPages > 1 && <Card padded={false}><Pagination page={page} totalPages={data.totalPages} total={data.total} onPage={setPage} /></Card>}
          <p className="text-xs text-slate-400">Expired stock can be sent back with a supplier return or written off with an “Expired” stock adjustment.</p>
        </div>
      )}
    </ReportFrame>
  );
}
