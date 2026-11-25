import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { locations, organizations, products, sales, superAdmins, users } from "@/db/schema";
import { getDummyHash, verifyPassword } from "@/lib/auth/password";
import { signSuperAdminToken } from "@/lib/auth/tokens";
import { cacheDel, cacheKeys } from "@/lib/cache";
import { notFound, unauthorized } from "@/lib/errors";
import { pagination } from "@/lib/validation/common";
import { and_, countAll, likePattern, offsetFor, pageOf } from "../_shared/paging";
import { qcol } from "../_shared/sql";

export const listOrganizationsQuery = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["TRIAL", "ACTIVE", "SUSPENDED"]).optional(),
  ...pagination,
});

export const updateOrganizationSchema = z
  .object({
    status: z.enum(["TRIAL", "ACTIVE", "SUSPENDED"]).optional(),
    plan: z.enum(["BASIC", "STANDARD", "PRO"]).optional(),
    trialEndsAt: z.coerce.date().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export async function platformLogin(email: string, password: string) {
  const admin = await db.query.superAdmins.findFirst({
    where: sql`lower(${superAdmins.email}) = ${email.toLowerCase()}`,
  });
  const ok = await verifyPassword(password, admin?.passwordHash ?? (await getDummyHash()));
  if (!admin || !ok || !admin.isActive) throw unauthorized("Invalid email or password");
  await db.update(superAdmins).set({ lastLoginAt: new Date() }).where(eq(superAdmins.id, admin.id));
  return {
    token: signSuperAdminToken({ superAdminId: admin.id }),
    admin: { id: admin.id, name: admin.name, email: admin.email },
  };
}

export async function platformMe(superAdminId: string) {
  const admin = await db.query.superAdmins.findFirst({
    where: eq(superAdmins.id, superAdminId),
    columns: { id: true, name: true, email: true, lastLoginAt: true },
  });
  if (!admin) throw unauthorized();
  return { admin };
}

const userCount = sql<number>`(select count(*)::int from ${users} where ${users.organizationId} = ${qcol(organizations.id)})`;
const locationCount = sql<number>`(select count(*)::int from ${locations} where ${locations.organizationId} = ${qcol(organizations.id)})`;
const ownerEmail = sql<string | null>`(select ${users.email} from ${users} where ${users.organizationId} = ${qcol(organizations.id)} and ${users.isOwner} limit 1)`;

export async function listOrganizations(q: z.infer<typeof listOrganizationsQuery>) {
  const where = and_(
    q.status ? eq(organizations.status, q.status) : undefined,
    q.search
      ? or(ilike(organizations.name, likePattern(q.search)), ilike(organizations.slug, likePattern(q.search)))
      : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        businessType: organizations.businessType,
        plan: organizations.plan,
        status: organizations.status,
        trialEndsAt: organizations.trialEndsAt,
        createdAt: organizations.createdAt,
        ownerEmail,
        userCount,
        locationCount,
      })
      .from(organizations)
      .where(where)
      .orderBy(desc(organizations.createdAt))
      .limit(q.limit)
      .offset(offsetFor(q.page, q.limit)),
    db.select({ total: countAll }).from(organizations).where(where),
  ]);
  return pageOf(rows, total, q.page, q.limit);
}

export async function getOrganization(id: string) {
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, id) });
  if (!org) throw notFound("Organization");
  const [[stats], owner] = await Promise.all([
    db
      .select({
        users: sql<number>`(select count(*)::int from ${users} where ${users.organizationId} = ${id})`,
        locations: sql<number>`(select count(*)::int from ${locations} where ${locations.organizationId} = ${id})`,
        products: sql<number>`(select count(*)::int from ${products} where ${products.organizationId} = ${id})`,
        sales: sql<number>`(select count(*)::int from ${sales} where ${sales.organizationId} = ${id} and ${sales.status} = 'POSTED')`,
        lastSaleAt: sql<string | null>`(select max(${sales.createdAt}) from ${sales} where ${sales.organizationId} = ${id})`,
      })
      .from(sql`(select 1) as one`),
    db.query.users.findFirst({
      where: and(eq(users.organizationId, id), eq(users.isOwner, true)),
      columns: { id: true, name: true, email: true, phone: true, lastLoginAt: true },
    }),
  ]);
  return { organization: org, owner: owner ?? null, stats };
}

export async function updateOrganization(id: string, input: z.infer<typeof updateOrganizationSchema>) {
  const [row] = await db
    .update(organizations)
    .set({
      ...(input.status && {
        status: input.status,
        suspendedAt: input.status === "SUSPENDED" ? new Date() : null,
      }),
      ...(input.plan && { plan: input.plan }),
      ...(input.trialEndsAt !== undefined && { trialEndsAt: input.trialEndsAt }),
    })
    .where(eq(organizations.id, id))
    .returning();
  if (!row) throw notFound("Organization");
  await cacheDel(cacheKeys.orgStatus(id));
  return { organization: row };
}

export async function platformStats() {
  const [byStatus, [totals], signups] = await Promise.all([
    db
      .select({ status: organizations.status, count: countAll })
      .from(organizations)
      .groupBy(organizations.status),
    db
      .select({
        organizations: sql<number>`(select count(*)::int from ${organizations})`,
        users: sql<number>`(select count(*)::int from ${users})`,
        expiredTrials: sql<number>`(select count(*)::int from ${organizations} where ${organizations.status} = 'TRIAL' and ${organizations.trialEndsAt} < now())`,
      })
      .from(sql`(select 1) as one`),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${organizations.createdAt}), 'YYYY-MM-DD')`,
        count: countAll,
      })
      .from(organizations)
      .where(sql`${organizations.createdAt} >= now() - interval '30 days'`)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
  ]);
  return {
    totals,
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.count])),
    signupsLast30Days: signups,
  };
}
