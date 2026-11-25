import { sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import type { AuthContext } from "@/lib/api/handler";
import { num, round2 } from "@/lib/num";
import type { purchasesReportQuery, salesReportQuery } from "@/lib/validation/reports";
import { numeric, reportContext, rows, type ReportContext } from "./context";

/**
 * Sale lines (+) and sale-return lines (−) in the range, each with revenue
 * excluding tax and after its share of the bill discount, and cost of goods.
 * Damaged returns don't reverse cost (the goods are lost).
 */
export function saleLinesSql(c: ReportContext): SQL {
  return sql`
    select s.id as doc_id, (s.sale_date at time zone ${c.tz})::date as day, s.location_id, s.party_id,
           coalesce(p.name, s.customer_name, 'Walk-in customer') as customer, s.created_by_user_id as user_id,
           si.variant_id, si.quantity as qty,
           si.line_total * (case when s.subtotal > 0 then 1 - s.discount / s.subtotal else 1 end)
             - case when s.tax_mode = 'INCLUSIVE' then si.tax_amount else 0 end as revenue,
           si.tax_amount as tax, si.quantity * si.unit_cost as cost, 1 as kind
      from sale_items si
      join sales s on s.id = si.sale_id
      left join parties p on p.id = s.party_id
     where s.organization_id = ${c.orgId} and s.status = 'POSTED'
       and (s.sale_date at time zone ${c.tz})::date between ${c.range.from} and ${c.range.to} ${c.loc(sql`s.location_id`)}
    union all
    select s.id, r.return_date, r.location_id, s.party_id,
           coalesce(p.name, s.customer_name, 'Walk-in customer'), r.created_by_user_id,
           ri.variant_id, -ri.quantity, -(ri.line_total - ri.tax_amount), -ri.tax_amount,
           -(case when ri.restocked then ri.quantity * ri.unit_cost else 0 end), -1
      from sale_return_items ri
      join sale_returns r on r.id = ri.sale_return_id
      join sales s on s.id = r.sale_id
      left join parties p on p.id = s.party_id
     where r.organization_id = ${c.orgId} and r.status = 'POSTED'
       and r.return_date between ${c.range.from} and ${c.range.to} ${c.loc(sql`r.location_id`)}`;
}

const GROUPS: Record<string, { key: SQL; label: SQL; joins: SQL; order: SQL }> = {
  day: { key: sql`l.day::text`, label: sql`l.day::text`, joins: sql``, order: sql`1 asc` },
  month: { key: sql`to_char(l.day, 'YYYY-MM')`, label: sql`to_char(l.day, 'YYYY-MM')`, joins: sql``, order: sql`1 asc` },
  product: {
    key: sql`l.variant_id::text`,
    label: sql`max(case when v.is_default then pr.name else pr.name || ' (' || v.name || ')' end)`,
    joins: sql`join product_variants v on v.id = l.variant_id join products pr on pr.id = v.product_id`,
    order: sql`revenue desc`,
  },
  category: {
    key: sql`coalesce(pr.category_id::text, 'none')`,
    label: sql`coalesce(max(cat.name), 'Uncategorised')`,
    joins: sql`join product_variants v on v.id = l.variant_id join products pr on pr.id = v.product_id left join categories cat on cat.id = pr.category_id`,
    order: sql`revenue desc`,
  },
  brand: {
    key: sql`coalesce(pr.brand_id::text, 'none')`,
    label: sql`coalesce(max(b.name), 'No brand')`,
    joins: sql`join product_variants v on v.id = l.variant_id join products pr on pr.id = v.product_id left join brands b on b.id = pr.brand_id`,
    order: sql`revenue desc`,
  },
  customer: {
    key: sql`coalesce(l.party_id::text, 'walk-in')`,
    label: sql`case when max(l.party_id::text) is null then 'Walk-in customers' else max(l.customer) end`,
    joins: sql``,
    order: sql`revenue desc`,
  },
  user: {
    key: sql`coalesce(l.user_id::text, 'none')`,
    label: sql`coalesce(max(u.name), 'Unknown')`,
    joins: sql`left join users u on u.id = l.user_id`,
    order: sql`revenue desc`,
  },
  location: {
    key: sql`l.location_id::text`,
    label: sql`max(lo.name)`,
    joins: sql`join locations lo on lo.id = l.location_id`,
    order: sql`revenue desc`,
  },
};

type Row = {
  key: string;
  label: string;
  documents: number;
  quantity: string;
  revenue: string;
  tax: string;
  cost: string;
};

export async function salesReport(auth: AuthContext, q: z.infer<typeof salesReportQuery>) {
  const c = await reportContext(auth, q);
  const showCost = auth.isOwner || auth.permissions.includes("reports.view");

  let items: Record<string, unknown>[];
  if (q.groupBy === "paymentMethod") {
    const res = await rows<{ key: string; label: string; documents: number; received: string; refunded: string }>(sql`
      select pay.method::text as key, initcap(replace(pay.method::text, '_', ' ')) as label, count(*)::int as documents,
             coalesce(sum(pay.amount) filter (where pay.direction = 'RECEIVED_FROM_CUSTOMER'), 0) as received,
             coalesce(sum(pay.amount) filter (where pay.direction = 'REFUND_TO_CUSTOMER'), 0) as refunded
        from payments pay
       where pay.organization_id = ${c.orgId} and pay.status = 'POSTED'
         and pay.direction in ('RECEIVED_FROM_CUSTOMER', 'REFUND_TO_CUSTOMER')
         and pay.payment_date between ${c.range.from} and ${c.range.to} ${c.loc(sql`pay.location_id`)}
       group by 1, 2 order by received desc`);
    items = res.map((r) => {
      const x = numeric(r, ["received", "refunded"]);
      return { ...x, net: round2(num(r.received) - num(r.refunded)) };
    });
  } else {
    const g = GROUPS[q.groupBy];
    const res = await rows<Row>(sql`
      select ${g.key} as key, ${g.label} as label,
             count(distinct l.doc_id) filter (where l.kind = 1)::int as documents,
             sum(l.qty) as quantity, sum(l.revenue) as revenue, sum(l.tax) as tax, sum(l.cost) as cost
        from (${saleLinesSql(c)}) l ${g.joins}
       group by 1 order by ${g.order} limit ${q.limit}`);
    items = res.map((r) => {
      const revenue = round2(num(r.revenue));
      const cost = round2(num(r.cost));
      return {
        key: r.key,
        label: r.label,
        documents: r.documents,
        quantity: Math.round(num(r.quantity) * 1000) / 1000,
        revenue,
        tax: round2(num(r.tax)),
        ...(showCost && {
          cost,
          profit: round2(revenue - cost),
          margin: revenue > 0 ? round2(((revenue - cost) / revenue) * 100) : 0,
        }),
      };
    });
  }

  // headline totals at document level (includes delivery charges and round-off)
  const [t] = await rows<Record<string, string>>(sql`
    select
      (select count(*) from sales s where s.organization_id = ${c.orgId} and s.status = 'POSTED'
         and (s.sale_date at time zone ${c.tz})::date between ${c.range.from} and ${c.range.to} ${c.loc(sql`s.location_id`)}) as invoices,
      (select coalesce(sum(s.grand_total), 0) from sales s where s.organization_id = ${c.orgId} and s.status = 'POSTED'
         and (s.sale_date at time zone ${c.tz})::date between ${c.range.from} and ${c.range.to} ${c.loc(sql`s.location_id`)}) as gross_sales,
      (select coalesce(sum(s.tax_amount), 0) from sales s where s.organization_id = ${c.orgId} and s.status = 'POSTED'
         and (s.sale_date at time zone ${c.tz})::date between ${c.range.from} and ${c.range.to} ${c.loc(sql`s.location_id`)}) as sales_tax,
      (select coalesce(sum(s.discount), 0) from sales s where s.organization_id = ${c.orgId} and s.status = 'POSTED'
         and (s.sale_date at time zone ${c.tz})::date between ${c.range.from} and ${c.range.to} ${c.loc(sql`s.location_id`)}) as bill_discounts,
      (select coalesce(sum(r.grand_total), 0) from sale_returns r where r.organization_id = ${c.orgId} and r.status = 'POSTED'
         and r.return_date between ${c.range.from} and ${c.range.to} ${c.loc(sql`r.location_id`)}) as returns,
      (select coalesce(sum(l.revenue), 0) from (${saleLinesSql(c)}) l) as net_revenue,
      (select coalesce(sum(l.cost), 0) from (${saleLinesSql(c)}) l) as cost`);
  const invoices = num(t.invoices);
  const netRevenue = round2(num(t.net_revenue));
  const cost = round2(num(t.cost));
  return {
    range: c.range,
    locationId: c.locationId ?? "all",
    groupBy: q.groupBy,
    items,
    summary: {
      invoices,
      grossSales: round2(num(t.gross_sales)),
      billDiscounts: round2(num(t.bill_discounts)),
      salesTax: round2(num(t.sales_tax)),
      returns: round2(num(t.returns)),
      netRevenue,
      averageSale: invoices > 0 ? round2(num(t.gross_sales) / invoices) : 0,
      ...(showCost && {
        cost,
        grossProfit: round2(netRevenue - cost),
        margin: netRevenue > 0 ? round2(((netRevenue - cost) / netRevenue) * 100) : 0,
      }),
    },
  };
}

// ── purchases ────────────────────────────────────────────────
const PGROUPS: Record<string, { key: SQL; label: SQL; joins: SQL; order: SQL }> = {
  day: { key: sql`pu.purchase_date::text`, label: sql`pu.purchase_date::text`, joins: sql``, order: sql`1 asc` },
  month: { key: sql`to_char(pu.purchase_date, 'YYYY-MM')`, label: sql`to_char(pu.purchase_date, 'YYYY-MM')`, joins: sql``, order: sql`1 asc` },
  supplier: { key: sql`pu.party_id::text`, label: sql`max(pa.name)`, joins: sql`join parties pa on pa.id = pu.party_id`, order: sql`amount desc` },
  product: {
    key: sql`pi.variant_id::text`,
    label: sql`max(case when v.is_default then pr.name else pr.name || ' (' || v.name || ')' end)`,
    joins: sql`join product_variants v on v.id = pi.variant_id join products pr on pr.id = v.product_id`,
    order: sql`amount desc`,
  },
  category: {
    key: sql`coalesce(pr.category_id::text, 'none')`,
    label: sql`coalesce(max(cat.name), 'Uncategorised')`,
    joins: sql`join product_variants v on v.id = pi.variant_id join products pr on pr.id = v.product_id left join categories cat on cat.id = pr.category_id`,
    order: sql`amount desc`,
  },
};

export async function purchasesReport(auth: AuthContext, q: z.infer<typeof purchasesReportQuery>) {
  const c = await reportContext(auth, q);
  const g = PGROUPS[q.groupBy];
  const where = sql`pu.organization_id = ${c.orgId} and pu.status = 'POSTED'
    and pu.purchase_date between ${c.range.from} and ${c.range.to} ${c.loc(sql`pu.location_id`)}`;
  const res = await rows<{ key: string; label: string; documents: number; quantity: string; amount: string; tax: string; landed: string }>(sql`
    select ${g.key} as key, ${g.label} as label, count(distinct pu.id)::int as documents, sum(pi.quantity) as quantity,
           sum(pi.line_total * (case when pu.subtotal > 0 then 1 - pu.discount / pu.subtotal else 1 end)
               - case when pu.tax_mode = 'INCLUSIVE' then pi.tax_amount else 0 end) as amount,
           sum(pi.tax_amount) as tax, sum(pi.quantity * pi.landed_unit_cost) as landed
      from purchase_items pi join purchases pu on pu.id = pi.purchase_id ${g.joins}
     where ${where}
     group by 1 order by ${g.order} limit ${q.limit}`);
  const [t] = await rows<Record<string, string>>(sql`
    select
      (select count(*) from purchases pu where ${where}) as bills,
      (select coalesce(sum(pu.grand_total), 0) from purchases pu where ${where}) as total,
      (select coalesce(sum(pu.tax_amount), 0) from purchases pu where ${where}) as tax,
      (select coalesce(sum(pu.paid_amount), 0) from purchases pu where ${where}) as paid,
      (select coalesce(sum(r.grand_total), 0) from purchase_returns r where r.organization_id = ${c.orgId}
         and r.status <> 'VOID' and r.return_date between ${c.range.from} and ${c.range.to} ${c.loc(sql`r.location_id`)}) as returns`);
  return {
    range: c.range,
    groupBy: q.groupBy,
    items: res.map((r) => ({
      key: r.key,
      label: r.label,
      documents: r.documents,
      quantity: Math.round(num(r.quantity) * 1000) / 1000,
      amount: round2(num(r.amount)),
      tax: round2(num(r.tax)),
      landedCost: round2(num(r.landed)),
    })),
    summary: {
      bills: num(t.bills),
      total: round2(num(t.total)),
      tax: round2(num(t.tax)),
      paid: round2(num(t.paid)),
      unpaid: round2(num(t.total) - num(t.paid)),
      returns: round2(num(t.returns)),
    },
  };
}
