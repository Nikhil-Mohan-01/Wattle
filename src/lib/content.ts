import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Loads a game's content file. Real puzzles live in content/private/ (never
 * committed, so the answers aren't public on GitHub). Without a private file,
 * the committed examples in content/examples/ are used, which is fine for
 * local development only.
 */
export function loadContent<T>(file: string): T {
  const root = process.cwd();
  const priv = path.join(root, "content", "private", file);
  const example = path.join(root, "content", "examples", file);
  const chosen = existsSync(priv) ? priv : example;
  if (chosen === example && process.env.NODE_ENV === "production") {
    console.warn(`[content] Using public example content for ${file}. Add content/private/${file}.`);
  }
  return JSON.parse(readFileSync(chosen, "utf8")) as T;
}
