import { beforeAll, describe, expect, it } from "vitest";
import { getPuzzle, getSnapshot, startPlay, submitMove } from "@/engine/engine";
import { deepcut, recentPromptIds, validateContent, type DeepCutPuzzle, type DeepCutState } from "@/games/deepcut/server";
import { answerKey, editDistance, matchAnswer, normalise, type DeepCutAnswer } from "@/games/deepcut/match";
import { GRACE_MS, MAX_ATTEMPTS, PROMPT_COUNT, TIME_LIMIT_MS, type DeepCutMove, type DeepCutView } from "@/games/deepcut/types";
import { GAME_MODULES } from "@/games/registry";
import { loadContent } from "@/lib/content";
import { seededRng } from "@/lib/rng";
import { DATES, makePlayer } from "./helpers";

const T0 = 1_800_000_000_000;
const ctxAt = (now: number) => ({ now, startedAt: T0, date: DATES.mon });

async function generate(seed = "a", recentlyUsed: string[] = []) {
  return (await deepcut.generate({ rng: seededRng("test", seed), date: DATES.mon, recentlyUsed })).puzzle;
}

/** Applies a move, failing the test if the server rejects it. */
async function apply(p: DeepCutPuzzle, s: DeepCutState, m: DeepCutMove, now: number) {
  const out = await deepcut.applyMove(p, s, m, ctxAt(now));
  if (!out.ok) throw new Error(out.error);
  return out;
}

async function begun(p: DeepCutPuzzle, now = T0) {
  return (await apply(p, deepcut.initialState(p, { now }), { type: "begin" }, now)).state;
}

/** A guess that's definitely not on the list. */
const WRONG = (i: number) => `zzqx wrong ${i}`;

describe("normalise & matching", () => {
  const answers: DeepCutAnswer[] = [
    { text: "Prince Edward Island", aliases: ["PEI"], tier: 4 },
    { text: "Québec", tier: 1 },
    { text: "The Tragically Hip", aliases: ["The Hip"], tier: 3 },
    { text: "C++", tier: 1 },
    { text: "C", tier: 2 },
    { text: "C#", tier: 2 },
    { text: "Dinar", tier: 4 },
    { text: "Denar", tier: 5 },
    { text: "Saskatchewan", tier: 3 },
    { text: "Mars", tier: 1 },
  ];

  it("normalises case, accents, punctuation, spaces and a leading 'the'", () => {
    expect(normalise("  The  Québec!! ")).toBe("quebec");
    expect(normalise("St. John's")).toBe("st johns");
    expect(normalise("Romeo & Juliet")).toBe("romeo and juliet");
    expect(answerKey("Prince-Edward   Island")).toBe("princeedwardisland");
    expect(normalise("Theodore")).toBe("theodore");
  });

  it("matches text and aliases exactly", () => {
    expect(matchAnswer("pei", answers)).toBe(0);
    expect(matchAnswer("quebec", answers)).toBe(1);
    expect(matchAnswer("hip", answers)).toBe(2);
    expect(matchAnswer("tragically hip", answers)).toBe(2);
    expect(matchAnswer("c++", answers)).toBe(3);
    expect(matchAnswer("c", answers)).toBe(4);
    expect(matchAnswer("C#", answers)).toBe(5);
  });

  it("allows small typos depending on length", () => {
    expect(editDistance("ab", "ba")).toBe(1);
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(matchAnswer("saskatchewn", answers)).toBe(8); // 1 typo, long word
    expect(matchAnswer("saskachewn", answers)).toBe(8); // 2 typos, length ≥ 9
    expect(matchAnswer("sakschewn", answers)).toBeNull(); // too many
    expect(matchAnswer("Quebce", answers)).toBe(1); // transposition, length 6
    expect(matchAnswer("Mras", answers)).toBeNull(); // length 4: exact only
    expect(matchAnswer("prince edwerd island", answers)).toBe(0);
  });

  it("rejects ambiguous typos and junk", () => {
    expect(matchAnswer("Dunar", answers)).toBeNull(); // 1 away from Dinar and Denar
    expect(matchAnswer("dinar", answers)).toBe(6);
    expect(matchAnswer("", answers)).toBeNull();
    expect(matchAnswer("!!!", answers)).toBeNull();
    expect(matchAnswer("the", answers)).toBeNull();
    expect(matchAnswer("x".repeat(61), answers)).toBeNull();
  });
});

