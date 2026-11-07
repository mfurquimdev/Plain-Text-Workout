// Renders icons/icon.svg to the PNG sizes the web manifest lists, with
// Playwright's Chromium. Run after changing the SVG: bun scripts/icons.js

import { chromium } from "@playwright/test"
import { join } from "node:path"

const dir = join(import.meta.dir, "..", "icons")
const svg = await Bun.file(join(dir, "icon.svg")).text()
const browser = await chromium.launch()
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`)
  await page.screenshot({ path: join(dir, `icon-${size}.png`) })
  await page.close()
}
await browser.close()
console.log("wrote icons/icon-192.png and icons/icon-512.png")
