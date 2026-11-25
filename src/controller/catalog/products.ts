import { and, asc, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { db, type Tx } from "@/db";
import {
  brands,
  categories,
  locations,
  productVariants,
  products,
  serialNumbers,
  stockLevels,
  stockLots,
  taxRates,
  units,
} from "@/db/schema";
import type { AuthContext } from "@/lib/api/handler";
import { randomToken } from "@/lib/auth/password";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { money, num, qtyStr } from "@/lib/num";
import { deleteImage, uploadImage } from "@/lib/upload/cloudinary";
import type {
  CreateProductInput,
  listProductsQuery,
  lookupQuery,
  reorderQuery,
  searchVariantsQuery,
  VariantInput,
} from "@/lib/validation/catalog";
import { countAll, likePattern, offsetFor, pageOf } from "../_shared/paging";
import { getSettings, resolveLocationFilter, resolveLocationId, type OrgSettings } from "../_shared/tenant";
import { refreshExpiredLots } from "../_shared/stock";
import { qcol } from "../_shared/sql";

// ── validation & normalisation ───────────────────────────────
function skuBase(name: string) {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 6);
  return base || "ITEM";
}
const generateSku = (name: string) => `${skuBase(name)}-${randomToken(4).replace(/[-_]/g, "X").slice(0, 5).toUpperCase()}`;

interface NormalisedVariant extends VariantInput {
  name: string;
  sku: string;
  isDefault: boolean;
}

async function exists(tx: Tx, table: typeof categories | typeof brands | typeof taxRates | typeof units, orgId: string, id: string) {
  const [row] = await tx
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.organizationId, orgId)))
    .limit(1);
  return !!row;
}

