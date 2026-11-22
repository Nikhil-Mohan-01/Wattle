// Applies the committed migrations (drizzle/) to the local embedded Postgres
// in ./data/pglite. Run while the dev database server is stopped; `npm run dev`
// runs this automatically before starting it.
import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

mkdirSync("./data", { recursive: true });
const client = new PGlite("./data/pglite");
await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
await client.close();
console.log("[db] Local database is up to date.");
