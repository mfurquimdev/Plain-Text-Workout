import { describe, expect, test } from "bun:test"
import { IDBFactory } from "fake-indexeddb"
import { openStore, StoreError, DB_NAME, DB_VERSION } from "../../src/sync/store.js"

describe("store", () => {
  test("a new device is not loaded, and that is not an empty log", async () => {
    const store = await openStore({ indexedDB: new IDBFactory() })
    const rec = await store.load()
    expect(rec).toEqual({ loaded: false, text: "", base: "", pending: null, savedAt: null })
  })

  test("saveText before the first download is refused, not stored as the log", async () => {
    const store = await openStore({ indexedDB: new IDBFactory() })
    const err = await store.saveText("").catch((e) => e)
    expect(err).toBeInstanceOf(StoreError)
    expect(err.code).toBe("not-loaded")
    expect((await store.load()).loaded).toBe(false)
  })

  test("text, base and pending are saved together and survive a reopen", async () => {
    const idb = new IDBFactory()
    const store = await openStore({ indexedDB: idb, now: () => 1234 })
    await store.update({ loaded: true, text: "a\n", base: "a\n" })
    const pending = { protocol: 1, device: "phone", base: "a\n", text: "a\nb\n" }
    const rec = await store.update({ text: "a\nb\n", pending })
    expect(rec).toEqual({ loaded: true, text: "a\nb\n", base: "a\n", pending, savedAt: 1234 })
    store.close()
    const again = await openStore({ indexedDB: idb })
    expect(await again.load()).toEqual(rec)
    await again.saveText("c\n")
    expect((await again.load()).text).toBe("c\n")
    expect((await again.load()).pending).toEqual(pending)
  })

  test("the database is named workout, at a versioned schema", async () => {
    const idb = new IDBFactory()
    await openStore({ indexedDB: idb })
    const dbs = await idb.databases()
    expect(dbs).toEqual([{ name: DB_NAME, version: DB_VERSION }])
  })

  test("a failing write gives an error the UI can show", async () => {
    const idb = new IDBFactory()
    const store = await openStore({ indexedDB: idb })
    await store.update({ loaded: true, text: "a\n", base: "a\n" })
    store.close() // writes now fail
    const err = await store.saveText("b\n").catch((e) => e)
    expect(err).toBeInstanceOf(StoreError)
    expect(err.message).toStartWith("could not save on this device")
  })

  test("persist() and estimate() report the browser's answer", async () => {
    let asked = 0
    const storage = {
      persisted: async () => false,
      persist: async () => (asked++, true),
      estimate: async () => ({ usage: 10, quota: 100, usageDetails: {} }),
    }
    const store = await openStore({ indexedDB: new IDBFactory(), storage })
    expect(await store.persist()).toBe(true)
    expect(asked).toBe(1)
    expect(await store.estimate()).toEqual({ usage: 10, quota: 100 })
    const bare = await openStore({ indexedDB: new IDBFactory(), storage: {} })
    expect(await bare.persist()).toBe(false)
    expect(await bare.estimate()).toBeNull()
  })
})
