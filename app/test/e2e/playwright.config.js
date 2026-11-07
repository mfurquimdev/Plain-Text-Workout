// End-to-end tests: `bun run test:e2e` builds the real app and runs it
// against workout-server (the tests start the server themselves).
import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: ".",
  testMatch: "*.pw.js",
  outputDir: "../../test-results/e2e",
  workers: 1,
  timeout: 90000,
  reporter: [["list"]],
})
