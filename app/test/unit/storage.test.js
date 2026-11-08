import { expect, test } from "bun:test"
import { keepOnDevice, NOT_PERSISTED } from "../../src/ui/storage.js"

const quiet = () => {
  const lines = []
  return { lines, info: (...a) => lines.push(["info", a.join(" ")]), warn: (...a) => lines.push(["warn", a.join(" ")]) }
}

test("granted: no note, and the outcome is logged", async () => {
  const notes = [], log = quiet()
  let calls = 0
  const kept = await keepOnDevice({ persist: async () => { calls++; return true } }, { note: t => notes.push(t), log })
  expect(kept).toBe(true)
  expect(calls).toBe(1)
  expect(notes).toEqual([])
  expect(log.lines).toEqual([["info", "storage: persistent, the browser keeps the log"]])
})

test("refused: a short note in the settings panel, nothing blocked", async () => {
  const notes = [], log = quiet()
  expect(await keepOnDevice({ persist: async () => false }, { note: t => notes.push(t), log })).toBe(false)
  expect(notes).toEqual([NOT_PERSISTED])
  expect(log.lines[0][1]).toStartWith("storage: not persistent")
})

test("a throwing persist() or none at all counts as refused, and does not reject", async () => {
  for (const store of [{ persist: async () => { throw new Error("SecurityError") } }, { persist: () => { throw new Error("sync") } }, {}]) {
    const notes = [], log = quiet()
    expect(await keepOnDevice(store, { note: t => notes.push(t), log })).toBe(false)
    expect(notes).toEqual([NOT_PERSISTED])
  }
})

test("with the real store: persist() asks the browser once it is loaded", async () => {
  const { IDBFactory } = await import("fake-indexeddb")
  const { openStore } = await import("../../src/sync/store.js")
  let asked = 0
  const storage = { persisted: async () => false, persist: async () => { asked++; return true } }
  const store = await openStore({ indexedDB: new IDBFactory(), storage })
  expect(await keepOnDevice(store, { log: quiet() })).toBe(true)
  expect(asked).toBe(1)
})
