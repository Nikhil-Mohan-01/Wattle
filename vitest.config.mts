import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const testDb = `file:${fileURLToPath(new URL("./data/test.db", import.meta.url))}`;

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["./test/global-setup.ts"],
    env: { DATABASE_URL: testDb, PUZZLE_SECRET: "test-secret" },
    // Tests share one SQLite file.
    fileParallelism: false,
  },
});
