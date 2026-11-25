import { z } from "zod";
import { dateRange, pagination, uuid } from "./common";

const scope = { locationId: z.string().optional(), ...dateRange };

export const dashboardQuery = z.object({ locationId: z.string().optional() });

export const salesReportQuery = z.object({
  ...scope,
  groupBy: z.enum(["day", "month", "product", "category", "brand", "customer", "user", "location", "paymentMethod"]).default("day"),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});

export const purchasesReportQuery = z.object({
  ...scope,
  groupBy: z.enum(["day", "month", "supplier", "product", "category"]).default("day"),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});

export const valuationQuery = z.object({
  locationId: z.string().optional(),
  groupBy: z.enum(["variant", "category", "location"]).default("category"),
  ...pagination,
});

export const movementSummaryQuery = z.object({
  ...scope,
  variantId: uuid.optional(),
  categoryId: uuid.optional(),
  search: z.string().trim().max(100).optional(),
  ...pagination,
});

export const profitLossQuery = z.object({ ...scope, compare: z.enum(["true", "false"]).optional() });
export const taxReportQuery = z.object({ ...scope, groupBy: z.enum(["month", "rate"]).default("month") });
export const expiryReportQuery = z.object({
  locationId: z.string().optional(),
  days: z.coerce.number().int().min(0).max(3650).default(90),
  includeExpired: z.enum(["true", "false"]).default("true"),
  ...pagination,
});

export const transactionsQuery = z.object({
  type: z
    .enum(["SALE", "SALE_RETURN", "PURCHASE", "PURCHASE_RETURN", "PAYMENT", "INCOME", "EXPENSE", "ADJUSTMENT", "TRANSFER"])
    .optional(),
  search: z.string().trim().max(100).optional(),
  partyId: uuid.optional(),
  ...scope,
  ...pagination,
});
