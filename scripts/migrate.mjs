// Applies committed migrations (drizzle/) during a Vercel production build.
// Uses DATABASE_MIGRATION_URL: Supabase's *direct* connection string (port
// 5432), since the pooled URL the app uses can't run migrations reliably.
// Preview and development builds never touch the database.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_MIGRATION_URL;
const env = process.env.VERCEL_ENV;

if (env && env !== "production") {
  console.log(`[migrate] Skipping migrations for a ${env} build.`);
} else if (!url) {
  console.warn("[migrate] DATABASE_MIGRATION_URL is not set; skipping migrations.");
} else {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
  console.log("[migrate] Database is up to date.");
}
