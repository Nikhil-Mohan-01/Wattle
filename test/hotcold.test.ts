import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { getPuzzle, getSnapshot, startPlay, submitMove } from "@/engine/engine";
import { GAME_MODULES } from "@/games/registry";
import { ANSWER_IDS, COUNTRIES, COUNTRY_BY_ID, normalizeName, resolveCountry } from "@/games/hotcold/countries";
import { distanceKm, hasShape } from "@/games/hotcold/geo";
import { hotcold, MAX_GUESSES, scoreFor, type HotColdPuzzle, type HotColdView } from "@/games/hotcold/server";
import { DATES, makePlayer } from "./helpers";

const today = DATES.thu;
const FRANCE = "250";
const GERMANY = "276";
const CANADA = "124";
const AUSTRALIA = "036";

beforeAll(() => {
  GAME_MODULES.hotcold = hotcold;
  process.env.WATTLE_DEV_DATE = today;
});

async function answerId() {
  return ((await getPuzzle(today)).data as HotColdPuzzle).answerId;
}

/** Some valid guess that isn't the answer and isn't in `avoid`. */
function wrongGuess(answer: string, avoid: string[] = []) {
  return COUNTRIES.find((c) => c.id !== answer && !avoid.includes(c.id))!;
}

describe("country list", () => {
  it("matches the 50m map, without Antarctica", () => {
    const topo = JSON.parse(readFileSync("node_modules/world-atlas/countries-50m.json", "utf8"));
    const mapIds = new Set<string>(
      topo.objects.countries.geometries.map((g: { id?: string }) => g.id).filter(Boolean),
    );
    mapIds.delete("010");
    expect(new Set(COUNTRIES.map((c) => c.id))).toEqual(mapIds);
    for (const id of ANSWER_IDS) expect(hasShape(id)).toBe(true);
    expect(ANSWER_IDS.length).toBeGreaterThan(150);
    expect(ANSWER_IDS).not.toContain("336"); // Vatican: too small
    expect(COUNTRY_BY_ID.has("010")).toBe(false);
  });

  it("resolves names and aliases, ignoring case and accents", () => {
    expect(resolveCountry("USA")).toBe("840");
    expect(resolveCountry("united states of america")).toBe("840");
    expect(resolveCountry("UK")).toBe("826");
    expect(resolveCountry("Czechia")).toBe("203");
    expect(resolveCountry("Czech Republic")).toBe("203");
    expect(resolveCountry("DRC")).toBe("180");
    expect(resolveCountry("Congo")).toBe("178");
    expect(resolveCountry("Ivory Coast")).toBe("384");
    expect(resolveCountry("cote d'ivoire")).toBe("384");
    expect(resolveCountry("  CÔTE D’IVOIRE ")).toBe("384");
    expect(resolveCountry("St. Lucia")).toBe("662");
    expect(resolveCountry("Russia")).toBe("643");
    expect(resolveCountry("türkiye")).toBe("792");
    expect(resolveCountry("the netherlands")).toBe("528");
    expect(resolveCountry("Atlantis")).toBeNull();
    expect(resolveCountry("Antarctica")).toBeNull();
    expect(normalizeName("São Tomé & Príncipe")).toBe("sao tome and principe");
  });

  it("gives every country a unique display name that resolves to itself", () => {
    expect(new Set(COUNTRIES.map((c) => c.name)).size).toBe(COUNTRIES.length);
    for (const c of COUNTRIES) expect(resolveCountry(c.name)).toBe(c.id);
  });
});

describe("distance", () => {
  it("is 0 for neighbours and symmetric", () => {
    expect(distanceKm(FRANCE, GERMANY)).toBe(0);
    expect(distanceKm(GERMANY, FRANCE)).toBe(0);
    expect(distanceKm("840", CANADA)).toBe(0);
    expect(distanceKm(CANADA, AUSTRALIA)).toBe(distanceKm(AUSTRALIA, CANADA));
  });

  it("is large for far-apart countries and plausible for near ones", () => {
    expect(distanceKm(CANADA, AUSTRALIA)).toBeGreaterThan(8000);
    const ukFrance = distanceKm("826", FRANCE); // across the Channel
    expect(ukFrance).toBeGreaterThan(10);
    expect(ukFrance).toBeLessThan(60);
    const japanKorea = distanceKm("392", "410");
    expect(japanKorea).toBeGreaterThan(30);
    expect(japanKorea).toBeLessThan(250);
  });

  it("ignores small far-away territories but keeps large or nearby parts", () => {
    // French Guiana would otherwise make France and Brazil neighbours.
    expect(distanceKm(FRANCE, "076")).toBeGreaterThan(5000);
    // Alaska is large, so the US still nearly touches Russia across the Bering Strait.
    expect(distanceKm("840", "643")).toBeLessThan(200);
    // Exclaves and islands near the main landmass still count.
    expect(distanceKm("643", "616")).toBe(0); // Russia–Poland via Kaliningrad
    expect(distanceKm("643", "440")).toBe(0); // Russia–Lithuania via Kaliningrad
    expect(distanceKm("643", "392")).toBeLessThan(100); // Russia–Japan via Sakhalin/Kurils
    // Nearby islands and coasts still count: Spain to Morocco is the Strait of Gibraltar.
    expect(distanceKm("724", "504")).toBeLessThan(50);
  });

  it("is fast enough per guess once shapes are cached", () => {
    const big = ["643", CANADA, "840", "076", "156", AUSTRALIA, "360", "304", "554", "032"];
    for (const id of big) distanceKm(id, FRANCE); // warm the cache
    for (const a of big) {
      for (const b of big) {
        const t = performance.now();
        distanceKm(a, b);
        expect(performance.now() - t).toBeLessThan(50);
      }
    }
  });
});

