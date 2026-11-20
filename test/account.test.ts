import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { account, play, session, user } from "@/db/schema";
import { makePlayer } from "./helpers";

describe("account deletion", () => {
  it("removes the player's sessions, sign-in accounts and plays with the user row", async () => {
    const uid = await makePlayer();
    const now = new Date();
    await db.insert(session).values({ id: randomUUID(), token: randomUUID(), userId: uid, expiresAt: new Date(Date.now() + 1e7) });
    await db.insert(account).values({ id: randomUUID(), accountId: "x", providerId: "microsoft", userId: uid });
    await db.insert(play).values({ id: randomUUID(), userId: uid, date: "2026-11-17", gameId: "honk", status: "done", state: {}, rawScore: 3, startedAt: now });

    await db.delete(user).where(eq(user.id, uid));

    expect(await db.select().from(session).where(eq(session.userId, uid))).toHaveLength(0);
    expect(await db.select().from(account).where(eq(account.userId, uid))).toHaveLength(0);
    expect(await db.select().from(play).where(eq(play.userId, uid))).toHaveLength(0);
  });
});

describe("replay protection after deletion", () => {
  it("stops a recreated account from starting a day the old account already played", async () => {
    const { addTombstones } = await import("@/lib/tombstone");
    const { startPlay } = await import("@/engine/engine");
    const { GAME_MODULES } = await import("@/games/registry");
    const today = "2030-01-08"; // a Tuesday no other test uses
    process.env.WATTLE_DEV_DATE = today;
    expect(GAME_MODULES.honk).toBeDefined();

    // The old account played today, then was deleted.
    await addTombstones("Replayer@uwaterloo.ca", [today], today);

    // Same email signs up again.
    const uid = await makePlayer("replayer");
    await expect(startPlay(uid, today)).rejects.toMatchObject({ code: "already_done" });

    // Someone else can still play.
    const other = await makePlayer();
    await expect(startPlay(other, today)).resolves.toMatchObject({ status: "playing" });
  });
});
