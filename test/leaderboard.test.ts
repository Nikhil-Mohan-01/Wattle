import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { play, user } from "@/db/schema";
import {
  BOARD_LIMIT,
  dailyBoard,
  facultyBoard,
  facultyScore,
  latestGameDay,
  periodBoard,
  termOf,
  weekRange,
} from "@/engine/leaderboard";
import { makePlayer } from "./helpers";

// Each test uses its own dates (far from other test files) so data doesn't mix.

type PlayOpts = {
  status?: "playing" | "done";
  flags?: string[] | null;
  finishedAt?: number;
  gameId?: string;
};

async function addPlay(userId: string, date: string, rawScore: number | null, o: PlayOpts = {}) {
  const status = o.status ?? "done";
  await db.insert(play).values({
    id: randomUUID(),
    userId,
    date,
    gameId: o.gameId ?? "honk",
    status,
    state: {},
    rawScore,
    flags: o.flags ?? null,
    startedAt: new Date(Date.parse(`${date}T12:00:00Z`)),
    finishedAt:
      status === "done" ? new Date(o.finishedAt ?? Date.parse(`${date}T12:05:00Z`)) : null,
  });
}

async function players(n: number, faculty = "math") {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = await makePlayer();
    await db.update(user).set({ faculty }).where(eq(user.id, id));
    ids.push(id);
  }
  return ids;
}

function pointsBy(rows: { userId: string; points: number }[]) {
  return Object.fromEntries(rows.map((r) => [r.userId, r.points]));
}

