import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { decryptContent, parseContentKey } from "./content-crypto";

/**
 * Where a content file comes from, in order:
 * 1. content/private/<file>: plain JSON, gitignored. For editing locally.
 * 2. content/encrypted/<file>.enc: committed, AES-256-GCM encrypted with
 *    CONTENT_KEY, so the repo never reveals answers. This is what runs in
 *    production.
 * 3. content/examples/<file>: small public samples for development and tests.
 */
export type ContentSource = "private" | "encrypted" | "examples";

// Static paths so the build only traces content/, not the whole project.
// Tests can point the loader elsewhere with setContentRootForTests.
let testRoot: string | null = null;
export function setContentRootForTests(dir: string | null) {
  testRoot = dir;
}
const paths = (file: string) =>
  testRoot
    ? {
        private: path.join(testRoot, "content", "private", file),
        encrypted: path.join(testRoot, "content", "encrypted", `${file}.enc`),
        examples: path.join(testRoot, "content", "examples", file),
      }
    : {
        private: path.join(process.cwd(), "content", "private", file),
        encrypted: path.join(process.cwd(), "content", "encrypted", `${file}.enc`),
        examples: path.join(process.cwd(), "content", "examples", file),
      };

/** Which source loadContent would use for this file, or null if none exists. */
export function contentSource(file: string): ContentSource | null {
  const p = paths(file);
  if (existsSync(p.private)) return "private";
  if (existsSync(p.encrypted)) return "encrypted";
  if (existsSync(p.examples)) return "examples";
  return null;
}

const cache = new Map<string, unknown>();

/** Forgets loaded content (tests). */
export function clearContentCache() {
  cache.clear();
}

/** Loads and parses a content file. Throws if none exists or decryption fails. */
export function loadContent<T>(file: string): T {
  if (cache.has(file)) return cache.get(file) as T;
  const source = contentSource(file);
  if (!source) throw new Error(`[content] No content found for ${file}.`);
  const p = paths(file);

  let text: string;
  if (source === "encrypted") {
    const key = parseContentKey(process.env.CONTENT_KEY);
    if (!key) throw new Error(`[content] CONTENT_KEY is missing or invalid; can't decrypt ${file}.`);
    text = decryptContent(readFileSync(p.encrypted, "utf8"), file, key);
  } else {
    if (source === "examples" && process.env.NODE_ENV === "production") {
      console.warn(`[content] Using public example content for ${file}.`);
    }
    text = readFileSync(p[source], "utf8");
  }
  const parsed = JSON.parse(text) as T;
  cache.set(file, parsed);
  return parsed;
}
