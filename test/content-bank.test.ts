import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { play, user } from "@/db/schema";
import { applyLearnedTiers, expandBank, tierForShare, LEARN_MIN_ANSWERS } from "@/games/deepcut/bank";
import { answerCounts, validateContent } from "@/games/deepcut/server";
import { generateFromBank, recentCategoryIds, validateQuadsBank } from "@/games/quads/bank";
import { clearContentCache, contentSource, loadContent, setContentRootForTests } from "@/lib/content";
import { decryptContent, encryptContent, generateContentKey, parseContentKey } from "@/lib/content-crypto";
import { seededRng } from "@/lib/rng";
import exampleQuadsBank from "../content/examples/quads-bank.json";

afterEach(() => {
  vi.unstubAllEnvs();
  setContentRootForTests(null);
  clearContentCache();
});

describe("content encryption", () => {
  const key = parseContentKey(generateContentKey())!;

  it("round-trips and rejects a wrong key, a renamed file or tampering", () => {
    const enc = encryptContent('{"a":1}', "quads-bank.json", key);
    expect(enc).not.toContain('"a"');
    expect(decryptContent(enc, "quads-bank.json", key)).toBe('{"a":1}');
    const other = parseContentKey(generateContentKey())!;
    expect(() => decryptContent(enc, "quads-bank.json", other)).toThrow();
    expect(() => decryptContent(enc, "deepcut-bank.json", key)).toThrow();
    const env = JSON.parse(enc);
    env.data = Buffer.from("x" + Buffer.from(env.data, "base64").toString("latin1"), "latin1").toString("base64");
    expect(() => decryptContent(JSON.stringify(env), "quads-bank.json", key)).toThrow();
  });

  it("accepts only 32-byte base64 keys", () => {
    expect(parseContentKey(undefined)).toBeNull();
    expect(parseContentKey("short")).toBeNull();
    expect(parseContentKey(generateContentKey())).not.toBeNull();
  });

  it("loads private, then encrypted, then example content", () => {
    const root = mkdtempSync(path.join(tmpdir(), "wattle-content-"));
    for (const dir of ["private", "encrypted", "examples"]) mkdirSync(path.join(root, "content", dir), { recursive: true });
    const k = generateContentKey();
    setContentRootForTests(root);
    vi.stubEnv("CONTENT_KEY", k);
    const file = "x.json";
    writeFileSync(path.join(root, "content", "examples", file), '{"from":"examples"}');
    expect(loadContent<{ from: string }>(file).from).toBe("examples");

    clearContentCache();
    writeFileSync(path.join(root, "content", "encrypted", `${file}.enc`), encryptContent('{"from":"encrypted"}', file, parseContentKey(k)!));
    expect(contentSource(file)).toBe("encrypted");
    expect(loadContent<{ from: string }>(file).from).toBe("encrypted");

    clearContentCache();
    vi.stubEnv("CONTENT_KEY", "");
    expect(() => loadContent(file)).toThrow(/CONTENT_KEY/);

    clearContentCache();
    writeFileSync(path.join(root, "content", "private", file), '{"from":"private"}');
    expect(loadContent<{ from: string }>(file).from).toBe("private");
  });
});

describe("Quads generator", () => {
  const bank = validateQuadsBank(exampleQuadsBank);

  it("builds unambiguous boards: one group per difficulty, distinct families, unique words", () => {
    const byName = new Map(bank.categories.map((c) => [c.name, c]));
    for (let seed = 0; seed < 300; seed++) {
      const p = generateFromBank(bank, seededRng("quads", String(seed)), []);
      expect(p.groups.map((g) => g.difficulty)).toEqual([1, 2, 3, 4]);
      const cats = p.groups.map((g) => byName.get(g.category)!);
      expect(new Set(cats.map((c) => c.family)).size).toBe(4);
      const words = p.groups.flatMap((g) => g.words);
      expect(new Set(words).size).toBe(16);
      for (const g of p.groups) {
        const cat = byName.get(g.category)!;
        for (const w of g.words) {
          expect(cat.words).toContain(w);
          // No word could also belong to another group on the board.
          for (const other of cats) if (other !== cat) expect(other.words).not.toContain(w);
        }
      }
    }
  });

  it("is deterministic per seed and avoids recent categories", () => {
    const a = generateFromBank(bank, seededRng("q", "1"), []);
    const b = generateFromBank(bank, seededRng("q", "1"), []);
    expect(a).toEqual(b);
    const recent = recentCategoryIds([a.id]);
    expect(recent.size).toBe(4);
    const c = generateFromBank(bank, seededRng("q", "2"), [a.id]);
    for (const id of c.id.slice(3).split("+")) expect(recent.has(id)).toBe(false);
  });

  it("rejects malformed banks", () => {
    expect(() => validateQuadsBank({ categories: [{ id: "x", name: "X", difficulty: 5, family: "f", words: [] }] })).toThrow();
    expect(() =>
      validateQuadsBank({ categories: [{ id: "x", name: "X", difficulty: 1, family: "f", words: ["a", "b", "c", "d", "e", "f"] }] }),
    ).toThrow(/UPPERCASE/);
  });
});

