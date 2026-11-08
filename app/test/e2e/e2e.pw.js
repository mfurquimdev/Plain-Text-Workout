// End to end: the built app (real WebAssembly language module, real sync
// client and service worker) served by the real workout-server, on a copy
// of the test log in a temporary git repository.
import { test, expect } from "@playwright/test"
import { execFileSync, spawn } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createServer } from "node:net"

const APP = fileURLToPath(new URL("../../", import.meta.url))
const CRATE = join(APP, "../workout_syntax")
const SERVER = join(CRATE, "target/debug/workout-server")
const SHOTS = join(APP, "test/ui/screenshots")

test.describe.configure({ mode: "serial" })

let dir, log, port, server, base

const freePort = () => new Promise(resolve => {
  const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)) })
})
const git = (...args) => execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8" })
const serverText = () => readFileSync(log, "utf8")

test.beforeAll(async () => {
  execFileSync("cargo", ["build", "--quiet", "--bin", "workout-server"], { cwd: CRATE, stdio: "inherit" })
  dir = mkdtempSync(join(tmpdir(), "workout-e2e-"))
  log = join(dir, "Workout.md")
  copyFileSync(join(CRATE, "tests/fixtures/Workout.md"), log)
  git("init", "-q"); git("add", "Workout.md"); git("commit", "-q", "-m", "Fixture log")
  port = await freePort()
  base = `http://127.0.0.1:${port}`
  server = spawn(SERVER, ["--log", log, "--listen", `127.0.0.1:${port}`, "--app", join(APP, ".dist")], { stdio: "inherit" })
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return } catch {}
    await new Promise(r => setTimeout(r, 50))
  }
  throw new Error("workout-server did not start")
})

test.afterAll(() => server?.kill())

async function open(context, kind) {
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", e => errors.push(e.message))
  await page.goto(base + "/")
  await expect(page.locator(".cm-content")).toBeVisible({ timeout: 15000 })
  await expect(page.locator("#status-text")).toHaveText(/Synced/, { timeout: 15000 })
  page.errors = errors
  return page
}

const editorText = page => page.evaluate(() => __workoutApp.editor.getVisibleText())

/** Types at the end of the document, then waits for the typing-pause sync. */
async function typeAtEnd(page, text) {
  await page.evaluate(() => {
    const v = __workoutApp.editor.view
    v.dispatch({ selection: { anchor: v.state.doc.length } })
    v.focus()
  })
  await page.keyboard.type(text)
}

const phoneContext = browser => browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true })
const desktopContext = browser => browser.newContext({ viewport: { width: 1280, height: 800 } })

test("the real language module colours the log and reports a parse error", async ({ browser }) => {
  const context = await desktopContext(browser)
  const page = await open(context)
  await expect(page.locator("#about")).toHaveText(/^Language \d+\.\d+\.\d+$/) // no "(development stubs)"
  const row = page.locator(".cm-line").filter({ hasText: /^- Chin Assisted/ }).first()
  await expect(row.locator(".tok-exercise")).toHaveText("Chin Assisted")
  await expect(row.locator(".tok-bw")).toHaveText("BW")
  // a load with no reps: the real module's message, shown once the cursor leaves the line
  await typeAtEnd(page, "\n- Pec Fly 39kg\n")
  const range = page.locator(".cm-line").filter({ hasText: /^- Pec Fly 39kg$/ }).locator(".cm-lintRange").first()
  await range.waitFor({ timeout: 10000 })
  await range.hover()
  await expect(page.locator(".cm-tooltip")).toContainText("39kg has no reps", { timeout: 10000 })
  // the theme's fonts: Argon text, Krypton in the lint range and its message
  const font = loc => loc.evaluate(e => getComputedStyle(e).fontFamily)
  expect(await font(page.locator(".cm-content"))).toMatch(/^"MonaspiceAr NFM"/)
  expect(await font(range)).toMatch(/^"MonaspiceKr NFM"/)
  expect(await font(page.locator(".cm-tooltip .cm-diagnostic").first())).toMatch(/^"MonaspiceKr NFM"/)
  expect(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('19px "MonaspiceAr NFM"', "Row") })).toBe(true)
  expect(page.errors).toEqual([])
  await context.close()
})

