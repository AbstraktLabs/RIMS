import { numeric, timestamp } from "drizzle-orm/pg-core";

// Shared column conventions — keep precision consistent across every table.

/** Money amounts (prices, totals, payments). */
export const money = (name: string) => numeric(name, { precision: 14, scale: 2 });

/** Unit costs — extra precision so averaged costs don't drift. */
export const unitCost = (name: string) => numeric(name, { precision: 14, scale: 4 });

/** Stock quantities — fractional to support kg, litre, metre etc. */
export const qty = (name: string) => numeric(name, { precision: 14, scale: 3 });

/** Percentages such as tax rates (e.g. 13.00). */
export const percent = (name: string) => numeric(name, { precision: 5, scale: 2 });

export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
