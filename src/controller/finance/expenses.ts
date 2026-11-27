import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { financeCategories } from "@/db/schema";
import type { AuthContext } from "@/lib/api/handler";
import { isoDate, money, nullableText, uuid } from "@/lib/validation/common";
import {
  createFinanceCategory,
  createFinanceEntry,
  deleteFinanceCategory,
  deleteFinanceEntry,
  listFinanceEntries,
  updateFinanceEntry,
} from "./entries";

// The pharmacy-style Expense screen, backed by finance entries of kind EXPENSE.

export const expenseSchema = z.object({
  categoryId: uuid.nullable().optional(),
  description: z.string().trim().min(1).max(255),
  note: nullableText(2000),
  amount: money.refine((n) => n > 0, "Amount must be greater than zero"),
  expenseDate: isoDate,
});
export const expenseQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(8),
  categoryId: uuid.optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
});
export const expenseCategorySchema = z.object({ name: z.string().trim().min(1).max(150) });

type Entry = Awaited<ReturnType<typeof createFinanceEntry>>["entry"];
const toExpense = (e: Entry | Awaited<ReturnType<typeof listFinanceEntries>>["items"][number]) => ({
  id: e.id,
  categoryId: e.categoryId,
  description: e.description,
  note: e.note,
  amount: e.amount.toFixed(2),
  expenseDate: e.entryDate,
  category: e.categoryId ? { id: e.categoryId, name: e.categoryName ?? "" } : null,
});

export async function listExpenseCategories(auth: AuthContext) {
  const rows = await db
    .select({ id: financeCategories.id, name: financeCategories.name })
    .from(financeCategories)
    .where(
      and(
        eq(financeCategories.organizationId, auth.organizationId),
        eq(financeCategories.kind, "EXPENSE"),
        eq(financeCategories.isActive, true),
      ),
    )
    .orderBy(asc(financeCategories.name));
  return { expenseCategories: rows };
}

export async function createExpenseCategory(auth: AuthContext, name: string) {
  const [existing] = await db
    .select({ id: financeCategories.id, name: financeCategories.name, isActive: financeCategories.isActive })
    .from(financeCategories)
    .where(
      and(
        eq(financeCategories.organizationId, auth.organizationId),
        eq(financeCategories.kind, "EXPENSE"),
        sql`lower(${financeCategories.name}) = lower(${name})`,
      ),
    );
  if (existing) {
    if (!existing.isActive) await db.update(financeCategories).set({ isActive: true }).where(eq(financeCategories.id, existing.id));
    return { expenseCategory: { id: existing.id, name: existing.name } };
  }
  const { category } = await createFinanceCategory(auth, { kind: "EXPENSE", name });
  return { expenseCategory: { id: category.id, name: category.name } };
}

export const deleteExpenseCategory = deleteFinanceCategory;

export async function listExpenses(auth: AuthContext, q: z.infer<typeof expenseQuery>) {
  const r = await listFinanceEntries(auth, {
    kind: "EXPENSE",
    categoryId: q.categoryId,
    from: q.startDate,
    to: q.endDate,
    page: q.page,
    limit: q.limit,
  } as Parameters<typeof listFinanceEntries>[1]);
  return {
    expenses: r.items.map(toExpense),
    pagination: { page: r.page, limit: r.limit, total: r.total, totalPages: Math.max(1, r.totalPages) },
  };
}

const toEntry = (v: z.infer<typeof expenseSchema>) => ({
  kind: "EXPENSE" as const,
  categoryId: v.categoryId ?? null,
  description: v.description,
  note: v.note ?? null,
  amount: v.amount,
  entryDate: v.expenseDate,
});

export async function createExpense(auth: AuthContext, v: z.infer<typeof expenseSchema>) {
  const { entry } = await createFinanceEntry(auth, { ...toEntry(v), method: "CASH", referenceNumber: null });
  return { expense: toExpense(entry) };
}

export async function updateExpense(auth: AuthContext, id: string, v: z.infer<typeof expenseSchema>) {
  const { entry } = await updateFinanceEntry(auth, id, toEntry(v));
  return { expense: toExpense(entry) };
}

export const deleteExpense = deleteFinanceEntry;
