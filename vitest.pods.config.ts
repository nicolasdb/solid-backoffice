import { defineConfig } from "vitest/config";

/**
 * Tests against a throwaway Solid server with a cast of test accounts
 * (test/pods/). Slower than `npm test` and needs no network: the server runs
 * in memory on localhost and is gone after the run.
 */
export default defineConfig({
  test: {
    include: ["test/pods/**/*.test.ts"],
    environment: "node",
    globalSetup: ["test/pods/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
