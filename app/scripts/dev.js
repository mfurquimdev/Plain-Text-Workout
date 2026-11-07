// Local preview: builds app/.dist (unminified), serves it, and rebuilds
// when a source file changes. Reload the page to see a change.
// Usage: bun run dev   (PORT=... to change the port, default 4173)

import { watch } from "node:fs"
import { join } from "node:path"
import { build } from "./build.js"
import { serve } from "./serve.js"

process.argv.push("--dev")
const root = join(import.meta.dir, "..")
await build()
const server = serve(Number(process.env.PORT ?? 4173))
console.log(`preview on ${server.url}`)

let timer = null
const rebuild = () => {
  clearTimeout(timer)
  timer = setTimeout(() => build({ quiet: true }).then(() => console.log("rebuilt"), e => console.error(e.message)), 150)
}
for (const dir of ["src", "css", "ui", "public", "icons"]) {
  try { watch(join(root, dir), { recursive: true }, rebuild) } catch { /* missing dir */ }
}
for (const file of ["index.html", "site.yaml", "manifest.webmanifest", "sw.js"]) {
  try { watch(join(root, file), rebuild) } catch { /* missing file */ }
}
