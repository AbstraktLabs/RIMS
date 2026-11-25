import { sql, type SQL } from "drizzle-orm";

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function pageOf<T>(items: T[], total: number, page: number, limit: number): Page<T> {
  return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export const offsetFor = (page: number, limit: number) => (page - 1) * limit;

/** ILIKE pattern with user wildcards escaped. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export const countAll = sql<number>`count(*)::int`;

export function and_(...parts: (SQL | undefined)[]): SQL | undefined {
  const real = parts.filter((p): p is SQL => !!p);
  if (!real.length) return undefined;
  return sql.join(real, sql` and `);
}
