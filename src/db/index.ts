import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

declare global {
  var _rimsPool: Pool | undefined;
}

// Reuse the pool across hot reloads in development.
const pool =
  global._rimsPool ??
  new Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== "production") {
  global._rimsPool = pool;
}

export const db = drizzle({ client: pool, schema });

export type Database = typeof db;
// Transaction handle — pass this into helpers that must run inside db.transaction().
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbOrTx = Database | Tx;
