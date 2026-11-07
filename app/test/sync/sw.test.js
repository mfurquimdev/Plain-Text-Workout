// The service worker in a real browser (Playwright Chromium), served by a
// tiny bun static server: a test page, one app script, sw.js and /api/log.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { chromium } from "playwright"

const SW = readFileSync(resolve(import.meta.dir, "../../sw.js"), "utf8")
let build = "test-1"
let apiHits = 0
let server, browser, base

/** sw.js with the build placeholders filled in, as the build would. */
const builtSw = () => SW.replace(`"__BUILD_ID__"`, JSON.stringify(build)).replace(`["__APP_FILES__"]`, JSON.stringify(["/app.js"]))

const PAGE = `<!doctype html><meta charset="utf-8"><title>Workout test</title>
<h1 id="h">Workout app</h1>
<script type="module" src="/app.js"></script>`
const APP = `document.body.dataset.app = "ran"
window.swReady = navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready)`

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const { pathname } = new URL(req.url)
      const type = (t) => ({ headers: { "content-type": t, "cache-control": "no-cache" } })
      if (pathname === "/" || pathname === "/index.html") return new Response(PAGE, type("text/html"))
      if (pathname === "/app.js") return new Response(APP, type("text/javascript"))
      if (pathname === "/sw.js") return new Response(builtSw(), type("text/javascript"))
      if (pathname === "/api/log") {
        apiHits++
        return Response.json({ protocol: 1, text: `hit ${apiHits}\n` })
      }
      return new Response("not found", { status: 404 })
    },
  })
  base = `http://127.0.0.1:${server.port}`
  browser = await chromium.launch()
}, 60_000)

afterAll(async () => {
  await browser?.close()
  server?.stop(true)
})

test(
  "offline, the page loads from the cache and /api/ is never cached",
  async () => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(base + "/")
    await page.evaluate(() => window.swReady)
    await page.reload() // now controlled by the worker
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

    const online = await page.evaluate(async () => (await (await fetch("/api/log")).json()).text)
    expect(online).toBe(`hit ${apiHits}\n`)
    const hitsBefore = apiHits

    const cached = await page.evaluate(async () => {
      const out = {}
      for (const key of await caches.keys()) out[key] = (await (await caches.open(key)).keys()).map((r) => new URL(r.url).pathname)
      return out
    })
    expect(Object.keys(cached)).toEqual(["workout-app-test-1"])
    expect(cached["workout-app-test-1"].sort()).toEqual(["/", "/app.js", "/index.html"])

    await context.setOffline(true)
    await page.reload()
    expect(await page.textContent("#h")).toBe("Workout app")
    expect(await page.evaluate(() => document.body.dataset.app)).toBe("ran") // app.js came from the cache
    // Another page of the app falls back to the cached /index.html.
    await page.goto(base + "/history")
    expect(await page.textContent("#h")).toBe("Workout app")

    const api = await page.evaluate(async () => {
      try {
        const r = await fetch("/api/log")
        return `served ${r.status}`
      } catch (e) {
        return "failed"
      }
    })
    expect(api).toBe("failed") // not answered from any cache
    expect(apiHits).toBe(hitsBefore)
    await context.close()
  },
  30_000,
)

test(
  "a new build installs and waits until the page asks it to take over",
  async () => {
    build = "test-1"
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(base + "/")
    await page.evaluate(() => window.swReady)
    await page.reload()
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

    build = "test-2"
    const waiting = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      await reg.update()
      for (let i = 0; i < 100 && !reg.waiting; i++) await new Promise((r) => setTimeout(r, 50))
      return !!reg.waiting
    })
    expect(waiting).toBe(true) // installed, but not swapped in during editing
    expect(await page.evaluate(() => caches.keys())).toEqual(expect.arrayContaining(["workout-app-test-1", "workout-app-test-2"]))

    const keys = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      const changed = new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }))
      reg.waiting.postMessage({ type: "skip-waiting" })
      await changed
      for (let i = 0; i < 100; i++) {
        const k = await caches.keys()
        if (k.length === 1) return k
        await new Promise((r) => setTimeout(r, 50))
      }
      return caches.keys()
    })
    expect(keys).toEqual(["workout-app-test-2"]) // the old build's cache is gone
    await context.close()
  },
  30_000,
)