async function normaliseProduct(tx: Tx, orgId: string, input: CreateProductInput, settings: OrgSettings) {
  const trackExpiry = input.trackExpiry;
  const trackBatches = input.trackBatches || trackExpiry; // expiry dates live on batches
  const trackSerials = input.trackSerials;

  if (trackBatches && !settings.enableBatchTracking) throw badRequest("Batch tracking is turned off in Settings");
  if (trackExpiry && !settings.enableExpiryTracking) throw badRequest("Expiry tracking is turned off in Settings");
  if (trackSerials && !settings.enableSerialTracking) throw badRequest("Serial-number tracking is turned off in Settings");

  // references must belong to this tenant
  const unit = await tx.query.units.findFirst({
    where: and(eq(units.id, input.unitId), eq(units.organizationId, orgId)),
  });
  if (!unit) throw notFound("Unit");
  if (trackSerials && unit.allowDecimal) {
    throw badRequest("Serial-tracked products must use a whole-number unit (e.g. pcs)");
  }
  if (input.categoryId && !(await exists(tx, categories, orgId, input.categoryId))) throw notFound("Category");
  if (input.brandId && !(await exists(tx, brands, orgId, input.brandId))) throw notFound("Brand");
  if (input.taxRateId && !(await exists(tx, taxRates, orgId, input.taxRateId))) throw notFound("Tax rate");
  if (!!input.purchaseUnitId !== !!input.purchaseUnitFactor) {
    throw badRequest("Set both the purchase unit and how many base units it contains, or neither");
  }
  if (input.purchaseUnitId) {
    if (input.purchaseUnitId === input.unitId) throw badRequest("Purchase unit must differ from the selling unit");
    if (!(await exists(tx, units, orgId, input.purchaseUnitId))) throw notFound("Purchase unit");
  }

  // variants
  const options = input.variantOptions;
  const optionNames = options.map((o) => o.name.toLowerCase());
  if (new Set(optionNames).size !== optionNames.length) throw badRequest("Variant option names must be unique");
  for (const o of options) {
    if (new Set(o.values.map((v) => v.toLowerCase())).size !== o.values.length) {
      throw badRequest(`Values for "${o.name}" must be unique`);
    }
  }

  let variants: NormalisedVariant[];
  if (options.length === 0) {
    if (input.variants.length !== 1) {
      throw badRequest("A product without variant options has exactly one variant. Add options like Size or Colour.");
    }
    const v = input.variants[0];
    variants = [
      { ...v, optionValues: {}, name: "Default", sku: v.sku || generateSku(input.name), isDefault: true, isActive: true },
    ];
  } else {
    if (!settings.enableVariants) throw badRequest("Variants are turned off in Settings");
    const seen = new Set<string>();
    variants = input.variants.map((v) => {
      const keys = Object.keys(v.optionValues);
      if (keys.length !== options.length || !options.every((o) => o.name in v.optionValues)) {
        throw badRequest(`Each variant must have a value for: ${options.map((o) => o.name).join(", ")}`);
      }
      for (const o of options) {
        if (!o.values.includes(v.optionValues[o.name])) {
          throw badRequest(`"${v.optionValues[o.name]}" is not one of the ${o.name} values`);
        }
      }
      const combo = options.map((o) => v.optionValues[o.name].toLowerCase()).join("|");
      if (seen.has(combo)) throw badRequest(`Duplicate variant: ${options.map((o) => v.optionValues[o.name]).join(" / ")}`);
      seen.add(combo);
      const label = options.map((o) => v.optionValues[o.name]).join(" / ");
      return {
        ...v,
        name: v.name || label,
        sku: v.sku || `${skuBase(input.name)}-${skuBase(label).slice(0, 4)}-${randomToken(3).replace(/[-_]/g, "X").toUpperCase()}`,
        isDefault: false,
      };
    });
    const firstActive = variants.find((v) => v.isActive) ?? variants[0];
    firstActive.isDefault = true;
    firstActive.isActive = true;
  }

  // duplicate SKUs / barcodes within the request
  const skus = variants.map((v) => v.sku.toLowerCase());
  if (new Set(skus).size !== skus.length) throw badRequest("SKUs must be unique");
  const codes = variants.map((v) => v.barcode).filter(Boolean) as string[];
  if (new Set(codes).size !== codes.length) throw badRequest("Barcodes must be unique");

  return {
    product: {
      name: input.name,
      description: input.description ?? null,
      categoryId: input.categoryId ?? null,
      brandId: input.brandId ?? null,
      model: input.model ?? null,
      hsCode: input.hsCode ?? null,
      unitId: input.unitId,
      purchaseUnitId: input.purchaseUnitId ?? null,
      purchaseUnitFactor: input.purchaseUnitFactor ? qtyStr(input.purchaseUnitFactor) : null,
      taxRateId: input.taxRateId ?? null,
      trackBatches,
      trackExpiry,
      trackSerials,
      hasVariants: options.length > 0,
      variantOptions: options,
      attributes: input.attributes,
      lowStockThreshold: input.lowStockThreshold != null ? qtyStr(input.lowStockThreshold) : null,
      isActive: input.isActive,
    },
    variants,
    unit,
  };
}

function variantValues(v: NormalisedVariant) {
  return {
    name: v.name,
    sku: v.sku,
    barcode: v.barcode ?? null,
    optionValues: v.optionValues,
    costPrice: money(v.costPrice),
    sellingPrice: money(v.sellingPrice),
    wholesalePrice: v.wholesalePrice != null ? money(v.wholesalePrice) : null,
    mrp: v.mrp != null ? money(v.mrp) : null,
    lowStockThreshold: v.lowStockThreshold != null ? qtyStr(v.lowStockThreshold) : null,
    isActive: v.isActive,
    isDefault: v.isDefault,
  };
}

// ── create / update / delete ─────────────────────────────────
export async function createProduct(auth: AuthContext, input: CreateProductInput) {
  const id = await db.transaction(async (tx) => {
    const settings = await getSettings(tx, auth.organizationId);
    const { product, variants } = await normaliseProduct(tx, auth.organizationId, input, settings);
    const [row] = await tx
      .insert(products)
      .values({ ...product, organizationId: auth.organizationId })
      .returning({ id: products.id });
    await tx
      .insert(productVariants)
      .values(variants.map((v) => ({ ...variantValues(v), organizationId: auth.organizationId, productId: row.id })));
    return row.id;
  });
  return getProduct(auth, id);
}