describe("parseMove", () => {
  it("accepts only well-formed moves", () => {
    expect(hotcold.parseMove({ country: " France " })).toEqual({ country: "France" });
    expect(hotcold.parseMove({ giveUp: true })).toEqual({ giveUp: true });
    for (const bad of [
      null,
      "France",
      [],
      {},
      { country: "" },
      { country: "   " },
      { country: 5 },
      { country: "x".repeat(81) },
      { giveUp: false },
      { giveUp: "true" },
      { country: "France", giveUp: true },
      { country: "France", extra: 1 },
    ]) {
      expect(hotcold.parseMove(bad)).toBeNull();
    }
  });
});

describe("scoring", () => {
  const solvedIn = (n: number) => ({
    guesses: Array.from({ length: n }, (_, i) => ({ id: String(i), km: 0 })),
    solved: true,
    gaveUp: false,
  });
  it("rewards fewer guesses and never goes below 1 when solved", () => {
    expect(scoreFor(solvedIn(1))).toBe(100);
    expect(scoreFor(solvedIn(2))).toBe(95);
    expect(scoreFor(solvedIn(10))).toBe(55);
    expect(scoreFor(solvedIn(40))).toBe(1);
    expect(scoreFor({ ...solvedIn(3), solved: false, gaveUp: true })).toBe(0);
  });
});

describe("plays", () => {
  it("hides the answer until done, and ignores bad or repeat guesses", async () => {
    const uid = await makePlayer();
    const answer = await answerId();
    expect(ANSWER_IDS).toContain(answer);

    const before = await getSnapshot(uid, today);
    expect(JSON.stringify(before)).not.toContain(answer);
    await startPlay(uid, today);

    const first = wrongGuess(answer);
    const s1 = await submitMove(uid, today, { country: first.name });
    const v1 = s1.view as HotColdView;
    expect(s1.status).toBe("playing");
    expect(v1.count).toBe(1);
    expect(v1.answer).toBeUndefined();
    expect(JSON.stringify(s1)).not.toContain(`"${answer}"`);
    expect(v1.guesses[0]).toMatchObject({ id: first.id, name: first.name, n: 1 });
    expect(v1.guesses[0].distanceKm).toBe(distanceKm(first.id, answer));

    await expect(submitMove(uid, today, { country: "Atlantis" })).rejects.toMatchObject({ code: "bad_move" });
    await expect(submitMove(uid, today, { country: first.name.toUpperCase() })).rejects.toMatchObject({
      code: "bad_move",
    });
    await expect(submitMove(uid, today, { country: 42 })).rejects.toMatchObject({ code: "bad_move" });
    expect(((await getSnapshot(uid, today)).view as HotColdView).count).toBe(1);

    const second = wrongGuess(answer, [first.id]);
    const s2 = await submitMove(uid, today, { country: second.name });
    const v2 = s2.view as HotColdView;
    expect(v2.count).toBe(2);
    expect(v2.latestId).toBe(second.id);
    expect(v2.guesses[0].distanceKm).toBeLessThanOrEqual(v2.guesses[1].distanceKm);
    expect(v2.closestKm).toBe(v2.guesses[0].distanceKm);

    const done = await submitMove(uid, today, { country: COUNTRY_BY_ID.get(answer)!.name });
    const vd = done.view as HotColdView;
    expect(done.status).toBe("done");
    expect(vd.solved).toBe(true);
    expect(vd.answer).toEqual({ id: answer, name: COUNTRY_BY_ID.get(answer)!.name });
    expect(done.rawScore).toBe(90);
    await expect(submitMove(uid, today, { country: "France" })).rejects.toMatchObject({ code: "already_done" });
  });

  it("ends with 0 when the player gives up", async () => {
    const uid = await makePlayer();
    const answer = await answerId();
    await startPlay(uid, today);
    await submitMove(uid, today, { country: wrongGuess(answer).name });
    const s = await submitMove(uid, today, { giveUp: true });
    expect(s.status).toBe("done");
    expect(s.rawScore).toBe(0);
    expect((s.view as HotColdView).gaveUp).toBe(true);
    expect((s.view as HotColdView).answer?.id).toBe(answer);
  });

  it("ends with 0 after the guess cap", async () => {
    const puzzle: HotColdPuzzle = { answerId: CANADA };
    let state = hotcold.initialState(puzzle, { now: 0 });
    const ctx = { now: 0, startedAt: 0, date: today };
    const wrong = COUNTRIES.filter((c) => c.id !== CANADA).slice(0, MAX_GUESSES);
    for (const [i, c] of wrong.entries()) {
      const out = await hotcold.applyMove(puzzle, state, { country: c.name }, ctx);
      if (!out.ok) throw new Error(out.error);
      state = out.state;
      expect(out.done).toBe(i === MAX_GUESSES - 1);
    }
    expect(await hotcold.score(puzzle, state, { date: today })).toBe(0);
    const after = await hotcold.applyMove(puzzle, state, { country: "Canada" }, ctx);
    expect(after.ok).toBe(false);
  });
});
