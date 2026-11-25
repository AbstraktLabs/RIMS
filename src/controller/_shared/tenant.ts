import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { locations, organizationSettings, userLocations } from "@/db/schema";
import type { AuthContext } from "@/lib/api/handler";
import { badRequest, forbidden, notFound } from "@/lib/errors";

export type OrgSettings = typeof organizationSettings.$inferSelect;

export async function getSettings(tx: DbOrTx, organizationId: string): Promise<OrgSettings> {
  const settings = await tx.query.organizationSettings.findFirst({
    where: eq(organizationSettings.organizationId, organizationId),
  });
  if (!settings) throw notFound("Business settings");
  return settings;
}

/**
 * Decide which location an operation applies to.
 * - An explicit locationId must belong to the tenant and be accessible to the user.
 * - Otherwise the session's active location, falling back to the default location.
 */
export async function resolveLocationId(
  tx: DbOrTx,
  auth: AuthContext,
  requested?: string | null,
): Promise<string> {
  const id = requested ?? auth.locationId;

  if (id) {
    const loc = await tx.query.locations.findFirst({
      where: and(eq(locations.id, id), eq(locations.organizationId, auth.organizationId)),
      columns: { id: true, isActive: true },
    });
    if (!loc) throw notFound("Location");
    if (!loc.isActive) throw badRequest("This location is inactive");
    if (!auth.isOwner && id !== auth.locationId) {
      const assigned = await tx.query.userLocations.findFirst({
        where: and(eq(userLocations.userId, auth.userId), eq(userLocations.locationId, id)),
        columns: { id: true },
      });
      if (!assigned) throw forbidden("You do not have access to this location");
    }
    return loc.id;
  }

  const def = await tx.query.locations.findFirst({
    where: and(eq(locations.organizationId, auth.organizationId), eq(locations.isDefault, true)),
    columns: { id: true },
  });
  if (!def) throw badRequest("No location available");
  return def.id;
}

/**
 * For list/report endpoints: owners may ask for "all" locations (undefined
 * result), other users are limited to their active location.
 */
export async function resolveLocationFilter(
  tx: DbOrTx,
  auth: AuthContext,
  requested?: string | null,
): Promise<string | undefined> {
  const wantsAll = !requested || requested === "all";
  if (auth.isOwner && wantsAll) return undefined;
  return resolveLocationId(tx, auth, wantsAll ? undefined : requested);
}