test("a session typed on the phone reaches the server and the desktop", async ({ browser }) => {
  const phoneCtx = await phoneContext(browser)
  const deskCtx = await desktopContext(browser)
  const phone = await open(phoneCtx)
  const desk = await open(deskCtx)
  const before = git("log", "--format=%s").split("\n").length

  await typeAtEnd(phone, "\n\n2027-01-15 82.5kg\n18h00~19h10\n- Row 12x20kg 10x25kg")
  await expect.poll(serverText, { timeout: 15000 }).toContain("- Row 12x20kg 10x25kg")
  expect(git("log", "-1", "--format=%s")).toMatch(/^Sync from phone/)
  expect(git("log", "--format=%s").split("\n").length).toBeGreaterThan(before)

  // the desktop picks it up when it comes back into view (here: online event)
  await desk.evaluate(() => dispatchEvent(new Event("online")))
  await expect.poll(() => editorText(desk), { timeout: 20000 }).toContain("2027-01-15 82.5kg")
  expect(phone.errors).toEqual([])
  expect(desk.errors).toEqual([])
  await phoneCtx.close(); await deskCtx.close()
})

test("offline: the app opens from the service worker, keeps typing, and syncs when back", async ({ browser }) => {
  const context = await phoneContext(browser)
  const page = await open(context)
  // wait until the service worker controls the page and has cached the app
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 10000 }).toBe(true)

  await context.setOffline(true)
  await page.reload()
  await expect(page.locator(".cm-content")).toBeVisible({ timeout: 15000 })
  await expect.poll(() => editorText(page)).toContain("2027-01-15 82.5kg") // the device copy, not the network
  // the bundled fonts come from the service worker's cache too
  const fonts = await page.evaluate(async () => {
    const cached = []
    for (const key of await caches.keys()) for (const r of await (await caches.open(key)).keys()) if (new URL(r.url).pathname.startsWith("/fonts/")) cached.push(new URL(r.url).pathname)
    await document.fonts.load('19px "MonaspiceAr NFM"', "Row")
    await document.fonts.load('italic 19px "MonaspiceRn NFM"', "Row")
    return { cached, ar: document.fonts.check('19px "MonaspiceAr NFM"', "Row"), rn: document.fonts.check('italic 19px "MonaspiceRn NFM"', "Row") }
  })
  expect(fonts.cached).toEqual(expect.arrayContaining(["/fonts/MonaspiceArNFM-Regular.woff2", "/fonts/MonaspiceKrNFM-Regular.woff2", "/fonts/MonaspiceRnNFM-Italic.woff2"]))
  expect(fonts.ar).toBe(true)
  expect(fonts.rn).toBe(true)
  await typeAtEnd(page, "\n- Curl 12x10kg")
  await expect(page.locator("#status-text")).toHaveText(/Offline|saved on this phone/i, { timeout: 15000 })
  expect(serverText()).not.toContain("- Curl 12x10kg")

  await context.setOffline(false)
  await page.evaluate(() => dispatchEvent(new Event("online")))
  await expect.poll(serverText, { timeout: 20000 }).toContain("- Curl 12x10kg")
  expect(page.errors).toEqual([])
  await context.close()
})

test("a stale save on the server asks before removing, and Keep restores the session", async ({ browser }) => {
  const context = await phoneContext(browser)
  const page = await open(context)
  const current = serverText()
  // Neovim saves an old copy that lacks the phone's session
  const stale = current.split("\n2027-01-15")[0] + "\n"
  writeFileSync(log, stale)
  await typeAtEnd(page, "\n- Press 8x30kg")
  const dialog = page.locator("#confirm-dialog")
  await expect(dialog).toBeVisible({ timeout: 20000 })
  await expect(page.locator("#removal-list")).toContainText("removes session 2027-01-15")
  expect(serverText()).toBe(stale) // nothing written while the question is open
  await page.locator("#confirm-keep").click()
  await expect.poll(serverText, { timeout: 20000 }).toContain("2027-01-15 82.5kg")
  expect(serverText()).toContain("- Press 8x30kg")
  expect(git("log", "--format=%s")).toContain("Outside edit")
  expect(page.errors).toEqual([])
  await context.close()
})

test("screenshots of the real app, light and dark", async ({ browser }) => {
  for (const [name, make] of [["phone", phoneContext], ["desktop", desktopContext]]) {
    for (const scheme of ["light", "dark"]) {
      const context = await make(browser)
      const page = await context.newPage()
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto(base + "/")
      await expect(page.locator("#status-text")).toHaveText(/Synced/, { timeout: 15000 })
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(300)
      await page.screenshot({ path: join(SHOTS, `e2e-${name}-${scheme}.png`) })
      await context.close()
    }
  }
})
