import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
};

// ---------------------------------------------------------------------------
// Auth tables (shape required by Better Auth)
// ---------------------------------------------------------------------------

export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    image: text("image"),
    // Wattle profile. Set once on the welcome screen; never accepted from the
    // auth client (see `input: false` in lib/auth.ts).
    handle: text("handle"),
    faculty: text("faculty"),
    ...timestamps,
  },
  (t) => [uniqueIndex("user_handle_lower_idx").on(sql`lower(${t.handle})`)],
);

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    ...timestamps,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

/**
 * One puzzle per day. Created the first time anyone asks for that day, then
 * frozen. `data` holds the full puzzle including answers and is never sent to
 * the browser as-is.
 */
export const puzzle = sqliteTable(
  "puzzle",
  {
    date: text("date").primaryKey(), // YYYY-MM-DD, Toronto time
    gameId: text("game_id").notNull(),
    contentId: text("content_id").notNull(),
    data: text("data", { mode: "json" }).notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("puzzle_game_idx").on(t.gameId, t.date)],
);

/**
 * A player's single attempt at a day's puzzle. All progress lives here on the
 * server; the browser only ever sends moves.
 */
export const play = sqliteTable(
  "play",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    gameId: text("game_id").notNull(),
    status: text("status", { enum: ["playing", "done"] }).notNull(),
    state: text("state", { mode: "json" }).notNull(),
    rawScore: real("raw_score"),
    moveCount: integer("move_count").notNull().default(0),
    // Bumped on every write; a write only succeeds against the version it read,
    // so two simultaneous moves can't both apply.
    version: integer("version").notNull().default(0),
    flags: text("flags", { mode: "json" }).$type<string[]>(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    uniqueIndex("play_user_date_idx").on(t.userId, t.date),
    index("play_date_idx").on(t.date, t.status),
  ],
);
