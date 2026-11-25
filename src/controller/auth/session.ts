import { and, asc, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import {
  locations,
  organizations,
  permissions,
  rolePermissions,
  roles,
  userLocations,
  users,
} from "@/db/schema";
import { forbidden, unauthorized } from "@/lib/errors";
import { ALL_PERMISSION_CODES, SYSTEM_ROLES } from "@/lib/permissions/catalog";
import type { AccessTokenClaims } from "@/lib/auth/tokens";

export interface SessionLocation {
  id: string;
  name: string;
  isDefault: boolean;
  role: string;
}

export interface SessionInfo {
  claims: AccessTokenClaims;
  user: { id: string; name: string; email: string; phone: string | null; isOwner: boolean };
  organization: {
    id: string;
    name: string;
    slug: string;
    status: string;
    plan: string;
    trialEndsAt: Date | null;
    logoUrl: string | null;
  };
  locations: SessionLocation[];
}

/**
 * Work out who the user is in their tenant right now: which locations they
 * may use, which one is active, and the permissions of their role there.
 * Rebuilt on every login/refresh so role changes take effect within minutes.
 */
export async function buildSession(tx: DbOrTx, userId: string, requestedLocationId?: string | null): Promise<SessionInfo> {
  const user = await tx.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || !user.isActive) throw unauthorized("This account is disabled");

  const org = await tx.query.organizations.findFirst({ where: eq(organizations.id, user.organizationId) });
  if (!org) throw unauthorized("Business account not found");

  let available: SessionLocation[];
  let roleIdByLocation = new Map<string, string>();

  if (user.isOwner) {
    const rows = await tx
      .select({ id: locations.id, name: locations.name, isDefault: locations.isDefault })
      .from(locations)
      .where(and(eq(locations.organizationId, org.id), eq(locations.isActive, true)))
      .orderBy(sql`${locations.isDefault} desc`, asc(locations.name));
    available = rows.map((r) => ({ ...r, role: SYSTEM_ROLES.OWNER }));
  } else {
    const rows = await tx
      .select({
        id: locations.id,
        name: locations.name,
        isDefault: locations.isDefault,
        role: roles.name,
        roleId: roles.id,
      })
      .from(userLocations)
      .innerJoin(locations, eq(locations.id, userLocations.locationId))
      .innerJoin(roles, eq(roles.id, userLocations.roleId))
      .where(and(eq(userLocations.userId, user.id), eq(locations.isActive, true)))
      .orderBy(sql`${locations.isDefault} desc`, asc(locations.name));
    available = rows.map(({ roleId: _r, ...r }) => r);
    roleIdByLocation = new Map(rows.map((r) => [r.id, r.roleId]));
  }

  if (!available.length) throw forbidden("You are not assigned to any active location. Contact the business owner.");

  const active =
    available.find((l) => l.id === requestedLocationId) ?? available.find((l) => l.isDefault) ?? available[0];

  let perms: string[];
  if (user.isOwner) {
    perms = [...ALL_PERMISSION_CODES];
  } else {
    const rows = await tx
      .select({ code: permissions.code })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(rolePermissions.roleId, roleIdByLocation.get(active.id)!));
    perms = rows.map((r) => r.code);
  }

  return {
    claims: {
      userId: user.id,
      organizationId: org.id,
      slug: org.slug,
      isOwner: user.isOwner,
      role: active.role,
      locationId: active.id,
      permissions: perms,
      plan: org.plan,
    },
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, isOwner: user.isOwner },
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      plan: org.plan,
      trialEndsAt: org.trialEndsAt,
      logoUrl: org.logoUrl,
    },
    locations: available,
  };
}

export function publicSession(s: SessionInfo) {
  return {
    user: s.user,
    organization: s.organization,
    locations: s.locations,
    activeLocationId: s.claims.locationId,
    role: s.claims.role,
    permissions: s.claims.permissions,
  };
}
