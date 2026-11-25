import { sql } from "drizzle-orm";
import type { z } from "zod";
import type { AuthContext } from "@/lib/api/handler";
import { num, round2, round3 } from "@/lib/num";
import type { dashboardQuery } from "@/lib/validation/reports";
import { allBalancesSql } from "../_shared/ledger";
import { addDays, startOfMonth } from "../_shared/dates";
import { canSeeCost, reportContext, rows } from "./context";
import { saleLinesSql } from "./sales";

export async function dashboard(auth: AuthContext, q: z.infer<typeof dashboardQuery>) {
  // range = last 30 days ending today
  const c = await reportContext(auth, q, 30);
  const today = c.range.to;
  const monthStart = startOfMonth(today);
  const showCost = canSeeCost(auth);
  const saleDay = sql`(s.sale_date at time zone ${c.tz})::date`;
  const posted = sql`s.organization_id = ${c.orgId} and s.status = 'POSTED' ${c.loc(sql`s.location_id`)}`;
  const threshold = sql`coalesce(v.low_stock_threshold, pr.low_stock_threshold)`;

  const [[k], trend, top, recent, methods, [bal], [pending]] = await Promise.all([
    rows<Record<string, string>>(sql`
      select
        (select count(*) from sales s where ${posted} and ${saleDay} = ${today}) as today_count,
        (select coalesce(sum(s.grand_total), 0) from sales s where ${posted} and ${saleDay} = ${today}) as today_amount,
        (select coalesce(sum(r.grand_total), 0) from sale_returns r where r.organization_id = ${c.orgId} and r.status = 'POSTED'
           and r.return_date = ${today} ${c.loc(sql`r.location_id`)}) as today_returns,
        (select count(*) from sales s where ${posted} and ${saleDay} between ${monthStart} and ${today}) as month_count,
        (select coalesce(sum(s.grand_total), 0) from sales s where ${posted} and ${saleDay} between ${monthStart} and ${today}) as month_amount,
        (select coalesce(sum(pu.grand_total), 0) from purchases pu where pu.organization_id = ${c.orgId} and pu.status = 'POSTED'
           and pu.purchase_date between ${monthStart} and ${today} ${c.loc(sql`pu.location_id`)}) as month_purchases,
        (select coalesce(sum(fe.amount), 0) from finance_entries fe where fe.organization_id = ${c.orgId} and fe.kind = 'EXPENSE'
           and fe.entry_date between ${monthStart} and ${today} ${c.loc(sql`fe.location_id`)}) as month_expenses,
        (select coalesce(sum(sl.quantity * sl.avg_cost), 0) from stock_levels sl where sl.organization_id = ${c.orgId} ${c.loc(sql`sl.location_id`)}) as stock_value,
        (select coalesce(sum(sl.quantity * v.selling_price), 0) from stock_levels sl join product_variants v on v.id = sl.variant_id
           where sl.organization_id = ${c.orgId} ${c.loc(sql`sl.location_id`)}) as retail_value,
        (select count(*) from (
           select v.id, coalesce(sum(sl.quantity), 0) as q, max(${threshold}) as t
             from product_variants v join products pr on pr.id = v.product_id
             left join stock_levels sl on sl.variant_id = v.id ${c.loc(sql`sl.location_id`)}
            where v.organization_id = ${c.orgId} and v.is_active and pr.is_active
            group by v.id) x where x.q > 0 and x.t is not null and x.q <= x.t) as low_stock,
        (select count(*) from (
           select v.id, coalesce(sum(sl.quantity), 0) as q
             from product_variants v join products pr on pr.id = v.product_id
             left join stock_levels sl on sl.variant_id = v.id ${c.loc(sql`sl.location_id`)}
            where v.organization_id = ${c.orgId} and v.is_active and pr.is_active
            group by v.id) x where x.q <= 0) as out_of_stock,
        (select count(*) from stock_lots l where l.organization_id = ${c.orgId} and l.quantity_available > 0
           and l.expiry_date between ${today} and ${addDays(today, c.settings.expiryAlertDays)} ${c.loc(sql`l.location_id`)}) as expiring_soon,
        (select count(*) from stock_lots l where l.organization_id = ${c.orgId} and l.quantity_available > 0
           and l.expiry_date < ${today} ${c.loc(sql`l.location_id`)}) as expired`),
    rows<{ day: string; count: number; amount: string }>(sql`
      select d::date::text as day, count(s.id)::int as count, coalesce(sum(s.grand_total), 0) as amount
        from generate_series(${c.range.from}::date, ${today}::date, interval '1 day') d
        left join sales s on ${posted} and ${saleDay} = d::date
       group by d order by d`),
    rows<Record<string, string>>(sql`
      select l.variant_id, max(case when v.is_default then pr.name else pr.name || ' (' || v.name || ')' end) as label,
             sum(l.qty) as quantity, sum(l.revenue) as revenue, sum(l.cost) as cost
        from (${saleLinesSql(c)}) l join product_variants v on v.id = l.variant_id join products pr on pr.id = v.product_id
       group by l.variant_id having sum(l.qty) > 0 order by revenue desc limit 5`),
    rows<Record<string, string>>(sql`
      select s.id, s.invoice_number, s.sale_date, s.grand_total, s.payment_status, s.channel,
             coalesce(p.name, s.customer_name, 'Walk-in customer') as customer
        from sales s left join parties p on p.id = s.party_id
       where ${posted} order by s.sale_date desc limit 8`),
    rows<{ method: string; amount: string }>(sql`
      select pay.method::text as method, sum(case when pay.direction = 'RECEIVED_FROM_CUSTOMER' then pay.amount else -pay.amount end) as amount
        from payments pay
       where pay.organization_id = ${c.orgId} and pay.status = 'POSTED' and pay.payment_date = ${today}
         and pay.direction in ('RECEIVED_FROM_CUSTOMER', 'REFUND_TO_CUSTOMER') ${c.loc(sql`pay.location_id`)}
       group by 1 order by 2 desc`),
    rows<Record<string, string>>(sql`
      select coalesce(sum(balance) filter (where balance > 0), 0) as receivable,
             coalesce(-sum(balance) filter (where balance < 0), 0) as payable
        from (${allBalancesSql(c.orgId)}) b`),
    rows<Record<string, string>>(sql`
      select
        (select count(*) from purchase_orders po where po.organization_id = ${c.orgId}
           and po.status in ('SENT', 'PARTIALLY_RECEIVED') ${c.loc(sql`po.location_id`)}) as open_orders,
        (select count(*) from purchase_returns pr where pr.organization_id = ${c.orgId} and pr.status = 'PENDING' ${c.loc(sql`pr.location_id`)}) as pending_returns,
        (select count(*) from stock_transfers t where t.organization_id = ${c.orgId} and t.status = 'IN_TRANSIT'
           ${c.locationId ? sql` and (t.from_location_id = ${c.locationId} or t.to_location_id = ${c.locationId})` : sql``}) as in_transit,
        (select count(*) from sales s where ${posted} and s.payment_status <> 'PAID' and s.due_date < ${today}) as overdue_sales,
        (select count(*) from purchases pu where pu.organization_id = ${c.orgId} and pu.status = 'POSTED' and pu.payment_status <> 'PAID'
           and pu.due_date < ${today} ${c.loc(sql`pu.location_id`)}) as overdue_purchases`),
  ]);

  // month gross profit (line level, net of returns)
  let monthProfit: { revenue: number; cost: number; grossProfit: number } | undefined;
  if (showCost) {
    const mc = { ...c, range: { from: monthStart, to: today } };
    const [p] = await rows<{ revenue: string; cost: string }>(
      sql`select coalesce(sum(revenue), 0) as revenue, coalesce(sum(cost), 0) as cost from (${saleLinesSql(mc)}) l`,
    );
    const revenue = round2(num(p.revenue));
    const cost = round2(num(p.cost));
    monthProfit = { revenue, cost, grossProfit: round2(revenue - cost) };
  }

  return {
    today,
    locationId: c.locationId ?? "all",
    currency: { code: c.settings.currencyCode, symbol: c.settings.currencySymbol, locale: c.settings.locale },
    kpis: {
      today: { sales: num(k.today_count), amount: round2(num(k.today_amount)), returns: round2(num(k.today_returns)) },
      month: {
        sales: num(k.month_count),
        amount: round2(num(k.month_amount)),
        purchases: round2(num(k.month_purchases)),
        expenses: round2(num(k.month_expenses)),
        ...(monthProfit && { netRevenue: monthProfit.revenue, grossProfit: monthProfit.grossProfit }),
      },
      receivable: round2(num(bal.receivable)),
      payable: round2(num(bal.payable)),
      ...(showCost && { stockValue: round2(num(k.stock_value)) }),
      retailValue: round2(num(k.retail_value)),
      lowStock: num(k.low_stock),
      outOfStock: num(k.out_of_stock),
      expiringSoon: num(k.expiring_soon),
      expired: num(k.expired),
    },
    attention: {
      openPurchaseOrders: num(pending.open_orders),
      pendingPurchaseReturns: num(pending.pending_returns),
      transfersInTransit: num(pending.in_transit),
      overdueSales: num(pending.overdue_sales),
      overduePurchases: num(pending.overdue_purchases),
    },
    salesTrend: trend.map((t) => ({ date: t.day, sales: t.count, amount: round2(num(t.amount)) })),
    topProducts: top.map((t) => ({
      variantId: t.variant_id,
      label: t.label,
      quantity: round3(num(t.quantity)),
      revenue: round2(num(t.revenue)),
      ...(showCost && { profit: round2(num(t.revenue) - num(t.cost)) }),
    })),
    recentSales: recent.map((s) => ({
      id: s.id,
      invoiceNumber: s.invoice_number,
      saleDate: s.sale_date,
      customer: s.customer,
      grandTotal: round2(num(s.grand_total)),
      paymentStatus: s.payment_status,
      channel: s.channel,
    })),
    paymentMethodsToday: methods.map((m) => ({ method: m.method, amount: round2(num(m.amount)) })),
  };
}
