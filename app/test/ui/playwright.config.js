// UI tests against the built app/.dist (run `bun run test:ui`, which
// builds first). A tiny bun static server serves it at the site root.
import { defineConfig } from "@playwright/test"

const PORT = Number(process.env.UI_PORT ?? 4174)

export default defineConfig({
  testDir: ".",
  testMatch: "*.pw.js",
  outputDir: "../../test-results",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: `bun ../../scripts/serve.js ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
  },
  projects: [
    { name: "phone", use: { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
})