export async function updateProduct(auth: AuthContext, id: string, input: CreateProductInput) {
  await db.transaction(async (tx) => {
    const existing = await tx.query.products.findFirst({
      where: and(eq(products.id, id), eq(products.organizationId, auth.organizationId)),
    });
    if (!existing) throw notFound("Product");
    const settings = await getSettings(tx, auth.organizationId);
    const { product, variants, unit } = await normaliseProduct(tx, auth.organizationId, input, settings);

    const currentVariants = await tx
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.productId, id));
    const currentIds = new Set(currentVariants.map((v) => v.id));
    for (const v of variants) {
      if (v.id && !currentIds.has(v.id)) throw badRequest("A variant does not belong to this product");
    }

    // tracking rules can't change while stock exists — lots/serials would be inconsistent
    const trackingChanged =
      existing.trackBatches !== product.trackBatches ||
      existing.trackSerials !== product.trackSerials ||
      existing.trackExpiry !== product.trackExpiry;
    const [stock] = await tx
      .select({
        nonZero: sql<number>`count(*) filter (where ${stockLevels.quantity} <> 0)::int`,
        fractional: sql<number>`count(*) filter (where ${stockLevels.quantity} <> trunc(${stockLevels.quantity}))::int`,
      })
      .from(stockLevels)
      .innerJoin(productVariants, eq(productVariants.id, stockLevels.variantId))
      .where(eq(productVariants.productId, id));
    if (trackingChanged && stock.nonZero > 0) {
      throw conflict("Batch, expiry and serial tracking can only be changed while the product has no stock");
    }
    if (!unit.allowDecimal && stock.fractional > 0) {
      throw conflict("This product has fractional stock; choose a unit that allows decimals");
    }

    await tx.update(products).set(product).where(eq(products.id, id));

    // clear the default flag first so the partial unique index is never violated mid-update
    await tx.update(productVariants).set({ isDefault: false }).where(eq(productVariants.productId, id));

    const keepIds = variants.filter((v) => v.id).map((v) => v.id!);
    const removed = [...currentIds].filter((vid) => !keepIds.includes(vid));
    for (const vid of removed) {
      // hard-delete never-used variants; archive ones with history
      try {
        await tx.transaction(async (sp) => {
          await sp.delete(productVariants).where(eq(productVariants.id, vid));
        });
      } catch {
        await tx.update(productVariants).set({ isActive: false }).where(eq(productVariants.id, vid));
      }
    }

    for (const v of variants) {
      if (v.id) {
        await tx.update(productVariants).set(variantValues(v)).where(eq(productVariants.id, v.id));
      } else {
        await tx
          .insert(productVariants)
          .values({ ...variantValues(v), organizationId: auth.organizationId, productId: id });
      }
    }
  });
  return getProduct(auth, id);
}

export async function deleteProduct(auth: AuthContext, id: string) {
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, id), eq(products.organizationId, auth.organizationId)),
    columns: { id: true, imagePublicId: true },
  });
  if (!product) throw notFound("Product");
  try {
    await db.transaction(async (tx) => {
      await tx.delete(productVariants).where(eq(productVariants.productId, id));
      await tx.delete(products).where(eq(products.id, id));
    });
    await deleteImage(product.imagePublicId);
    return { deleted: true, archived: false };
  } catch {
    // has stock history or documents → keep it for the records, hide it from use
    await db.transaction(async (tx) => {
      await tx.update(products).set({ isActive: false }).where(eq(products.id, id));
      await tx.update(productVariants).set({ isActive: false }).where(eq(productVariants.productId, id));
    });
    return {
      deleted: false,
      archived: true,
      message: "This product has stock history, so it was archived instead of deleted.",
    };
  }
}

export async function uploadProductImage(auth: AuthContext, id: string, file: File) {
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, id), eq(products.organizationId, auth.organizationId)),
    columns: { imagePublicId: true },
  });
  if (!product) throw notFound("Product");
  const { url, publicId } = await uploadImage(file, auth.organizationId, "products");
  await db.update(products).set({ imageUrl: url, imagePublicId: publicId }).where(eq(products.id, id));
  await deleteImage(product.imagePublicId);
  return { imageUrl: url };
}

export async function removeProductImage(auth: AuthContext, id: string) {
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, id), eq(products.organizationId, auth.organizationId)),
    columns: { imagePublicId: true },
  });
  if (!product) throw notFound("Product");
  await db.update(products).set({ imageUrl: null, imagePublicId: null }).where(eq(products.id, id));
  await deleteImage(product.imagePublicId);
  return { success: true };
}