describe("content", () => {
  it("example content is valid and big enough", () => {
    const prompts = validateContent(loadContent("deepcut.json"));
    expect(prompts.length).toBeGreaterThanOrEqual(40);
    for (const p of prompts) expect(p.answers.length).toBeGreaterThanOrEqual(4);
  });

  it("rejects bad content", () => {
    const ok = { id: "x", prompt: "Name a thing", answers: [1, 2, 3].map((t) => ({ text: `a${t}`, tier: t })) };
    const many = (extra: object) => [extra, ...Array.from({ length: 7 }, (_, i) => ({ ...ok, id: `ok${i}` }))];
    expect(() => validateContent(many(ok))).not.toThrow();
    expect(() => validateContent("nope")).toThrow();
    expect(() => validateContent([ok])).toThrow(/at least/);
    expect(() => validateContent(many({ ...ok, id: "a,b" }))).toThrow(/id/);
    expect(() => validateContent(many({ ...ok, id: "ok1" }))).toThrow(/duplicate/);
    expect(() => validateContent(many({ ...ok, answers: [...ok.answers, { text: "A1!", tier: 2 }] }))).toThrow(/share/);
    expect(() => validateContent(many({ ...ok, answers: [...ok.answers, { text: "z", tier: 6 }] }))).toThrow(/tier/);
    expect(() => validateContent(many({ ...ok, answers: [...ok.answers, { text: "z", tier: 1, aliases: [""] }] }))).toThrow(/aliases/);
  });
});

describe("generate", () => {
  it("picks 7 distinct prompts with a sorted content id", async () => {
    const out = await deepcut.generate({ rng: seededRng("g"), date: DATES.mon, recentlyUsed: [] });
    const ids = out.puzzle.prompts.map((p) => p.id);
    expect(new Set(ids).size).toBe(PROMPT_COUNT);
    expect(out.contentId).toBe([...ids].sort().join(","));
  });

  it("avoids recently used prompts", async () => {
    const recent: string[] = [];
    const seen = new Set<string>();
    for (let day = 0; day < 6; day++) {
      const out = await deepcut.generate({ rng: seededRng("g", String(day)), date: DATES.mon, recentlyUsed: recent });
      for (const p of out.puzzle.prompts) {
        expect(seen.has(p.id)).toBe(false);
        seen.add(p.id);
      }
      recent.unshift(out.contentId);
    }
    expect(recentPromptIds(["a,b", "c"])).toEqual(["a", "b", "c"]);
  });
});

