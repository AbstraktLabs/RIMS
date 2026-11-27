import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { parties, purchases, sales } from "@/db/schema";
import type { AuthContext } from "@/lib/api/handler";
import { notFound } from "@/lib/errors";
import { money, num, round2 } from "@/lib/num";
import type { ledgerQuery, partiesQuery, partySchema, updatePartySchema } from "@/lib/validation/parties";
import { allBalancesSql, ledgerLinesSql, partyBalance } from "../_shared/ledger";
import { countAll, likePattern, offsetFor, pageOf } from "../_shared/paging";
import { getBusiness } from "../settings/controller";
import { formatBsDate, getFiscalYear } from "@/lib/client/nepali-date";

type PartyInput = z.infer<typeof partySchema>;
type PartyUpdate = z.infer<typeof updatePartySchema>;

function values(input: PartyUpdate) {
  const { creditLimit, openingBalance, ...rest } = input;
  return {
    ...rest,
    ...(creditLimit !== undefined && { creditLimit: creditLimit === null ? null : money(creditLimit) }),
    ...(openingBalance !== undefined && { openingBalance: money(openingBalance) }),
  };
}

export async function createParty(auth: AuthContext, input: PartyInput) {
  const [row] = await db
    .insert(parties)
    .values({ ...values(input), name: input.name, organizationId: auth.organizationId })
    .returning();
  return getParty(auth, row.id);
}

export async function updateParty(auth: AuthContext, id: string, input: PartyUpdate) {
  const [row] = await db
    .update(parties)
    .set(values(input))
    .where(and(eq(parties.id, id), eq(parties.organizationId, auth.organizationId)))
    .returning({ id: parties.id });
  if (!row) throw notFound("Party");
  return getParty(auth, id);
}

export async function deleteParty(auth: AuthContext, id: string) {
  try {
    const [row] = await db.transaction(async (tx) =>
      tx
        .delete(parties)
        .where(and(eq(parties.id, id), eq(parties.organizationId, auth.organizationId)))
        .returning({ id: parties.id }),
    );
    if (!row) throw notFound("Party");
    return { deleted: true, archived: false };
  } catch (err) {
    if ((err as { status?: number }).status === 404) throw err;
    await db
      .update(parties)
      .set({ isActive: false })
      .where(and(eq(parties.id, id), eq(parties.organizationId, auth.organizationId)));
    return { deleted: false, archived: true, message: "This party has transactions, so it was deactivated instead." };
  }
}

export async function listParties(auth: AuthContext, q: z.infer<typeof partiesQuery>) {
  const balances = sql`(${allBalancesSql(auth.organizationId)})`;
  const balance = sql<string>`coalesce(b.balance, 0)`;
  const conds: (SQL | undefined)[] = [eq(parties.organizationId, auth.organizationId)];
  if (q.status === "active") conds.push(eq(parties.isActive, true));
  if (q.status === "inactive") conds.push(eq(parties.isActive, false));
  if (q.type === "BOTH") conds.push(eq(parties.partyType, "BOTH"));
  else if (q.type) conds.push(or(eq(parties.partyType, q.type), eq(parties.partyType, "BOTH")));
  if (q.search) {
    const p = likePattern(q.search);
    conds.push(or(ilike(parties.name, p), ilike(parties.phone, p), ilike(parties.code, p), ilike(parties.email, p), ilike(parties.taxId, p)));
  }
  if (q.balance === "receivable") conds.push(sql`${balance} > 0.004`);
  if (q.balance === "payable") conds.push(sql`${balance} < -0.004`);
  if (q.balance === "settled") conds.push(sql`abs(${balance}) <= 0.004`);
  const where = and(...conds);
  const order = {
    name: asc(parties.name),
    balance: sql`${balance} asc`,
    "-balance": sql`${balance} desc`,
    "-createdAt": desc(parties.createdAt),
  }[q.sort];

  const [rows, [summary]] = await Promise.all([
    db
      .select({
        id: parties.id,
        code: parties.code,
        name: parties.name,
        partyType: parties.partyType,
        phone: parties.phone,
        email: parties.email,
        taxId: parties.taxId,
        creditLimit: parties.creditLimit,
        isActive: parties.isActive,
        balance,
        createdAt: parties.createdAt,
      })
      .from(parties)
      .leftJoin(sql`${balances} b`, sql`b.party_id = ${parties.id}`)
      .where(where)
      .orderBy(order, asc(parties.id))
      .limit(q.limit)
      .offset(offsetFor(q.page, q.limit)),
    db
      .select({
        total: countAll,
        receivable: sql<string>`coalesce(sum(greatest(${balance}, 0)), 0)`,
        payable: sql<string>`coalesce(sum(greatest(-${balance}, 0)), 0)`,
      })
      .from(parties)
      .leftJoin(sql`${balances} b`, sql`b.party_id = ${parties.id}`)
      .where(where),
  ]);
  return {
    ...pageOf(
      rows.map((r) => ({
        ...r,
        balance: round2(num(r.balance)),
        creditLimit: r.creditLimit === null ? null : num(r.creditLimit),
      })),
      summary.total,
      q.page,
      q.limit,
    ),
    summary: { receivable: num(summary.receivable), payable: num(summary.payable) },
  };
}

