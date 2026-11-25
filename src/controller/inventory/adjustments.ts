import { and, desc, eq, gte, ilike, inArray, lte, sql } from "drizzle-orm";
import type { z } from "zod";
import { db, type Tx } from "@/db";
import {
  locations,
  productVariants,
  products,
  serialNumbers,
  stockAdjustmentItems,
  stockAdjustments,
  stockLevels,
  stockLots,
  units,
  users,
} from "@/db/schema";
import type { AuthContext } from "@/lib/api/handler";
import { badRequest, notFound } from "@/lib/errors";
import { costStr, money, num, qtyStr, round2, round4 } from "@/lib/num";
import type { adjustmentsQuery, CreateAdjustmentInput } from "@/lib/validation/inventory";
import { todayIn } from "../_shared/dates";
import { countAll, likePattern, offsetFor, pageOf } from "../_shared/paging";
import { nextDocumentNumber } from "../_shared/sequences";
import { issueStock, loadVariants, receiveStock } from "../_shared/stock";
import { getSettings, resolveLocationFilter, resolveLocationId } from "../_shared/tenant";
import { qcol } from "../_shared/sql";

const INCREASE_ONLY = new Set(["OPENING_STOCK", "FOUND"]);
const DECREASE_ONLY = new Set(["DAMAGED", "EXPIRED", "LOST", "THEFT", "INTERNAL_USE"]);

async function currentAvgCost(tx: Tx, variantId: string, locationId: string, fallback: number) {
  const [row] = await tx
    .select({ avgCost: stockLevels.avgCost, quantity: stockLevels.quantity })
    .from(stockLevels)
    .where(and(eq(stockLevels.variantId, variantId), eq(stockLevels.locationId, locationId)));
  return row && num(row.quantity) > 0 && num(row.avgCost) > 0 ? num(row.avgCost) : fallback;
}

async function serialMode(tx: Tx, orgId: string, variantId: string, numbers: string[]) {
  if (!numbers.length) return "create" as const;
  const existing = await tx
    .select({ serialNumber: serialNumbers.serialNumber, status: serialNumbers.status })
    .from(serialNumbers)
    .where(
      and(
        eq(serialNumbers.organizationId, orgId),
        eq(serialNumbers.variantId, variantId),
        inArray(serialNumbers.serialNumber, numbers),
      ),
    );
  if (existing.length === 0) return "create" as const;
  if (existing.length === numbers.length && existing.every((e) => e.status !== "IN_STOCK")) return "restock" as const;
  throw badRequest("Mix of new and existing serial numbers — add them in separate lines, and none may already be in stock");
}

export async function createAdjustment(auth: AuthContext, input: CreateAdjustmentInput) {
  const id = await db.transaction(async (tx) => {
    const settings = await getSettings(tx, auth.organizationId);
    const locationId = await resolveLocationId(tx, auth, input.locationId);
    const variants = await loadVariants(
      tx,
      auth.organizationId,
      input.items.map((i) => i.variantId),
    );

    for (const item of input.items) {
      if (INCREASE_ONLY.has(input.reason) && item.quantity < 0) {
        throw badRequest(`${input.reason.replace("_", " ").toLowerCase()} can only add stock`);
      }
      if (DECREASE_ONLY.has(input.reason) && item.quantity > 0) {
        throw badRequest(`${input.reason.replace("_", " ").toLowerCase()} can only remove stock`);
      }
    }

    const number = await nextDocumentNumber(tx, auth.organizationId, "STOCK_ADJUSTMENT");
    const [adj] = await tx
      .insert(stockAdjustments)
      .values({
        organizationId: auth.organizationId,
        locationId,
        number,
        adjustmentDate: input.adjustmentDate ?? todayIn(settings.timezone),
        reason: input.reason,
        note: input.note ?? null,
        createdByUserId: auth.userId,
      })
      .returning({ id: stockAdjustments.id });

    let total = 0;
    for (const item of input.items) {
      const v = variants.get(item.variantId)!;
      const base = { organizationId: auth.organizationId, locationId, variant: v, referenceType: "ADJUSTMENT" as const, referenceId: adj.id, userId: auth.userId, note: item.note ?? input.note ?? null };

      if (item.quantity > 0) {
        const unitCost = round4(item.unitCost ?? (await currentAvgCost(tx, v.id, locationId, v.costPrice)));
        const { lotId } = await receiveStock(tx, {
          ...base,
          quantity: item.quantity,
          unitCost,
          movementType: input.reason === "OPENING_STOCK" ? "OPENING" : "ADJUSTMENT_IN",
          lot: {
            existingLotId: item.lotId ?? null,
            lotNumber: item.lotNumber ?? null,
            manufacturingDate: item.manufacturingDate ?? null,
            expiryDate: item.expiryDate ?? null,
          },
          serials: v.trackSerials
            ? { numbers: item.serials, mode: await serialMode(tx, auth.organizationId, v.id, item.serials) }
            : undefined,
        });
        const lineValue = round2(item.quantity * unitCost);
        total += lineValue;
        await tx.insert(stockAdjustmentItems).values({
          adjustmentId: adj.id,
          variantId: v.id,
          lotId,
          quantity: qtyStr(item.quantity),
          unitCost: costStr(unitCost),
          lineValue: money(lineValue),
          lotNumber: item.lotNumber ?? null,
          manufacturingDate: item.manufacturingDate ?? null,
          expiryDate: item.expiryDate ?? null,
          serialNumbers: item.serials,
          note: item.note ?? null,
        });
      } else {
        const qty = -item.quantity;
        const writeOff = input.reason === "DAMAGED" || input.reason === "EXPIRED";
        const allocations = await issueStock(tx, {
          ...base,
          quantity: qty,
          movementType: writeOff ? "DAMAGE" : "ADJUSTMENT_OUT",
          lotId: item.lotId ?? null,
          serials: item.serials,
          serialStatus: "DAMAGED",
          allowNegative: settings.allowNegativeStock,
          allowExpired: true,
        });
        for (const a of allocations) {
          const lineValue = -round2(a.quantity * a.unitCost);
          total += lineValue;
          await tx.insert(stockAdjustmentItems).values({
            adjustmentId: adj.id,
            variantId: v.id,
            lotId: a.lotId,
            quantity: qtyStr(-a.quantity),
            unitCost: costStr(a.unitCost),
            lineValue: money(lineValue),
            serialNumbers: allocations.length === 1 ? item.serials : [],
            note: item.note ?? null,
          });
        }
      }
    }

    await tx.update(stockAdjustments).set({ totalValue: money(total) }).where(eq(stockAdjustments.id, adj.id));
    return adj.id;
  });
  return getAdjustment(auth, id);
}

