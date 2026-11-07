import { describe, expect, test } from "bun:test"
import { fakeFetch, merged, freshStore, loadedStore, makeClient, tick, until } from "./helpers.js"

const LOG = "2026-11-06\n- Squat 60kg 10^3\n"
const TYPED = LOG + "\n2026-11-07\n- Row 30kg 12^3\n"
const SERVER = "2026-11-05\n- Bench 40kg 10^3\n\n" + TYPED

describe("first open", () => {
  test("downloads the log and saves it as text and base", async () => {
    const { store } = await freshStore()
    const fetch = fakeFetch(() => ({ body: { protocol: 1, text: LOG } }))
    const editor = { text: "" }
    const t = makeClient({ store, fetch, editor })
    const s = await t.client.syncNow()
    expect(fetch.gets().map((c) => c.url)).toEqual(["/api/log"])
    expect(fetch.posts()).toEqual([])
    expect(s.state).toBe("synced")
    expect(s.message).toBe("Synced home at 18:42; ready offline")
    expect(t.mergedEvents).toEqual([{ text: LOG, notices: [], loaded: true }])
    const rec = await store.load()
    expect(rec).toMatchObject({ loaded: true, text: LOG, base: LOG, pending: null })
  })

  test("'not loaded' is never synced as an empty log", async () => {
    const { store } = await freshStore()
    const fetch = fakeFetch(() => {
      throw new TypeError("Failed to fetch")
    })
    const editor = { text: "" }
    const t = makeClient({ store, fetch, editor })
    const s = await t.client.syncNow()
    expect(s.state).toBe("not-loaded")
    await t.client.notifyEdit() // the empty editor is not saved as the log
    await t.client.syncNow()
    expect(fetch.posts()).toEqual([])
    expect((await store.load()).loaded).toBe(false)

    const off = makeClient({ store, fetch, editor, online: false })
    expect((await off.client.syncNow()).message).toStartWith("Offline: the log is not on this device yet")
  })
})

