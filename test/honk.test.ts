import { beforeAll, describe, expect, it } from "vitest";
import { getPuzzle, getSnapshot, startPlay, submitMove } from "@/engine/engine";
import { ANSWERS } from "@/games/honk/answers";
import { markGuess, type HonkView } from "@/games/honk/feedback";
import { allowedGuesses, honk, type HonkPuzzle, type HonkState } from "@/games/honk/server";
import { GAME_MODULES } from "@/games/registry";
import { seededRng } from "@/lib/rng";
import { DATES, makePlayer } from "./helpers";

const today = DATES.tue;
const ctx = { now: 0, startedAt: 0, date: today };

/** Compact form: G = correct, Y = present, . = absent. */
const marks = (guess: string, answer: string) =>
  markGuess(guess, answer)
    .map((m) => (m === "correct" ? "G" : m === "present" ? "Y" : "."))
    .join("");

/** Any valid word that isn't the answer. */
function wrongWord(answer: string): string {
  return ANSWERS.find((w) => w !== answer)!;
}

beforeAll(() => {
  GAME_MODULES.honk = honk;
  process.env.WATTLE_DEV_DATE = today;
});

describe("feedback", () => {
  it("marks exact, misplaced and missing letters", () => {
    expect(marks("crane", "crane")).toBe("GGGGG");
    expect(marks("nacre", "crane")).toBe("YYYYG");
    expect(marks("fight", "crane")).toBe(".....");
  });

  it("limits duplicate letters to how many the answer has", () => {
    // Answer LEVEL has two Es and two Ls.
    expect(marks("eerie", "level")).toBe("YG...");
    expect(marks("hello", "level")).toBe(".GYY.");
    expect(marks("level", "level")).toBe("GGGGG");
    expect(marks("lolly", "level")).toBe("G.Y..");
    // Answer SPEED: two Es, adjacent.
    expect(marks("eerie", "speed")).toBe("YY...");
    expect(marks("geese", "speed")).toBe(".YGY.");
    expect(marks("erase", "speed")).toBe("Y..YY");
    expect(marks("sheep", "speed")).toBe("G.GGY");
    expect(marks("speed", "abide")).toBe("..Y.Y");
    // An exact match claims a letter before an earlier misplaced copy can.
    expect(marks("geese", "those")).toBe("...GG");
  });
});

/** Independent reference implementation for cross-checking. */
function markString(guess: string, answer: string): string {
  const out = Array<string>(5).fill(".");
  const pool = answer.split("");
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) {
      out[i] = "G";
      pool[i] = "";
    }
  }
  for (let i = 0; i < 5; i++) {
    if (out[i] === "G") continue;
    const j = pool.indexOf(guess[i]);
    if (j !== -1) {
      out[i] = "Y";
      pool[j] = "";
    }
  }
  return out.join("");
}

describe("feedback matches a reference implementation", () => {
  it("agrees on random pairs", () => {
    const rng = seededRng("honk-test");
    for (let k = 0; k < 2000; k++) {
      const a = rng.pick(ANSWERS);
      const g = rng.pick(ANSWERS);
      expect(marks(g, a)).toBe(markString(g, a));
    }
  });
});

describe("word lists", () => {
  it("answers are unique five-letter lowercase words and all valid guesses", () => {
    expect(ANSWERS.length).toBeGreaterThanOrEqual(400);
    expect(new Set(ANSWERS).size).toBe(ANSWERS.length);
    const allowed = allowedGuesses();
    for (const w of ANSWERS) {
      expect(w).toMatch(/^[a-z]{5}$/);
      expect(allowed.has(w)).toBe(true);
    }
    expect(allowed.size).toBeGreaterThan(5000);
  });

  it("doesn't repeat recent answers", () => {
    const used = ANSWERS.slice(0, ANSWERS.length - 1);
    const { contentId, puzzle } = honk.generate({ rng: seededRng("x"), date: today, recentlyUsed: used }) as {
      contentId: string;
      puzzle: HonkPuzzle;
    };
    expect(contentId).toBe(ANSWERS[ANSWERS.length - 1]);
    expect(puzzle.answer).toBe(contentId);
  });
});

