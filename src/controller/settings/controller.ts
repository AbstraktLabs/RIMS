import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { z } from "zod";
import { db, type Tx } from "@/db";
import {
  documentSequences,
  locations,
  organizations,
  organizationSettings,
  products,
  productVariants,
  stockLevels,
  taxRates,
  units,
  userLocations,
} from "@/db/schema";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { deleteImage, uploadImage } from "@/lib/upload/cloudinary";
import type {
  locationSchema,
  taxRateSchema,
  unitSchema,
  updateBusinessSchema,
  updateLocationSchema,
  updateSequenceSchema,
  updateTaxRateSchema,
  updateUnitSchema,
} from "@/lib/validation/settings";
import type { AuthContext } from "@/lib/api/handler";
import { getSettings } from "../_shared/tenant";
import { qcol } from "../_shared/sql";

// ── business profile + settings ──────────────────────────────
async function loadBusiness(orgId: string) {
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
  if (!org) throw notFound("Business");
  const { logoPublicId: _p, ...organization } = org;
  return { organization, settings: await getSettings(db, orgId) };
}

export const getBusiness = (auth: AuthContext) => loadBusiness(auth.organizationId);

export async function updateBusiness(auth: AuthContext, input: z.infer<typeof updateBusinessSchema>) {
  const orgId = auth.organizationId;
  await db.transaction(async (tx) => {
    if (input.organization && Object.keys(input.organization).length) {
      await tx.update(organizations).set(input.organization).where(eq(organizations.id, orgId));
    }
    if (input.settings && Object.keys(input.settings).length) {
      await tx.update(organizationSettings).set(input.settings).where(eq(organizationSettings.organizationId, orgId));
    }
  });
  return loadBusiness(orgId);
}

export async function uploadLogo(auth: AuthContext, file: File) {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, auth.organizationId),
    columns: { logoPublicId: true },
  });
  const { url, publicId } = await uploadImage(file, auth.organizationId, "branding");
  await db
    .update(organizations)
    .set({ logoUrl: url, logoPublicId: publicId })
    .where(eq(organizations.id, auth.organizationId));
  await deleteImage(org?.logoPublicId);
  return { logoUrl: url };
}

export async function removeLogo(auth: AuthContext) {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, auth.organizationId),
    columns: { logoPublicId: true },
  });
  await db
    .update(organizations)
    .set({ logoUrl: null, logoPublicId: null })
    .where(eq(organizations.id, auth.organizationId));
  await deleteImage(org?.logoPublicId);
  return { success: true };
}

// ── locations ────────────────────────────────────────────────
export async function listLocations(auth: AuthContext, includeInactive: boolean) {
  const base = db
    .select({
      id: locations.id,
      name: locations.name,
      code: locations.code,
      type: locations.type,
      address: locations.address,
      phone: locations.phone,
      isDefault: locations.isDefault,
      isActive: locations.isActive,
      createdAt: locations.createdAt,
      staffCount: sql<number>`(select count(*)::int from ${userLocations} where ${userLocations.locationId} = ${qcol(locations.id)})`,
    })
    .from(locations);

  const conds = [eq(locations.organizationId, auth.organizationId)];
  if (!includeInactive) conds.push(eq(locations.isActive, true));
  if (!auth.isOwner) {
    // staff only see locations they are assigned to
    conds.push(
      sql`exists (select 1 from ${userLocations} where ${userLocations.locationId} = ${qcol(locations.id)} and ${userLocations.userId} = ${auth.userId})`,
    );
  }
  const items = await base.where(and(...conds)).orderBy(sql`${locations.isDefault} desc`, asc(locations.name));
  return { items };
}

async function clearDefault(tx: Tx, orgId: string) {
  await tx
    .update(locations)
    .set({ isDefault: false })
    .where(and(eq(locations.organizationId, orgId), eq(locations.isDefault, true)));
}

export async function createLocation(auth: AuthContext, input: z.infer<typeof locationSchema>) {
  return db.transaction(async (tx) => {
    if (input.isDefault) await clearDefault(tx, auth.organizationId);
    const [row] = await tx
      .insert(locations)
      .values({ ...input, isDefault: input.isDefault ?? false, organizationId: auth.organizationId })
      .returning();
    return { location: row };
  });
}

