import "server-only";
import { PGlite } from "@electric-sql/pglite";
import type { SQL } from "drizzle-orm";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * DATABASE_URL selects the database:
 * - `postgres://…` / `postgresql://…`: a Postgres server. In production that's
 *   Supabase (use its pooled "transaction" connection string on Vercel); in
 *   local development `npm run dev` starts an embedded Postgres server
 *   (PGlite) on port 5433 that stores its data in ./data/pglite.
 * - `memory://`: embedded Postgres in memory, inside this process (tests).
 */
export const DEFAULT_DATABASE_URL = "postgresql://postgres@127.0.0.1:5433/postgres";

export type DB = PostgresJsDatabase<typeof schema>;

export function isPostgresUrl(url: string): boolean {
  return /^postgres(ql)?:\/\//.test(url);
}

function create(): DB {
  const url = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
  if (isPostgresUrl(url)) {
    // `prepare: false` is required by Supabase's transaction pooler. Serverless
    // functions keep one connection each; the pooler fans them in. The local
    // dev server (PGlite) is single-session and can interleave queries from
    // parallel connections, so it gets exactly one.
    const { hostname, port } = new URL(url);
    const localDevServer = ["127.0.0.1", "localhost"].includes(hostname) && port === "5433";
    const max = process.env.VERCEL || localDevServer ? 1 : 10;
    const client = postgres(url, { prepare: false, max });
    return drizzlePostgres(client, { schema });
  }
  if (url !== "memory://") throw new Error(`Unsupported DATABASE_URL: ${url}`);
  // Same query API as the Postgres driver, so it's typed the same way.
  return drizzlePglite(new PGlite(), { schema }) as unknown as DB;
}

// One client per process, kept across hot reloads and test module resets so
// an embedded database is never opened twice.
const g = globalThis as { __wattleDb?: DB };
export const db: DB = (g.__wattleDb ??= create());

/** Runs a raw SQL query and returns its rows, whichever driver is in use. */
export async function queryRows<T>(query: SQL): Promise<T[]> {
  const result: unknown = await db.execute(query);
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}