// ── reads ────────────────────────────────────────────────────
function stockSubquery(locationId: string | undefined) {
  const loc = locationId ? sql` and sl.location_id = ${locationId}` : sql``;
  return sql<string>`coalesce((select sum(sl.quantity) from ${stockLevels} sl join ${productVariants} pv on pv.id = sl.variant_id where pv.product_id = ${qcol(products.id)}${loc}), 0)`;
}

export async function listProducts(auth: AuthContext, q: z.infer<typeof listProductsQuery>) {
  const locationId = await resolveLocationFilter(db, auth, q.locationId);
  const stock = stockSubquery(locationId);

  const conds: SQL[] = [eq(products.organizationId, auth.organizationId)];
  if (q.status === "active") conds.push(eq(products.isActive, true));
  if (q.status === "inactive") conds.push(eq(products.isActive, false));
  if (q.categoryId) {
    // include subcategories
    conds.push(
      sql`${products.categoryId} in (with recursive c as (select id from ${categories} where id = ${q.categoryId} and organization_id = ${auth.organizationId} union all select k.id from ${categories} k join c on k.parent_id = c.id) select id from c)`,
    );
  }
  if (q.brandId) conds.push(eq(products.brandId, q.brandId));
  if (q.tracking === "batches") conds.push(eq(products.trackBatches, true));
  if (q.tracking === "serials") conds.push(eq(products.trackSerials, true));
  if (q.tracking === "expiry") conds.push(eq(products.trackExpiry, true));
  if (q.search) {
    const p = likePattern(q.search);
    conds.push(
      or(
        ilike(products.name, p),
        ilike(products.model, p),
        sql`exists (select 1 from ${productVariants} v where v.product_id = ${qcol(products.id)} and (v.sku ilike ${p} or v.barcode ilike ${p} or v.name ilike ${p}))`,
      )!,
    );
  }
  if (q.stock === "out") conds.push(sql`${stock} <= 0`);
  if (q.stock === "in") conds.push(sql`${stock} > 0`);
  if (q.stock === "low") {
    conds.push(sql`${stock} > 0 and ${products.lowStockThreshold} is not null and ${stock} <= ${products.lowStockThreshold}`);
  }
  const where = and(...conds);

  const order = {
    name: asc(products.name),
    "-name": desc(products.name),
    createdAt: asc(products.createdAt),
    "-createdAt": desc(products.createdAt),
    stock: sql`${stock} asc`,
    "-stock": sql`${stock} desc`,
  }[q.sort];

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        model: products.model,
        imageUrl: products.imageUrl,
        isActive: products.isActive,
        hasVariants: products.hasVariants,
        trackBatches: products.trackBatches,
        trackExpiry: products.trackExpiry,
        trackSerials: products.trackSerials,
        lowStockThreshold: products.lowStockThreshold,
        categoryId: products.categoryId,
        categoryName: categories.name,
        brandId: products.brandId,
        brandName: brands.name,
        unitCode: units.code,
        allowDecimal: units.allowDecimal,
        taxRate: taxRates.rate,
        createdAt: products.createdAt,
        stock,
        variantCount: sql<number>`(select count(*)::int from ${productVariants} v where v.product_id = ${qcol(products.id)} and v.is_active)`,
        minPrice: sql<string>`(select min(v.selling_price) from ${productVariants} v where v.product_id = ${qcol(products.id)} and v.is_active)`,
        maxPrice: sql<string>`(select max(v.selling_price) from ${productVariants} v where v.product_id = ${qcol(products.id)} and v.is_active)`,
        defaultSku: sql<string>`(select v.sku from ${productVariants} v where v.product_id = ${qcol(products.id)} and v.is_default limit 1)`,
        stockValue: sql<string>`coalesce((select sum(sl.quantity * sl.avg_cost) from ${stockLevels} sl join ${productVariants} pv on pv.id = sl.variant_id where pv.product_id = ${qcol(products.id)}${locationId ? sql` and sl.location_id = ${locationId}` : sql``} and sl.quantity > 0), 0)`,
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .innerJoin(units, eq(units.id, products.unitId))
      .leftJoin(taxRates, eq(taxRates.id, products.taxRateId))
      .where(where)
      .orderBy(order, asc(products.id))
      .limit(q.limit)
      .offset(offsetFor(q.page, q.limit)),
    db.select({ total: countAll }).from(products).where(where),
  ]);

  const items = rows.map((r) => {
    const s = num(r.stock);
    const threshold = r.lowStockThreshold === null ? null : num(r.lowStockThreshold);
    return {
      ...r,
      stock: s,
      stockValue: num(r.stockValue),
      stockStatus: s <= 0 ? "OUT" : threshold !== null && s <= threshold ? "LOW" : "IN",
    };
  });
  return { ...pageOf(items, total, q.page, q.limit), locationId: locationId ?? "all" };
}

