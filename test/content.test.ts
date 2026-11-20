// Validates puzzle content files. Runs on the committed examples always, and
// on content/private/ files when they exist (`npm run content:check`).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateContent as validateDeepCut } from "@/games/deepcut/server";
import { validateQuadsContent } from "@/games/quads/server";

const FILES = [
  { file: "quads.json", validate: validateQuadsContent, perWeek: 1, unit: "puzzles" },
  { file: "deepcut.json", validate: validateDeepCut, perWeek: 7, unit: "prompts" },
] as const;

const read = (dir: string, file: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "content", dir, file), "utf8")) as unknown;

for (const { file, validate, perWeek, unit } of FILES) {
  describe(file, () => {
    it("example content is valid", () => {
      expect(validate(read("examples", file)).length).toBeGreaterThan(0);
    });

    const priv = path.join(process.cwd(), "content", "private", file);
    it.runIf(existsSync(priv))("private content is valid and not just the public examples", () => {
      const items = validate(read("private", file)) as { id: string }[];
      const weeks = Math.floor(items.length / perWeek);
      console.log(`[content] ${file}: ${items.length} ${unit} ≈ ${weeks} weeks before repeats`);

      // Puzzles copied from the public examples (even with a new id) would
      // have public answers.
      const body = (item: { id: string }) => JSON.stringify({ ...item, id: undefined });
      const examples = new Set((validate(read("examples", file)) as { id: string }[]).map(body));
      const leaked = items.filter((item) => examples.has(body(item)));
      expect(leaked.map((i) => i.id), "copied from public examples").toEqual([]);
    });
  });
}