export async function getParty(auth: AuthContext, id: string) {
  const party = await db.query.parties.findFirst({
    where: and(eq(parties.id, id), eq(parties.organizationId, auth.organizationId)),
  });
  if (!party) throw notFound("Party");
  const [balance, [stats]] = await Promise.all([
    partyBalance(db, auth.organizationId, id),
    db
      .select({
        salesCount: sql<number>`(select count(*)::int from ${sales} where ${sales.partyId} = ${id} and ${sales.status} = 'POSTED')`,
        salesTotal: sql<string>`(select coalesce(sum(${sales.grandTotal}), 0) from ${sales} where ${sales.partyId} = ${id} and ${sales.status} = 'POSTED')`,
        lastSaleAt: sql<string | null>`(select max(${sales.saleDate}) from ${sales} where ${sales.partyId} = ${id} and ${sales.status} = 'POSTED')`,
        purchasesCount: sql<number>`(select count(*)::int from ${purchases} where ${purchases.partyId} = ${id} and ${purchases.status} = 'POSTED')`,
        purchasesTotal: sql<string>`(select coalesce(sum(${purchases.grandTotal}), 0) from ${purchases} where ${purchases.partyId} = ${id} and ${purchases.status} = 'POSTED')`,
        lastPurchaseAt: sql<string | null>`(select max(${purchases.purchaseDate}) from ${purchases} where ${purchases.partyId} = ${id} and ${purchases.status} = 'POSTED')`,
        unpaidSales: sql<number>`(select count(*)::int from ${sales} where ${sales.partyId} = ${id} and ${sales.status} = 'POSTED' and ${sales.paymentStatus} <> 'PAID')`,
        unpaidPurchases: sql<number>`(select count(*)::int from ${purchases} where ${purchases.partyId} = ${id} and ${purchases.status} = 'POSTED' and ${purchases.paymentStatus} <> 'PAID')`,
      })
      .from(sql`(select 1) as one`),
  ]);
  return {
    party: {
      ...party,
      creditLimit: party.creditLimit === null ? null : num(party.creditLimit),
      openingBalance: num(party.openingBalance),
      balance,
      balanceType: balance > 0.004 ? "RECEIVABLE" : balance < -0.004 ? "PAYABLE" : "SETTLED",
      availableCredit: party.creditLimit === null ? null : round2(num(party.creditLimit) - Math.max(balance, 0)),
      stats: {
        ...stats,
        salesTotal: num(stats.salesTotal),
        purchasesTotal: num(stats.purchasesTotal),
      },
    },
  };
}

/** Statement with running balance. Lines before `from` collapse into a brought-forward line. */
export async function partyLedger(auth: AuthContext, id: string, q: z.infer<typeof ledgerQuery>) {
  const party = await db.query.parties.findFirst({
    where: and(eq(parties.id, id), eq(parties.organizationId, auth.organizationId)),
    columns: { id: true, name: true, partyType: true, phone: true, address: true },
  });
  if (!party) throw notFound("Party");

  const lines = sql`(${ledgerLinesSql(auth.organizationId, id)}) l`;
  const [before, inRange] = await Promise.all([
    q.from
      ? db.execute<{ debit: string; credit: string }>(
          sql`select coalesce(sum(debit), 0) as debit, coalesce(sum(credit), 0) as credit from ${lines} where l.date < ${q.from}`,
        )
      : Promise.resolve({ rows: [{ debit: "0", credit: "0" }] }),
    db.execute<{
      date: string;
      created_at: string;
      type: string;
      document_id: string | null;
      number: string | null;
      description: string;
      debit: string;
      credit: string;
    }>(
      sql`select * from ${lines} where true ${q.from ? sql`and l.date >= ${q.from}` : sql``} ${q.to ? sql`and l.date <= ${q.to}` : sql``}
          order by l.date asc, l.created_at asc`,
    ),
  ]);

  const openingDebit = num(before.rows[0]?.debit);
  const openingCredit = num(before.rows[0]?.credit);
  let running = round2(openingDebit - openingCredit);
  const broughtForward = running;
  let totalDebit = 0;
  let totalCredit = 0;
  const entries = inRange.rows.map((r) => {
    const debit = num(r.debit);
    const credit = num(r.credit);
    totalDebit += debit;
    totalCredit += credit;
    running = round2(running + debit - credit);
    return {
      date: r.date,
      type: r.type,
      documentId: r.document_id,
      number: r.number,
      description: r.description,
      debit,
      credit,
      balance: running,
    };
  });
  return {
    party,
    from: q.from ?? null,
    to: q.to ?? null,
    openingBalance: broughtForward,
    entries,
    totals: { debit: round2(totalDebit), credit: round2(totalCredit) },
    closingBalance: running,
  };
}

