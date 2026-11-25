import { pgTable, uuid, varchar, text, boolean, index, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt } from "./_columns";
import { organizations, locations } from "./tenancy";
import { users } from "./users";

// Permission catalogue — static, seeded from src/db/seed/permissions.ts.
// code = "<resource>.<action>", e.g. "inventory.view", "sales.manage".
export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    module: varchar("module", { length: 50 }).notNull(),
    resource: varchar("resource", { length: 50 }).notNull(),
    action: varchar("action", { length: 30 }).notNull(),
    code: varchar("code", { length: 120 }).notNull(),
    description: text("description"),
  },
  (t) => [
    uniqueIndex("permissions_code_idx").on(t.code),
    uniqueIndex("permissions_resource_action_idx").on(t.resource, t.action),
  ],
);

// System roles (organization_id NULL, is_system = true): Owner, Manager, Viewer.
// Tenants may later add custom roles (organization_id set) without schema changes.
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("roles_system_name_idx").on(t.name).where(sql`${t.organizationId} is null`),
    uniqueIndex("roles_org_name_idx").on(t.organizationId, t.name).where(sql`${t.organizationId} is not null`),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

// Which locations a user may work in, and with which role at each.
// The tenant owner (users.is_owner) has implicit access to every location.
export const userLocations = pgTable(
  "user_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("user_locations_user_location_idx").on(t.userId, t.locationId),
    index("user_locations_org_idx").on(t.organizationId),
    index("user_locations_location_idx").on(t.locationId),
  ],
);
