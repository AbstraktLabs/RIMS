import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import type { DbOrTx, Tx } from "@/db";
import {
  productVariants,
  products,
  serialNumbers,
  stockLevels,
  stockLots,
  stockMovements,
  taxRates,
  units,
} from "@/db/schema";
import { badRequest, notFound, unprocessable } from "@/lib/errors";
import { costStr, isWhole, num, qtyStr, round3, round4 } from "@/lib/num";

// ─────────────────────────────────────────────────────────────
// Stock engine. The ONLY code that changes stock_levels, stock_lots,
// serial_numbers stock status and stock_movements. Always called inside a
// transaction; the stock_levels row is locked (FOR UPDATE) first, so two
// concurrent sales of the same item cannot both take the last unit.
// ─────────────────────────────────────────────────────────────

type MovementType = (typeof stockMovements.$inferInsert)["type"];
type ReferenceType = (typeof stockMovements.$inferInsert)["referenceType"];
type SerialStatus = NonNullable<(typeof serialNumbers.$inferInsert)["status"]>;

export interface VariantInfo {
  id: string;
  productId: string;
  name: string;
  displayName: string; // "T-Shirt (M / Red)"
  sku: string;
  sellingPrice: number;
  wholesalePrice: number | null;
  costPrice: number;
  isActive: boolean;
  trackBatches: boolean;
  trackExpiry: boolean;
  trackSerials: boolean;
  allowDecimal: boolean;
  taxRateId: string | null;
  taxRate: number;
  purchaseUnitFactor: number | null;
}

export async function loadVariants(tx: Tx, organizationId: string, ids: string[]): Promise<Map<string, VariantInfo>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();

  const rows = await tx
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      name: productVariants.name,
      sku: productVariants.sku,
      sellingPrice: productVariants.sellingPrice,
      wholesalePrice: productVariants.wholesalePrice,
      costPrice: productVariants.costPrice,
      variantActive: productVariants.isActive,
      isDefault: productVariants.isDefault,
      productName: products.name,
      productActive: products.isActive,
      trackBatches: products.trackBatches,
      trackExpiry: products.trackExpiry,
      trackSerials: products.trackSerials,
      allowDecimal: units.allowDecimal,
      taxRateId: products.taxRateId,
      taxRate: taxRates.rate,
      taxActive: taxRates.isActive,
      purchaseUnitFactor: products.purchaseUnitFactor,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(units, eq(units.id, products.unitId))
    .leftJoin(taxRates, eq(taxRates.id, products.taxRateId))
    .where(and(eq(productVariants.organizationId, organizationId), inArray(productVariants.id, unique)));

  if (rows.length !== unique.length) throw notFound("One or more products");

  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        productId: r.productId,
        name: r.name,
        displayName: r.isDefault ? r.productName : `${r.productName} (${r.name})`,
        sku: r.sku,
        sellingPrice: num(r.sellingPrice),
        wholesalePrice: r.wholesalePrice === null ? null : num(r.wholesalePrice),
        costPrice: num(r.costPrice),
        isActive: r.variantActive && r.productActive,
        trackBatches: r.trackBatches,
        trackExpiry: r.trackExpiry,
        trackSerials: r.trackSerials,
        allowDecimal: r.allowDecimal,
        taxRateId: r.taxRateId,
        taxRate: r.taxRate !== null && r.taxActive ? num(r.taxRate) : 0,
        purchaseUnitFactor: r.purchaseUnitFactor === null ? null : num(r.purchaseUnitFactor),
      },
    ]),
  );
}

export function assertQuantity(v: VariantInfo, quantity: number, serials?: string[]) {
  if (!(quantity > 0)) throw badRequest(`Quantity for ${v.displayName} must be greater than zero`);
  if (!v.allowDecimal && !isWhole(quantity)) {
    throw badRequest(`${v.displayName} is sold in whole units — fractional quantities are not allowed`);
  }
  if (v.trackSerials) {
    if (!isWhole(quantity)) throw badRequest(`${v.displayName} is serial-tracked; quantity must be whole`);
    const list = serials ?? [];
    if (list.length !== quantity) {
      throw badRequest(`${v.displayName} needs ${quantity} serial number(s); ${list.length} given`);
    }
    if (new Set(list).size !== list.length) throw badRequest(`Duplicate serial numbers for ${v.displayName}`);
  }
}

