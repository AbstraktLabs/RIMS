// Idempotent platform seed: permission catalogue, system roles and their
// permissions, and (optionally) the first super admin from env vars.
// Usage: pnpm db:seed
import "dotenv/config";
import bcrypt from "bcrypt";
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "../index";
import { permissions, rolePermissions, roles, superAdmins } from "../schema";
import { PERMISSION_CATALOG, SYSTEM_ROLE_DEFINITIONS } from "../../lib/permissions/catalog";

async function seedPermissions() {
  const rows = PERMISSION_CATALOG.flatMap((p) =>
    p.actions.map((action) => ({
      module: p.module,
      resource: p.resource,
      action,
      code: `${p.resource}.${action}`,
    })),
  );

  await db
    .insert(permissions)
    .values(rows)
    .onConflictDoUpdate({
      target: permissions.code,
      set: { module: sql`excluded.module`, resource: sql`excluded.resource`, action: sql`excluded.action` },
    });

  console.log(`✓ permissions: ${rows.length}`);
}

async function seedSystemRoles() {
  const allPermissions = await db.select({ id: permissions.id, code: permissions.code }).from(permissions);
  const idByCode = new Map(allPermissions.map((p) => [p.code, p.id]));

  for (const [name, def] of Object.entries(SYSTEM_ROLE_DEFINITIONS)) {
    await db.transaction(async (tx) => {
      let role = await tx.query.roles.findFirst({
        where: and(eq(roles.name, name), isNull(roles.organizationId)),
      });

      if (!role) {
        [role] = await tx
          .insert(roles)
          .values({ name, description: def.description, isSystem: true })
          .returning();
      } else {
        await tx.update(roles).set({ description: def.description, isSystem: true }).where(eq(roles.id, role.id));
      }

      const wantedIds = def.permissions.map((code) => {
        const id = idByCode.get(code);
        if (!id) throw new Error(`Permission ${code} missing — run seedPermissions first`);
        return id;
      });

      // remove permissions no longer granted, add the missing ones
      await tx
        .delete(rolePermissions)
        .where(and(eq(rolePermissions.roleId, role.id), notInArray(rolePermissions.permissionId, wantedIds)));

      await tx
        .insert(rolePermissions)
        .values(wantedIds.map((permissionId) => ({ roleId: role!.id, permissionId })))
        .onConflictDoNothing();

      console.log(`✓ role ${name}: ${wantedIds.length} permissions`);
    });
  }
}

async function seedSuperAdmin() {
  const name = process.env.SEED_SUPER_ADMIN_NAME?.trim();
  const email = process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("• super admin: skipped (SEED_SUPER_ADMIN_EMAIL / SEED_SUPER_ADMIN_PASSWORD not set)");
    return;
  }
  if (password.length < 12) {
    throw new Error("SEED_SUPER_ADMIN_PASSWORD must be at least 12 characters");
  }

  const existing = await db.query.superAdmins.findFirst({ where: eq(superAdmins.email, email) });
  if (existing) {
    console.log("• super admin: already exists, left unchanged");
    return;
  }

  await db.insert(superAdmins).values({
    name: name || "Platform Admin",
    email,
    passwordHash: await bcrypt.hash(password, 12),
  });
  console.log("✓ super admin created");
}

async function main() {
  await seedPermissions();
  await seedSystemRoles();
  await seedSuperAdmin();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
