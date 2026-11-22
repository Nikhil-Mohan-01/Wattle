import { defineConfig } from "drizzle-kit";

// Needs a running Postgres: Supabase (use its direct connection, port 5432,
// for migrations) or the local dev server from `npm run db:server`.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL || "postgresql://postgres@127.0.0.1:5433/postgres" },
});
