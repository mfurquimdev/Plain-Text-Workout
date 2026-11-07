// Device storage for the workout log: one IndexedDB record that holds the
// editor text, the base (the text this device last agreed with the server)
// and the pending sync request. All three are written in ONE transaction,
// so they can never disagree after a crash (device rule, point 5).
//
//   const store = await openStore()
//   await store.load()        // {loaded, text, base, pending, savedAt}
//   await store.saveText(t)   // durable before it resolves
//
// "Not loaded" (no download yet) is its own state, never an empty log.

/** @typedef {{protocol: number, device: string, base: string, text: string, confirm?: string, keep?: boolean}} SyncRequest */
/** @typedef {{loaded: boolean, text: string, base: string, pending: SyncRequest|null, savedAt: number|null}} LogRecord */

export const DB_NAME = "workout"
/** Schema version. Raise it and add a step to MIGRATIONS for a new schema. */
export const DB_VERSION = 1
const LOG = "log" // object store
const KEY = "current" // the one record

/**
 * Upgrade steps, by the version they lead to. A step runs inside the
 * versionchange transaction. Migrations must never drop or rewrite the
 * record's `text`, `base` or `pending`: that is unsynced work.
 * @type {Record<number, (db: IDBDatabase, tx: IDBTransaction) => void>}
 */
const MIGRATIONS = {
  1: (db) => {
    db.createObjectStore(LOG)
  },
}

/** A storage failure the UI can show as is. */
export class StoreError extends Error {
  /** @param {string} message @param {{code?: string, cause?: unknown}} [opts] */
  constructor(message, { code = "save-failed", cause } = {}) {
    super(message, { cause })
    this.name = "StoreError"
    this.code = code // "save-failed" | "load-failed" | "open-failed" | "not-loaded" | "blocked"
  }
}

const reason = (e) => (e && (e.name || e.message)) ? `${e.name || "Error"}: ${e.message || ""}`.trim() : String(e)

/** @returns {LogRecord} */
function empty() {
  return { loaded: false, text: "", base: "", pending: null, savedAt: null }
}

/**
 * Opens (and creates or upgrades) the database.
 * @param {{name?: string, indexedDB?: IDBFactory, storage?: StorageManager, now?: () => number}} [opts]
 *   `indexedDB` and `storage` are injectable for tests.
 */
export async function openStore(opts = {}) {
  const idb = opts.indexedDB ?? globalThis.indexedDB
  const name = opts.name ?? DB_NAME
  const now = opts.now ?? Date.now
  if (!idb) throw new StoreError("could not open storage on this device: IndexedDB is not available", { code: "open-failed" })

  const db = await new Promise((resolve, reject) => {
    let req
    try {
      req = idb.open(name, DB_VERSION)
    } catch (e) {
      reject(new StoreError(`could not open storage on this device (${reason(e)})`, { code: "open-failed", cause: e }))
      return
    }
    req.onupgradeneeded = (ev) => {
      const db = req.result
      const tx = req.transaction
      for (let v = (ev.oldVersion || 0) + 1; v <= DB_VERSION; v++) MIGRATIONS[v]?.(db, tx)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(new StoreError(`could not open storage on this device (${reason(req.error)})`, { code: "open-failed", cause: req.error }))
    req.onblocked = () => reject(new StoreError("could not open storage on this device: another tab holds an older version open; close it and reload", { code: "blocked" }))
  })
  // Another tab wants a newer schema: let it, this page reloads to follow.
  db.onversionchange = () => db.close()
  return new Store(db, { storage: opts.storage, now })
}

class Store {
  /** @param {IDBDatabase} db */
  constructor(db, { storage, now }) {
    this.db = db
    this.storage = storage
    this.now = now
  }

  /** @param {IDBTransactionMode} mode */
  #tx(mode) {
    // Strict durability: the write reaches the disk before `complete` fires.
    // Browsers without the option ignore the extra argument.
    return mode === "readwrite" ? this.db.transaction(LOG, mode, { durability: "strict" }) : this.db.transaction(LOG, mode)
  }

  /** @returns {Promise<LogRecord>} */
  load() {
    return new Promise((resolve, reject) => {
      let tx
      try {
        tx = this.#tx("readonly")
      } catch (e) {
        reject(new StoreError(`could not read storage on this device (${reason(e)})`, { code: "load-failed", cause: e }))
        return
      }
      const req = tx.objectStore(LOG).get(KEY)
      req.onsuccess = () => resolve({ ...empty(), ...(req.result ?? {}) })
      tx.onerror = () => reject(new StoreError(`could not read storage on this device (${reason(tx.error)})`, { code: "load-failed", cause: tx.error }))
    })
  }

  /**
   * Changes fields of the record in one readwrite transaction (read, merge,
   * put), resolving with the new record only after the transaction has
   * completed. `text`, `base` and `pending` given together land together.
   * @param {Partial<LogRecord>} patch
   * @returns {Promise<LogRecord>}
   */
  update(patch) {
    return new Promise((resolve, reject) => {
      const fail = (e) => reject(e instanceof StoreError ? e : new StoreError(`could not save on this device (${reason(e)})`, { cause: e }))
      let tx
      try {
        tx = this.#tx("readwrite")
      } catch (e) {
        fail(e)
        return
      }
      let next
      const os = tx.objectStore(LOG)
      const get = os.get(KEY)
      get.onsuccess = () => {
        const cur = { ...empty(), ...(get.result ?? {}) }
        const loaded = patch.loaded ?? cur.loaded
        if (!loaded && "text" in patch) {
          tx.abort()
          fail(new StoreError("the log is not loaded on this device yet; nothing was saved", { code: "not-loaded" }))
          return
        }
        next = { ...cur, ...patch, loaded, savedAt: this.now() }
        try {
          os.put(next, KEY)
        } catch (e) {
          tx.abort()
          fail(e)
        }
      }
      tx.oncomplete = () => resolve(next)
      tx.onerror = () => fail(tx.error)
      tx.onabort = () => fail(tx.error ?? new Error("the transaction was aborted"))
    })
  }

  /**
   * Saves the editor text. Refused (code "not-loaded") before the first
   * download, so a blank editor is never stored as the log.
   * @param {string} text
   */
  saveText(text) {
    return this.update({ text })
  }

  /** Asks the browser to keep this site's storage. Resolves true when granted. */
  async persist() {
    const s = this.storage ?? globalThis.navigator?.storage
    if (!s?.persist) return false
    try {
      return (await s.persisted?.()) || (await s.persist())
    } catch {
      return false
    }
  }

  /** `{usage, quota}` in bytes, or null where unsupported. */
  async estimate() {
    const s = this.storage ?? globalThis.navigator?.storage
    if (!s?.estimate) return null
    try {
      const { usage, quota } = await s.estimate()
      return { usage, quota }
    } catch {
      return null
    }
  }

  close() {
    this.db.close()
  }
}
