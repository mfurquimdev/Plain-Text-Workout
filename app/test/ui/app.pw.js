import { test, expect } from "@playwright/test"
import { fileURLToPath } from "node:url"

const SHOTS = fileURLToPath(new URL("./screenshots/", import.meta.url))
const phone = info => info.project.name === "phone"

const today = () => {
  const d = new Date(), p = n => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function open(page, query = "") {
  await page.goto(`/${query}`)
  await expect(page.locator(".cm-content")).toBeVisible()
  await expect(page.locator("#status")).not.toHaveAttribute("data-state", "loading")
}

/** Puts the cursor at the end of the given line (1-based) through the editor API. */
async function cursorAtLineEnd(page, n) {
  await page.evaluate(n => {
    const v = __workoutApp.editor.view
    v.dispatch({ selection: { anchor: v.state.doc.line(n).to } })
    v.focus()
  }, n)
}

const text = page => page.evaluate(() => __workoutApp.editor.getText())

test("the page loads with the log, the status line and the logging bar", async ({ page }, info) => {
  const errors = []
  page.on("pageerror", e => errors.push(e.message))
  await open(page)
  await expect(page).toHaveTitle("Workout")
  await expect(page.locator("#status-text")).toHaveText(/Synced/)
  await expect(page.locator("#logbar")).toBeVisible()
  await expect(page.locator(".cm-content")).toHaveAttribute("autocorrect", "off")
  await expect(page.locator(".cm-content")).toHaveAttribute("autocapitalize", "off")
  await expect(page.locator(".cm-content")).toHaveAttribute("spellcheck", "false")
  await expect(page.locator("link[rel=manifest]")).toHaveAttribute("href", "/manifest.webmanifest")
  const manifest = await (await page.request.get("/manifest.webmanifest")).json()
  expect(manifest.start_url).toBe("/")
  // opens at the end of the file
  const atEnd = await page.evaluate(() => {
    const v = __workoutApp.editor.view
    return v.state.selection.main.head === v.state.doc.length
  })
  expect(atEnd).toBe(true)
  await expect(page.locator(".cm-line").filter({ hasText: "Loaded Back Extension" })).toBeInViewport()
  expect(errors).toEqual([])
})

test("a log line gets the expected tok-* classes", async ({ page }) => {
  await open(page)
  const row = page.locator(".cm-line").filter({ hasText: /^- Row 12x25kg/ })
  await expect(row.locator(".tok-bullet")).toHaveText("-")
  await expect(row.locator(".tok-exercise")).toHaveText("Row")
  await expect(row.locator(".tok-reps")).toHaveText(["12", "10"])
  await expect(row.locator(".tok-load")).toHaveText(["25", "25"])
  await expect(row.locator(".tok-unit").first()).toHaveText("kg")
  const date = page.locator(".cm-line").filter({ hasText: /^2026-11-05/ })
  await expect(date.locator(".tok-date")).toHaveText("2026-11-05")
  await expect(date.locator(".tok-body_weight")).toHaveText("82.5")
})

test("a conflict line is red with an orange date", async ({ page }) => {
  await open(page)
  const line = page.locator(".cm-line.cm-conflict-line")
  await expect(line).toHaveCount(1)
  const red = line.locator(".tok-conflict").first()
  const date = line.locator(".tok-conflict_date")
  await expect(date).toHaveText("2026-11-05")
  await expect(red).toHaveCSS("color", "rgb(255, 95, 95)")
  await expect(date).toHaveCSS("color", "rgb(255, 135, 0)")
})

test("a parse error is a wavy underline, not red", async ({ page }) => {
  await open(page)
  await cursorAtLineEnd(page, 1)
  await page.evaluate(() => __workoutApp.editor.insert("\n- Row 12x25zz"))
  const bad = page.locator(".tok-invalid").filter({ hasText: "zz" })
  await expect(bad).toHaveCSS("text-decoration-style", "wavy")
  expect(await bad.evaluate(e => getComputedStyle(e).color)).not.toBe("rgb(255, 95, 95)")
})

test("the symbol row inserts text at the cursor", async ({ page }, info) => {
  test.skip(!phone(info), "the symbol row is for touch devices")
  await open(page)
  await page.evaluate(() => __workoutApp.editor.insert("\n- Curl 12"))
  for (const s of ["x", "kg", "^", ";"]) await page.locator(`#logbar [data-insert="${s}"]`).tap()
  expect(await text(page)).toMatch(/\n- Curl 12xkg\^;$/)
  // focus stays in the editor, so the keyboard stays open
  expect(await page.evaluate(() => document.activeElement?.classList.contains("cm-content"))).toBe(true)
})

test("a decimal comma typed between digits is saved as a point", async ({ page }) => {
  await open(page)
  await cursorAtLineEnd(page, (await text(page)).split("\n").length)
  await page.keyboard.type("- Curl 12x2,5kg, 10x2,5kg")
  expect(await text(page)).toMatch(/- Curl 12x2\.5kg, 10x2\.5kg$/)
})

test("Start session inserts today's date", async ({ page }) => {
  await open(page)
  // a log without today's session (the sample may hold today's date)
  await page.evaluate(() => __workoutApp.editor.setText("2020-01-01\n- Row 12x25kg\n"))
  await page.locator("#start-session").click()
  const t = await text(page)
  expect(t.endsWith(`\n\n${today()}\n`)).toBe(true)
  await expect(page.locator(".cm-line .tok-date").last()).toHaveText(today())
  // with the Obsidian setting on, the date is a link; Undo takes it back first
  await page.locator("#undo").click()
  expect(await text(page)).not.toContain(today())
  await page.locator(".settings summary").click()
  await page.locator("#setting-obsidian").check()
  await page.locator(".settings summary").click()
  await page.locator("#start-session").click()
  expect((await text(page)).endsWith(`[[${today()}]]\n`)).toBe(true)
})

test("Same set again repeats the last set on the line, and Undo reverts it", async ({ page }) => {
  await open(page)
  const t0 = await text(page)
  const n = t0.split("\n").findIndex(l => l.startsWith("- Row")) + 1
  await cursorAtLineEnd(page, n)
  await page.locator("#same-set").click()
  expect((await text(page)).split("\n")[n - 1]).toBe("- Row 12x25kg 10x25kg 10x25kg")
  await expect(page.locator("#undo")).toBeEnabled()
  await page.locator("#undo").click()
  expect(await text(page)).toBe(t0)
})

test("the removal question appears when the client asks, and answers it", async ({ page }) => {
  await open(page)
  await expect(page.locator("#status-text")).toHaveText(/Synced/)
  await page.evaluate(() => {
    window.__answers = []
    const c = __workoutStub.client
    const answer = c.answer.bind(c)
    c.answer = choice => { window.__answers.push(choice); answer(choice) }
    c.emit("status", { state: "confirm", message: "Sync waiting: answer the question", at: Date.now() })
    c.emit("confirm", { removalId: "r1", removals: ["removes session 2026-11-07 (5 exercises, 14 sets)", "removes Row from 2026-11-05 (2 sets)"] })
  })
  const dialog = page.locator("#confirm-dialog")
  await expect(dialog).toBeVisible()
  await expect(dialog.locator("li")).toHaveText([/removes session 2026-11-07/, /removes Row/])
  await expect(dialog.locator("[data-copy]")).toBeVisible() // copy my text in a failure state
  await dialog.getByRole("button", { name: "Keep" }).click()
  await expect(dialog).toBeHidden()
  expect(await page.evaluate(() => window.__answers)).toEqual(["keep"])
  await expect(page.locator(".notice").filter({ hasText: "Kept your version" })).toBeVisible()
})

test("remote text applies without touching the undo history", async ({ page }) => {
  await open(page)
  const t0 = await text(page)
  await page.evaluate(t => {
    __workoutApp.editor.remote.lastInput = -Infinity
    __workoutStub.client.emit("merged", { text: "2026-10-01\n- Squat 5x100kg\n\n" + t, notices: ["1 session added from desktop"] })
  }, t0)
  await expect.poll(() => text(page)).toBe("2026-10-01\n- Squat 5x100kg\n\n" + t0)
  await expect(page.locator(".notice").filter({ hasText: "1 session added from desktop" })).toBeVisible()
  await expect(page.locator("#undo")).toBeDisabled()
})

test("log not loaded is its own screen, with Copy my text", async ({ page }) => {
  await page.goto("/?stub=notloaded")
  await expect(page.locator("#not-loaded")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Log not loaded" })).toBeVisible()
  await expect(page.locator(".cm-editor")).toHaveCount(0)
  await expect(page.locator("#logbar")).toBeHidden()
  await expect(page.locator("#status")).toHaveAttribute("data-state", "not-loaded")
  await expect(page.locator("#not-loaded [data-copy]")).toBeVisible()
  // home becomes reachable: Try again downloads the log and opens the editor
  await page.evaluate(() => { __workoutStub.server.reachable = true })
  await page.locator("#load-now").click()
  await expect(page.locator(".cm-content")).toBeVisible()
  await expect(page.locator("#not-loaded")).toBeHidden()
})

test("no horizontal scroll", async ({ page }) => {
  await open(page)
  const sizes = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth, document.body.scrollWidth])
  expect(sizes[0]).toBeLessThanOrEqual(sizes[1])
  expect(sizes[2]).toBeLessThanOrEqual(sizes[1])
  await page.goto("/?stub=notloaded")
  await expect(page.locator("#not-loaded")).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test("hover (desktop) or a tap (phone) shows the line's information", async ({ page }, info) => {
  await open(page)
  const row = page.locator(".cm-line").filter({ hasText: /^- Row 12x25kg/ }).locator(".tok-exercise")
  if (phone(info)) {
    await row.tap()
    await expect(page.locator("#tap-panel")).toBeVisible()
    await expect(page.locator("#tap-panel")).toContainText("Row")
  } else {
    await row.hover()
    await expect(page.locator(".workout-hover")).toContainText("2 sets")
  }
})

test("completion offers exercises; on the phone it leaves the reps out", async ({ page }, info) => {
  await open(page)
  await cursorAtLineEnd(page, (await text(page)).split("\n").length)
  await page.keyboard.type("\n- Ro")
  const option = page.locator(".cm-tooltip-autocomplete li").filter({ hasText: "Row" })
  await expect(option).toBeVisible()
  await page.waitForTimeout(150) // CodeMirror ignores Enter for 75 ms after the list opens
  await page.keyboard.press("Enter")
  const last = (await text(page)).split("\n").at(-1)
  expect(last).toBe(phone(info) ? "- Row x25kg" : "- Row 12x25kg 10x25kg")
})

for (const scheme of ["light", "dark"]) {
  test(`screenshot, ${scheme}`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: scheme })
    await open(page)
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}${info.project.name}-${scheme}.png` })
    await page.goto("/?stub=notloaded")
    await expect(page.locator("#not-loaded")).toBeVisible()
    await page.screenshot({ path: `${SHOTS}${info.project.name}-${scheme}-not-loaded.png` })
    await open(page)
    await page.evaluate(() => __workoutStub.client.emit("confirm", { removalId: "r1", removals: ["removes session 2026-11-07 (5 exercises, 14 sets)"] }))
    await expect(page.locator("#confirm-dialog")).toBeVisible()
    await page.screenshot({ path: `${SHOTS}${info.project.name}-${scheme}-confirm.png` })
  })
}
