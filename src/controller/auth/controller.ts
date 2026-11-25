import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { organizations, passwordResets, refreshTokens, users } from "@/db/schema";
import { createTenantDefaults } from "@/db/tenant-defaults";
import { badRequest, conflict, forbidden, unauthorized } from "@/lib/errors";
import {
  getDummyHash,
  hashPassword,
  randomCode,
  sha256,
  verifyPassword,
} from "@/lib/auth/password";
import {
  REFRESH_TOKEN_TTL_SECONDS,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "@/lib/auth/tokens";
import { passwordResetMail, sendMail } from "@/lib/email/send";
import type {
  ChangePasswordInputT,
  LoginInputT,
  RegisterInputT,
  ResetPasswordInputT,
  UpdateProfileInputT,
  VerifyResetCodeInputT,
} from "./types";
import { buildSession, publicSession } from "./session";

const RESET_CODE_TTL_MS = 15 * 60 * 1000;

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "store"
  );
}

// Sensible starting toggles per business type — all editable in Settings.
const FEATURE_PRESETS: Record<RegisterInputT["businessType"], Record<string, boolean>> = {
  GROCERY: { enableBatchTracking: true, enableExpiryTracking: true, enableVariants: true },
  FOOD: { enableBatchTracking: true, enableExpiryTracking: true, enableVariants: true },
  COSMETICS: { enableBatchTracking: true, enableExpiryTracking: true, enableVariants: true },
  FASHION: { enableVariants: true },
  ELECTRONICS: { enableSerialTracking: true, enableVariants: true },
  CONVENIENCE: { enableVariants: true, enableExpiryTracking: true, enableBatchTracking: true },
  GENERAL: { enableVariants: true },
  OTHER: { enableVariants: true },
};

async function issueSession(userId: string, activeLocationId: string | null, userAgent: string | null) {
  const session = await buildSession(db, userId, activeLocationId);
  const [row] = await db
    .insert(refreshTokens)
    .values({
      userId,
      activeLocationId: session.claims.locationId,
      tokenHash: "pending",
      userAgent: userAgent?.slice(0, 500) ?? null,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    })
    .returning({ id: refreshTokens.id });
  const refreshToken = signRefreshToken({ userId, sessionId: row.id });
  await db.update(refreshTokens).set({ tokenHash: sha256(refreshToken) }).where(eq(refreshTokens.id, row.id));
  return { accessToken: signAccessToken(session.claims), refreshToken, session };
}

export async function register(input: RegisterInputT, userAgent: string | null) {
  const existing = await db.query.users.findFirst({
    where: sql`lower(${users.email}) = ${input.email}`,
    columns: { id: true },
  });
  if (existing) throw conflict("An account with this email already exists");

  const trialDays = Number(process.env.TRIAL_DAYS ?? 14);
  const base = slugify(input.businessName);

  const { userId } = await db.transaction(async (tx) => {
    // find a free slug: base, base-2, base-3 …
    const taken = await tx
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(sql`${organizations.slug} = ${base} or ${organizations.slug} like ${base + "-%"}`);
    const takenSet = new Set(taken.map((t) => t.slug));
    let slug = base;
    for (let i = 2; takenSet.has(slug); i++) slug = `${base}-${i}`;

    const [org] = await tx
      .insert(organizations)
      .values({
        name: input.businessName,
        slug,
        businessType: input.businessType,
        status: "TRIAL",
        trialEndsAt: new Date(Date.now() + trialDays * 86_400_000),
        email: input.email,
        phone: input.phone ?? null,
      })
      .returning({ id: organizations.id });

    await createTenantDefaults(tx, {
      organizationId: org.id,
      settings: {
        ...FEATURE_PRESETS[input.businessType],
        ...(input.currencyCode && { currencyCode: input.currencyCode }),
        ...(input.currencySymbol && { currencySymbol: input.currencySymbol }),
        ...(input.locale && { locale: input.locale }),
        ...(input.timezone && { timezone: input.timezone }),
        ...(input.calendarSystem && { calendarSystem: input.calendarSystem }),
        ...(input.taxLabel && { taxLabel: input.taxLabel }),
      },
      defaultTaxRate:
        input.defaultTaxRate !== undefined && input.defaultTaxRate > 0
          ? { name: `${input.taxLabel ?? "VAT"} ${input.defaultTaxRate}%`, rate: String(input.defaultTaxRate) }
          : undefined,
    });

    const [user] = await tx
      .insert(users)
      .values({
        organizationId: org.id,
        name: input.ownerName,
        email: input.email,
        phone: input.phone ?? null,
        passwordHash: await hashPassword(input.password),
        isOwner: true,
        emailVerified: true,
      })
      .returning({ id: users.id });

    return { userId: user.id };
  });

  return issueSession(userId, null, userAgent);
}

export async function login(input: LoginInputT, userAgent: string | null) {
  const user = await db.query.users.findFirst({
    where: sql`lower(${users.email}) = ${input.email}`,
    columns: { id: true, passwordHash: true, isActive: true },
  });

  const ok = await verifyPassword(input.password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !ok) throw unauthorized("Invalid email or password");
  if (!user.isActive) throw unauthorized("This account is disabled. Contact the business owner.");

  const result = await issueSession(user.id, null, userAgent);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  return result;
}