export async function getProduct(auth: AuthContext, id: string) {
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, id), eq(products.organizationId, auth.organizationId)),
    with: { category: true, brand: true, unit: true, purchaseUnit: true, taxRate: true },
  });
  if (!product) throw notFound("Product");

  const variants = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, id))
    .orderBy(desc(productVariants.isDefault), desc(productVariants.isActive), asc(productVariants.createdAt));

  const levels = variants.length
    ? await db
        .select({
          variantId: stockLevels.variantId,
          locationId: stockLevels.locationId,
          locationName: locations.name,
          quantity: stockLevels.quantity,
          avgCost: stockLevels.avgCost,
        })
        .from(stockLevels)
        .innerJoin(locations, eq(locations.id, stockLevels.locationId))
        .where(
          inArray(
            stockLevels.variantId,
            variants.map((v) => v.id),
          ),
        )
    : [];

  const { imagePublicId: _p, ...rest } = product;
  return {
    product: {
      ...rest,
      variants: variants.map((v) => {
        const stock = levels.filter((l) => l.variantId === v.id);
        return {
          ...v,
          stock: stock.map((l) => ({ ...l, quantity: num(l.quantity), avgCost: num(l.avgCost) })),
          totalStock: stock.reduce((s, l) => s + num(l.quantity), 0),
        };
      }),
    },
  };
}

// ── pickers for POS / purchases / adjustments ────────────────
const variantSelect = (locationId: string | undefined) => ({
  variantId: productVariants.id,
  productId: products.id,
  productName: products.name,
  variantName: productVariants.name,
  isDefault: productVariants.isDefault,
  sku: productVariants.sku,
  barcode: productVariants.barcode,
  optionValues: productVariants.optionValues,
  sellingPrice: productVariants.sellingPrice,
  wholesalePrice: productVariants.wholesalePrice,
  costPrice: productVariants.costPrice,
  mrp: productVariants.mrp,
  imageUrl: products.imageUrl,
  unitId: units.id,
  unitCode: units.code,
  allowDecimal: units.allowDecimal,
  purchaseUnitId: products.purchaseUnitId,
  purchaseUnitFactor: products.purchaseUnitFactor,
  taxRateId: products.taxRateId,
  taxRate: sql<string>`case when ${taxRates.isActive} then ${taxRates.rate} else 0 end`,
  trackBatches: products.trackBatches,
  trackExpiry: products.trackExpiry,
  trackSerials: products.trackSerials,
  stock: locationId
    ? sql<string>`coalesce((select sl.quantity from ${stockLevels} sl where sl.variant_id = ${qcol(productVariants.id)} and sl.location_id = ${locationId}), 0)`
    : sql<string>`coalesce((select sum(sl.quantity) from ${stockLevels} sl where sl.variant_id = ${qcol(productVariants.id)}), 0)`,
  avgCost: locationId
    ? sql<string>`coalesce((select sl.avg_cost from ${stockLevels} sl where sl.variant_id = ${qcol(productVariants.id)} and sl.location_id = ${locationId}), ${productVariants.costPrice})`
    : productVariants.costPrice,
});

type VariantRow = Awaited<ReturnType<typeof baseVariantQuery>>[number];
function baseVariantQuery(locationId: string | undefined, where: SQL | undefined, limit: number) {
  return db
    .select(variantSelect(locationId))
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(units, eq(units.id, products.unitId))
    .leftJoin(taxRates, eq(taxRates.id, products.taxRateId))
    .where(where)
    .orderBy(asc(products.name), desc(productVariants.isDefault), asc(productVariants.name))
    .limit(limit);
}

