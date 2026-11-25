import { sql } from "drizzle-orm";
import type { z } from "zod";
import type { AuthContext } from "@/lib/api/handler";
import { num, round2 } from "@/lib/num";
import type { transactionsQuery } from "@/lib/validation/reports";
import { likePattern, offsetFor, pageOf } from "../_shared/paging";
import { reportContext, rows, type ReportContext } from "./context";

/**
 * One feed of everything that happened: documents, payments, income and
 * expenses, stock adjustments and transfers. `flow` says which way money
 * moved (IN / OUT) — stock-only records are NONE.
 */
function feedSql(c: ReportContext) {
  const o = c.orgId;
  const r = c.range;
  const locOr = (a: string, b: string) =>
    c.locationId ? sql` and (${sql.raw(a)} = ${c.locationId} or ${sql.raw(b)} = ${c.locationId})` : sql``;
  return sql`
    select 'SALE' as type, s.id, s.invoice_number as number, (s.sale_date at time zone ${c.tz})::date as date, s.created_at,
           s.party_id, coalesce(p.name, s.customer_name, 'Walk-in customer') as party, s.grand_total as amount, 'IN' as flow,
           s.status::text as status, s.location_id, s.channel::text as detail
      from sales s left join parties p on p.id = s.party_id
     where s.organization_id = ${o} and (s.sale_date at time zone ${c.tz})::date between ${r.from} and ${r.to} ${c.loc(sql`s.location_id`)}
    union all
    select 'SALE_RETURN', sr.id, sr.number, sr.return_date, sr.created_at, sr.party_id,
           coalesce(p.name, s.customer_name, 'Walk-in customer'), sr.grand_total, 'OUT', sr.status::text, sr.location_id, sr.resolution::text
      from sale_returns sr join sales s on s.id = sr.sale_id left join parties p on p.id = sr.party_id
     where sr.organization_id = ${o} and sr.return_date between ${r.from} and ${r.to} ${c.loc(sql`sr.location_id`)}
    union all
    select 'PURCHASE', pu.id, pu.number, pu.purchase_date, pu.created_at, pu.party_id, p.name, pu.grand_total, 'OUT',
           pu.status::text, pu.location_id, pu.supplier_invoice_number
      from purchases pu join parties p on p.id = pu.party_id
     where pu.organization_id = ${o} and pu.purchase_date between ${r.from} and ${r.to} ${c.loc(sql`pu.location_id`)}
    union all
    select 'PURCHASE_RETURN', pr.id, pr.number, pr.return_date, pr.created_at, pr.party_id, p.name, pr.grand_total, 'IN',
           pr.status::text, pr.location_id, pr.resolution::text
      from purchase_returns pr join parties p on p.id = pr.party_id
     where pr.organization_id = ${o} and pr.return_date between ${r.from} and ${r.to} ${c.loc(sql`pr.location_id`)}
    union all
    select 'PAYMENT', pay.id, pay.number, pay.payment_date, pay.created_at, pay.party_id, coalesce(p.name, 'Walk-in customer'), pay.amount,
           case when pay.direction in ('RECEIVED_FROM_CUSTOMER', 'REFUND_FROM_SUPPLIER') then 'IN' else 'OUT' end,
           pay.status::text, pay.location_id, pay.direction::text || ' · ' || pay.method::text
      from payments pay left join parties p on p.id = pay.party_id
     where pay.organization_id = ${o} and pay.payment_date between ${r.from} and ${r.to} ${c.loc(sql`pay.location_id`)}
    union all
    select fe.kind::text, fe.id, coalesce(fe.reference_number, ''), fe.entry_date, fe.created_at, fe.party_id, p.name, fe.amount,
           case when fe.kind = 'INCOME' then 'IN' else 'OUT' end, 'POSTED', fe.location_id,
           coalesce(fc.name, 'Uncategorised') || ' · ' || fe.description
      from finance_entries fe left join parties p on p.id = fe.party_id left join finance_categories fc on fc.id = fe.category_id
     where fe.organization_id = ${o} and fe.entry_date between ${r.from} and ${r.to} ${c.loc(sql`fe.location_id`)}
    union all
    select 'ADJUSTMENT', a.id, a.number, a.adjustment_date, a.created_at, null::uuid, null, a.total_value, 'NONE', 'POSTED',
           a.location_id, a.reason::text
      from stock_adjustments a
     where a.organization_id = ${o} and a.adjustment_date between ${r.from} and ${r.to} ${c.loc(sql`a.location_id`)}
    union all
    select 'TRANSFER', t.id, t.number, t.transfer_date, t.created_at, null::uuid, null, null::numeric, 'NONE', t.status::text,
           t.from_location_id, fl.name || ' → ' || tl.name
      from stock_transfers t join locations fl on fl.id = t.from_location_id join locations tl on tl.id = t.to_location_id
     where t.organization_id = ${o} and t.transfer_date between ${r.from} and ${r.to} ${locOr("t.from_location_id", "t.to_location_id")}`;
}

export async function listTransactions(auth: AuthContext, q: z.infer<typeof transactionsQuery>) {
  const c = await reportContext(auth, q);
  const filters = sql`where true
    ${q.type ? sql` and f0.type = ${q.type}` : sql``}
    ${q.partyId ? sql` and f0.party_id = ${q.partyId}` : sql``}
    ${q.search ? sql` and (f0.number ilike ${likePattern(q.search)} or f0.party ilike ${likePattern(q.search)} or f0.detail ilike ${likePattern(q.search)})` : sql``}`;
  const feed = sql`(select * from (${feedSql(c)}) f0 ${filters}) f`;

  const [items, [t]] = await Promise.all([
    rows<Record<string, string | null>>(sql`
      select f.*, l.name as location from ${feed} left join locations l on l.id = f.location_id
      order by f.date desc, f.created_at desc
      limit ${q.limit} offset ${offsetFor(q.page, q.limit)}`),
    rows<Record<string, string>>(sql`
      select count(*)::int as total,
             coalesce(sum(f.amount) filter (where f.flow = 'IN' and f.status not in ('VOID')), 0) as total_in,
             coalesce(sum(f.amount) filter (where f.flow = 'OUT' and f.status not in ('VOID')), 0) as total_out
        from ${feed}`),
  ]);

  return {
    range: c.range,
    ...pageOf(
      items.map((r) => ({
        type: r.type,
        id: r.id,
        number: r.number,
        date: typeof r.date === "string" ? r.date : new Date(r.date as unknown as Date).toISOString().slice(0, 10),
        createdAt: r.created_at,
        partyId: r.party_id,
        party: r.party,
        amount: r.amount === null ? null : round2(num(r.amount)),
        flow: r.flow,
        status: r.status,
        locationId: r.location_id,
        location: r.location,
        detail: r.detail,
      })),
      num(t.total),
      q.page,
      q.limit,
    ),
    summary: { in: round2(num(t.total_in)), out: round2(num(t.total_out)), net: round2(num(t.total_in) - num(t.total_out)) },
  };
}
