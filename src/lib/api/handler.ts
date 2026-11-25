import { connection, NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z, ZodError, type ZodType } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, superAdmins } from "@/db/schema";
import { AppError, forbidden, fromPgError, unauthorized } from "@/lib/errors";
import { verifyAccessToken, verifySuperAdminToken, type AccessTokenClaims } from "@/lib/auth/tokens";
import { PLATFORM_COOKIE } from "@/lib/auth/cookies";
import { cached, cacheKeys } from "@/lib/cache";
import type { PermissionCode } from "@/lib/permissions/catalog";

// ─────────────────────────────────────────────────────────────
// Route wrappers. Every API route goes through one of these so that
// authentication, tenant scoping, permission checks, validation errors and
// database errors are handled the same way everywhere.
//   route.ts → tenantRoute(...) → controller(auth, input) → JSON
// ─────────────────────────────────────────────────────────────

export type AuthContext = AccessTokenClaims;

type RouteCtx = { params: Promise<Record<string, string>> };
type Params = Record<string, string>;

interface HandlerArgs {
  req: NextRequest;
  params: Params;
}

export class JsonResponse {
  constructor(
    public body: unknown,
    public status: number,
  ) {}
}
export const created = (body: unknown) => new JsonResponse(body, 201);

function toResponse(result: unknown): Response {
  if (result instanceof Response) return result;
  if (result instanceof JsonResponse) return NextResponse.json(result.body, { status: result.status });
  return NextResponse.json(result ?? { success: true });
}

export function errorResponse(err: unknown): Response {
  // let Next.js control-flow errors (dynamic bail-out, redirects…) through
  unstable_rethrow(err);
  if (err instanceof AppError) {
    const headers: Record<string, string> = {};
    const retry = (err.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
    if (err.status === 429 && retry) headers["Retry-After"] = String(retry);
    return NextResponse.json({ error: err.message, details: err.details }, { status: err.status, headers });
  }
  if (err instanceof ZodError) {
    return NextResponse.json({ error: "Invalid input", details: z.flattenError(err) }, { status: 400 });
  }
  const pg = fromPgError(err);
  if (pg) return NextResponse.json({ error: pg.message, details: pg.details }, { status: pg.status });
  console.error("[api] unhandled error:", err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

// ── input helpers ────────────────────────────────────────────
export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError(400, "Request body must be valid JSON");
  }
  return schema.parse(body);
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  const raw: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    if (value !== "") raw[key] = value;
  });
  return schema.parse(raw);
}

const uuidSchema = z.string().uuid();
export function idParam(params: Params, name = "id"): string {
  const parsed = uuidSchema.safeParse(params[name]);
  if (!parsed.success) throw new AppError(404, "Not found");
  return parsed.data;
}

// ── tenant access ────────────────────────────────────────────
export function hasPermission(auth: AuthContext, code: PermissionCode): boolean {
  return auth.isOwner || auth.permissions.includes(code);
}

export function requirePermission(auth: AuthContext, ...codes: PermissionCode[]) {
  if (!codes.some((c) => hasPermission(auth, c))) throw forbidden();
}

export function requireOwner(auth: AuthContext) {
  if (!auth.isOwner) throw forbidden("Only the business owner can do this");
}

interface OrgAccess {
  status: "TRIAL" | "ACTIVE" | "SUSPENDED";
  trialEndsAt: string | null;
}

async function getOrgAccess(organizationId: string): Promise<OrgAccess | null> {
  return cached(cacheKeys.orgStatus(organizationId), 30, async () => {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
      columns: { status: true, trialEndsAt: true },
    });
    return org ? { status: org.status, trialEndsAt: org.trialEndsAt?.toISOString() ?? null } : null;
  });
}

/** Suspended tenants and expired trials can read their data but not change it. */
export function isReadOnlyTenant(access: OrgAccess): boolean {
  if (access.status === "SUSPENDED") return true;
  if (access.status === "TRIAL" && access.trialEndsAt && new Date(access.trialEndsAt) < new Date()) return true;
  return false;
}

export function readAuth(req: NextRequest): AuthContext | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  try {
    return verifyAccessToken(header.slice(7));
  } catch {
    return null;
  }
}

interface TenantRouteOptions {
  /** user needs at least one of these permissions */
  permission?: PermissionCode | PermissionCode[];
  ownerOnly?: boolean;
}

export function tenantRoute(
  options: TenantRouteOptions,
  fn: (args: HandlerArgs & { auth: AuthContext }) => Promise<unknown>,
) {
  return async (req: NextRequest, ctx: RouteCtx): Promise<Response> => {
    await connection(); // API responses are always per-request, never prerendered
    try {
      const auth = readAuth(req);
      if (!auth) throw unauthorized("Your session has expired. Please sign in again.");

      const access = await getOrgAccess(auth.organizationId);
      if (!access) throw unauthorized("Business account not found");
      if (req.method !== "GET" && isReadOnlyTenant(access)) {
        throw new AppError(
          403,
          access.status === "SUSPENDED"
            ? "This business account is suspended. You can view your data, but changes are disabled."
            : "Your trial has ended. You can view your data, but changes are disabled until you upgrade.",
          { code: "TENANT_READ_ONLY" },
        );
      }

      if (options.ownerOnly) requireOwner(auth);
      if (options.permission) {
        const codes = Array.isArray(options.permission) ? options.permission : [options.permission];
        requirePermission(auth, ...codes);
      }

      const params = ctx?.params ? await ctx.params : {};
      return toResponse(await fn({ req, params, auth }));
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function publicRoute(fn: (args: HandlerArgs) => Promise<unknown>) {
  return async (req: NextRequest, ctx: RouteCtx): Promise<Response> => {
    await connection(); // API responses are always per-request, never prerendered
    try {
      const params = ctx?.params ? await ctx.params : {};
      return toResponse(await fn({ req, params }));
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export interface PlatformAuth {
  superAdminId: string;
}

export function platformRoute(fn: (args: HandlerArgs & { admin: PlatformAuth }) => Promise<unknown>) {
  return async (req: NextRequest, ctx: RouteCtx): Promise<Response> => {
    await connection(); // API responses are always per-request, never prerendered
    try {
      const token = req.cookies.get(PLATFORM_COOKIE)?.value;
      if (!token) throw unauthorized();
      let claims;
      try {
        claims = verifySuperAdminToken(token);
      } catch {
        throw unauthorized();
      }
      const admin = await db.query.superAdmins.findFirst({
        where: eq(superAdmins.id, claims.superAdminId),
        columns: { id: true, isActive: true },
      });
      if (!admin?.isActive) throw unauthorized();
      const params = ctx?.params ? await ctx.params : {};
      return toResponse(await fn({ req, params, admin: { superAdminId: admin.id } }));
    } catch (err) {
      return errorResponse(err);
    }
  };
}