describe("daily points", () => {
  it("gives the best 100, the worst 0 and the middle by percentile", async () => {
    const date = "2025-01-06";
    const [a, b, c, d, e] = await players(5);
    for (const [id, s] of [[a, 10], [b, 20], [c, 30], [d, 40], [e, 50]] as const) {
      await addPlay(id, date, s);
    }
    const board = await dailyBoard(date, null);
    expect(pointsBy(board.rows)).toEqual({ [a]: 0, [b]: 25, [c]: 50, [d]: 75, [e]: 100 });
    expect(board.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(board.rows[0].userId).toBe(e);
    expect(board.total).toBe(5);
  });

  it("splits ties at the midpoint and shares the rank", async () => {
    const date = "2025-01-07";
    const [a, b, c, d] = await players(4);
    await addPlay(a, date, 1);
    await addPlay(b, date, 5);
    await addPlay(c, date, 5);
    await addPlay(d, date, 9);
    const board = await dailyBoard(date, null);
    // b and c: 1 below + 0.5 * 1 tie over 3 → 50.
    expect(pointsBy(board.rows)).toEqual({ [a]: 0, [b]: 50, [c]: 50, [d]: 100 });
    expect(board.rows.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it("gives everyone 50 when everyone ties", async () => {
    const date = "2025-01-08";
    const ids = await players(3);
    for (const id of ids) await addPlay(id, date, 7);
    const board = await dailyBoard(date, null);
    expect(board.rows.every((r) => r.points === 50)).toBe(true);
  });

  it("gives a lone player 100", async () => {
    const date = "2025-01-09";
    const [a] = await players(1);
    await addPlay(a, date, 0);
    const board = await dailyBoard(date, a);
    expect(board.rows).toHaveLength(1);
    expect(board.me).toMatchObject({ userId: a, points: 100, rank: 1 });
  });

  it("ignores unfinished and flagged plays", async () => {
    const date = "2025-01-10";
    const [a, b, playing, cheat, cleanFlags] = await players(5);
    await addPlay(a, date, 1);
    await addPlay(b, date, 2);
    await addPlay(playing, date, null, { status: "playing" });
    await addPlay(cheat, date, 99, { flags: ["too_fast"] });
    await addPlay(cleanFlags, date, 3, { flags: [] });
    const board = await dailyBoard(date, cheat);
    expect(pointsBy(board.rows)).toEqual({ [a]: 0, [b]: 50, [cleanFlags]: 100 });
    expect(board.me).toBeNull();
    expect(board.total).toBe(3);
  });

  it("never exposes emails", async () => {
    const date = "2025-01-10";
    const board = await dailyBoard(date, null);
    expect(JSON.stringify(board)).not.toContain("@");
  });
});

describe("your rank", () => {
  it("returns the viewer's row even outside the top rows", async () => {
    const date = "2025-01-13";
    const ids = await players(BOARD_LIMIT + 5);
    for (let i = 0; i < ids.length; i++) await addPlay(ids[i], date, i); // ids[0] is last
    const board = await dailyBoard(date, ids[0]);
    expect(board.rows).toHaveLength(BOARD_LIMIT);
    expect(board.rows.some((r) => r.userId === ids[0])).toBe(false);
    expect(board.me).toMatchObject({ userId: ids[0], rank: BOARD_LIMIT + 5, points: 0 });
    expect(board.total).toBe(BOARD_LIMIT + 5);

    const top = await dailyBoard(date, ids.at(-1)!);
    expect(top.me).toMatchObject({ rank: 1, points: 100 });
    expect(top.rows).toHaveLength(BOARD_LIMIT);

    const week = await periodBoard(weekRange(date), ids[3]);
    expect(week.me).toMatchObject({ userId: ids[3], rank: BOARD_LIMIT + 2 });
  });
});

describe("weekly board", () => {
  it("sums daily points and breaks ties by days played, then earliest finish", async () => {
    // Week of Mon 2025-02-03.
    const [a, b, c, d, filler] = await players(5);
    const mon = "2025-02-03";
    const tue = "2025-02-04";
    const wed = "2025-02-05";
    await addPlay(a, mon, 10); // 100
    await addPlay(b, mon, 1); //    0
    await addPlay(b, tue, 10); //  100
    await addPlay(filler, tue, 1); // 0
    // Wed: c and d tie for top among 3 → each 75; filler 0.
    await addPlay(c, wed, 5, { finishedAt: Date.parse(`${wed}T15:00:00Z`) });
    await addPlay(d, wed, 5, { finishedAt: Date.parse(`${wed}T14:00:00Z`) });
    await addPlay(filler, wed, 1);
    // A play in the following week doesn't count.
    await addPlay(a, "2025-02-10", 99);

    const board = await periodBoard(weekRange(wed), null);
    const order = board.rows.map((r) => [r.userId, r.points, r.days, r.rank]);
    expect(order).toEqual([
      [b, 100, 2, 1], // same points as a, more days
      [a, 100, 1, 2],
      [d, 75, 1, 3], // same as c, finished earlier
      [c, 75, 1, 4],
      [filler, 0, 2, 5],
    ]);
  });

  it("uses Monday to Friday", () => {
    expect(weekRange("2025-02-05")).toEqual({ from: "2025-02-03", to: "2025-02-07" });
    expect(weekRange("2025-02-09")).toEqual({ from: "2025-02-03", to: "2025-02-07" });
  });
});

describe("terms", () => {
  it("maps dates to Waterloo terms", () => {
    expect(termOf("2026-01-01")).toEqual({ name: "Winter 2026", from: "2026-01-01", to: "2026-04-30" });
    expect(termOf("2026-04-30").name).toBe("Winter 2026");
    expect(termOf("2026-05-01").name).toBe("Spring 2026");
    expect(termOf("2026-08-31")).toEqual({ name: "Spring 2026", from: "2026-05-01", to: "2026-08-31" });
    expect(termOf("2026-09-01").name).toBe("Fall 2026");
    expect(termOf("2026-12-31")).toEqual({ name: "Fall 2026", from: "2026-09-01", to: "2026-12-31" });
  });

  it("only counts plays inside the term", async () => {
    const [a] = await players(1);
    await addPlay(a, "2024-08-30", 1); // Spring 2024
    await addPlay(a, "2024-09-02", 1); // Fall 2024
    await addPlay(a, "2024-12-31", 1); // Fall 2024
    await addPlay(a, "2025-01-02", 1); // Winter 2025
    const fall = await periodBoard(termOf("2024-10-15"), a);
    expect(fall.me).toMatchObject({ points: 200, days: 2 });
    const spring = await periodBoard(termOf("2024-06-01"), a);
    expect(spring.me).toMatchObject({ points: 100, days: 1 });
  });

  it("finds the latest game day", () => {
    expect(latestGameDay("2025-02-07")).toBe("2025-02-07"); // Fri
    expect(latestGameDay("2025-02-08")).toBe("2025-02-07"); // Sat
    expect(latestGameDay("2025-02-09")).toBe("2025-02-07"); // Sun
  });
});

describe("faculty board", () => {
  it("scales average points by participation", async () => {
    expect(facultyScore(80, 5)).toBe(40);
    expect(facultyScore(80, 10)).toBe(80);
    expect(facultyScore(80, 25)).toBe(80);
    expect(facultyScore(0, 0)).toBe(0);
  });

  it("ranks faculties and counts members and players", async () => {
    // A quiet past week used only by this test.
    const mon = "2023-03-06";
    const tue = "2023-03-07";
    const arts = await players(2, "arts");
    const eng = await players(12, "eng");
    await players(1, "sci"); // a member who never plays
    // Mon: arts take the top two spots, engineers spread below.
    for (let i = 0; i < eng.length; i++) await addPlay(eng[i], mon, i);
    await addPlay(arts[0], mon, 100);
    await addPlay(arts[1], mon, 50);
    // Tue: one engineer alone → 100.
    await addPlay(eng[0], tue, 3);

    const rows = await facultyBoard(weekRange(mon));
    expect(rows).toHaveLength(6);
    const byId = Object.fromEntries(rows.map((r) => [r.faculty, r]));

    // Mon has 14 plays (n-1 = 13): arts get 13/13 and 12/13 → 100, 92.
    expect(byId.arts).toMatchObject({ players: 2, plays: 2, avgPoints: 96 });
    expect(byId.arts.score).toBeCloseTo(19.2, 1);
    // eng Mon points: round(100*i/13) for i=0..11, plus Tue 100.
    const engPts = [...Array.from({ length: 12 }, (_, i) => Math.round((100 * i) / 13)), 100];
    const engAvg = engPts.reduce((s, p) => s + p, 0) / engPts.length;
    expect(byId.eng.players).toBe(12);
    expect(byId.eng.plays).toBe(13);
    expect(byId.eng.avgPoints).toBeCloseTo(engAvg, 1);
    expect(byId.eng.score).toBeCloseTo(engAvg, 1); // 12 players ≥ 10 → full weight
    expect(rows[0].faculty).toBe("eng");
    expect(rows[1].faculty).toBe("arts");
    // Members count everyone in the faculty, played or not, across all tests.
    expect(byId.sci.members).toBeGreaterThanOrEqual(1);
    expect(byId.sci).toMatchObject({ players: 0, plays: 0, score: 0 });
  });
});
