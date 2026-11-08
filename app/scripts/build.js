// Builds app/.dist:
//   1. bun bundles src/main.js (editor, UI, CodeMirror) into js/app.js;
//   2. Nue builds the page shell into .dist (and adds js/app.js to it);
//   3. public/ (the WebAssembly files and the fonts) is copied to the root
//      of .dist.
// Usage: bun scripts/build.js [--dev]   (--dev: no minifying)

import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises"
import { basename, join, relative } from "node:path"

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
    // WORKOUT_STUBS=1 builds the page on the plain-JS stubs (UI tests)
    define: { __WORKOUT_STUBS__: process.env.WORKOUT_STUBS === "1" ? "true" : "false" },
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
    await cp(join(root, "public"), join(root, ".dist"), { recursive: true, filter: src => basename(src) !== "README.md" })
  } catch (e) {
    if (e.code !== "ENOENT") throw e
  }
  await mkdir(join(root, ".dist"), { recursive: true })
  await stampServiceWorker()
  if (!quiet) console.log(`built app/.dist in ${Math.round(performance.now() - t0)} ms`)
}

/** Every file the app needs offline, as absolute URL paths. */
async function appFiles(dir, base = dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await appFiles(path, base)))
    else out.push("/" + relative(base, path).split("\\").join("/"))
  }
  return out
}

/**
 * Fills the service worker's placeholders (see app/sw.js): the build ID is
 * a hash of every app file, so any change makes a new cache, and the file
 * list is everything in .dist except the worker itself.
 */
async function stampServiceWorker() {
  const dist = join(root, ".dist")
  const sw = join(dist, "sw.js")
  try { await stat(sw) } catch { return }
  const files = (await appFiles(dist)).filter(f => f !== "/sw.js" && !f.endsWith(".d.ts")).sort()
  const hash = new Bun.CryptoHasher("sha256")
  for (const f of files) hash.update(f).update(await readFile(join(dist, f)))
  const id = hash.digest("hex").slice(0, 16)
  let text = await readFile(sw, "utf8")
  // Nue minifies sw.js while copying it, which can inline the build ID into
  // other strings (the cache name), so replace every occurrence of the token
  if (!text.includes("__BUILD_ID__") || !text.includes('["__APP_FILES__"]')) throw new Error("sw.js placeholders missing")
  text = text.replaceAll("__BUILD_ID__", id).replace('["__APP_FILES__"]', JSON.stringify(files))
  await writeFile(sw, text)
}

if (import.meta.main) await build()
