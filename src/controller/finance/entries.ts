import { and, asc, desc, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { financeCategories, financeEntries, locations, parties, purchases, sales, users } from "@/db/schema";
import type { AuthContext } from "@/lib/api/handler";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { money, num, round2 } from "@/lib/num";
import type {
  financeCategorySchema,
  financeEntriesQuery,
  financeEntrySchema,
  outstandingQuery,
  updateFinanceCategorySchema,
  updateFinanceEntrySchema,
} from "@/lib/validation/finance";
import { todayIn } from "../_shared/dates";
import { countAll, likePattern, offsetFor, pageOf } from "../_shared/paging";
import { getSettings, resolveLocationFilter } from "../_shared/tenant";
import { qcol } from "../_shared/sql";

// ── categories ───────────────────────────────────────────────
export async function listFinanceCategories(auth: AuthContext, kind?: "INCOME" | "EXPENSE") {
  const items = await db
    .select({
      id: financeCategories.id,
      kind: financeCategories.kind,
      name: financeCategories.name,
      isActive: financeCategories.isActive,
      entryCount: sql<number>`(select count(*)::int from ${financeEntries} e where e.category_id = ${qcol(financeCategories.id)})`,
    })
    .from(financeCategories)
    .where(and(eq(financeCategories.organizationId, auth.organizationId), kind ? eq(financeCategories.kind, kind) : undefined))
    .orderBy(asc(financeCategories.kind), asc(financeCategories.name));
  return { items };
}

export async function createFinanceCategory(auth: AuthContext, input: z.infer<typeof financeCategorySchema>) {
  const [row] = await db
    .insert(financeCategories)
    .values({ ...input, organizationId: auth.organizationId })
    .returning();
  return { category: row };
}

export async function updateFinanceCategory(auth: AuthContext, id: string, input: z.infer<typeof updateFinanceCategorySchema>) {
  const [row] = await db
    .update(financeCategories)
    .set(input)
    .where(and(eq(financeCategories.id, id), eq(financeCategories.organizationId, auth.organizationId)))
    .returning();
  if (!row) throw notFound("Category");
  return { category: row };
}

export async function deleteFinanceCategory(auth: AuthContext, id: string) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(financeEntries)
    .where(and(eq(financeEntries.organizationId, auth.organizationId), eq(financeEntries.categoryId, id)));
  if (n > 0) throw conflict(`${n} entr${n === 1 ? "y uses" : "ies use"} this category. Deactivate it instead.`);
  const [row] = await db
    .delete(financeCategories)
    .where(and(eq(financeCategories.id, id), eq(financeCategories.organizationId, auth.organizationId)))
    .returning({ id: financeCategories.id });
  if (!row) throw notFound("Category");
  return { success: true };
}

// ── income & expense entries ─────────────────────────────────
type EntryInput = z.infer<typeof financeEntrySchema>;

async function checkRefs(auth: AuthContext, input: Partial<EntryInput>, kind: "INCOME" | "EXPENSE") {
  if (input.categoryId) {
    const cat = await db.query.financeCategories.findFirst({
      where: and(eq(financeCategories.id, input.categoryId), eq(financeCategories.organizationId, auth.organizationId)),
    });
    if (!cat) throw notFound("Category");
    if (cat.kind !== kind) throw badRequest(`"${cat.name}" is an ${cat.kind.toLowerCase()} category`);
  }
  if (input.partyId) {
    const p = await db.query.parties.findFirst({
      where: and(eq(parties.id, input.partyId), eq(parties.organizationId, auth.organizationId)),
      columns: { id: true },
    });
    if (!p) throw notFound("Party");
  }
  if (input.locationId) {
    const l = await db.query.locations.findFirst({
      where: and(eq(locations.id, input.locationId), eq(locations.organizationId, auth.organizationId)),
      columns: { id: true },
    });
    if (!l) throw notFound("Location");
  }
}

export async function createFinanceEntry(auth: AuthContext, input: EntryInput) {
  await checkRefs(auth, input, input.kind);
  const settings = await getSettings(db, auth.organizationId);
  const [row] = await db
    .insert(financeEntries)
    .values({
      organizationId: auth.organizationId,
      kind: input.kind,
      categoryId: input.categoryId ?? null,
      partyId: input.partyId ?? null,
      locationId: input.locationId ?? auth.locationId ?? null,
      amount: money(input.amount),
      entryDate: input.entryDate ?? todayIn(settings.timezone),
      method: input.method,
      referenceNumber: input.referenceNumber ?? null,
      description: input.description,
      note: input.note ?? null,
      createdByUserId: auth.userId,
    })
    .returning({ id: financeEntries.id });
  return getFinanceEntry(auth, row.id);
}

