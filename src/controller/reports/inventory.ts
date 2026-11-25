import { sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import type { AuthContext } from "@/lib/api/handler";
import { num, round2, round3 } from "@/lib/num";
import type { expiryReportQuery, movementSummaryQuery, valuationQuery } from "@/lib/validation/reports";
import { addDays, todayIn } from "../_shared/dates";
import { likePattern, offsetFor, pageOf } from "../_shared/paging";
import { getSettings, resolveLocationFilter } from "../_shared/tenant";
import { db } from "@/db";
import { reportContext, rows } from "./context";

const variantLabel = sql`case when v.is_default then pr.name else pr.name || ' (' || v.name || ')' end`;

// ── stock valuation ──────────────────────────────────────────
export async function inventoryValuation(auth: AuthContext, q: z.infer<typeof valuationQuery>) {
  const locationId = await resolveLocationFilter(db, auth, q.locationId);
  const loc = locationId ? sql` and sl.location_id = ${locationId}` : sql``;
  const base = sql`
    from stock_levels sl
    join product_variants v on v.id = sl.variant_id
    join products pr on pr.id = v.product_id
    left join categories cat on cat.id = pr.category_id
    join locations lo on lo.id = sl.location_id
   where sl.organization_id = ${auth.organizationId} and sl.quantity <> 0 ${loc}`;

  const groups: Record<string, { key: SQL; label: SQL; extra: SQL }> = {
    variant: {
      key: sql`v.id::text`,
      label: sql`max(${variantLabel})`,
      extra: sql`, max(v.sku) as sku, max(cat.name) as category, max(v.selling_price) as selling_price`,
    },
    category: { key: sql`coalesce(pr.category_id::text, 'none')`, label: sql`coalesce(max(cat.name), 'Uncategorised')`, extra: sql`` },
    location: { key: sql`sl.location_id::text`, label: sql`max(lo.name)`, extra: sql`` },
  };
  const g = groups[q.groupBy];

  const [items, [t]] = await Promise.all([
    rows<Record<string, string | number | null>>(sql`
      select ${g.key} as key, ${g.label} as label, count(distinct v.id)::int as variants,
             sum(sl.quantity) as quantity, sum(sl.quantity * sl.avg_cost) as cost_value,
             sum(sl.quantity * v.selling_price) as retail_value ${g.extra}
      ${base}
      group by 1 order by cost_value desc
      limit ${q.limit} offset ${offsetFor(q.page, q.limit)}`),
    rows<Record<string, string>>(sql`
      select count(distinct ${g.key})::int as groups, count(distinct v.id)::int as variants,
             coalesce(sum(sl.quantity * sl.avg_cost), 0) as cost_value,
             coalesce(sum(sl.quantity * v.selling_price), 0) as retail_value,
             count(*) filter (where sl.quantity < 0)::int as negative_lines
      ${base}`),
  ]);

  const costValue = round2(num(t.cost_value));
  const retailValue = round2(num(t.retail_value));
  return {
    groupBy: q.groupBy,
    locationId: locationId ?? "all",
    ...pageOf(
      items.map((r) => {
        const cost = round2(num(r.cost_value as string));
        const retail = round2(num(r.retail_value as string));
        return {
          key: r.key,
          label: r.label,
          ...(q.groupBy === "variant" && { sku: r.sku, category: r.category, sellingPrice: num(r.selling_price as string) }),
          variants: r.variants,
          quantity: round3(num(r.quantity as string)),
          costValue: cost,
          retailValue: retail,
          potentialProfit: round2(retail - cost),
        };
      }),
      num(t.groups),
      q.page,
      q.limit,
    ),
    summary: {
      variants: num(t.variants),
      costValue,
      retailValue,
      potentialProfit: round2(retailValue - costValue),
      negativeStockLines: num(t.negative_lines),
    },
  };
}

// ── stock movement summary (opening / in / out / closing) ────
export async function stockMovementSummary(auth: AuthContext, q: z.infer<typeof movementSummaryQuery>) {
  const c = await reportContext(auth, q);
  const day = sql`(m.occurred_at at time zone ${c.tz})::date`;
  const filters = sql`${q.variantId ? sql` and v.id = ${q.variantId}` : sql``}
    ${q.categoryId ? sql` and pr.category_id = ${q.categoryId}` : sql``}
    ${q.search ? sql` and (pr.name ilike ${likePattern(q.search)} or v.sku ilike ${likePattern(q.search)} or v.barcode = ${q.search})` : sql``}`;
  const inRange = sql`${day} between ${c.range.from} and ${c.range.to}`;
  const t = (types: string[]) => sql`coalesce(sum(m.quantity) filter (where ${inRange} and m.type in (${sql.join(types.map((x) => sql`${x}`), sql`, `)})), 0)`;

  const base = sql`
    from stock_movements m
    join product_variants v on v.id = m.variant_id
    join products pr on pr.id = v.product_id
   where m.organization_id = ${c.orgId} and ${day} <= ${c.range.to} ${c.loc(sql`m.location_id`)} ${filters}`;

  const [items, [count]] = await Promise.all([
    rows<Record<string, string>>(sql`
      select v.id as variant_id, max(${variantLabel}) as label, max(v.sku) as sku,
             coalesce(sum(m.quantity) filter (where ${day} < ${c.range.from}), 0) as opening,
             coalesce(sum(m.quantity) filter (where ${inRange} and m.quantity > 0), 0) as qty_in,
             coalesce(-sum(m.quantity) filter (where ${inRange} and m.quantity < 0), 0) as qty_out,
             ${t(["PURCHASE"])} as purchases, ${t(["PURCHASE_RETURN"])} as purchase_returns,
             ${t(["SALE"])} as sales, ${t(["SALE_RETURN"])} as sale_returns,
             ${t(["OPENING", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "DAMAGE"])} as adjustments,
             ${t(["TRANSFER_IN", "TRANSFER_OUT"])} as transfers,
             coalesce(sum(m.quantity), 0) as closing
      ${base}
      group by v.id order by label
      limit ${q.limit} offset ${offsetFor(q.page, q.limit)}`),
    rows<{ total: number }>(sql`select count(distinct v.id)::int as total ${base}`),
  ]);

  const keys = ["opening", "qty_in", "qty_out", "purchases", "purchase_returns", "sales", "sale_returns", "adjustments", "transfers", "closing"];
  return {
    range: c.range,
    locationId: c.locationId ?? "all",
    ...pageOf(
      items.map((r) => {
        const o: Record<string, unknown> = { variantId: r.variant_id, label: r.label, sku: r.sku };
        for (const k of keys) o[k === "qty_in" ? "in" : k === "qty_out" ? "out" : k.replace(/_(\w)/g, (_m, ch: string) => ch.toUpperCase())] = round3(num(r[k]));
        return o;
      }),
      count.total,
      q.page,
      q.limit,
    ),
  };
}

// ── expiry ───────────────────────────────────────────────────
export async function expiryReport(auth: AuthContext, q: z.infer<typeof expiryReportQuery>) {
  const settings = await getSettings(db, auth.organizationId);
  const locationId = await resolveLocationFilter(db, auth, q.locationId);
  const today = todayIn(settings.timezone);
  const until = addDays(today, q.days);
  const where = sql`l.organization_id = ${auth.organizationId} and l.expiry_date is not null and l.quantity_available > 0
    and l.expiry_date <= ${until} ${q.includeExpired === "true" ? sql`` : sql` and l.expiry_date >= ${today}`}
    ${locationId ? sql` and l.location_id = ${locationId}` : sql``}`;
  const from = sql`from stock_lots l
    join product_variants v on v.id = l.variant_id
    join products pr on pr.id = v.product_id
    join locations lo on lo.id = l.location_id
    left join parties s on s.id = l.supplier_id`;

  const [items, [t]] = await Promise.all([
    rows<Record<string, string>>(sql`
      select l.id, l.lot_number, l.expiry_date::text as expiry_date, (l.expiry_date - ${today}::date) as days_to_expiry,
             l.quantity_available, l.unit_cost, l.quantity_available * l.unit_cost as cost_value,
             v.id as variant_id, ${variantLabel} as label, v.sku, lo.name as location, s.name as supplier
      ${from} where ${where}
      order by l.expiry_date asc, label
      limit ${q.limit} offset ${offsetFor(q.page, q.limit)}`),
    rows<Record<string, string>>(sql`
      select count(*)::int as total,
             count(*) filter (where l.expiry_date < ${today})::int as expired_lots,
             coalesce(sum(l.quantity_available * l.unit_cost) filter (where l.expiry_date < ${today}), 0) as expired_value,
             count(*) filter (where l.expiry_date >= ${today})::int as expiring_lots,
             coalesce(sum(l.quantity_available * l.unit_cost) filter (where l.expiry_date >= ${today}), 0) as expiring_value
      ${from} where ${where}`),
  ]);

  return {
    today,
    until,
    ...pageOf(
      items.map((r) => {
        const days = num(r.days_to_expiry);
        return {
          lotId: r.id,
          lotNumber: r.lot_number,
          expiryDate: r.expiry_date,
          daysToExpiry: days,
          status: days < 0 ? "EXPIRED" : days <= settings.expiryAlertDays ? "EXPIRING_SOON" : "OK",
          variantId: r.variant_id,
          label: r.label,
          sku: r.sku,
          location: r.location,
          supplier: r.supplier,
          quantity: round3(num(r.quantity_available)),
          unitCost: num(r.unit_cost),
          costValue: round2(num(r.cost_value)),
        };
      }),
      num(t.total),
      q.page,
      q.limit,
    ),
    summary: {
      expiredLots: num(t.expired_lots),
      expiredValue: round2(num(t.expired_value)),
      expiringLots: num(t.expiring_lots),
      expiringValue: round2(num(t.expiring_value)),
    },
  };
}