describe("device rule", () => {
  test("a merged reply is adopted as text and base when the editor did not change", async () => {
    const { store } = await loadedStore(LOG)
    const fetch = fakeFetch(() => merged(SERVER, ["Session 2026-11-05 added from the server"]))
    const editor = { text: TYPED }
    const t = makeClient({ store, fetch, editor })
    const s = await t.client.syncNow()
    expect(fetch.posts()).toEqual([{ protocol: 1, device: "phone", base: LOG, text: TYPED }])
    expect(t.mergedEvents).toEqual([{ text: SERVER, notices: ["Session 2026-11-05 added from the server"] }])
    expect(s).toMatchObject({ state: "synced", message: "Synced home at 18:42" })
    expect(t.statuses.map((x) => x.state)).toEqual(["syncing", "synced"])
    expect(await store.load()).toMatchObject({ text: SERVER, base: SERVER, pending: null })
  })

  test("the request is stored as pending before it is sent", async () => {
    const { store } = await loadedStore(LOG)
    let seen
    const fetch = fakeFetch(async () => {
      seen = await store.load()
      return merged(TYPED)
    })
    const t = makeClient({ store, fetch, editor: { text: TYPED } })
    await t.client.syncNow()
    expect(seen).toMatchObject({ text: TYPED, base: LOG, pending: { protocol: 1, device: "phone", base: LOG, text: TYPED } })
  })

  test("a lost reply is resent exactly, even after the owner typed", async () => {
    const { store, idb } = await loadedStore(LOG)
    let n = 0
    const fetch = fakeFetch(() => {
      if (++n === 1) throw new TypeError("network connection was lost")
      return merged(n === 2 ? TYPED : TYPED + "- more\n")
    })
    const editor = { text: TYPED }
    const t = makeClient({ store, fetch, editor })
    expect((await t.client.syncNow()).state).toBe("offline")
    expect((await store.load()).pending).toEqual({ protocol: 1, device: "phone", base: LOG, text: TYPED })

    // The page reloads (a new client on the same database), the owner types.
    editor.text = TYPED + "- more\n"
    const reopened = await (await import("../../src/sync/store.js")).openStore({ indexedDB: idb })
    const t2 = makeClient({ store: reopened, fetch, editor })
    await t2.client.syncNow()
    const posts = fetch.posts()
    expect(posts[1]).toEqual(posts[0]) // identical resend
    // The editor changed, so the sent text became the base and it synced again.
    expect(posts[2]).toEqual({ protocol: 1, device: "phone", base: TYPED, text: TYPED + "- more\n" })
    expect(posts.length).toBe(3)
    expect(t2.mergedEvents.length).toBe(1)
    expect(await reopened.load()).toMatchObject({ text: TYPED + "- more\n", base: TYPED + "- more\n", pending: null })
  })

  test("a 5xx keeps the pending request and resends it after a backoff", async () => {
    const { store } = await loadedStore(LOG)
    let n = 0
    const fetch = fakeFetch(() =>
      ++n === 1 ? { status: 503, body: { status: "error", message: "the log on the server is empty; it may be mid-save" } } : merged(TYPED),
    )
    const t = makeClient({ store, fetch, editor: { text: TYPED } })
    t.client.started = true // allow the retry timer without listeners
    const s = await t.client.syncNow()
    expect(s.state).toBe("waiting")
    expect(s.message).toBe("Sync waiting: the log on the server is empty; it may be mid-save; will retry")
    expect((await store.load()).pending).not.toBeNull()
    await until(() => t.client.status.state === "synced")
    expect(fetch.posts()[1]).toEqual(fetch.posts()[0])
    t.client.stop()
  })

  test("a timeout counts as an unknown outcome", async () => {
    const { store } = await loadedStore(LOG)
    const fetch = fakeFetch(
      (call) =>
        new Promise((_, reject) => call.signal.addEventListener("abort", () => reject(call.signal.reason))),
    )
    const t = makeClient({ store, fetch, editor: { text: TYPED }, timeout: 30 })
    const s = await t.client.syncNow()
    expect(s).toMatchObject({ state: "waiting", message: "Sync waiting: home did not answer; will retry" })
    expect((await store.load()).pending).toMatchObject({ text: TYPED })
  })

  test("typing during a sync: no merged event, the sent text becomes the base, and it syncs again", async () => {
    const { store } = await loadedStore(LOG)
    const editor = { text: TYPED }
    const more = TYPED + "- Curl 10kg 12^3\n"
    let n = 0
    const fetch = fakeFetch(() => {
      if (++n === 1) {
        editor.text = more // the owner types while the request is out
        return merged(SERVER)
      }
      return merged(SERVER + "- Curl 10kg 12^3\n")
    })
    const t = makeClient({ store, fetch, editor })
    const s = await t.client.syncNow()
    const [first, second] = fetch.posts()
    expect(first).toEqual({ protocol: 1, device: "phone", base: LOG, text: TYPED })
    expect(second).toEqual({ protocol: 1, device: "phone", base: TYPED, text: more })
    // Only the second reply (which matched the editor) was applied.
    expect(t.mergedEvents).toEqual([{ text: SERVER + "- Curl 10kg 12^3\n", notices: [] }])
    expect(s.state).toBe("synced")
  })

  test("typing during a sync while a date is half-typed waits, with the base already moved", async () => {
    const { store } = await loadedStore(LOG)
    const editor = { text: TYPED }
    let ready = true
    const fetch = fakeFetch(() => {
      editor.text = TYPED + "\n2026-11-0"
      ready = false
      return merged(SERVER)
    })
    const t = makeClient({ store, fetch, editor, isReady: () => ready })
    const s = await t.client.syncNow()
    expect(s).toMatchObject({ state: "waiting", message: "Sync waiting: finish the date" })
    expect(t.mergedEvents).toEqual([])
    expect(await store.load()).toMatchObject({ base: TYPED, text: TYPED + "\n2026-11-0", pending: null })
    expect(fetch.posts().length).toBe(1)
  })

  for (const choice of ["remove", "keep"]) {
    test(`confirm, then ${choice}`, async () => {
      const { store } = await loadedStore(LOG)
      const editor = { text: TYPED }
      const fetch = fakeFetch((call) => {
        if (!call.body.confirm && !call.body.keep) {
          return { status: 409, body: { status: "confirm", removal_id: "abc123", removals: ["removes session 2026-11-06 (1 exercise, 3 sets)"] } }
        }
        return merged(call.body.keep ? TYPED : "2026-11-07\n- Row 30kg 12^3\n")
      })
      const t = makeClient({ store, fetch, editor })
      const s = await t.client.syncNow()
      expect(s).toMatchObject({ state: "confirm", message: "Sync waiting: answer the removal question" })
      expect(t.confirms).toEqual([{ removalId: "abc123", removals: ["removes session 2026-11-06 (1 exercise, 3 sets)"] }])
      expect(t.mergedEvents).toEqual([])
      expect((await store.load()).pending).toBeNull()

      // Typing continues; other triggers do not resend while the question is open.
      editor.text = TYPED
      await t.client.notifyEdit()
      expect((await t.client.syncNow()).state).toBe("confirm")
      expect(fetch.posts().length).toBe(1)

      const done = await t.client.answer(choice)
      const resent = fetch.posts()[1]
      const expected = { protocol: 1, device: "phone", base: LOG, text: TYPED }
      expect(resent).toEqual(choice === "remove" ? { ...expected, confirm: "abc123" } : { ...expected, keep: true })
      expect(done.state).toBe("synced")
      expect(t.mergedEvents.length).toBe(1)
      expect(editor.text).toBe(choice === "keep" ? TYPED : "2026-11-07\n- Row 30kg 12^3\n")
    })
  }

  test("a wait reply sets status waiting with the reason", async () => {
    const { store } = await loadedStore(LOG)
    const fetch = fakeFetch(() => ({ status: 409, body: { status: "wait", reason: "a date line is unfinished or not yet yyyy-mm-dd" } }))
    const t = makeClient({ store, fetch, editor: { text: TYPED } })
    const s = await t.client.syncNow()
    expect(s).toMatchObject({ state: "waiting", message: "Sync waiting: finish the date", reason: "a date line is unfinished or not yet yyyy-mm-dd" })
    expect((await store.load()).pending).toBeNull()
  })

  test("no sync while the editor is not ready", async () => {
    const { store } = await loadedStore(LOG)
    const fetch = fakeFetch(() => merged(TYPED))
    let ready = false
    const t = makeClient({ store, fetch, editor: { text: TYPED }, isReady: () => ready })
    expect((await t.client.syncNow()).state).toBe("waiting")
    expect(fetch.calls.length).toBe(0)
    ready = true
    expect((await t.client.syncNow()).state).toBe("synced")
  })

  test("offline, then online", async () => {
    const { store } = await loadedStore(LOG)
    const fetch = fakeFetch(() => merged(TYPED))
    const editor = { text: LOG }
    const t = makeClient({ store, fetch, editor, online: false })
    t.client.start()
    await until(() => t.client.status.state === "offline")
    expect(t.client.status.message).toBe("Offline: saved on this phone")
    expect(fetch.calls.length).toBe(0)
    editor.text = TYPED
    await t.client.notifyEdit()
    expect(t.client.status.message).toBe("Offline: saved on this phone")
    expect((await store.load()).text).toBe(TYPED)

    t.nav.onLine = true
    t.win.dispatchEvent(new Event("online"))
    await until(() => t.client.status.state === "synced")
    expect(fetch.posts()).toEqual([{ protocol: 1, device: "phone", base: LOG, text: TYPED }])
    t.client.stop()
  })

  test("a failing fetch means offline, retried with backoff", async () => {
    const { store } = await loadedStore(LOG)
    let n = 0
    const fetch = fakeFetch(() => {
      if (++n <= 2) throw new TypeError("Failed to fetch")
      return merged(TYPED)
    })
    const t = makeClient({ store, fetch, editor: { text: TYPED } })
    t.client.start()
    await until(() => t.client.status.state === "synced")
    const posts = fetch.posts()
    expect(posts.length).toBe(3)
    expect(posts[1]).toEqual(posts[0])
    expect(posts[2]).toEqual(posts[0])
    expect(t.statuses.map((s) => s.state)).toEqual(["syncing", "offline", "syncing", "offline", "syncing", "synced"])
    t.client.stop()
  })

  test("an old protocol needs attention and keeps the text", async () => {
    const { store } = await loadedStore(LOG)
    const fetch = fakeFetch(() => ({ status: 409, body: { status: "error", message: "update needed: this device speaks protocol 1, the server speaks 2" } }))
    const t = makeClient({ store, fetch, editor: { text: TYPED } })
    const s = await t.client.syncNow()
    expect(s).toMatchObject({ state: "attention", message: "Needs attention, not synced: update needed, your text is safe", code: "protocol" })
    expect(await store.load()).toMatchObject({ text: TYPED, base: LOG, pending: null })
  })

  test("a 400 needs attention with the server's message", async () => {
    const { store } = await loadedStore(LOG)
    const fetch = fakeFetch(() => ({ status: 400, body: { status: "error", message: "refused an empty log; the device's text is safe" } }))
    const t = makeClient({ store, fetch, editor: { text: TYPED } })
    const s = await t.client.syncNow()
    expect(s).toMatchObject({ state: "attention", message: "Needs attention, not synced: refused an empty log; the device's text is safe" })
  })

  test("conflict notices show how many lines need review", async () => {
    const { store } = await loadedStore(LOG)
    const fetch = fakeFetch(() => merged(TYPED, ["Session 2026-11-07 needs review: ; conflict 2026-11-07 phone: - Row"]))
    const t = makeClient({ store, fetch, editor: { text: TYPED } })
    expect((await t.client.syncNow()).message).toBe("Synced, 1 line needs review")
  })
})

