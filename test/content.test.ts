// Validates the puzzle banks (`npm run content:check`). Always checks the
// public examples; also checks content/private/ banks when they exist, and
// reports how much variety they give.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { expandBank } from "@/games/deepcut/bank";
import { validateContent } from "@/games/deepcut/server";
import { generateFromBank, validateQuadsBank } from "@/games/quads/bank";
import { validateQuadsContent } from "@/games/quads/server";
import { seededRng } from "@/lib/rng";

const read = (dir: string, file: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "content", dir, file), "utf8")) as unknown;
const hasPrivate = (file: string) => existsSync(path.join(process.cwd(), "content", "private", file));

for (const dir of ["examples", "private"] as const) {
  describe(`${dir} quads-bank.json`, () => {
    it.runIf(dir === "examples" || hasPrivate("quads-bank.json"))("is valid and generates good boards", () => {
      const bank = validateQuadsBank(read(dir, "quads-bank.json"));
      const boards = new Set<string>();
      let recent: string[] = [];
      for (let day = 0; day < 200; day++) {
        const p = generateFromBank(bank, seededRng("check", String(day)), recent);
        validateQuadsContent([p]);
        boards.add(p.id);
        recent = [p.id, ...recent];
      }
      const byDifficulty = [1, 2, 3, 4].map((d) => bank.categories.filter((c) => c.difficulty === d).length);
      console.log(
        `[content] ${dir} quads: ${bank.categories.length} categories (by difficulty ${byDifficulty.join("/")}), ` +
          `${boards.size} distinct boards in 200 days`,
      );
      expect(boards.size).toBeGreaterThan(dir === "examples" ? 20 : 190);
    });
  });

  describe(`${dir} deepcut-bank.json`, () => {
    it.runIf(dir === "examples" || hasPrivate("deepcut-bank.json"))("expands to enough prompts", () => {
      const { prompts, skipped } = expandBank(read(dir, "deepcut-bank.json"), (p) => validateContent([p], 1)[0]);
      const weeks = Math.floor(prompts.length / 7);
      console.log(`[content] ${dir} deepcut: ${prompts.length} prompts (~${weeks} weeks), ${skipped.length} skipped`);
      expect(prompts.length).toBeGreaterThanOrEqual(dir === "examples" ? 7 : 300);
    });
  });
}