describe("Deep Cut bank", () => {
  const validate = (p: unknown) => validateContent([p], 1)[0];
  const item = (name: string, tier: number, attrs: Record<string, string | string[]> = {}) => ({ name, tier, attrs });
  const animals = [
    item("Lion", 1, { class: "mammal" }), item("Tiger", 1, { class: "mammal" }), item("Lemur", 3, { class: "mammal" }),
    item("Lynx", 4, { class: "mammal" }), item("Llama", 2, { class: "mammal" }), item("Loris", 5, { class: "mammal" }),
    item("Eagle", 1, { class: "bird" }), item("Emu", 2, { class: "bird" }),
    item("Leopard", 2, { class: ["mammal", "big-cat"] }),
  ];

  it("expands attribute, value, letter and whole-dataset templates", () => {
    const { prompts, skipped } = expandBank(
      {
        datasets: { animals },
        templates: [
          { id: "animal-class", dataset: "animals", prompt: "Name a {value}", attr: "class" },
          { id: "mammals", dataset: "animals", prompt: "Name a mammal", attr: "class", value: "mammal" },
          { id: "animal-letter", dataset: "animals", prompt: "Name an animal starting with {letter}", letter: true },
          { id: "animals", dataset: "animals", prompt: "Name an animal" },
        ],
      },
      validate,
    );
    const ids = prompts.map((p) => p.id).sort();
    // Birds (2 answers), big cats (1) and letters other than L are too small.
    expect(ids).toEqual(["animal-class-mammal", "animal-letter-l", "animals", "mammals"]);
    expect(prompts.find((p) => p.id === "animal-letter-l")!.prompt).toBe("Name an animal starting with L");
    expect(skipped.some((s) => s.startsWith("animal-class-bird"))).toBe(true);
  });

  it("re-tiers answers from real answer shares once enough students answered", () => {
    expect(tierForShare(0.5)).toBe(1);
    expect(tierForShare(0.1)).toBe(2);
    expect(tierForShare(0.05)).toBe(3);
    expect(tierForShare(0.015)).toBe(4);
    expect(tierForShare(0.001)).toBe(5);
    const prompt = validate({ id: "p", prompt: "Name one", answers: [{ text: "A", tier: 5 }, { text: "B", tier: 1 }, { text: "C", tier: 1 }] });
    expect(applyLearnedTiers(prompt, new Map([["A", LEARN_MIN_ANSWERS - 1]]))).toBe(prompt);
    const learned = applyLearnedTiers(prompt, new Map([["A", 90], ["B", 10]]));
    expect(learned.answers.map((a) => a.tier)).toEqual([1, 2, 5]);
  });

  it("counts real answers from finished, unflagged plays", async () => {
    const uid = randomUUID();
    await db.insert(user).values({ id: uid, name: "x", email: `${uid}@x.ca`, emailVerified: true });
    const addPlay = async (answers: string[], flags: string[] | null = null) =>
      db.insert(play).values({
        id: randomUUID(), userId: (await mkUser()), date: "2031-04-07", gameId: "deepcut", status: "done",
        state: { results: answers.map((a) => ({ promptId: "count-me", outcome: "correct", answer: a })) },
        rawScore: 1, flags, startedAt: new Date(), finishedAt: new Date(),
      });
    const mkUser = async () => {
      const id = randomUUID();
      await db.insert(user).values({ id, name: "x", email: `${id}@x.ca`, emailVerified: true });
      return id;
    };
    await addPlay(["Ontario"]);
    await addPlay(["Ontario"]);
    await addPlay(["Yukon"]);
    await addPlay(["Nunavut"], ["too_fast"]); // flagged: ignored
    const counts = await answerCounts(["count-me"]);
    expect(Object.fromEntries(counts.get("count-me")!)).toEqual({ Ontario: 2, Yukon: 1 });
  });
});
