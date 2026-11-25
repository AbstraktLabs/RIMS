import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { AuthContext } from "@/lib/api/handler";
import { num, round2 } from "@/lib/num";
import { resolveRange, type DateRange } from "../_shared/dates";
import { getSettings, resolveLocationFilter, type OrgSettings } from "../_shared/tenant";

export interface ReportContext {
  orgId: string;
  settings: OrgSettings;
  tz: string;
  range: DateRange;
  locationId: string | undefined;
  /** `and <col> = <location>` when a single location is selected */
  loc: (col: SQL) => SQL;
}

export async function reportContext(
  auth: AuthContext,
  q: { from?: string; to?: string; locationId?: string },
  defaultDays?: number,
): Promise<ReportContext> {
  const settings = await getSettings(db, auth.organizationId);
  const locationId = await resolveLocationFilter(db, auth, q.locationId);
  return {
    orgId: auth.organizationId,
    settings,
    tz: settings.timezone,
    range: resolveRange(settings.timezone, q.from, q.to, defaultDays),
    locationId,
    loc: (col) => (locationId ? sql` and ${col} = ${locationId}` : sql``),
  };
}

export async function rows<T>(query: SQL): Promise<T[]> {
  const res = await db.execute(query);
  return res.rows as T[];
}

/** numeric strings → numbers for the listed keys */
export function numeric<T extends Record<string, unknown>>(row: T, keys: (keyof T)[]): T {
  const out = { ...row };
  for (const k of keys) (out as Record<string, unknown>)[k as string] = round2(num(row[k] as string));
  return out;
}

export const canSeeCost = (auth: AuthContext) => auth.isOwner || auth.permissions.includes("reports.view");
