import { and, asc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { db, type Tx } from "@/db";
import {
  locations,
  organizations,
  permissions,
  refreshTokens,
  rolePermissions,
  roles,
  userLocations,
  users,
} from "@/db/schema";
import type { AuthContext } from "@/lib/api/handler";
import { hashPassword, randomToken } from "@/lib/auth/password";
import { sendMail, staffWelcomeMail } from "@/lib/email/send";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { SYSTEM_ROLES } from "@/lib/permissions/catalog";
import type { createStaffSchema, listStaffQuery, updateStaffSchema } from "@/lib/validation/staff";
import { likePattern } from "../_shared/paging";

type Assignment = { locationId: string; roleId: string };

// ── roles ────────────────────────────────────────────────────
function assignableRolesWhere(orgId: string) {
  return or(
    and(isNull(roles.organizationId), eq(roles.isSystem, true), sql`${roles.name} <> ${SYSTEM_ROLES.OWNER}`),
    eq(roles.organizationId, orgId),
  );
}

export async function listRoles(auth: AuthContext) {
  const rows = await db
    .select({
      id: roles.id,
      name: roles.name,
      description: roles.description,
      isSystem: roles.isSystem,
      permission: permissions.code,
    })
    .from(roles)
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(assignableRolesWhere(auth.organizationId))
    .orderBy(asc(roles.name));

  const map = new Map<string, { id: string; name: string; description: string | null; isSystem: boolean; permissions: string[] }>();
  for (const r of rows) {
    const role = map.get(r.id) ?? { id: r.id, name: r.name, description: r.description, isSystem: r.isSystem, permissions: [] };
    if (r.permission) role.permissions.push(r.permission);
    map.set(r.id, role);
  }
  return { items: [...map.values()] };
}

async function validateAssignments(tx: Tx, orgId: string, list: Assignment[]) {
  const locIds = list.map((a) => a.locationId);
  const roleIds = [...new Set(list.map((a) => a.roleId))];
  const [locs, rs] = await Promise.all([
    tx
      .select({ id: locations.id, isActive: locations.isActive })
      .from(locations)
      .where(and(eq(locations.organizationId, orgId), inArray(locations.id, locIds))),
    tx.select({ id: roles.id }).from(roles).where(and(inArray(roles.id, roleIds), assignableRolesWhere(orgId))),
  ]);
  if (locs.length !== locIds.length) throw badRequest("One or more locations were not found");
  if (locs.some((l) => !l.isActive)) throw badRequest("Staff can't be assigned to an inactive location");
  if (rs.length !== roleIds.length) throw badRequest("One or more roles are not assignable");
}

async function replaceAssignments(tx: Tx, orgId: string, userId: string, list: Assignment[]) {
  await tx.delete(userLocations).where(eq(userLocations.userId, userId));
  await tx.insert(userLocations).values(list.map((a) => ({ ...a, userId, organizationId: orgId })));
}

async function revokeSessions(tx: Tx, userId: string) {
  await tx
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

// ── staff ────────────────────────────────────────────────────
async function loadStaff(orgId: string, filter?: { ids?: string[]; search?: string; status?: string }) {
  const conds = [eq(users.organizationId, orgId)];
  if (filter?.ids) conds.push(inArray(users.id, filter.ids));
  if (filter?.status === "active") conds.push(eq(users.isActive, true));
  if (filter?.status === "inactive") conds.push(eq(users.isActive, false));
  if (filter?.search) {
    const p = likePattern(filter.search);
    conds.push(or(ilike(users.name, p), ilike(users.email, p))!);
  }
  const people = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      isOwner: users.isOwner,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(...conds))
    .orderBy(sql`${users.isOwner} desc`, asc(users.name));
  if (!people.length) return [];

  const links = await db
    .select({
      userId: userLocations.userId,
      locationId: locations.id,
      locationName: locations.name,
      roleId: roles.id,
      roleName: roles.name,
    })
    .from(userLocations)
    .innerJoin(locations, eq(locations.id, userLocations.locationId))
    .innerJoin(roles, eq(roles.id, userLocations.roleId))
    .where(
      inArray(
        userLocations.userId,
        people.map((p) => p.id),
      ),
    )
    .orderBy(asc(locations.name));

  return people.map((p) => ({
    ...p,
    assignments: p.isOwner
      ? []
      : links.filter((l) => l.userId === p.id).map(({ userId: _u, ...rest }) => rest),
  }));
}

export async function listStaff(auth: AuthContext, q: z.infer<typeof listStaffQuery>) {
  return { items: await loadStaff(auth.organizationId, { search: q.search, status: q.status }) };
}

export async function getStaff(auth: AuthContext, id: string) {
  const [user] = await loadStaff(auth.organizationId, { ids: [id] });
  if (!user) throw notFound("Staff member");
  return { user };
}

const tempPassword = () => `${randomToken(9)}9a`; // ~12 chars, has a letter and a digit

export async function createStaff(auth: AuthContext, input: z.infer<typeof createStaffSchema>) {
  const exists = await db.query.users.findFirst({
    where: sql`lower(${users.email}) = ${input.email}`,
    columns: { id: true },
  });
  if (exists) throw conflict("A user with this email already exists");

  const plain = input.password ?? tempPassword();
  const userId = await db.transaction(async (tx) => {
    await validateAssignments(tx, auth.organizationId, input.assignments);
    const [u] = await tx
      .insert(users)
      .values({
        organizationId: auth.organizationId,
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        passwordHash: await hashPassword(plain),
        emailVerified: true,
      })
      .returning({ id: users.id });
    await replaceAssignments(tx, auth.organizationId, u.id, input.assignments);
    return u.id;
  });

  let emailed = false;
  if (input.sendWelcomeEmail) {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, auth.organizationId),
      columns: { name: true },
    });
    try {
      await sendMail(staffWelcomeMail(input.email, input.name, org?.name ?? "your business", plain));
      emailed = true;
    } catch (err) {
      console.warn("[staff] welcome email failed", err);
    }
  }

  const { user } = await getStaff(auth, userId);
  // The generated password is shown once so the owner can hand it over.
  return { user, temporaryPassword: input.password ? undefined : plain, emailed };
}

