// Integration test: two SyncClients ("phone" and "desktop"), each with its
// own fake IndexedDB, against the real workout-server on a temp copy of the
// fixture log in its own git repository.
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { spawn, spawnSync } from "node:child_process"
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { freshStore, makeClient } from "./helpers.js"

const CRATE = resolve(import.meta.dir, "../../../workout_syntax")
const FIXTURE = join(CRATE, "tests/fixtures/Workout.md")

let dir, log, server, endpoint
const git = (...args) => {
  const r = spawnSync("git", ["-C", dir, "-c", "user.name=test", "-c", "user.email=test@localhost", ...args], { encoding: "utf8" })
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`)
  return r.stdout
}
const subjects = () => git("log", "--format=%s").trim().split("\n").reverse()

function freePort() {
  return new Promise((res, rej) => {
    const s = createServer()
    s.once("error", rej)
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address()
      s.close(() => res(port))
    })
  })
}

beforeAll(async () => {
  const build = spawnSync("cargo", ["build", "--quiet", "--bin", "workout-server"], { cwd: CRATE, encoding: "utf8" })
  if (build.status !== 0) throw new Error(`cargo build failed:\n${build.stderr}`)
  dir = mkdtempSync(join(process.env.TMPDIR || tmpdir(), "workout-sync-"))
  log = join(dir, "Workout.md")
  copyFileSync(FIXTURE, log)
  git("init", "--quiet")
  git("add", "Workout.md")
  git("commit", "--quiet", "-m", "Fixture log")
  const port = await freePort()
  const bin = join(CRATE, "target/debug/workout-server")
  server = spawn(bin, ["--log", log, "--listen", `127.0.0.1:${port}`], { stdio: ["ignore", "ignore", "pipe"] })
  endpoint = `http://127.0.0.1:${port}/api`
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${endpoint}/health`)).ok) break
    } catch {}
    if (i > 100) throw new Error("workout-server did not start")
    await Bun.sleep(50)
  }
}, 600_000)

afterAll(() => {
  server?.kill()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

/** A device: its editor, store and client. `hook` runs inside each POST. */
async function device(name) {
  const { store } = await freshStore()
  const editor = { text: "" }
  const d = { name, editor, store, hook: null, notices: [] }
  const realFetch = async (url, init) => {
    if (init?.method === "POST" && d.hook) {
      const h = d.hook
      d.hook = null
      const res = await fetch(url, init)
      h() // the owner types while the reply is on its way
      return res
    }
    return fetch(url, init)
  }
  Object.assign(d, makeClient({ store, fetch: realFetch, editor, device: name, endpoint }))
  d.client.on("merged", (m) => d.notices.push(...m.notices))
  /** The owner types: the editor changes and the client hears of it. */
  d.type = async (text) => {
    editor.text = text
    await d.client.notifyEdit()
  }
  return d
}

const PHONE_SESSION = "\n2026-11-01\n18h00~\n- Squat 60kg 10^3\n- Row 30kg 12^3\n"
const DESKTOP_SESSION = "\n2026-11-02\n07h30~\n- Bench Press 40kg 10^3\n"
const EXTRA_SET = "- Calf Raise 50kg 15^3\n"
const LATE_LINE = "- Plank BW 12^2\n"

describe("phone and desktop against workout-server", () => {
  let phone, desktop, fixture, beforePhone

  test("first open downloads the log on both devices", async () => {
    fixture = readFileSync(log, "utf8")
    phone = await device("phone")
    desktop = await device("desktop")
    expect((await phone.client.syncNow()).state).toBe("synced")
    expect((await desktop.client.syncNow()).state).toBe("synced")
    expect(phone.editor.text).toBe(fixture)
    expect(desktop.editor.text).toBe(fixture)
    expect(await phone.store.load()).toMatchObject({ loaded: true, text: fixture, base: fixture })
  })

  test("each device adds a session; both arrive on the server", async () => {
    beforePhone = readFileSync(log, "utf8") // what a stale Neovim buffer would still hold
    await phone.type(fixture + PHONE_SESSION)
    expect((await phone.client.syncNow()).state).toBe("synced")
    await desktop.type(fixture + DESKTOP_SESSION)
    expect((await desktop.client.syncNow()).state).toBe("synced")
    expect(desktop.editor.text).toContain(PHONE_SESSION.trim())
    expect(desktop.editor.text).toContain(DESKTOP_SESSION.trim())
    await phone.client.syncNow() // pulls the desktop's session
    expect(phone.editor.text).toBe(desktop.editor.text)
    expect(readFileSync(log, "utf8")).toBe(phone.editor.text)
  })

  test("typing during a sync: the new typing syncs again, nothing applied over it", async () => {
    const start = phone.editor.text
    const withSet = start.replace("- Row 30kg 12^3\n", "- Row 30kg 12^3\n" + EXTRA_SET)
    await phone.type(withSet)
    phone.hook = () => {
      phone.editor.text = phone.editor.text + LATE_LINE
    }
    const mergedBefore = phone.mergedEvents.length
    const s = await phone.client.syncNow()
    expect(s.state).toBe("synced")
    expect(phone.mergedEvents.length).toBe(mergedBefore + 1) // only the second reply was applied
    expect(phone.editor.text).toBe(withSet + LATE_LINE)
    expect(readFileSync(log, "utf8")).toBe(withSet + LATE_LINE)
    expect(await phone.store.load()).toMatchObject({ text: withSet + LATE_LINE, base: withSet + LATE_LINE, pending: null })
  })

  test("a stale save on the server asks before removing, and keep brings the sessions back", async () => {
    const phoneText = phone.editor.text
    writeFileSync(log, beforePhone) // Neovim saves a buffer opened before the syncs
    const s = await phone.client.syncNow()
    expect(s.state).toBe("confirm")
    expect(phone.confirms.length).toBe(1)
    const { removals } = phone.confirms[0]
    expect(removals.some((r) => r.includes("removes session 2026-11-01"))).toBe(true)
    expect(removals.some((r) => r.includes("removes session 2026-11-02"))).toBe(true)
    expect(readFileSync(log, "utf8")).toBe(beforePhone) // nothing written while asking
    expect(phone.editor.text).toBe(phoneText) // the device keeps its text

    const done = await phone.client.answer("keep")
    expect(done.state).toBe("synced")
    // Every line the phone had is back (the merge may drop a blank line
    // that only separated sessions).
    const kept = new Set(phone.editor.text.split("\n"))
    expect(phoneText.split("\n").filter((l) => l.trim() && !kept.has(l))).toEqual([])
    expect(readFileSync(log, "utf8")).toBe(phone.editor.text)
  })

  test("both devices converge with no lines lost, and git has every step", async () => {
    await desktop.client.syncNow()
    await phone.client.syncNow()
    const server = readFileSync(log, "utf8")
    expect(phone.editor.text).toBe(server)
    expect(desktop.editor.text).toBe(server)
    expect((await desktop.store.load()).text).toBe(server)
    const lines = new Set(server.split("\n"))
    const expected = [...fixture.split("\n"), ...PHONE_SESSION.split("\n"), ...DESKTOP_SESSION.split("\n"), EXTRA_SET.trim(), LATE_LINE.trim()]
    expect(expected.filter((l) => !lines.has(l))).toEqual([])
    expect(server).not.toContain("; conflict")

    const log_ = subjects()
    // The fixture has sessions out of date order, so the first merges from
    // it (and from the stale copy) also move those into order.
    const moved = "(; moved [-0-9, ]+)?$"
    expect(log_.length).toBe(7)
    const want = [
      /^Fixture log$/,
      new RegExp("^Sync from phone: added 2026-11-01" + moved),
      new RegExp("^Sync from desktop: added 2026-11-02" + moved),
      /^Sync from phone$/, // the extra set
      /^Sync from phone$/, // the line typed during that sync
      /^Outside edit$/, // the stale save, committed before merging
      new RegExp("^Sync from phone: added 2026-11-01, 2026-11-02" + moved), // keep
    ]
    want.forEach((re, i) => expect(log_[i]).toMatch(re))
    expect(git("status", "--porcelain")).toBe("")
  })
})
