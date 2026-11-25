import { getTableName, sql, type Column } from "drizzle-orm";

/**
 * A fully table-qualified column reference.
 *
 * Drizzle prints columns without the table name in the select list of a
 * single-table query. Inside a correlated subquery that silently binds the
 * column to the *inner* table (e.g. `where i.sale_id = "id"`), so outer
 * references in subqueries must always go through this helper.
 */
export const qcol = (c: Column) => sql`${sql.identifier(getTableName(c.table))}.${sql.identifier(c.name)}`;