export async function updateFinanceEntry(auth: AuthContext, id: string, input: z.infer<typeof updateFinanceEntrySchema>) {
  const existing = await db.query.financeEntries.findFirst({
    where: and(eq(financeEntries.id, id), eq(financeEntries.organizationId, auth.organizationId)),
  });
  if (!existing) throw notFound("Entry");
  const kind = input.kind ?? existing.kind;
  await checkRefs(auth, { ...input, categoryId: input.categoryId ?? (input.kind ? existing.categoryId : undefined) }, kind);
  const { amount, ...rest } = input;
  await db
    .update(financeEntries)
    .set({ ...rest, ...(amount !== undefined && { amount: money(amount) }) })
    .where(eq(financeEntries.id, id));
  return getFinanceEntry(auth, id);
}

export async function deleteFinanceEntry(auth: AuthContext, id: string) {
  const [row] = await db
    .delete(financeEntries)
    .where(and(eq(financeEntries.id, id), eq(financeEntries.organizationId, auth.organizationId)))
    .returning({ id: financeEntries.id });
  if (!row) throw notFound("Entry");
  return { success: true };
}

function entrySelect() {
  return db
    .select({
      id: financeEntries.id,
      kind: financeEntries.kind,
      amount: financeEntries.amount,
      entryDate: financeEntries.entryDate,
      method: financeEntries.method,
      referenceNumber: financeEntries.referenceNumber,
      description: financeEntries.description,
      note: financeEntries.note,
      categoryId: financeEntries.categoryId,
      categoryName: financeCategories.name,
      partyId: financeEntries.partyId,
      partyName: parties.name,
      locationId: financeEntries.locationId,
      locationName: locations.name,
      createdByName: users.name,
      createdAt: financeEntries.createdAt,
    })
    .from(financeEntries)
    .leftJoin(financeCategories, eq(financeCategories.id, financeEntries.categoryId))
    .leftJoin(parties, eq(parties.id, financeEntries.partyId))
    .leftJoin(locations, eq(locations.id, financeEntries.locationId))
    .leftJoin(users, eq(users.id, financeEntries.createdByUserId));
}

export async function getFinanceEntry(auth: AuthContext, id: string) {
  const [row] = await entrySelect().where(and(eq(financeEntries.id, id), eq(financeEntries.organizationId, auth.organizationId)));
  if (!row) throw notFound("Entry");
  return { entry: { ...row, amount: num(row.amount) } };
}

export async function listFinanceEntries(auth: AuthContext, q: z.infer<typeof financeEntriesQuery>) {
  const locationId = await resolveLocationFilter(db, auth, q.locationId);
  const where = and(
    eq(financeEntries.organizationId, auth.organizationId),
    locationId ? or(eq(financeEntries.locationId, locationId), isNull(financeEntries.locationId)) : undefined,
    q.kind ? eq(financeEntries.kind, q.kind) : undefined,
    q.categoryId ? eq(financeEntries.categoryId, q.categoryId) : undefined,
    q.search
      ? or(ilike(financeEntries.description, likePattern(q.search)), ilike(financeEntries.referenceNumber, likePattern(q.search)))
      : undefined,
    q.from ? gte(financeEntries.entryDate, q.from) : undefined,
    q.to ? lte(financeEntries.entryDate, q.to) : undefined,
  );
  const [rows, [summary], byCategory] = await Promise.all([
    entrySelect()
      .where(where)
      .orderBy(desc(financeEntries.entryDate), desc(financeEntries.createdAt))
      .limit(q.limit)
      .offset(offsetFor(q.page, q.limit)),
    db
      .select({
        total: countAll,
        income: sql<string>`coalesce(sum(${financeEntries.amount}) filter (where ${financeEntries.kind} = 'INCOME'), 0)`,
        expense: sql<string>`coalesce(sum(${financeEntries.amount}) filter (where ${financeEntries.kind} = 'EXPENSE'), 0)`,
      })
      .from(financeEntries)
      .where(where),
    db
      .select({
        kind: financeEntries.kind,
        categoryName: sql<string>`coalesce(${financeCategories.name}, 'Uncategorised')`,
        amount: sql<string>`sum(${financeEntries.amount})`,
      })
      .from(financeEntries)
      .leftJoin(financeCategories, eq(financeCategories.id, financeEntries.categoryId))
      .where(where)
      .groupBy(financeEntries.kind, sql`2`)
      .orderBy(sql`3 desc`),
  ]);
  return {
    ...pageOf(
      rows.map((r) => ({ ...r, amount: num(r.amount) })),
      summary.total,
      q.page,
      q.limit,
    ),
    summary: {
      income: num(summary.income),
      expense: num(summary.expense),
      net: round2(num(summary.income) - num(summary.expense)),
      byCategory: byCategory.map((c) => ({ ...c, amount: num(c.amount) })),
    },
  };
}