async function lockLevel(tx: Tx, organizationId: string, variantId: string, locationId: string) {
  await tx.insert(stockLevels).values({ organizationId, variantId, locationId }).onConflictDoNothing();
  const [level] = await tx
    .select({ id: stockLevels.id, quantity: stockLevels.quantity, avgCost: stockLevels.avgCost })
    .from(stockLevels)
    .where(and(eq(stockLevels.variantId, variantId), eq(stockLevels.locationId, locationId)))
    .for("update");
  return { id: level.id, quantity: num(level.quantity), avgCost: num(level.avgCost) };
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── receive (stock in) ───────────────────────────────────────
export interface ReceiveInput {
  organizationId: string;
  locationId: string;
  variant: VariantInfo;
  quantity: number;
  unitCost: number;
  movementType: MovementType;
  referenceType: ReferenceType;
  referenceId: string;
  userId: string | null;
  note?: string | null;
  lot?: {
    existingLotId?: string | null; // top up a known lot (returns, voids)
    lotNumber?: string | null;
    manufacturingDate?: string | null;
    expiryDate?: string | null;
    supplierId?: string | null;
    purchaseItemId?: string | null;
    note?: string | null;
  };
  serials?: {
    numbers: string[];
    mode: "create" | "restock"; // create new serial rows, or bring existing ones back into stock
    purchaseItemId?: string | null;
  };
}

export async function receiveStock(tx: Tx, input: ReceiveInput): Promise<{ lotId: string | null }> {
  const { organizationId, locationId, variant, quantity } = input;
  const unitCost = Math.max(0, round4(input.unitCost));
  assertQuantity(variant, quantity, input.serials?.numbers);

  const level = await lockLevel(tx, organizationId, variant.id, locationId);
  const newQty = round3(level.quantity + quantity);
  const newAvg =
    level.quantity <= 0 || newQty <= 0 ? unitCost : round4((level.quantity * level.avgCost + quantity * unitCost) / newQty);

  await tx
    .update(stockLevels)
    .set({ quantity: qtyStr(newQty), avgCost: costStr(newAvg) })
    .where(eq(stockLevels.id, level.id));

  let lotId: string | null = null;
  if (variant.trackBatches) {
    const lot = input.lot ?? {};
    if (lot.existingLotId) {
      const [existing] = await tx
        .select({ id: stockLots.id, expiryDate: stockLots.expiryDate })
        .from(stockLots)
        .where(
          and(
            eq(stockLots.id, lot.existingLotId),
            eq(stockLots.variantId, variant.id),
            eq(stockLots.locationId, locationId),
          ),
        )
        .for("update");
      if (!existing) throw notFound("Batch");
      const expired = existing.expiryDate !== null && existing.expiryDate < todayIso();
      await tx
        .update(stockLots)
        .set({
          quantityAvailable: sql`${stockLots.quantityAvailable} + ${qtyStr(quantity)}`,
          status: expired ? "EXPIRED" : "ACTIVE",
        })
        .where(eq(stockLots.id, existing.id));
      lotId = existing.id;
    } else {
      if (variant.trackExpiry && !lot.expiryDate) throw badRequest(`Expiry date is required for ${variant.displayName}`);
      const expired = !!lot.expiryDate && lot.expiryDate < todayIso();
      const [created] = await tx
        .insert(stockLots)
        .values({
          organizationId,
          variantId: variant.id,
          locationId,
          supplierId: lot.supplierId ?? null,
          purchaseItemId: lot.purchaseItemId ?? null,
          lotNumber: lot.lotNumber ?? null,
          manufacturingDate: lot.manufacturingDate ?? null,
          expiryDate: lot.expiryDate ?? null,
          note: lot.note ?? null,
          unitCost: costStr(unitCost),
          quantityReceived: qtyStr(quantity),
          quantityAvailable: qtyStr(quantity),
          status: expired ? "EXPIRED" : "ACTIVE",
        })
        .returning({ id: stockLots.id });
      lotId = created.id;
    }
  }

  if (variant.trackSerials && input.serials) {
    const { numbers, mode } = input.serials;
    if (mode === "create") {
      const clash = await tx
        .select({ serialNumber: serialNumbers.serialNumber })
        .from(serialNumbers)
        .where(
          and(
            eq(serialNumbers.organizationId, organizationId),
            eq(serialNumbers.variantId, variant.id),
            inArray(serialNumbers.serialNumber, numbers),
          ),
        );
      if (clash.length) {
        throw badRequest(`Serial number(s) already exist: ${clash.map((c) => c.serialNumber).join(", ")}`);
      }
      await tx.insert(serialNumbers).values(
        numbers.map((serialNumber) => ({
          organizationId,
          variantId: variant.id,
          locationId,
          serialNumber,
          status: "IN_STOCK" as const,
          purchaseItemId: input.serials!.purchaseItemId ?? null,
        })),
      );
    } else {
      const updated = await tx
        .update(serialNumbers)
        .set({ status: "IN_STOCK", locationId })
        .where(
          and(
            eq(serialNumbers.organizationId, organizationId),
            eq(serialNumbers.variantId, variant.id),
            inArray(serialNumbers.serialNumber, numbers),
            sql`${serialNumbers.status} <> 'IN_STOCK'`,
          ),
        )
        .returning({ id: serialNumbers.id });
      if (updated.length !== numbers.length) {
        throw badRequest(`Some serial numbers for ${variant.displayName} are unknown or already in stock`);
      }
    }
  }

  await tx.insert(stockMovements).values({
    organizationId,
    variantId: variant.id,
    locationId,
    lotId,
    type: input.movementType,
    quantity: qtyStr(quantity),
    unitCost: costStr(unitCost),
    balanceAfter: qtyStr(newQty),
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    note: input.note ?? null,
    createdByUserId: input.userId,
  });

  return { lotId };
}

// ── issue (stock out) ────────────────────────────────────────
export interface IssueInput {
  organizationId: string;
  locationId: string;
  variant: VariantInfo;
  quantity: number;
  movementType: MovementType;
  referenceType: ReferenceType;
  referenceId: string;
  userId: string | null;
  note?: string | null;
  lotId?: string | null; // take from this lot instead of FEFO
  serials?: string[];
  serialStatus?: SerialStatus; // new status for issued serials (default SOLD)
  allowNegative: boolean;
  allowExpired?: boolean; // write-offs and supplier returns may take expired lots
}

export interface Allocation {
  lotId: string | null;
  quantity: number;
  unitCost: number;
}

export async function issueStock(tx: Tx, input: IssueInput): Promise<Allocation[]> {
  const { organizationId, locationId, variant, quantity } = input;
  assertQuantity(variant, quantity, input.serials);

  const level = await lockLevel(tx, organizationId, variant.id, locationId);
  const allocations: Allocation[] = [];

  if (variant.trackBatches) {
    const statuses = input.allowExpired ? (["ACTIVE", "EXPIRED"] as const) : (["ACTIVE"] as const);
    const conditions = [
      eq(stockLots.variantId, variant.id),
      eq(stockLots.locationId, locationId),
      gt(stockLots.quantityAvailable, "0"),
      inArray(stockLots.status, [...statuses]),
    ];
    if (input.lotId) conditions.push(eq(stockLots.id, input.lotId));
    if (!input.allowExpired) {
      conditions.push(sql`(${stockLots.expiryDate} is null or ${stockLots.expiryDate} >= ${todayIso()})`);
    }

    // FEFO: earliest expiry first, undated lots last, then oldest received
    const lots = await tx
      .select({ id: stockLots.id, quantityAvailable: stockLots.quantityAvailable, unitCost: stockLots.unitCost })
      .from(stockLots)
      .where(and(...conditions))
      .orderBy(sql`${stockLots.expiryDate} asc nulls last`, asc(stockLots.createdAt))
      .for("update");

    let remaining = quantity;
    for (const lot of lots) {
      if (remaining <= 0) break;
      const take = round3(Math.min(remaining, num(lot.quantityAvailable)));
      allocations.push({ lotId: lot.id, quantity: take, unitCost: num(lot.unitCost) });
      remaining = round3(remaining - take);
    }
    if (remaining > 0) {
      const available = round3(quantity - remaining);
      throw unprocessable(
        input.lotId
          ? `The selected batch of ${variant.displayName} has only ${available} available`
          : `Not enough sellable stock for ${variant.displayName}: ${available} available in unexpired batches`,
        { variantId: variant.id, available },
      );
    }

    for (const a of allocations) {
      await tx
        .update(stockLots)
        .set({
          quantityAvailable: sql`${stockLots.quantityAvailable} - ${qtyStr(a.quantity)}`,
          status: sql`case when ${stockLots.quantityAvailable} - ${qtyStr(a.quantity)} <= 0 then 'DEPLETED'::lot_status else ${stockLots.status} end`,
        })
        .where(eq(stockLots.id, a.lotId!));
    }
  } else {
    if (!input.allowNegative && level.quantity < quantity) {
      throw unprocessable(`Not enough stock for ${variant.displayName}: ${round3(level.quantity)} available`, {
        variantId: variant.id,
        available: round3(level.quantity),
      });
    }
    allocations.push({ lotId: null, quantity, unitCost: level.avgCost || variant.costPrice });
  }

  const newQty = round3(level.quantity - quantity);
  await tx.update(stockLevels).set({ quantity: qtyStr(newQty) }).where(eq(stockLevels.id, level.id));

  if (variant.trackSerials) {
    const status = input.serialStatus ?? "SOLD";
    const keepLocation = status === "DAMAGED";
    const updated = await tx
      .update(serialNumbers)
      .set({ status, locationId: keepLocation ? locationId : null })
      .where(
        and(
          eq(serialNumbers.organizationId, organizationId),
          eq(serialNumbers.variantId, variant.id),
          eq(serialNumbers.locationId, locationId),
          eq(serialNumbers.status, "IN_STOCK"),
          inArray(serialNumbers.serialNumber, input.serials ?? []),
        ),
      )
      .returning({ id: serialNumbers.id });
    if (updated.length !== quantity) {
      throw badRequest(`Some serial numbers for ${variant.displayName} are not in stock at this location`);
    }
  }

  let balance = level.quantity;
  for (const a of allocations) {
    balance = round3(balance - a.quantity);
    await tx.insert(stockMovements).values({
      organizationId,
      variantId: variant.id,
      locationId,
      lotId: a.lotId,
      type: input.movementType,
      quantity: qtyStr(-a.quantity),
      unitCost: costStr(a.unitCost),
      balanceAfter: qtyStr(balance),
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      note: input.note ?? null,
      createdByUserId: input.userId,
    });
  }

  return allocations;
}

/** Attach issued/received serials to the document line that moved them. */
export async function linkSerials(
  tx: Tx,
  organizationId: string,
  variantId: string,
  numbers: string[],
  link: { saleItemId?: string | null; purchaseItemId?: string | null },
) {
  if (!numbers.length) return;
  await tx
    .update(serialNumbers)
    .set(link)
    .where(
      and(
        eq(serialNumbers.organizationId, organizationId),
        eq(serialNumbers.variantId, variantId),
        inArray(serialNumbers.serialNumber, numbers),
      ),
    );
}

/** Mark lots whose expiry date has passed. Cheap; called by inventory reads. */
export async function refreshExpiredLots(tx: DbOrTx, organizationId: string) {
  await tx
    .update(stockLots)
    .set({ status: "EXPIRED" })
    .where(
      and(
        eq(stockLots.organizationId, organizationId),
        eq(stockLots.status, "ACTIVE"),
        sql`${stockLots.expiryDate} < ${todayIso()}`,
      ),
    );
}