describe("module rules", () => {
  const puzzle: HonkPuzzle = { answer: "level" };

  it("parses only well-shaped moves", () => {
    expect(honk.parseMove({ guess: "Hello" })).toEqual({ guess: "hello" });
    expect(honk.parseMove({ guess: 12345 })).toBeNull();
    expect(honk.parseMove({ guess: "x".repeat(100) })).toBeNull();
    expect(honk.parseMove({ guess: "hello", extra: 1 })).toBeNull();
    expect(honk.parseMove(["hello"])).toBeNull();
    expect(honk.parseMove(null)).toBeNull();
  });

  it("rejects invalid words without using a guess", async () => {
    const s: HonkState = { guesses: [] };
    for (const guess of ["abcde", "hell", "hellos", "hél1o"]) {
      const out = await honk.applyMove(puzzle, s, { guess }, ctx);
      expect(out.ok).toBe(false);
    }
    expect(s.guesses).toHaveLength(0);
  });

  it("allows at most six guesses and scores 7 - guesses", async () => {
    let s: HonkState = honk.initialState(puzzle, { now: 0 });
    for (let i = 0; i < 6; i++) {
      const out = await honk.applyMove(puzzle, s, { guess: "crane" }, ctx);
      if (!out.ok) throw new Error(out.error);
      s = out.state;
      expect(out.done).toBe(i === 5);
    }
    expect(await honk.applyMove(puzzle, s, { guess: "level" }, ctx)).toMatchObject({ ok: false });
    expect(await honk.score(puzzle, s, { date: today })).toBe(0);

    expect(await honk.score(puzzle, { guesses: ["level"] }, { date: today })).toBe(6);
    expect(await honk.score(puzzle, { guesses: ["crane", "crane", "level"] }, { date: today })).toBe(4);
    expect(await honk.score(puzzle, { guesses: [...Array(5).fill("crane"), "level"] }, { date: today })).toBe(1);
  });

  it("ends the game when solved", async () => {
    const out = await honk.applyMove(puzzle, { guesses: ["crane"] }, { guess: "level" }, ctx);
    expect(out).toMatchObject({ ok: true, done: true });
  });
});

describe("through the engine", () => {
  it("hides the answer until done, then reveals it", async () => {
    const uid = await makePlayer();
    const { answer } = (await getPuzzle(today)).data as HonkPuzzle;

    const fresh = await getSnapshot(uid, today);
    expect(JSON.stringify(fresh)).not.toContain(answer);

    await startPlay(uid, today);
    const wrong = wrongWord(answer);
    const mid = await submitMove(uid, today, { guess: wrong });
    expect(mid.status).toBe("playing");
    const v = mid.view as HonkView;
    expect(v.rows).toHaveLength(1);
    expect(v.answer).toBeUndefined();
    expect(JSON.stringify(mid)).not.toContain(answer);

    // Invalid word: friendly error, no guess consumed.
    await expect(submitMove(uid, today, { guess: "zzzzz" })).rejects.toMatchObject({ code: "bad_move" });
    expect(((await getSnapshot(uid, today)).view as HonkView).rows).toHaveLength(1);

    const done = await submitMove(uid, today, { guess: answer });
    expect(done.status).toBe("done");
    expect(done.rawScore).toBe(5);
    expect((done.view as HonkView).answer).toBe(answer);
    expect((done.view as HonkView).solved).toBe(true);
  });

  it("finishes with score 0 after six misses", async () => {
    const uid = await makePlayer();
    const { answer } = (await getPuzzle(today)).data as HonkPuzzle;
    await startPlay(uid, today);
    const wrong = wrongWord(answer);
    let snap = await getSnapshot(uid, today);
    for (let i = 0; i < 6; i++) snap = await submitMove(uid, today, { guess: wrong });
    expect(snap.status).toBe("done");
    expect(snap.rawScore).toBe(0);
    expect((snap.view as HonkView).solved).toBe(false);
    await expect(submitMove(uid, today, { guess: answer })).rejects.toMatchObject({ code: "already_done" });
  });
});