describe("triggers", () => {
  test("one sync in flight; a second request waits and runs after", async () => {
    const { store } = await loadedStore(LOG)
    let inFlight = 0
    let most = 0
    const fetch = fakeFetch(async (call) => {
      most = Math.max(most, ++inFlight)
      await tick(10)
      inFlight--
      return merged(call.body.text)
    })
    const t = makeClient({ store, fetch, editor: { text: TYPED } })
    await Promise.all([t.client.syncNow(), t.client.syncNow(), t.client.syncNow()])
    expect(most).toBe(1)
    expect(fetch.posts().length).toBe(2) // the one running, and one more for the requests queued behind it
  })

  test("typing saves at once and syncs after a pause; visibility syncs", async () => {
    const { store } = await loadedStore(LOG)
    const fetch = fakeFetch((call) => merged(call.body.text))
    const editor = { text: LOG }
    const t = makeClient({ store, fetch, editor })
    t.client.start()
    await until(() => t.client.status.state === "synced")
    const before = fetch.posts().length

    editor.text = LOG + "- a\n"
    await t.client.notifyEdit()
    expect(t.client.status.message).toBe("Saved on this phone")
    expect((await store.load()).text).toBe(LOG + "- a\n")
    editor.text = LOG + "- ab\n"
    t.client.notifyEdit()
    await tick(5)
    expect(fetch.posts().length).toBe(before) // still typing
    await until(() => fetch.posts().length === before + 1)
    expect(fetch.posts().at(-1).text).toBe(LOG + "- ab\n")

    await until(() => !t.client.running)
    t.doc.visibilityState = "visible"
    t.doc.dispatchEvent(new Event("visibilitychange"))
    await until(() => fetch.posts().length === before + 2)
    t.client.stop()
  })
})