// ── receivables / payables with ageing ───────────────────────
export async function outstanding(auth: AuthContext, q: z.infer<typeof outstandingQuery>) {
  const settings = await getSettings(db, auth.organizationId);
  const today = todayIn(settings.timezone);

  if (q.type === "receivables") {
    const due = sql<string>`${sales.grandTotal} - ${sales.paidAmount} - coalesce((select sum(r.grand_total) from sale_returns r where r.sale_id = ${qcol(sales.id)} and r.status = 'POSTED' and r.resolution = 'STORE_CREDIT'), 0)`;
    const docDate = sql<string>`(${sales.saleDate} at time zone ${settings.timezone})::date`;
    const age = sql<number>`(${today}::date - coalesce(${sales.dueDate}, ${docDate}))`;
    const where = and(
      eq(sales.organizationId, auth.organizationId),
      eq(sales.status, "POSTED"),
      sql`${sales.paymentStatus} <> 'PAID'`,
      q.partyId ? eq(sales.partyId, q.partyId) : undefined,
      q.search ? or(ilike(sales.invoiceNumber, likePattern(q.search)), ilike(parties.name, likePattern(q.search))) : undefined,
    );
    return ageing(
      db
        .select({
          id: sales.id,
          number: sales.invoiceNumber,
          date: docDate,
          dueDate: sales.dueDate,
          partyId: sales.partyId,
          partyName: sql<string>`coalesce(${parties.name}, ${sales.customerName}, 'Walk-in customer')`,
          total: sales.grandTotal,
          paid: sales.paidAmount,
          due,
          daysOverdue: age,
        })
        .from(sales)
        .leftJoin(parties, eq(parties.id, sales.partyId))
        .where(where)
        .orderBy(asc(docDate)),
      q,
    );
  }

  const due = sql<string>`${purchases.grandTotal} - ${purchases.paidAmount} - coalesce((select sum(r.grand_total) from purchase_returns r where r.purchase_id = ${qcol(purchases.id)} and r.status = 'COMPLETED' and r.resolution = 'CREDIT_NOTE'), 0)`;
  const age = sql<number>`(${today}::date - coalesce(${purchases.dueDate}, ${purchases.purchaseDate}))`;
  const where = and(
    eq(purchases.organizationId, auth.organizationId),
    eq(purchases.status, "POSTED"),
    sql`${purchases.paymentStatus} <> 'PAID'`,
    q.partyId ? eq(purchases.partyId, q.partyId) : undefined,
    q.search ? or(ilike(purchases.number, likePattern(q.search)), ilike(parties.name, likePattern(q.search))) : undefined,
  );
  return ageing(
    db
      .select({
        id: purchases.id,
        number: purchases.number,
        date: sql<string>`${purchases.purchaseDate}::text`,
        dueDate: purchases.dueDate,
        partyId: purchases.partyId,
        partyName: parties.name,
        total: purchases.grandTotal,
        paid: purchases.paidAmount,
        due,
        daysOverdue: age,
      })
      .from(purchases)
      .innerJoin(parties, eq(parties.id, purchases.partyId))
      .where(where)
      .orderBy(asc(purchases.purchaseDate)),
    q,
  );
}

type OutstandingRow = {
  id: string;
  number: string;
  date: string;
  dueDate: string | null;
  partyId: string | null;
  partyName: string;
  total: string;
  paid: string;
  due: string;
  daysOverdue: number;
};

async function ageing(query: Promise<OutstandingRow[]>, q: z.infer<typeof outstandingQuery>) {
  const all = (await query)
    .map((r) => ({ ...r, total: num(r.total), paid: num(r.paid), due: round2(num(r.due)), daysOverdue: Math.max(0, r.daysOverdue) }))
    .filter((r) => r.due > 0.004);
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  for (const r of all) {
    const d = r.daysOverdue;
    if (d <= 0) buckets.current += r.due;
    else if (d <= 30) buckets.d1_30 += r.due;
    else if (d <= 60) buckets.d31_60 += r.due;
    else if (d <= 90) buckets.d61_90 += r.due;
    else buckets.d90plus += r.due;
  }
  const start = (q.page - 1) * q.limit;
  return {
    ...pageOf(all.slice(start, start + q.limit), all.length, q.page, q.limit),
    summary: {
      totalDue: round2(all.reduce((s, r) => s + r.due, 0)),
      ageing: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, round2(v)])),
    },
  };
}
