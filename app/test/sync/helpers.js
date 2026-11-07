// Test helpers: a fake fetch, an editor stand-in, and a client factory.
import { IDBFactory } from "fake-indexeddb"
import { openStore } from "../../src/sync/store.js"
import { SyncClient } from "../../src/sync/client.js"

/**
 * A fetch that hands each call to `handler({url, method, body, signal})`.
 * The handler returns {status, body} (body is JSON-encoded), or throws to
 * simulate a network failure. Every call is recorded in `calls`.
 */
export function fakeFetch(handler) {
  const calls = []
  const f = async (url, init = {}) => {
    const call = { url: String(url), method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : undefined, signal: init.signal }
    calls.push(call)
    const r = await handler(call, calls.length)
    return new Response(r.raw ?? JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } })
  }
  f.calls = calls
  f.posts = () => calls.filter((c) => c.method === "POST").map((c) => c.body)
  f.gets = () => calls.filter((c) => c.method === "GET")
  return f
}

export const merged = (text, notices = []) => ({ status: 200, body: { status: "merged", text, notices, written: true } })

/** A fresh store on its own fake IndexedDB. */
export async function freshStore(idb = new IDBFactory()) {
  return { store: await openStore({ indexedDB: idb }), idb }
}

/** A store that already holds a downloaded log. */
export async function loadedStore(text, idb) {
  const s = await freshStore(idb)
  await s.store.update({ loaded: true, text, base: text, pending: null })
  return s
}

export function makeClient({ store, fetch, editor, device = "phone", online = true, ...rest }) {
  const nav = { onLine: online }
  const win = new EventTarget()
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" })
  const client = new SyncClient({
    store,
    device,
    endpoint: "/api",
    getText: () => editor.text,
    fetch,
    navigator: nav,
    window: win,
    document: doc,
    typingPause: 20,
    backoff: [15],
    now: () => new Date(2026, 10, 7, 18, 42),
    ...rest,
  })
  const statuses = []
  const mergedEvents = []
  const confirms = []
  client.on("status", (s) => statuses.push(s))
  client.on("merged", (m) => {
    mergedEvents.push(m)
    editor.text = m.text // the editor applies the merged text
  })
  client.on("confirm", (q) => confirms.push(q))
  return { client, nav, win, doc, statuses, mergedEvents, confirms }
}

export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

/** Waits until `cond()` is true, or fails after `ms`. */
export async function until(cond, ms = 2000) {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out waiting for a condition")
    await tick(5)
  }
}