export async function updateLocation(auth: AuthContext, id: string, input: z.infer<typeof updateLocationSchema>) {
  return db.transaction(async (tx) => {
    const loc = await tx.query.locations.findFirst({
      where: and(eq(locations.id, id), eq(locations.organizationId, auth.organizationId)),
    });
    if (!loc) throw notFound("Location");

    if (input.isDefault === false && loc.isDefault) {
      throw badRequest("Choose another location as default instead of un-setting this one");
    }
    if (input.isActive === false) {
      if (loc.isDefault || input.isDefault) throw badRequest("The default location cannot be deactivated");
      await assertLocationEmpty(tx, id);
    }
    if (input.isDefault && !loc.isDefault) {
      if (input.isActive === false || !loc.isActive) throw badRequest("An inactive location cannot be the default");
      await clearDefault(tx, auth.organizationId);
    }
    const [row] = await tx.update(locations).set(input).where(eq(locations.id, id)).returning();
    return { location: row };
  });
}

async function assertLocationEmpty(tx: Tx, id: string) {
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(stockLevels)
    .where(and(eq(stockLevels.locationId, id), ne(stockLevels.quantity, "0")));
  if (n > 0) throw conflict("This location still holds stock. Transfer or adjust it to zero first.");
}

export async function deleteLocation(auth: AuthContext, id: string) {
  // Locations referenced by documents can't be removed; deactivate instead.
  return updateLocation(auth, id, { isActive: false });
}

// ── tax rates ────────────────────────────────────────────────
export async function listTaxRates(auth: AuthContext, includeInactive: boolean) {
  const conds = [eq(taxRates.organizationId, auth.organizationId)];
  if (!includeInactive) conds.push(eq(taxRates.isActive, true));
  const items = await db
    .select({
      id: taxRates.id,
      name: taxRates.name,
      rate: taxRates.rate,
      isDefault: taxRates.isDefault,
      isActive: taxRates.isActive,
      productCount: sql<number>`(select count(*)::int from ${products} where ${products.taxRateId} = ${qcol(taxRates.id)})`,
    })
    .from(taxRates)
    .where(and(...conds))
    .orderBy(sql`${taxRates.isDefault} desc`, asc(taxRates.rate));
  return { items };
}

async function clearDefaultTax(tx: Tx, orgId: string) {
  await tx
    .update(taxRates)
    .set({ isDefault: false })
    .where(and(eq(taxRates.organizationId, orgId), eq(taxRates.isDefault, true)));
}

export async function createTaxRate(auth: AuthContext, input: z.infer<typeof taxRateSchema>) {
  return db.transaction(async (tx) => {
    if (input.isDefault) await clearDefaultTax(tx, auth.organizationId);
    const [row] = await tx
      .insert(taxRates)
      .values({ organizationId: auth.organizationId, name: input.name, rate: String(input.rate), isDefault: !!input.isDefault })
      .returning();
    return { taxRate: row };
  });
}

export async function updateTaxRate(auth: AuthContext, id: string, input: z.infer<typeof updateTaxRateSchema>) {
  return db.transaction(async (tx) => {
    const rate = await tx.query.taxRates.findFirst({
      where: and(eq(taxRates.id, id), eq(taxRates.organizationId, auth.organizationId)),
    });
    if (!rate) throw notFound("Tax rate");
    if (input.isDefault) await clearDefaultTax(tx, auth.organizationId);
    const isDefault = input.isActive === false ? false : input.isDefault;
    const [row] = await tx
      .update(taxRates)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.rate !== undefined && { rate: String(input.rate) }),
        ...(isDefault !== undefined && { isDefault }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      })
      .where(eq(taxRates.id, id))
      .returning();
    return { taxRate: row };
  });
}

