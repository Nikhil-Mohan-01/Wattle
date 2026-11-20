import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Fresh test database with the current schema for every run.
export default function setup() {
  const dir = fileURLToPath(new URL("../data/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  const file = `${dir}test.db`;
  rmSync(file, { force: true });
  execSync("npx drizzle-kit push --force", {
    env: { ...process.env, DATABASE_URL: `file:${file}` },
    stdio: "pipe",
  });
}
