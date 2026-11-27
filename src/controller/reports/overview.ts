import { sql } from "drizzle-orm";
import { z } from "zod";
import type { AuthContext } from "@/lib/api/handler";
import { badRequest } from "@/lib/errors";
import { num, round2 } from "@/lib/num";
import { addDays } from "../_shared/dates";
import { reportContext, rows, type ReportContext } from "./context";
import { saleLinesSql } from "./sales";

// Dashboard and Analytics figures in the shape the pharmacy-style pages use.
// Profit is on a cost-of-goods-sold basis: revenue (net of tax and returns)
// minus the cost of the goods sold, minus recorded expenses and stock written off.

/** Cost of stock written off from batches (damaged or expired), by day. */
const writeOffsSql = (c: ReportContext) => sql`
  select (m.occurred_at at time zone ${c.tz})::date as day, -m.quantity * m.unit_cost as loss
    from stock_movements m
   where m.organization_id = ${c.orgId} and m.type = 'DAMAGE'
     and (m.occurred_at at time zone ${c.tz})::date between ${c.range.from} and ${c.range.to} ${c.loc(sql`m.location_id`)}`;

const month = z.string().regex(/^\d{4}-\d{2}$/);
const year = z.coerce.number().int().min(2000).max(2100);

export const rangeQuery = z.object({
  mode: z.enum(["monthly", "yearly"]).default("monthly"),
  startMonth: month.optional(),
  endMonth: month.optional(),
  startYear: year.optional(),
  endYear: year.optional(),
  by: z.enum(["category", "payment"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  locationId: z.string().optional(),
});
export type RangeQuery = z.infer<typeof rangeQuery>;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface Period {
  key: string; // YYYY-MM or YYYY
  label: string;
}

function lastDay(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

/** The periods in range and the matching from/to dates. */
function periodsFor(q: RangeQuery, today: string): { periods: Period[]; from: string; to: string; fmt: string } {
  if (q.mode === "yearly") {
    const thisYear = Number(today.slice(0, 4));
    const a = q.startYear ?? thisYear;
    const b = q.endYear ?? thisYear;
    if (b < a) throw badRequest("The end year is before the start year");
    if (b - a > 20) throw badRequest("Choose at most 20 years");
    const periods = Array.from({ length: b - a + 1 }, (_, i) => ({ key: String(a + i), label: String(a + i) }));
    return { periods, from: `${a}-01-01`, to: `${b}-12-31`, fmt: "YYYY" };
  }
  const start = q.startMonth ?? `${today.slice(0, 4)}-01`;
  const end = q.endMonth ?? today.slice(0, 7);
  if (end < start) throw badRequest("The end month is before the start month");
  const periods: Period[] = [];
  let [y, m] = start.split("-").map(Number);
  const spansYears = start.slice(0, 4) !== end.slice(0, 4);
  while (`${y}-${String(m).padStart(2, "0")}` <= end) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    periods.push({ key, label: spansYears ? `${MONTHS[m - 1].slice(0, 3)} ${y}` : MONTHS[m - 1] });
    if (periods.length > 240) throw badRequest("Choose at most 240 months");
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return { periods, from: `${start}-01`, to: lastDay(end), fmt: "YYYY-MM" };
}

async function context(auth: AuthContext, q: RangeQuery) {
  const base = await reportContext(auth, { locationId: q.locationId });
  const p = periodsFor(q, base.range.to);
  const c: ReportContext = { ...base, range: { from: p.from, to: p.to } };
  return { c, ...p };
}

interface PeriodRow {
  period: string;
  revenue: number;
  costOfGoods: number;
  purchases: number;
  expenses: number; // recorded expenses plus write-offs
}

async function perPeriod(c: ReportContext, periods: Period[], fmt: string): Promise<PeriodRow[]> {
  const [sales, purchases, expenses, writeOffs] = await Promise.all([
    rows<{ k: string; revenue: string; cost: string }>(sql`
      select to_char(l.day, ${fmt}) as k, coalesce(sum(l.revenue), 0) as revenue, coalesce(sum(l.cost), 0) as cost
        from (${saleLinesSql(c)}) l group by 1`),
    rows<{ k: string; amount: string }>(sql`
      select to_char(pu.purchase_date, ${fmt}) as k, coalesce(sum(pu.grand_total), 0) as amount
        from purchases pu
       where pu.organization_id = ${c.orgId} and pu.status = 'POSTED'
         and pu.purchase_date between ${c.range.from} and ${c.range.to} ${c.loc(sql`pu.location_id`)}
       group by 1`),
    rows<{ k: string; amount: string }>(sql`
      select to_char(fe.entry_date, ${fmt}) as k, coalesce(sum(fe.amount), 0) as amount
        from finance_entries fe
       where fe.organization_id = ${c.orgId} and fe.kind = 'EXPENSE'
         and fe.entry_date between ${c.range.from} and ${c.range.to} ${c.loc(sql`fe.location_id`)}
       group by 1`),
    rows<{ k: string; amount: string }>(sql`
      select to_char(w.day, ${fmt}) as k, coalesce(sum(w.loss), 0) as amount from (${writeOffsSql(c)}) w group by 1`),
  ]);
  const by = <T extends { k: string }>(list: T[]) => new Map(list.map((r) => [r.k, r]));
  const s = by(sales);
  const pu = by(purchases);
  const ex = by(expenses);
  const wo = by(writeOffs);
  return periods.map((p) => ({
    period: p.label,
    revenue: round2(num(s.get(p.key)?.revenue)),
    costOfGoods: round2(num(s.get(p.key)?.cost)),
    purchases: round2(num(pu.get(p.key)?.amount)),
    expenses: round2(num(ex.get(p.key)?.amount) + num(wo.get(p.key)?.amount)),
  }));
}

const sum = (list: PeriodRow[], k: keyof Omit<PeriodRow, "period">) => round2(list.reduce((t, r) => t + r[k], 0));
const profitOf = (r: { revenue: number; costOfGoods: number; expenses: number }) => round2(r.revenue - r.costOfGoods - r.expenses);

// ── analytics ────────────────────────────────────────────────

export async function analyticsStats(auth: AuthContext, q: RangeQuery) {
  const { c, periods, fmt } = await context(auth, q);
  const list = await perPeriod(c, periods, fmt);
  const revenue = sum(list, "revenue");
  const totalExpense = round2(sum(list, "costOfGoods") + sum(list, "expenses"));
  return { revenue, totalExpense, netProfit: round2(revenue - totalExpense) };
}

export async function analyticsBreakdown(auth: AuthContext, q: RangeQuery) {
  const { c, periods, fmt } = await context(auth, q);
  return (await perPeriod(c, periods, fmt)).map((r) => ({
    period: r.period,
    purchaseExpense: r.costOfGoods,
    manualExpense: r.expenses,
    totalExpense: round2(r.costOfGoods + r.expenses),
    revenue: r.revenue,
    netProfit: profitOf(r),
  }));
}

export async function analyticsTrend(auth: AuthContext, q: RangeQuery) {
  const { c, periods, fmt } = await context(auth, q);
  return (await perPeriod(c, periods, fmt)).map((r) => ({
    period: r.period,
    revenue: r.revenue,
    totalExpense: round2(r.costOfGoods + r.expenses),
    netProfit: profitOf(r),
  }));
}

export async function expenseSplit(auth: AuthContext, q: RangeQuery) {
  const { c } = await context(auth, q);
  const [[cogs], [lost], cats] = await Promise.all([
    rows<{ cost: string }>(sql`select coalesce(sum(l.cost), 0) as cost from (${saleLinesSql(c)}) l`),
    rows<{ loss: string }>(sql`select coalesce(sum(w.loss), 0) as loss from (${writeOffsSql(c)}) w`),
    rows<{ category: string; amount: string }>(sql`
      select coalesce(fc.name, 'Other') as category, sum(fe.amount) as amount
        from finance_entries fe left join finance_categories fc on fc.id = fe.category_id
       where fe.organization_id = ${c.orgId} and fe.kind = 'EXPENSE'
         and fe.entry_date between ${c.range.from} and ${c.range.to} ${c.loc(sql`fe.location_id`)}
       group by 1 order by 2 desc`),
  ]);
  const categories = [
    ...(num(cogs.cost) > 0 ? [{ category: "Cost of Goods", amount: round2(num(cogs.cost)) }] : []),
    ...cats.map((r) => ({ category: r.category, amount: round2(num(r.amount)) })),
    ...(num(lost.loss) > 0 ? [{ category: "Inventory Write-off", amount: round2(num(lost.loss)) }] : []),
  ];
  return { categories, total: round2(categories.reduce((t, r) => t + r.amount, 0)) };
}

// ── dashboard ────────────────────────────────────────────────

export async function dashboardStats(auth: AuthContext, q: RangeQuery) {
  const { c, periods, fmt } = await context(auth, q);
  const list = await perPeriod(c, periods, fmt);
  const today = (await reportContext(auth, { locationId: q.locationId })).range.to;
  const threshold = sql`coalesce(v.low_stock_threshold, pr.low_stock_threshold)`;
  const [inv] = await rows<Record<string, string>>(sql`
    select
      (select count(*) from product_variants v join products pr on pr.id = v.product_id
        where pr.organization_id = ${c.orgId} and v.is_active and pr.is_active) as total_items,
      (select count(*) from stock_levels sl join product_variants v on v.id = sl.variant_id join products pr on pr.id = v.product_id
        where sl.organization_id = ${c.orgId} and v.is_active and pr.is_active ${c.loc(sql`sl.location_id`)}
          and ${threshold} is not null and sl.quantity <= ${threshold}) as low_stock,
      (select count(*) from stock_lots l where l.organization_id = ${c.orgId} and l.quantity_available > 0
          and l.expiry_date <= ${addDays(today, c.settings.expiryAlertDays)} ${c.loc(sql`l.location_id`)}) as expiring`);
  const revenue = sum(list, "revenue");
  const netProfit = round2(revenue - sum(list, "costOfGoods") - sum(list, "expenses"));
  return {
    stats: {
      totalSales: revenue,
      purchases: sum(list, "purchases"),
      outflow: sum(list, "expenses"),
      netProfit,
      profitMargin: revenue > 0 ? round2((netProfit / revenue) * 100) : 0,
    },
    inventoryStatus: { totalItems: num(inv.total_items), lowStockCount: num(inv.low_stock), expiringCount: num(inv.expiring) },
  };
}

export async function dashboardTrend(auth: AuthContext, q: RangeQuery) {
  const { c, periods, fmt } = await context(auth, q);
  const list = await perPeriod(c, periods, fmt);
  return {
    points: list.map((r) => ({ label: r.period, revenue: r.revenue, expenses: round2(r.costOfGoods + r.expenses), netProfit: profitOf(r) })),
  };
}

export async function dashboardBreakdown(auth: AuthContext, q: RangeQuery) {
  const { c } = await context(auth, q);
  const list =
    q.by === "payment"
      ? await rows<{ label: string; amount: string }>(sql`
          select initcap(replace(pay.method::text, '_', ' ')) as label,
                 sum(case when pay.direction = 'RECEIVED_FROM_CUSTOMER' then pay.amount else -pay.amount end) as amount
            from payments pay
           where pay.organization_id = ${c.orgId} and pay.status = 'POSTED'
             and pay.direction in ('RECEIVED_FROM_CUSTOMER', 'REFUND_TO_CUSTOMER')
             and pay.payment_date between ${c.range.from} and ${c.range.to} ${c.loc(sql`pay.location_id`)}
           group by 1 having sum(case when pay.direction = 'RECEIVED_FROM_CUSTOMER' then pay.amount else -pay.amount end) > 0
           order by 2 desc`)
      : await rows<{ label: string; amount: string }>(sql`
          select coalesce(max(cat.name), 'Uncategorised') as label, sum(l.revenue) as amount
            from (${saleLinesSql(c)}) l
            join product_variants v on v.id = l.variant_id join products pr on pr.id = v.product_id
            left join categories cat on cat.id = pr.category_id
           group by coalesce(pr.category_id::text, 'none') having sum(l.revenue) > 0 order by 2 desc`);
  const total = list.reduce((t, r) => t + num(r.amount), 0);
  return {
    slices: list.map((r) => ({
      label: r.label,
      amount: round2(num(r.amount)),
      percent: total > 0 ? Math.round((num(r.amount) / total) * 1000) / 10 : 0,
    })),
  };
}

export async function dashboardWatchlist(auth: AuthContext, q: RangeQuery) {
  const c = await reportContext(auth, { locationId: q.locationId });
  const today = c.range.to;
  const soon = addDays(today, c.settings.expiryAlertDays);
  const name = sql`case when v.is_default then pr.name else pr.name || ' (' || v.name || ')' end`;
  const threshold = sql`coalesce(v.low_stock_threshold, pr.low_stock_threshold)`;
  const [lots, low] = await Promise.all([
    rows<Record<string, string>>(sql`
      select ${name} as name, b.name as brand, u.code as unit, l.lot_number, l.expiry_date::text as expiry_date,
             sup.name as supplier, (l.expiry_date - ${today}::date) as days_left,
             l.quantity_available, l.quantity_received
        from stock_lots l
        join product_variants v on v.id = l.variant_id join products pr on pr.id = v.product_id
        join units u on u.id = pr.unit_id
        left join brands b on b.id = pr.brand_id
        left join parties sup on sup.id = l.supplier_id
       where l.organization_id = ${c.orgId} and l.quantity_available > 0 and l.expiry_date <= ${soon} ${c.loc(sql`l.location_id`)}
       order by l.expiry_date`),
    rows<Record<string, string>>(sql`
      select ${name} as name, b.name as brand, u.code as unit, sl.quantity, ${threshold} as threshold
        from stock_levels sl
        join product_variants v on v.id = sl.variant_id join products pr on pr.id = v.product_id
        join units u on u.id = pr.unit_id
        left join brands b on b.id = pr.brand_id
       where sl.organization_id = ${c.orgId} and v.is_active and pr.is_active ${c.loc(sql`sl.location_id`)}
         and ${threshold} is not null and sl.quantity <= ${threshold}
       order by sl.quantity`),
  ]);
  return {
    items: [
      ...lots.map((l) => ({
        status: num(l.days_left) < 0 ? "EXPIRED" : "NEAR_EXPIRY",
        name: l.name,
        manufacturer: l.brand,
        unit: l.unit,
        batchNumber: l.lot_number ?? "—",
        expiryDate: l.expiry_date,
        supplierName: l.supplier,
        daysLeft: num(l.days_left),
        quantityAvailable: num(l.quantity_available),
        quantityReceived: num(l.quantity_received),
      })),
      ...low.map((l) => ({
        status: "LOW_STOCK",
        name: l.name,
        manufacturer: l.brand,
        unit: l.unit,
        batchNumber: null,
        expiryDate: null,
        quantityAvailable: num(l.quantity),
        quantityReceived: num(l.threshold),
      })),
    ],
  };
}

export async function dashboardRecent(auth: AuthContext, q: RangeQuery) {
  const c = await reportContext(auth, { locationId: q.locationId });
  const limit = q.limit ?? 5;
  const list = await rows<Record<string, string>>(sql`
    (select 'SALE' as type, s.id, s.invoice_number as voucher_no, coalesce(p.name, s.customer_name, 'Walk-in customer') as party_name,
            s.grand_total as amount, s.sale_date as date, s.payment_status::text as payment_type
       from sales s left join parties p on p.id = s.party_id
      where s.organization_id = ${c.orgId} and s.status = 'POSTED' ${c.loc(sql`s.location_id`)}
      order by s.sale_date desc limit ${limit})
    union all
    (select 'PURCHASE', pu.id, pu.number, p.name, pu.grand_total, pu.created_at, pu.payment_status::text
       from purchases pu join parties p on p.id = pu.party_id
      where pu.organization_id = ${c.orgId} and pu.status = 'POSTED' ${c.loc(sql`pu.location_id`)}
      order by pu.created_at desc limit ${limit})
    union all
    (select 'EXPENSE', fe.id, coalesce(fc.name, 'Expense'), coalesce(nullif(left(fe.description, 40), ''), 'Expense'), fe.amount, fe.created_at, fe.method::text
       from finance_entries fe left join finance_categories fc on fc.id = fe.category_id
      where fe.organization_id = ${c.orgId} and fe.kind = 'EXPENSE' ${c.loc(sql`fe.location_id`)}
      order by fe.created_at desc limit ${limit})
    order by date desc limit ${limit}`);
  const label = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ") : null);
  return {
    items: list.map((r) => ({
      type: r.type,
      id: r.id,
      voucherNo: r.voucher_no,
      partyName: r.party_name,
      amount: String(round2(num(r.amount))),
      date: r.date,
      paymentType: label(r.payment_type),
    })),
  };
}