/** Validates and rotates a refresh token. Any mismatch revokes the session. */
export async function refresh(refreshToken: string | undefined, requestedLocationId?: string | null) {
  if (!refreshToken) throw unauthorized("Not signed in");
  let claims;
  try {
    claims = verifyRefreshToken(refreshToken);
  } catch {
    throw unauthorized("Session expired");
  }

  const row = await db.query.refreshTokens.findFirst({ where: eq(refreshTokens.id, claims.sessionId) });
  if (!row || row.revokedAt || row.expiresAt < new Date()) throw unauthorized("Session expired");
  if (row.tokenHash !== sha256(refreshToken)) {
    // token reuse — treat as stolen
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));
    throw unauthorized("Session expired");
  }

  let session;
  try {
    session = await buildSession(db, row.userId, requestedLocationId ?? row.activeLocationId);
  } catch (err) {
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));
    throw err;
  }
  // an explicit switch must land on the requested location (checked before rotating)
  if (requestedLocationId && session.claims.locationId !== requestedLocationId) {
    throw forbidden("You don't have access to that location");
  }

  const newRefresh = signRefreshToken({ userId: row.userId, sessionId: row.id });
  // Rotate only if nobody rotated it since we read it. Two tabs refreshing at the same
  // moment both pass the check above; the loser gets a 401 but the session survives,
  // and its retry carries the winner's cookie.
  const rotated = await db
    .update(refreshTokens)
    .set({
      tokenHash: sha256(newRefresh),
      activeLocationId: session.claims.locationId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    })
    .where(and(eq(refreshTokens.id, row.id), eq(refreshTokens.tokenHash, row.tokenHash), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });
  if (!rotated.length) throw unauthorized("Session expired");

  return { accessToken: signAccessToken(session.claims), refreshToken: newRefresh, session };
}

export async function logout(refreshToken: string | undefined) {
  if (!refreshToken) return;
  try {
    const claims = verifyRefreshToken(refreshToken);
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, claims.sessionId));
  } catch {
    /* already invalid */
  }
}

export async function me(userId: string, locationId: string | null) {
  const session = await buildSession(db, userId, locationId);
  return publicSession(session);
}

// ── password reset ───────────────────────────────────────────
export async function requestPasswordReset(email: string) {
  const user = await db.query.users.findFirst({
    where: sql`lower(${users.email}) = ${email}`,
    columns: { id: true, email: true, isActive: true },
  });
  // Always behave the same so the endpoint doesn't reveal which emails exist.
  if (!user || !user.isActive) return;

  const code = randomCode();
  await db.insert(passwordResets).values({
    userId: user.id,
    codeHash: sha256(`${user.id}:${code}`),
    expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
  });
  await sendMail(passwordResetMail(user.email, code));
}

async function findValidReset(email: string, code: string) {
  const user = await db.query.users.findFirst({
    where: sql`lower(${users.email}) = ${email}`,
    columns: { id: true },
  });
  if (!user) throw badRequest("Invalid or expired code");
  const reset = await db.query.passwordResets.findFirst({
    where: and(
      eq(passwordResets.userId, user.id),
      isNull(passwordResets.usedAt),
      gt(passwordResets.expiresAt, new Date()),
    ),
    orderBy: desc(passwordResets.createdAt),
  });
  if (!reset || reset.codeHash !== sha256(`${user.id}:${code}`)) throw badRequest("Invalid or expired code");
  return { userId: user.id, resetId: reset.id };
}

export async function verifyResetCode(input: VerifyResetCodeInputT) {
  const { resetId } = await findValidReset(input.email, input.code);
  await db.update(passwordResets).set({ verified: true }).where(eq(passwordResets.id, resetId));
}

export async function resetPassword(input: ResetPasswordInputT) {
  const { userId, resetId } = await findValidReset(input.email, input.code);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash: await hashPassword(input.newPassword) }).where(eq(users.id, userId));
    await tx.update(passwordResets).set({ usedAt: new Date(), verified: true }).where(eq(passwordResets.id, resetId));
    // sign out everywhere
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  });
}

// ── own profile ──────────────────────────────────────────────
export async function updateProfile(userId: string, input: UpdateProfileInputT) {
  const [row] = await db
    .update(users)
    .set({ ...(input.name && { name: input.name }), ...(input.phone !== undefined && { phone: input.phone }) })
    .where(eq(users.id, userId))
    .returning({ id: users.id, name: users.name, email: users.email, phone: users.phone });
  return { user: row };
}

export async function changePassword(userId: string, input: ChangePasswordInputT, currentRefreshToken?: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { passwordHash: true } });
  if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw badRequest("Current password is incorrect");
  }
  let keepSessionId: string | null = null;
  try {
    if (currentRefreshToken) keepSessionId = verifyRefreshToken(currentRefreshToken).sessionId;
  } catch {
    /* ignore */
  }
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash: await hashPassword(input.newPassword) }).where(eq(users.id, userId));
    // sign out other devices
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.userId, userId),
          isNull(refreshTokens.revokedAt),
          keepSessionId ? ne(refreshTokens.id, keepSessionId) : undefined,
        ),
      );
  });
}
