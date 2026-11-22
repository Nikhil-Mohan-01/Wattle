import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Each test file gets its own in-memory Postgres, migrated from drizzle/.
    setupFiles: ["./test/setup-db.ts"],
    env: { DATABASE_URL: "memory://", PUZZLE_SECRET: "test-secret" },
    testTimeout: 20_000,
  },
});