function shapeVariant(r: VariantRow) {
  return {
    ...r,
    displayName: r.isDefault ? r.productName : `${r.productName} (${r.variantName})`,
    sellingPrice: num(r.sellingPrice),
    wholesalePrice: r.wholesalePrice === null ? null : num(r.wholesalePrice),
    costPrice: num(r.costPrice),
    mrp: r.mrp === null ? null : num(r.mrp),
    purchaseUnitFactor: r.purchaseUnitFactor === null ? null : num(r.purchaseUnitFactor),
    taxRate: num(r.taxRate),
    stock: num(r.stock),
    avgCost: num(r.avgCost),
  };
}

async function sellableLots(orgId: string, variantIds: string[], locationId: string | undefined) {
  if (!variantIds.length || !locationId) return [];
  await refreshExpiredLots(db, orgId);
  return db
    .select({
      id: stockLots.id,
      variantId: stockLots.variantId,
      lotNumber: stockLots.lotNumber,
      expiryDate: stockLots.expiryDate,
      quantityAvailable: stockLots.quantityAvailable,
      status: stockLots.status,
      unitCost: stockLots.unitCost,
    })
    .from(stockLots)
    .where(
      and(
        inArray(stockLots.variantId, variantIds),
        eq(stockLots.locationId, locationId),
        sql`${stockLots.quantityAvailable} > 0`,
        ne(stockLots.status, "DEPLETED"),
      ),
    )
    .orderBy(sql`${stockLots.expiryDate} asc nulls last`, asc(stockLots.createdAt));
}

export async function searchVariants(auth: AuthContext, q: z.infer<typeof searchVariantsQuery>) {
  const locationId = q.locationId ? await resolveLocationId(db, auth, q.locationId) : (auth.locationId ?? undefined);
  const conds: SQL[] = [
    eq(productVariants.organizationId, auth.organizationId),
    eq(productVariants.isActive, true),
    eq(products.isActive, true),
  ];
  if (q.q) {
    const p = likePattern(q.q);
    conds.push(
      or(
        ilike(products.name, p),
        ilike(productVariants.name, p),
        ilike(productVariants.sku, p),
        ilike(productVariants.barcode, p),
        ilike(products.model, p),
      )!,
    );
  }
  if (q.inStockOnly && locationId) {
    conds.push(
      sql`exists (select 1 from ${stockLevels} sl where sl.variant_id = ${qcol(productVariants.id)} and sl.location_id = ${locationId} and sl.quantity > 0)`,
    );
  }
  const rows = (await baseVariantQuery(locationId, and(...conds), q.limit)).map(shapeVariant);
  return { items: rows, locationId: locationId ?? null };
}

/**
 * Items at a location that are at or below their low-stock level (or sold out),
 * with a suggested order quantity: enough to reach twice the low-stock level,
 * less what is already on sent purchase orders for that location.
 */
