import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

const timestamps = {
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
};

// ---------------------------------------------------------------------------
// Auth tables (shape required by Better Auth)
// ---------------------------------------------------------------------------

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    // Wattle profile. Set once on the welcome screen; never accepted from the
    // auth client (see `input: false` in lib/auth.ts).
    handle: text("handle"),
    faculty: text("faculty"),
    // The verified student email that makes this a player. One per account and
    // one account per student email. Never accepted from the auth client.
    studentEmail: text("student_email").unique(),
    studentVerifiedAt: ts("student_verified_at"),
    // University id (lib/universities.ts), from the student email's domain.
    university: text("university"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("user_handle_lower_idx").on(sql`lower(${t.handle})`),
    index("user_university_idx").on(t.university, t.faculty),
  ],
);

/**
 * A pending 6-digit code proving the player owns a student email. One per
 * user; only a keyed hash of the code is stored.
 */
export const studentCode = pgTable("student_code", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
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

export const account = pgTable(
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
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
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
export const puzzle = pgTable(
  "puzzle",
  {
    date: text("date").primaryKey(), // YYYY-MM-DD, Toronto time
    gameId: text("game_id").notNull(),
    contentId: text("content_id").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("puzzle_game_idx").on(t.gameId, t.date)],
);

/**
 * A player's single attempt at a day's puzzle. All progress lives here on the
 * server; the browser only ever sends moves.
 */
export const play = pgTable(
  "play",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    gameId: text("game_id").notNull(),
    status: text("status", { enum: ["playing", "done"] }).notNull(),
    state: jsonb("state").notNull(),
    rawScore: doublePrecision("raw_score"),
    moveCount: integer("move_count").notNull().default(0),
    // Bumped on every write; a write only succeeds against the version it read,
    // so two simultaneous moves can't both apply.
    version: integer("version").notNull().default(0),
    flags: jsonb("flags").$type<string[]>(),
    startedAt: ts("started_at").notNull(),
    finishedAt: ts("finished_at"),
  },
  (t) => [
    uniqueIndex("play_user_date_idx").on(t.userId, t.date),
    index("play_date_idx").on(t.date, t.status),
  ],
);

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * Fixed-window counters shared by every server process. Updated with a single
 * atomic upsert (see lib/rate-limit.ts), so limits hold across restarts and
 * workers and can't be bypassed with parallel requests.
 */
export const rateLimitBucket = pgTable(
  "rate_limit_bucket",
  {
    key: text("key").primaryKey(),
    windowStart: bigint("window_start", { mode: "number" }).notNull(), // ms
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(), // ms
    count: integer("count").notNull(),
  },
  (t) => [index("rate_limit_bucket_expires_idx").on(t.expiresAt)],
);

/**
 * Days a since-deleted account had already played, keyed by a keyed hash of
 * its email (never the email itself). Stops someone deleting their account
 * and signing back in to replay today's puzzle. Old rows are pruned.
 */
export const playTombstone = pgTable(
  "play_tombstone",
  {
    emailHash: text("email_hash").notNull(),
    date: text("date").notNull(),
  },
  (t) => [uniqueIndex("play_tombstone_idx").on(t.emailHash, t.date)],
);
