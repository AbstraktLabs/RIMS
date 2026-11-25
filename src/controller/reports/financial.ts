import { sql } from "drizzle-orm";
import type { z } from "zod";
import type { AuthContext } from "@/lib/api/handler";
import { num, round2 } from "@/lib/num";
import type { profitLossQuery, taxReportQuery } from "@/lib/validation/reports";
import { previousRange, type DateRange } from "../_shared/dates";
import { reportContext, rows, type ReportContext } from "./context";

async function computeProfitLoss(c: ReportContext, range: DateRange) {
  const saleDay = sql`(s.sale_date at time zone ${c.tz})::date`;
  const [t] = await rows<Record<string, string>>(sql`
    select
      (select coalesce(sum(s.grand_total - s.tax_amount), 0) from sales s
        where s.organization_id = ${c.orgId} and s.status = 'POSTED' and ${saleDay} between ${range.from} and ${range.to} ${c.loc(sql`s.location_id`)}) as sales,
      (select coalesce(sum(s.discount), 0) from sales s
        where s.organization_id = ${c.orgId} and s.status = 'POSTED' and ${saleDay} between ${range.from} and ${range.to} ${c.loc(sql`s.location_id`)}) as discounts,
      (select coalesce(sum(r.grand_total - r.tax_amount), 0) from sale_returns r
        where r.organization_id = ${c.orgId} and r.status = 'POSTED' and r.return_date between ${range.from} and ${range.to} ${c.loc(sql`r.location_id`)}) as returns,
      (select coalesce(sum(si.quantity * si.unit_cost), 0) from sale_items si join sales s on s.id = si.sale_id
        where s.organization_id = ${c.orgId} and s.status = 'POSTED' and ${saleDay} between ${range.from} and ${range.to} ${c.loc(sql`s.location_id`)}) as cogs,
      (select coalesce(sum(ri.quantity * ri.unit_cost) filter (where ri.restocked), 0) from sale_return_items ri join sale_returns r on r.id = ri.sale_return_id
        where r.organization_id = ${c.orgId} and r.status = 'POSTED' and r.return_date between ${range.from} and ${range.to} ${c.loc(sql`r.location_id`)}) as cogs_reversed,
      (select coalesce(sum(ri.quantity * ri.unit_cost) filter (where not ri.restocked), 0) from sale_return_items ri join sale_returns r on r.id = ri.sale_return_id
        where r.organization_id = ${c.orgId} and r.status = 'POSTED' and r.return_date between ${range.from} and ${range.to} ${c.loc(sql`r.location_id`)}) as damaged_returns,
      (select coalesce(-sum(a.total_value) filter (where a.total_value < 0), 0) from stock_adjustments a
        where a.organization_id = ${c.orgId} and a.reason <> 'OPENING_STOCK' and a.adjustment_date between ${range.from} and ${range.to} ${c.loc(sql`a.location_id`)}) as stock_loss,
      (select coalesce(sum(a.total_value) filter (where a.total_value > 0), 0) from stock_adjustments a
        where a.organization_id = ${c.orgId} and a.reason <> 'OPENING_STOCK' and a.adjustment_date between ${range.from} and ${range.to} ${c.loc(sql`a.location_id`)}) as stock_gain`);

  const entries = await rows<{ kind: string; category: string; amount: string }>(sql`
    select fe.kind, coalesce(fc.name, 'Uncategorised') as category, sum(fe.amount) as amount
      from finance_entries fe left join finance_categories fc on fc.id = fe.category_id
     where fe.organization_id = ${c.orgId} and fe.entry_date between ${range.from} and ${range.to} ${c.loc(sql`fe.location_id`)}
     group by 1, 2 order by amount desc`);

  const salesNet = round2(num(t.sales));
  const returns = round2(num(t.returns));
  const netRevenue = round2(salesNet - returns);
  const cogs = round2(num(t.cogs) - num(t.cogs_reversed));
  const grossProfit = round2(netRevenue - cogs);
  const stockLoss = round2(num(t.stock_loss));
  const stockGain = round2(num(t.stock_gain));
  const income = entries.filter((e) => e.kind === "INCOME").map((e) => ({ category: e.category, amount: round2(num(e.amount)) }));
  const expenses = entries.filter((e) => e.kind === "EXPENSE").map((e) => ({ category: e.category, amount: round2(num(e.amount)) }));
  const otherIncome = round2(income.reduce((a, e) => a + e.amount, 0));
  const totalExpenses = round2(expenses.reduce((a, e) => a + e.amount, 0));
  const netProfit = round2(grossProfit + stockGain - stockLoss + otherIncome - totalExpenses);

  return {
    range,
    revenue: { sales: salesNet, discountsGiven: round2(num(t.discounts)), returns, netRevenue },
    costOfGoodsSold: { cogs, damagedReturnsCost: round2(num(t.damaged_returns)) },
    grossProfit,
    grossMargin: netRevenue > 0 ? round2((grossProfit / netRevenue) * 100) : 0,
    stockAdjustments: { loss: stockLoss, gain: stockGain },
    otherIncome: { total: otherIncome, byCategory: income },
    expenses: { total: totalExpenses, byCategory: expenses },
    netProfit,
    netMargin: netRevenue > 0 ? round2((netProfit / netRevenue) * 100) : 0,
  };
}