export async function deleteTaxRate(auth: AuthContext, id: string) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(and(eq(products.organizationId, auth.organizationId), eq(products.taxRateId, id)));
  if (n > 0) throw conflict(`This tax rate is used by ${n} product(s). Deactivate it instead.`);
  const [row] = await db
    .delete(taxRates)
    .where(and(eq(taxRates.id, id), eq(taxRates.organizationId, auth.organizationId)))
    .returning({ id: taxRates.id });
  if (!row) throw notFound("Tax rate");
  return { success: true };
}

// ── units ────────────────────────────────────────────────────
export async function listUnits(auth: AuthContext, includeInactive: boolean) {
  const conds = [eq(units.organizationId, auth.organizationId)];
  if (!includeInactive) conds.push(eq(units.isActive, true));
  const items = await db
    .select({
      id: units.id,
      name: units.name,
      code: units.code,
      allowDecimal: units.allowDecimal,
      isActive: units.isActive,
      productCount: sql<number>`(select count(*)::int from ${products} where ${products.unitId} = ${qcol(units.id)})`,
    })
    .from(units)
    .where(and(...conds))
    .orderBy(asc(units.name));
  return { items };
}

export async function createUnit(auth: AuthContext, input: z.infer<typeof unitSchema>) {
  const [row] = await db
    .insert(units)
    .values({ ...input, organizationId: auth.organizationId })
    .returning();
  return { unit: row };
}

export async function updateUnit(auth: AuthContext, id: string, input: z.infer<typeof updateUnitSchema>) {
  if (input.allowDecimal === false) {
    // switching a unit to whole numbers is only safe if no stock is fractional
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(stockLevels)
      .innerJoin(productVariants, eq(productVariants.id, stockLevels.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(products.unitId, id), sql`${stockLevels.quantity} <> trunc(${stockLevels.quantity})`));
    if (n > 0) throw conflict("Some products in this unit have fractional stock; it must allow decimals.");
  }
  const [row] = await db
    .update(units)
    .set(input)
    .where(and(eq(units.id, id), eq(units.organizationId, auth.organizationId)))
    .returning();
  if (!row) throw notFound("Unit");
  return { unit: row };
}

export async function deleteUnit(auth: AuthContext, id: string) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(and(eq(products.organizationId, auth.organizationId), eq(products.unitId, id)));
  if (n > 0) throw conflict(`This unit is used by ${n} product(s). Deactivate it instead.`);
  const [row] = await db
    .delete(units)
    .where(and(eq(units.id, id), eq(units.organizationId, auth.organizationId)))
    .returning({ id: units.id });
  if (!row) throw notFound("Unit");
  return { success: true };
}

// ── document numbering ───────────────────────────────────────
export async function listSequences(auth: AuthContext) {
  const items = await db
    .select()
    .from(documentSequences)
    .where(eq(documentSequences.organizationId, auth.organizationId))
    .orderBy(asc(documentSequences.documentType));
  return {
    items: items.map((s) => ({
      ...s,
      preview: `${s.prefix}${String(s.nextNumber).padStart(s.padding, "0")}`,
    })),
  };
}

export async function updateSequence(auth: AuthContext, input: z.infer<typeof updateSequenceSchema>) {
  await db.transaction(async (tx) => {
    const [seq] = await tx
      .select()
      .from(documentSequences)
      .where(
        and(
          eq(documentSequences.organizationId, auth.organizationId),
          eq(documentSequences.documentType, input.documentType),
        ),
      )
      .for("update");
    if (!seq) throw notFound("Document sequence");
    // Lowering the counter could re-issue numbers that already exist.
    if (input.nextNumber !== undefined && input.nextNumber < seq.nextNumber && (input.prefix ?? seq.prefix) === seq.prefix) {
      throw badRequest(`Next number can't go below ${seq.nextNumber} while keeping the same prefix`);
    }
    await tx
      .update(documentSequences)
      .set({
        ...(input.prefix !== undefined && { prefix: input.prefix }),
        ...(input.nextNumber !== undefined && { nextNumber: input.nextNumber }),
        ...(input.padding !== undefined && { padding: input.padding }),
      })
      .where(
        and(
          eq(documentSequences.organizationId, auth.organizationId),
          eq(documentSequences.documentType, input.documentType),
        ),
      );
  });
  return listSequences(auth);
}
