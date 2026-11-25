import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, updatedAt } from "./_columns";
import { organizations, locations } from "./tenancy";

// A user belongs to exactly one tenant. Email is globally unique so login
// needs only email + password and the tenant is resolved from the user.
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 30 }),
    passwordHash: text("password_hash").notNull(),
    // The owner has full access across all locations and cannot be demoted
    // by other users. Exactly one owner per tenant (enforced below).
    isOwner: boolean("is_owner").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    emailVerified: boolean("email_verified").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(sql`lower(${t.email})`),
    index("users_org_idx").on(t.organizationId, t.isActive),
    uniqueIndex("users_org_owner_idx").on(t.organizationId).where(sql`${t.isOwner}`),
  ],
);

// Refresh-token sessions. The token itself lives in an httpOnly cookie; only
// its SHA-256 hash is stored. Rotated on every refresh; revoked on logout.
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // location the session is currently working in (null = owner "all locations")
    activeLocationId: uuid("active_location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("refresh_tokens_user_idx").on(t.userId), index("refresh_tokens_hash_idx").on(t.tokenHash)],
);

export const passwordResets = pgTable(
  "password_resets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    verified: boolean("verified").notNull().default(false),
    usedAt: timestamp("used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("password_resets_user_idx").on(t.userId)],
);

export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("email_verification_tokens_hash_idx").on(t.tokenHash),
    index("email_verification_tokens_user_idx").on(t.userId),
  ],
);
