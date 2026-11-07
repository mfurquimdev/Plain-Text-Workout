// Builds app/.dist:
//   1. bun bundles src/main.js (editor, UI, CodeMirror) into js/app.js;
//   2. Nue builds the page shell into .dist (and adds js/app.js to it);
//   3. public/ (the WebAssembly files) is copied to the root of .dist.
// Usage: bun scripts/build.js [--dev]   (--dev: no minifying)

import { cp, mkdir, stat } from "node:fs/promises"
import { join } from "node:path"

const root = join(import.meta.dir, "..")
const dev = process.argv.includes("--dev")

export async function build({ quiet = false } = {}) {
  const t0 = performance.now()
  const result = await Bun.build({
    entrypoints: [join(root, "src/main.js")],
    outdir: join(root, "js"),
    naming: "app.js",
    target: "browser",
    format: "esm",
    minify: !dev,
    sourcemap: dev ? "inline" : "none",
    // the real language module is loaded from /wasm/ at run time
    external: ["/wasm/*"],
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    throw new Error("bundling src/main.js failed")
  }

  const nue = Bun.spawnSync([join(root, "node_modules/.bin/nue"), "build", "--clean", "--silent"], {
    cwd: root, stdout: quiet ? "ignore" : "inherit", stderr: "inherit",
  })
  if (nue.exitCode !== 0) throw new Error(`nue build failed (${nue.exitCode})`)

  try {
    await stat(join(root, "public"))
    await cp(join(root, "public"), join(root, ".dist"), { recursive: true })
  } catch (e) {
    if (e.code !== "ENOENT") throw e
  }
  await mkdir(join(root, ".dist"), { recursive: true })
  if (!quiet) console.log(`built app/.dist in ${Math.round(performance.now() - t0)} ms`)
}

if (import.meta.main) await build()