describe("play", () => {
  it("hides prompts before begin, and answers until done", async () => {
    const p = await generate();
    const fresh = deepcut.initialState(p, { now: T0 });
    const v0 = await deepcut.view(p, fresh, { done: false, now: T0, date: DATES.mon });
    expect(v0.phase).toBe("ready");
    expect(v0.current).toBeNull();
    for (const q of p.prompts) expect(JSON.stringify(v0)).not.toContain(q.prompt);

    let s = await begun(p);
    s = (await apply(p, s, { type: "answer", text: p.prompts[0].answers[0].text }, T0 + 1000)).state;
    const v1 = await deepcut.view(p, s, { done: false, now: T0 + 1000, date: DATES.mon });
    expect(v1.current?.prompt).toBe(p.prompts[1].prompt);
    expect(v1.reveal).toBeNull();
    const json = JSON.stringify(v1);
    // Current and future prompts: no answers, no prompt text beyond the current one.
    for (const q of p.prompts.slice(1)) {
      for (const a of q.answers) expect(json).not.toContain(`"${a.text}"`);
    }
    for (const q of p.prompts.slice(2)) expect(json).not.toContain(q.prompt);
  });

  it("scores by tier and finishes after 7 prompts", async () => {
    const p = await generate("score");
    let s = await begun(p);
    let expected = 0;
    let now = T0;
    for (let i = 0; i < PROMPT_COUNT; i++) {
      // Pick the rarest answer on even prompts, skip odd ones.
      now += 2000;
      if (i % 2 === 0) {
        const a = [...p.prompts[i].answers].sort((x, y) => y.tier - x.tier)[0];
        expected += [0, 10, 25, 50, 75, 100][a.tier];
        const out = await apply(p, s, { type: "answer", text: a.text }, now);
        s = out.state;
        expect(out.done).toBe(i === PROMPT_COUNT - 1);
      } else {
        s = (await apply(p, s, { type: "timeout" }, now)).state;
      }
    }
    expect(await deepcut.score(p, s, { date: DATES.mon })).toBe(expected);
    expect(s.results.filter((r) => r.outcome === "correct").every((r) => typeof r.answer === "string")).toBe(true);
    const v = await deepcut.view(p, s, { done: true, now, date: DATES.mon });
    expect(v.phase).toBe("done");
    expect(v.reveal).toHaveLength(PROMPT_COUNT);
    expect(v.total).toBe(expected);
  });

  it("enforces the timer on the server", async () => {
    const p = await generate("timer");
    const s = await begun(p);
    const right = p.prompts[0].answers[0].text;

    // Just inside the grace window: counts.
    const inTime = await apply(p, s, { type: "answer", text: right }, T0 + TIME_LIMIT_MS + GRACE_MS);
    expect(inTime.state.results[0].outcome).toBe("correct");

    // Just after: a correct answer still scores 0.
    const late = await apply(p, s, { type: "answer", text: right }, T0 + TIME_LIMIT_MS + GRACE_MS + 1);
    expect(late.state.results[0]).toMatchObject({ outcome: "timeout", points: 0 });

    // The next prompt's clock starts when the previous one ended.
    const t1 = T0 + 5000;
    const s1 = (await apply(p, s, { type: "answer", text: right }, t1)).state;
    expect(s1.activeSince).toBe(t1);
    const v = await deepcut.view(p, s1, { done: false, now: t1, date: DATES.mon });
    expect(v.current?.deadline).toBe(t1 + TIME_LIMIT_MS);
    const late2 = await apply(p, s1, { type: "answer", text: p.prompts[1].answers[0].text }, t1 + 30_000);
    expect(late2.state.results[1].outcome).toBe("timeout");
  });

  it("allows retries up to the attempt cap", async () => {
    const p = await generate("cap");
    let s = await begun(p);
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      s = (await apply(p, s, { type: "answer", text: WRONG(i) }, T0 + 100 * (i + 1))).state;
      expect(s.index).toBe(0);
    }
    // Repeating a wrong guess doesn't use a try.
    const repeat = await deepcut.applyMove(p, s, { type: "answer", text: WRONG(0) }, ctxAt(T0 + 900));
    expect(repeat.ok).toBe(false);
    // Eighth wrong try ends the prompt.
    const last = await apply(p, s, { type: "answer", text: WRONG(99) }, T0 + 1000);
    expect(last.state.index).toBe(1);
    expect(last.state.results[0]).toMatchObject({ outcome: "out_of_attempts", points: 0, attempts: MAX_ATTEMPTS });
    // A right answer on the last try still counts.
    const saved = await apply(p, s, { type: "answer", text: p.prompts[0].answers[0].text }, T0 + 1000);
    expect(saved.state.results[0].outcome).toBe("correct");
  });

  it("rejects moves before begin, double begin and bad shapes", async () => {
    const p = await generate();
    const fresh = deepcut.initialState(p, { now: T0 });
    expect((await deepcut.applyMove(p, fresh, { type: "timeout" }, ctxAt(T0))).ok).toBe(false);
    const s = await begun(p);
    expect((await deepcut.applyMove(p, s, { type: "begin" }, ctxAt(T0 + 1))).ok).toBe(false);

    expect(deepcut.parseMove({ type: "answer", text: "x".repeat(61) })).toBeNull();
    expect(deepcut.parseMove({ type: "answer", text: "   " })).toBeNull();
    expect(deepcut.parseMove({ type: "answer", text: 5 })).toBeNull();
    expect(deepcut.parseMove({ type: "answer", text: "a\u0000b" })).toBeNull();
    expect(deepcut.parseMove({ type: "skip" })).toBeNull();
    expect(deepcut.parseMove(null)).toBeNull();
    expect(deepcut.parseMove(["answer"])).toBeNull();
    expect(deepcut.parseMove({ type: "answer", text: " Mars " })).toEqual({ type: "answer", text: "Mars" });
    expect(deepcut.parseMove({ type: "timeout", at: 5 })).toEqual({ type: "timeout" });
  });
});

describe("through the engine", () => {
  beforeAll(() => {
    GAME_MODULES.deepcut = deepcut;
    process.env.WATTLE_DEV_DATE = DATES.mon;
  });

  it("plays a full game with answers hidden until done", async () => {
    const uid = await makePlayer();
    const p = (await getPuzzle(DATES.mon)).data as DeepCutPuzzle;
    const before = await getSnapshot(uid, DATES.mon);
    expect(JSON.stringify(before)).not.toContain(p.prompts[0].prompt);

    await startPlay(uid, DATES.mon);
    let snap = await submitMove(uid, DATES.mon, { type: "begin" });
    expect((snap.view as DeepCutView).current?.prompt).toBe(p.prompts[0].prompt);
    for (const a of p.prompts[0].answers) expect(JSON.stringify(snap.view)).not.toContain(`"${a.text}"`);

    for (let i = 0; i < PROMPT_COUNT; i++) {
      snap = await submitMove(uid, DATES.mon, { type: "answer", text: p.prompts[i].answers[0].text });
    }
    expect(snap.status).toBe("done");
    const expected = p.prompts.reduce((sum, q) => sum + [0, 10, 25, 50, 75, 100][q.answers[0].tier], 0);
    expect(snap.rawScore).toBe(expected);
  });
});