export async function profitLoss(auth: AuthContext, q: z.infer<typeof profitLossQuery>) {
  const c = await reportContext(auth, q);
  const current = await computeProfitLoss(c, c.range);
  const previous = q.compare === "true" ? await computeProfitLoss(c, previousRange(c.range)) : undefined;
  const change = (a: number, b: number) => (b === 0 ? null : round2(((a - b) / Math.abs(b)) * 100));
  return {
    locationId: c.locationId ?? "all",
    basis: "Revenue excludes tax. Cost of goods sold uses the cost of the stock lots each sale drew from.",
    ...current,
    ...(previous && {
      previous,
      changePercent: {
        netRevenue: change(current.revenue.netRevenue, previous.revenue.netRevenue),
        grossProfit: change(current.grossProfit, previous.grossProfit),
        expenses: change(current.expenses.total, previous.expenses.total),
        netProfit: change(current.netProfit, previous.netProfit),
      },
    }),
  };
}

export async function taxReport(auth: AuthContext, q: z.infer<typeof taxReportQuery>) {
  const c = await reportContext(auth, q);
  const saleDay = sql`(s.sale_date at time zone ${c.tz})::date`;
  const r = c.range;

  type Row = { key: string; out_taxable: string; out_tax: string; in_taxable: string; in_tax: string };
  let items: Row[];
  if (q.groupBy === "month") {
    items = await rows<Row>(sql`
      select key, sum(out_taxable) as out_taxable, sum(out_tax) as out_tax, sum(in_taxable) as in_taxable, sum(in_tax) as in_tax from (
        select to_char(${saleDay}, 'YYYY-MM') as key, s.grand_total - s.tax_amount as out_taxable, s.tax_amount as out_tax, 0 as in_taxable, 0 as in_tax
          from sales s where s.organization_id = ${c.orgId} and s.status = 'POSTED' and ${saleDay} between ${r.from} and ${r.to} ${c.loc(sql`s.location_id`)}
        union all
        select to_char(sr.return_date, 'YYYY-MM'), -(sr.grand_total - sr.tax_amount), -sr.tax_amount, 0, 0
          from sale_returns sr where sr.organization_id = ${c.orgId} and sr.status = 'POSTED' and sr.return_date between ${r.from} and ${r.to} ${c.loc(sql`sr.location_id`)}
        union all
        select to_char(p.purchase_date, 'YYYY-MM'), 0, 0, p.grand_total - p.tax_amount, p.tax_amount
          from purchases p where p.organization_id = ${c.orgId} and p.status = 'POSTED' and p.purchase_date between ${r.from} and ${r.to} ${c.loc(sql`p.location_id`)}
        union all
        select to_char(pr.return_date, 'YYYY-MM'), 0, 0, -(pr.grand_total - pr.tax_amount), -pr.tax_amount
          from purchase_returns pr where pr.organization_id = ${c.orgId} and pr.status <> 'VOID' and pr.return_date between ${r.from} and ${r.to} ${c.loc(sql`pr.location_id`)}
      ) t group by key order by key`);
  } else {
    // by rate: line level, so bill-level charges/round-off are not included
    const billFactor = (alias: string) =>
      sql.raw(`(case when ${alias}.subtotal > 0 then 1 - ${alias}.discount / ${alias}.subtotal else 1 end)`);
    items = await rows<Row>(sql`
      select key, sum(out_taxable) as out_taxable, sum(out_tax) as out_tax, sum(in_taxable) as in_taxable, sum(in_tax) as in_tax from (
        select (si.tax_rate::numeric)::text as key,
               si.line_total * ${billFactor("s")} - case when s.tax_mode = 'INCLUSIVE' then si.tax_amount else 0 end as out_taxable,
               si.tax_amount as out_tax, 0 as in_taxable, 0 as in_tax
          from sale_items si join sales s on s.id = si.sale_id
         where s.organization_id = ${c.orgId} and s.status = 'POSTED' and ${saleDay} between ${r.from} and ${r.to} ${c.loc(sql`s.location_id`)}
        union all
        select (si.tax_rate::numeric)::text, -(ri.line_total - ri.tax_amount), -ri.tax_amount, 0, 0
          from sale_return_items ri join sale_returns sr on sr.id = ri.sale_return_id join sale_items si on si.id = ri.sale_item_id
         where sr.organization_id = ${c.orgId} and sr.status = 'POSTED' and sr.return_date between ${r.from} and ${r.to} ${c.loc(sql`sr.location_id`)}
        union all
        select (pi.tax_rate::numeric)::text, 0, 0,
               pi.line_total * ${billFactor("p")} - case when p.tax_mode = 'INCLUSIVE' then pi.tax_amount else 0 end, pi.tax_amount
          from purchase_items pi join purchases p on p.id = pi.purchase_id
         where p.organization_id = ${c.orgId} and p.status = 'POSTED' and p.purchase_date between ${r.from} and ${r.to} ${c.loc(sql`p.location_id`)}
        union all
        select (ri.tax_rate::numeric)::text, 0, 0, -(ri.line_total - ri.tax_amount), -ri.tax_amount
          from purchase_return_items ri join purchase_returns pr on pr.id = ri.purchase_return_id
         where pr.organization_id = ${c.orgId} and pr.status <> 'VOID' and pr.return_date between ${r.from} and ${r.to} ${c.loc(sql`pr.location_id`)}
      ) t group by key order by key::numeric`);
  }

  const mapped = items.map((x) => {
    const outputTax = round2(num(x.out_tax));
    const inputTax = round2(num(x.in_tax));
    return {
      key: x.key,
      label: q.groupBy === "rate" ? `${num(x.key)}%` : x.key,
      taxableSales: round2(num(x.out_taxable)),
      outputTax,
      taxablePurchases: round2(num(x.in_taxable)),
      inputTax,
      netPayable: round2(outputTax - inputTax),
    };
  });
  const total = (k: "taxableSales" | "outputTax" | "taxablePurchases" | "inputTax" | "netPayable") =>
    round2(mapped.reduce((a, m) => a + m[k], 0));
  return {
    range: r,
    taxLabel: c.settings.taxLabel,
    taxRegistered: c.settings.taxRegistered,
    groupBy: q.groupBy,
    items: mapped,
    summary: {
      taxableSales: total("taxableSales"),
      outputTax: total("outputTax"),
      taxablePurchases: total("taxablePurchases"),
      inputTax: total("inputTax"),
      netPayable: total("netPayable"),
    },
  };
}
