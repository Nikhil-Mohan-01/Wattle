import "server-only";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Local dev uses a SQLite file. In production point DATABASE_URL at a
// hosted libSQL/Turso database and set DATABASE_AUTH_TOKEN.
const client = createClient({
  url: process.env.DATABASE_URL ?? "file:./data/wattle.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
export type DB = typeof db;