async function loadEditable(tx: Tx, auth: AuthContext, id: string) {
  const user = await tx.query.users.findFirst({
    where: and(eq(users.id, id), eq(users.organizationId, auth.organizationId)),
  });
  if (!user) throw notFound("Staff member");
  if (user.isOwner) throw forbidden("The business owner's account is managed from their own profile");
  if (user.id === auth.userId) throw forbidden("You can't change your own access");
  return user;
}

export async function updateStaff(auth: AuthContext, id: string, input: z.infer<typeof updateStaffSchema>) {
  await db.transaction(async (tx) => {
    await loadEditable(tx, auth, id);
    await tx
      .update(users)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      })
      .where(eq(users.id, id));
    if (input.assignments) {
      await validateAssignments(tx, auth.organizationId, input.assignments);
      await replaceAssignments(tx, auth.organizationId, id, input.assignments);
    }
    // access changed → force re-login so stale tokens can't refresh
    if (input.isActive === false || input.assignments) await revokeSessions(tx, id);
  });
  return getStaff(auth, id);
}

export async function deactivateStaff(auth: AuthContext, id: string) {
  // Staff are referenced by every document they created, so they're never hard-deleted.
  return updateStaff(auth, id, { isActive: false, phone: undefined });
}

export async function resetStaffPassword(auth: AuthContext, id: string) {
  const plain = tempPassword();
  await db.transaction(async (tx) => {
    await loadEditable(tx, auth, id);
    await tx.update(users).set({ passwordHash: await hashPassword(plain) }).where(eq(users.id, id));
    await revokeSessions(tx, id);
  });
  return { temporaryPassword: plain };
}