/** Counts for the Parties page tiles; SUPPLIER/CUSTOMER include BOTH. */
export async function partyStats(auth: AuthContext, type?: "SUPPLIER" | "CUSTOMER" | "BOTH") {
  const [r] = await db
    .select({
      totalCount: countAll,
      activeCount: sql<number>`(count(*) filter (where ${parties.isActive}))::int`,
    })
    .from(parties)
    .where(
      and(
        eq(parties.organizationId, auth.organizationId),
        type && type !== "BOTH" ? or(eq(parties.partyType, type), eq(parties.partyType, "BOTH")) : undefined,
      ),
    );
  return { stats: { totalCount: r.totalCount, activeCount: r.activeCount, inactiveCount: r.totalCount - r.activeCount } };
}

const LEDGER_TYPE: Record<string, "Sale" | "Purc" | "SlRt" | "PurRt" | "Jrnl" | "Rcpt" | "Pymt"> = {
  SALE: "Sale",
  PURCHASE: "Purc",
  SALE_RETURN: "SlRt",
  PURCHASE_RETURN: "PurRt",
  RECEIVED_FROM_CUSTOMER: "Rcpt",
  REFUND_FROM_SUPPLIER: "Rcpt",
  PAID_TO_SUPPLIER: "Pymt",
  REFUND_TO_CUSTOMER: "Pymt",
};

/** The pharmacy-style account statement (Party Ledger screen), with BS dates. */
export async function partyStatement(auth: AuthContext, id: string, q: { startDate?: string; endDate?: string }) {
  const [ledger, full, { organization: org }] = await Promise.all([
    partyLedger(auth, id, { from: q.startDate, to: q.endDate }),
    db.query.parties.findFirst({ where: and(eq(parties.id, id), eq(parties.organizationId, auth.organizationId)) }),
    getBusiness(auth),
  ]);
  const bs = (d: string | null | undefined) => (d ? formatBsDate(new Date(d)) : null);
  const side = (n: number): "Dr" | "Cr" => (n < 0 ? "Cr" : "Dr");
  const entries = ledger.entries.map((e, i) => ({
    id: e.documentId ?? `${e.type}-${i}`,
    nepaliDate: bs(e.date) ?? "",
    englishDate: e.date,
    rawDate: e.date,
    type: LEDGER_TYPE[e.type] ?? "Jrnl",
    vchNo: e.number ?? "—",
    particulars: e.description,
    debit: e.debit,
    credit: e.credit,
    balance: Math.abs(e.balance),
    balanceType: side(e.balance),
  }));
  return {
    party: {
      id: ledger.party.id,
      name: ledger.party.name,
      partyType: ledger.party.partyType,
      panVatNumber: full?.taxId ?? null,
      phone: ledger.party.phone,
      address: ledger.party.address,
      email: full?.email ?? null,
    },
    organization: {
      id: auth.organizationId,
      businessName: org.name,
      panVatNumber: org.taxId,
      address: org.address,
      phone: org.phone,
      fiscalYear: getFiscalYear(new Date()),
    },
    dateRange: {
      startDate: ledger.from,
      endDate: ledger.to,
      startBsDate: bs(ledger.from),
      endBsDate: bs(ledger.to),
    },
    openingBalance: { amount: Math.abs(ledger.openingBalance), type: side(ledger.openingBalance) },
    entries,
    summary: {
      totalDebit: ledger.totals.debit,
      totalCredit: ledger.totals.credit,
      closingBalance: Math.abs(ledger.closingBalance),
      closingBalanceType: ledger.closingBalance < 0 ? ("Credit Balance" as const) : ("Debit Balance" as const),
      grandTotal: Math.max(ledger.totals.debit, ledger.totals.credit) + Math.abs(ledger.openingBalance),
    },
  };
}
