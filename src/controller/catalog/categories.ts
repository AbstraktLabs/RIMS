import { and, asc, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { brands, categories, products } from "@/db/schema";
import type { AuthContext } from "@/lib/api/handler";
import { badRequest, conflict, notFound } from "@/lib/errors";
import type { brandSchema, categorySchema, updateBrandSchema, updateCategorySchema } from "@/lib/validation/catalog";
import { qcol } from "../_shared/sql";

// ── categories ───────────────────────────────────────────────
type CategoryRow = {
  id: string;
  name: string;
  parentId: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
};
type CategoryNode = CategoryRow & { children: CategoryNode[] };

export async function listCategories(auth: AuthContext, includeInactive: boolean) {
  const conds = [eq(categories.organizationId, auth.organizationId)];
  if (!includeInactive) conds.push(eq(categories.isActive, true));
  const rows: CategoryRow[] = await db
    .select({
      id: categories.id,
      name: categories.name,
      parentId: categories.parentId,
      description: categories.description,
      sortOrder: categories.sortOrder,
      isActive: categories.isActive,
      productCount: sql<number>`(select count(*)::int from ${products} where ${products.categoryId} = ${qcol(categories.id)})`,
    })
    .from(categories)
    .where(and(...conds))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  const nodes = new Map<string, CategoryNode>(rows.map((r) => [r.id, { ...r, children: [] }]));
  const tree: CategoryNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else tree.push(node);
  }
  return { items: rows, tree };
}

async function assertParent(orgId: string, parentId: string, selfId?: string) {
  // walk up from the proposed parent; reaching selfId would create a cycle
  let current: string | null = parentId;
  for (let depth = 0; current; depth++) {
    if (current === selfId) throw badRequest("A category can't be placed inside itself or its subcategories");
    if (depth > 20) throw badRequest("Category tree is too deep");
    const row: { parentId: string | null } | undefined = await db.query.categories.findFirst({
      where: and(eq(categories.id, current), eq(categories.organizationId, orgId)),
      columns: { parentId: true },
    });
    if (!row) throw notFound("Parent category");
    current = row.parentId;
  }
}

export async function createCategory(auth: AuthContext, input: z.infer<typeof categorySchema>) {
  if (input.parentId) await assertParent(auth.organizationId, input.parentId);
  const [row] = await db
    .insert(categories)
    .values({ ...input, parentId: input.parentId ?? null, organizationId: auth.organizationId })
    .returning();
  return { category: row };
}

export async function updateCategory(auth: AuthContext, id: string, input: z.infer<typeof updateCategorySchema>) {
  if (input.parentId) await assertParent(auth.organizationId, input.parentId, id);
  const [row] = await db
    .update(categories)
    .set(input)
    .where(and(eq(categories.id, id), eq(categories.organizationId, auth.organizationId)))
    .returning();
  if (!row) throw notFound("Category");
  return { category: row };
}

export async function deleteCategory(auth: AuthContext, id: string) {
  const [counts] = await db
    .select({
      children: sql<number>`(select count(*)::int from ${categories} where ${categories.parentId} = ${id})`,
      products: sql<number>`(select count(*)::int from ${products} where ${products.categoryId} = ${id})`,
    })
    .from(sql`(select 1) as one`);
  if (counts.children > 0) throw conflict("Move or delete the subcategories first");
  if (counts.products > 0) {
    throw conflict(`${counts.products} product(s) use this category. Reassign them or deactivate the category.`);
  }
  const [row] = await db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.organizationId, auth.organizationId)))
    .returning({ id: categories.id });
  if (!row) throw notFound("Category");
  return { success: true };
}

// ── brands ───────────────────────────────────────────────────
export async function listBrands(auth: AuthContext, includeInactive: boolean) {
  const conds = [eq(brands.organizationId, auth.organizationId)];
  if (!includeInactive) conds.push(eq(brands.isActive, true));
  const items = await db
    .select({
      id: brands.id,
      name: brands.name,
      isActive: brands.isActive,
      productCount: sql<number>`(select count(*)::int from ${products} where ${products.brandId} = ${qcol(brands.id)})`,
    })
    .from(brands)
    .where(and(...conds))
    .orderBy(asc(brands.name));
  return { items };
}

export async function createBrand(auth: AuthContext, input: z.infer<typeof brandSchema>) {
  const [row] = await db
    .insert(brands)
    .values({ ...input, organizationId: auth.organizationId })
    .returning();
  return { brand: row };
}

export async function updateBrand(auth: AuthContext, id: string, input: z.infer<typeof updateBrandSchema>) {
  const [row] = await db
    .update(brands)
    .set(input)
    .where(and(eq(brands.id, id), eq(brands.organizationId, auth.organizationId)))
    .returning();
  if (!row) throw notFound("Brand");
  return { brand: row };
}

export async function deleteBrand(auth: AuthContext, id: string) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(and(eq(products.organizationId, auth.organizationId), eq(products.brandId, id)));
  if (n > 0) throw conflict(`${n} product(s) use this brand. Reassign them or deactivate the brand.`);
  const [row] = await db
    .delete(brands)
    .where(and(eq(brands.id, id), eq(brands.organizationId, auth.organizationId)))
    .returning({ id: brands.id });
  if (!row) throw notFound("Brand");
  return { success: true };
}