export async function reorderSuggestions(auth: AuthContext, q: z.infer<typeof reorderQuery>) {
  const locationId = await resolveLocationId(db, auth, q.locationId);
  const threshold = sql`coalesce(${productVariants.lowStockThreshold}, ${products.lowStockThreshold})`;
  const onHand = sql`(select sl.quantity from ${stockLevels} sl where sl.variant_id = ${qcol(productVariants.id)} and sl.location_id = ${locationId})`;
  const rows = (
    await baseVariantQuery(
      locationId,
      and(
        eq(productVariants.organizationId, auth.organizationId),
        eq(productVariants.isActive, true),
        eq(products.isActive, true),
        sql`${onHand} is not null and ${onHand} <= coalesce(${threshold}, 0)`,
      ),
      200,
    )
  ).map(shapeVariant);
  if (!rows.length) return { items: [], locationId };

  const extra = await db
    .select({
      variantId: productVariants.id,
      threshold: sql<string | null>`${threshold}`,
      onOrder: sql<string>`coalesce((
        select sum(poi.quantity - poi.quantity_received)
        from purchase_order_items poi
        join purchase_orders po on po.id = poi.purchase_order_id
        where poi.variant_id = ${qcol(productVariants.id)}
          and po.organization_id = ${auth.organizationId}
          and po.location_id = ${locationId}
          and po.status in ('SENT', 'PARTIALLY_RECEIVED')
      ), 0)`,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(productVariants.id, rows.map((r) => r.variantId)));
  const byId = new Map(extra.map((e) => [e.variantId, e]));

  const items = rows.map((r) => {
    const e = byId.get(r.variantId);
    const lowStockThreshold = e?.threshold == null ? null : num(e.threshold);
    const onOrder = num(e?.onOrder ?? 0);
    const target = lowStockThreshold && lowStockThreshold > 0 ? lowStockThreshold * 2 : 1;
    let suggested = Math.max(target - Math.max(r.stock, 0) - onOrder, 0);
    suggested = r.allowDecimal ? Math.round(suggested * 1000) / 1000 : Math.ceil(suggested);
    return { ...r, lowStockThreshold, onOrder, suggestedQuantity: suggested };
  });
  return { items, locationId };
}

/** Exact barcode / SKU / serial-number match — what a scanner at the till sends. */
export async function lookupByCode(auth: AuthContext, q: z.infer<typeof lookupQuery>) {
  const locationId = q.locationId ? await resolveLocationId(db, auth, q.locationId) : (auth.locationId ?? undefined);
  const code = q.code;
  const base = and(eq(productVariants.organizationId, auth.organizationId), eq(productVariants.isActive, true));

  let rows = await baseVariantQuery(
    locationId,
    and(base, or(eq(productVariants.barcode, code), sql`lower(${productVariants.sku}) = lower(${code})`)),
    2,
  );
  let serial: { serialNumber: string; status: string; locationId: string | null } | null = null;

  if (!rows.length) {
    const [s] = await db
      .select({
        variantId: serialNumbers.variantId,
        serialNumber: serialNumbers.serialNumber,
        status: serialNumbers.status,
        locationId: serialNumbers.locationId,
      })
      .from(serialNumbers)
      .where(and(eq(serialNumbers.organizationId, auth.organizationId), eq(serialNumbers.serialNumber, code)))
      .limit(1);
    if (s) {
      serial = { serialNumber: s.serialNumber, status: s.status, locationId: s.locationId };
      rows = await baseVariantQuery(locationId, and(base, eq(productVariants.id, s.variantId)), 1);
    }
  }
  if (!rows.length) throw notFound("No product matches this code");

  const variant = shapeVariant(rows[0]);
  const lots = variant.trackBatches ? await sellableLots(auth.organizationId, [variant.variantId], locationId) : [];
  return {
    variant,
    serial,
    lots: lots.map((l) => ({ ...l, quantityAvailable: num(l.quantityAvailable), unitCost: num(l.unitCost) })),
  };
}

/** In-stock serials for a variant at a location (for picking at the till). */
/** 404 unless the variant belongs to the caller's business. */
async function assertOwnVariant(auth: AuthContext, variantId: string) {
  const v = await db.query.productVariants.findFirst({
    where: and(eq(productVariants.id, variantId), eq(productVariants.organizationId, auth.organizationId)),
    columns: { id: true },
  });
  if (!v) throw notFound("Product");
}

export async function availableSerials(auth: AuthContext, variantId: string, locationId?: string) {
  await assertOwnVariant(auth, variantId);
  const loc = locationId ? await resolveLocationId(db, auth, locationId) : auth.locationId;
  const rows = await db
    .select({ serialNumber: serialNumbers.serialNumber, warrantyEndsOn: serialNumbers.warrantyEndsOn })
    .from(serialNumbers)
    .where(
      and(
        eq(serialNumbers.organizationId, auth.organizationId),
        eq(serialNumbers.variantId, variantId),
        eq(serialNumbers.status, "IN_STOCK"),
        loc ? eq(serialNumbers.locationId, loc) : undefined,
      ),
    )
    .orderBy(asc(serialNumbers.serialNumber))
    .limit(1000);
  return { items: rows };
}

export async function variantLots(auth: AuthContext, variantId: string, locationId?: string) {
  await assertOwnVariant(auth, variantId);
  const loc = locationId ? await resolveLocationId(db, auth, locationId) : (auth.locationId ?? undefined);
  const lots = await sellableLots(auth.organizationId, [variantId], loc);
  return { items: lots.map((l) => ({ ...l, quantityAvailable: num(l.quantityAvailable), unitCost: num(l.unitCost) })) };
}