export async function getAdjustment(auth: AuthContext, id: string) {
  const [adj] = await db
    .select({
      id: stockAdjustments.id,
      number: stockAdjustments.number,
      adjustmentDate: stockAdjustments.adjustmentDate,
      reason: stockAdjustments.reason,
      totalValue: stockAdjustments.totalValue,
      note: stockAdjustments.note,
      locationId: stockAdjustments.locationId,
      locationName: locations.name,
      createdByName: users.name,
      createdAt: stockAdjustments.createdAt,
    })
    .from(stockAdjustments)
    .innerJoin(locations, eq(locations.id, stockAdjustments.locationId))
    .leftJoin(users, eq(users.id, stockAdjustments.createdByUserId))
    .where(and(eq(stockAdjustments.id, id), eq(stockAdjustments.organizationId, auth.organizationId)));
  if (!adj) throw notFound("Stock adjustment");
  if (!auth.isOwner) await resolveLocationId(db, auth, adj.locationId); // staff: own locations only

  const items = await db
    .select({
      id: stockAdjustmentItems.id,
      variantId: stockAdjustmentItems.variantId,
      displayName: sql<string>`case when ${productVariants.isDefault} then ${products.name} else ${products.name} || ' (' || ${productVariants.name} || ')' end`,
      productId: productVariants.productId,
      sku: productVariants.sku,
      unitCode: units.code,
      lotId: stockAdjustmentItems.lotId,
      lotNumber: sql<string | null>`coalesce(${stockLots.lotNumber}, ${stockAdjustmentItems.lotNumber})`,
      expiryDate: sql<string | null>`coalesce(${stockLots.expiryDate}, ${stockAdjustmentItems.expiryDate})`,
      quantity: stockAdjustmentItems.quantity,
      unitCost: stockAdjustmentItems.unitCost,
      lineValue: stockAdjustmentItems.lineValue,
      serialNumbers: stockAdjustmentItems.serialNumbers,
      note: stockAdjustmentItems.note,
    })
    .from(stockAdjustmentItems)
    .innerJoin(productVariants, eq(productVariants.id, stockAdjustmentItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(units, eq(units.id, products.unitId))
    .leftJoin(stockLots, eq(stockLots.id, stockAdjustmentItems.lotId))
    .where(eq(stockAdjustmentItems.adjustmentId, id));

  return {
    adjustment: {
      ...adj,
      totalValue: num(adj.totalValue),
      items: items.map((i) => ({ ...i, quantity: num(i.quantity), unitCost: num(i.unitCost), lineValue: num(i.lineValue) })),
    },
  };
}

export async function listAdjustments(auth: AuthContext, q: z.infer<typeof adjustmentsQuery>) {
  const locationId = await resolveLocationFilter(db, auth, q.locationId);
  const where = and(
    eq(stockAdjustments.organizationId, auth.organizationId),
    locationId ? eq(stockAdjustments.locationId, locationId) : undefined,
    q.reason ? eq(stockAdjustments.reason, q.reason) : undefined,
    q.search ? ilike(stockAdjustments.number, likePattern(q.search)) : undefined,
    q.from ? gte(stockAdjustments.adjustmentDate, q.from) : undefined,
    q.to ? lte(stockAdjustments.adjustmentDate, q.to) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: stockAdjustments.id,
        number: stockAdjustments.number,
        adjustmentDate: stockAdjustments.adjustmentDate,
        reason: stockAdjustments.reason,
        totalValue: stockAdjustments.totalValue,
        note: stockAdjustments.note,
        locationName: locations.name,
        createdByName: users.name,
        itemCount: sql<number>`(select count(*)::int from ${stockAdjustmentItems} i where i.adjustment_id = ${qcol(stockAdjustments.id)})`,
        createdAt: stockAdjustments.createdAt,
      })
      .from(stockAdjustments)
      .innerJoin(locations, eq(locations.id, stockAdjustments.locationId))
      .leftJoin(users, eq(users.id, stockAdjustments.createdByUserId))
      .where(where)
      .orderBy(desc(stockAdjustments.adjustmentDate), desc(stockAdjustments.createdAt))
      .limit(q.limit)
      .offset(offsetFor(q.page, q.limit)),
    db.select({ total: countAll }).from(stockAdjustments).where(where),
  ]);
  return pageOf(
    rows.map((r) => ({ ...r, totalValue: num(r.totalValue) })),
    total,
    q.page,
    q.limit,
  );
}
