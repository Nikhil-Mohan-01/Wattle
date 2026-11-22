// Runs in every test worker: create the schema in the in-memory database
// from the committed migrations, so tests exercise the real migration files.
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { db } from "@/db/client";

const g = globalThis as { __wattleMigrated?: boolean };
if (!g.__wattleMigrated) {
  await migrate(db as unknown as PgliteDatabase, {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  g.__wattleMigrated = true;
}
