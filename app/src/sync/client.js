// The sync client: follows the device rule from the design brief.
//
//  1. One sync at a time. The request is stored as `pending` before it is sent.
//  2. If the outcome is unknown (network error, timeout, 5xx), the same
//     pending request is resent later. The server's merge is repeat-safe.
//  3. On a merged reply, if the editor still equals the text sent, the merged
//     text becomes the editor text and the base.
//  4. If the owner typed during the sync, the editor is left alone, the sent
//     text becomes the base, and it syncs again.
//  5. Text, base and pending request are saved in one transaction (store.js).
//
// No Nue or CodeMirror imports: the UI wires getText/isReady and the events.

export const PROTOCOL = 1

const TYPING_PAUSE = 2000 // ms after the last edit before a sync
const TIMEOUT = 20000 // ms before a request counts as lost
const BACKOFF = [2000, 5000, 10000, 30000, 60000]

/** @typedef {"not-loaded"|"saved"|"syncing"|"synced"|"waiting"|"offline"|"confirm"|"attention"} State */
/** @typedef {{state: State, message: string, at: number, reason?: string, notices?: string[], code?: string}} Status */

export class SyncClient {
  /**
   * @param {object} o
   * @param {ReturnType<typeof import("./store.js").openStore> extends Promise<infer S> ? S : never} o.store
   * @param {string} o.device        the device name, such as "phone-3f9a" (src/ui/settings.js); may be reassigned
   * @param {string} [o.endpoint]    "/api"
   * @param {() => string} o.getText the editor's current text
   * @param {() => boolean} [o.isReady] false while composing or a date is unfinished
   * @param {typeof fetch} [o.fetch]
   * @param {string} [o.serverName]  how the status names the server: "Synced home at 18:42"
   * @param {number} [o.typingPause] ms (default 2000)
   * @param {number} [o.timeout]     ms per request (default 20000)
   * @param {number[]} [o.backoff]   retry delays in ms
   * @param {{onLine?: boolean}} [o.navigator]   injectable for tests
   * @param {EventTarget} [o.window]  receives "online" / "offline" (default globalThis)
   * @param {{visibilityState?: string} & EventTarget} [o.document] receives "visibilitychange"
   * @param {() => Date} [o.now]
   */
  constructor(o) {
    this.store = o.store
    this.device = o.device
    this.endpoint = (o.endpoint ?? "/api").replace(/\/$/, "")
    this.getText = o.getText
    this.isReady = o.isReady ?? (() => true)
    this.fetch = o.fetch ?? globalThis.fetch.bind(globalThis)
    this.serverName = o.serverName ?? "home"
    this.typingPause = o.typingPause ?? TYPING_PAUSE
    this.timeout = o.timeout ?? TIMEOUT
    this.backoff = o.backoff ?? BACKOFF
    this.nav = o.navigator ?? globalThis.navigator
    this.win = o.window ?? globalThis
    this.doc = o.document ?? globalThis.document
    this.now = o.now ?? (() => new Date())

    /** @type {Record<string, Set<Function>>} */
    this.handlers = { status: new Set(), merged: new Set(), confirm: new Set() }
    /** @type {Status} */
    this.status = { state: "not-loaded", message: "Log not loaded on this device yet", at: Date.now() }
    this.running = null // the sync in flight
    this.again = false // another sync was asked for while one ran
    this.question = null // {removalId, removals, request}
    this.answerGiven = null // "remove" | "keep"
    this.failures = 0
    this.retryTimer = null
    this.typingTimer = null
    this.saving = null
    this.saveAgain = false
    this.started = false
    this.listeners = []
  }

  // ---------- events ----------

  /** @param {"status"|"merged"|"confirm"} name @returns {() => void} unsubscribe */
  on(name, fn) {
    this.handlers[name].add(fn)
    return () => this.handlers[name].delete(fn)
  }

  emit(name, value) {
    for (const fn of this.handlers[name]) {
      try {
        fn(value)
      } catch (e) {
        console.error(`sync: a "${name}" handler failed`, e)
      }
    }
  }

  /** @param {State} state @param {string} message @param {object} [extra] */
  setStatus(state, message, extra = {}) {
    this.status = { state, message, at: this.now().getTime(), ...extra }
    this.emit("status", this.status)
    return this.status
  }

  // ---------- triggers ----------

  /** Sync on open, when the page becomes visible, on regaining the network, and after typing pauses. */
  start() {
    if (this.started) return
    this.started = true
    const listen = (target, type, fn) => {
      if (!target?.addEventListener) return
      target.addEventListener(type, fn)
      this.listeners.push(() => target.removeEventListener(type, fn))
    }
    listen(this.win, "online", () => {
      this.failures = 0
      this.syncNow()
    })
    listen(this.win, "offline", () => {
      if (!this.running) this.setStatus("offline", this.offlineMessage())
    })
    listen(this.doc, "visibilitychange", () => {
      if (this.doc.visibilityState === "visible") this.syncNow()
    })
    this.syncNow()
  }

  stop() {
    this.started = false
    for (const off of this.listeners) off()
    this.listeners = []
    clearTimeout(this.retryTimer)
    clearTimeout(this.typingTimer)
    this.retryTimer = this.typingTimer = null
  }

  /**
   * Call on every change the owner makes (not for applied merges). Saves the
   * editor text on this device right away (coalesced) and, once start() has
   * run, syncs when typing pauses.
   * @returns {Promise<void>} resolves when the text is saved
   */
  notifyEdit() {
    clearTimeout(this.typingTimer)
    if (this.started) {
      this.typingTimer = setTimeout(() => {
        this.typingTimer = null
        this.syncNow()
      }, this.typingPause)
    }
    return this.saveEditor()
  }

  /** Saves getText() to the store; one save at a time, the last one wins. */
  saveEditor() {
    if (this.saving) {
      this.saveAgain = true
      return this.saving
    }
    this.saving = (async () => {
      do {
        this.saveAgain = false
        const text = this.getText()
        try {
          await this.store.saveText(text)
        } catch (e) {
          if (e?.code === "not-loaded") return // nothing to save into yet
          this.setStatus("attention", `Could not save on this device: ${e?.message ?? e}. Copy your text to keep it.`, { code: "save-failed" })
          return
        }
      } while (this.saveAgain)
      if (!this.running && ["synced", "saved", "offline"].includes(this.status.state)) {
        if (this.status.state === "offline") this.setStatus("offline", this.offlineMessage())
        else this.setStatus("saved", `Saved on this ${this.device}`)
      }
    })().finally(() => {
      this.saving = null
    })
    return this.saving
  }

  offlineMessage() {
    return `Offline: saved on this ${this.device}`
  }

  scheduleRetry() {
    clearTimeout(this.retryTimer)
    if (!this.started) return
    const delay = this.backoff[Math.min(this.failures, this.backoff.length) - 1] ?? this.backoff.at(-1)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.syncNow()
    }, delay)
  }

  // ---------- the removal question ----------

  /** Answers the open removal question and resends. @param {"remove"|"keep"} choice */
  answer(choice) {
    if (!this.question) return Promise.resolve(this.status)
    if (choice !== "remove" && choice !== "keep") throw new Error(`answer must be "remove" or "keep", not ${choice}`)
    this.answerGiven = choice
    return this.syncNow()
  }

  // ---------- the sync ----------

  /** Runs a sync now, or after the one in flight. @returns {Promise<Status>} */
  syncNow() {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = (async () => {
      let status
      do {
        this.again = false
        try {
          status = await this.cycle()
        } catch (e) {
          status = this.setStatus("attention", `Needs attention, not synced: ${e?.message ?? e}`, { code: e?.code ?? "error" })
        }
      } while (this.again && this.syncable())
      return status
    })().finally(() => {
      this.running = null
    })
    return this.running
  }

  /** Whether a queued sync should run (not when only the question is open). */
  syncable() {
    return !(this.question && !this.answerGiven)
  }

  /** One pass of the device rule. Loops while the owner typed during a sync. */
  async cycle() {
    let rec = await this.store.load()
    if (!rec.loaded) return this.download()

    for (let round = 0; round < 10; round++) {
      if (this.nav && this.nav.onLine === false && !this.question) return this.offline()
      let request
      if (rec.pending) {
        // A sync whose outcome is unknown: resend it exactly.
        request = rec.pending
      } else if (this.question) {
        if (!this.answerGiven) return this.setStatus("confirm", "Sync waiting: answer the removal question", { removals: this.question.removals })
        const q = this.question
        request = this.answerGiven === "remove" ? { ...q.request, confirm: q.removalId } : { ...q.request, keep: true }
        this.question = this.answerGiven = null
        rec = await this.store.update({ pending: request })
      } else {
        if (!this.isReady()) return this.setStatus("waiting", "Sync waiting: finish the date", { reason: "not-ready" })
        const text = this.getText()
        request = { protocol: PROTOCOL, device: this.device, base: rec.base, text }
        rec = await this.store.update({ text, pending: request })
      }
      if (this.nav && this.nav.onLine === false) return this.offline()
      this.setStatus("syncing", `Syncing with ${this.serverName}…`)
      const reply = await this.send(request)

      if (reply.kind === "unknown") return reply.offline ? this.offline() : this.retryLater(reply.message)
      this.failures = 0

      if (reply.kind === "merged") {
        if (this.getText() === request.text) {
          // Emit before any await, so the editor applies it before more typing.
          this.emit("merged", { text: reply.text, notices: reply.notices })
          await this.store.update({ text: reply.text, base: reply.text, pending: null })
          return this.synced(reply.notices)
        }
        // The owner typed meanwhile: the sent text is what the server has
        // merged, so it is the new base; sync the new typing.
        rec = await this.store.update({ text: this.getText(), base: request.text, pending: null })
        continue
      }

      // Every other reply is a known outcome where nothing was merged.
      rec = await this.store.update({ pending: null })
      if (reply.kind === "confirm") {
        this.question = { removalId: reply.removalId, removals: reply.removals, request: stripAnswer(request) }
        this.answerGiven = null
        const s = this.setStatus("confirm", "Sync waiting: answer the removal question", { removals: reply.removals })
        this.emit("confirm", { removalId: reply.removalId, removals: reply.removals })
        return s
      }
      if (reply.kind === "wait") return this.setStatus("waiting", "Sync waiting: finish the date", { reason: reply.reason })
      if (reply.kind === "protocol") {
        return this.setStatus("attention", "Needs attention, not synced: update needed, your text is safe", { reason: reply.message, code: "protocol" })
      }
      return this.setStatus("attention", `Needs attention, not synced: ${reply.message}`, { reason: reply.message, code: "refused" })
    }
    return this.retryLater("the text kept changing during the sync")
  }

  synced(notices) {
    const review = notices.filter((n) => / needs review: /.test(n)).length
    const time = hhmm(this.now())
    const message = review
      ? `Synced, ${review} line${review === 1 ? "" : "s"} need${review === 1 ? "s" : ""} review`
      : `Synced ${this.serverName} at ${time}`
    return this.setStatus("synced", message, { notices })
  }

  offline() {
    this.failures++
    this.scheduleRetry()
    return this.setStatus("offline", this.offlineMessage())
  }

  retryLater(why) {
    this.failures++
    this.scheduleRetry()
    return this.setStatus("waiting", `Sync waiting: ${why}; will retry`, { reason: why })
  }

  /** First open: download the whole log and keep it as text and base. */
  async download() {
    if (this.nav && this.nav.onLine === false) {
      this.failures++
      this.scheduleRetry()
      return this.setStatus("not-loaded", "Offline: the log is not on this device yet; connect once to download it")
    }
    this.setStatus("not-loaded", `Downloading the log from ${this.serverName}…`)
    let res, body
    try {
      res = await this.request(`${this.endpoint}/log`, { method: "GET" })
      body = await res.json()
    } catch (e) {
      this.failures++
      this.scheduleRetry()
      return this.setStatus("not-loaded", `Not loaded: could not reach ${this.serverName}; will retry`, { reason: String(e?.message ?? e) })
    }
    if (!res.ok || typeof body?.text !== "string") {
      this.failures++
      this.scheduleRetry()
      return this.setStatus("not-loaded", `Not loaded: ${body?.message ?? `the server answered ${res.status}`}`, { reason: body?.message })
    }
    if (body.protocol !== PROTOCOL) {
      return this.setStatus("attention", "Needs attention, not loaded: update needed", { code: "protocol" })
    }
    this.failures = 0
    // Saved before the editor gets it: the log is on the device from now on.
    await this.store.update({ loaded: true, text: body.text, base: body.text, pending: null })
    this.emit("merged", { text: body.text, notices: [], loaded: true })
    return this.setStatus("synced", `Synced ${this.serverName} at ${hhmm(this.now())}; ready offline`, { notices: [] })
  }

  /** fetch with a timeout. */
  async request(url, init) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(new Error("timed out")), this.timeout)
    try {
      return await this.fetch(url, { ...init, signal: ctrl.signal, cache: "no-store", credentials: "same-origin" })
    } finally {
      clearTimeout(t)
    }
  }

  /**
   * Sends one sync request and classifies the reply.
   * @returns {Promise<{kind: "merged", text: string, notices: string[]}
   *   | {kind: "confirm", removalId: string, removals: string[]}
   *   | {kind: "wait", reason: string}
   *   | {kind: "protocol"|"refused", message: string}
   *   | {kind: "unknown", offline: boolean, message: string}>}
   */
  async send(request) {
    let res
    try {
      res = await this.request(`${this.endpoint}/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      })
    } catch (e) {
      // Network failure or timeout: the server may or may not have merged.
      const timedOut = e?.name === "AbortError" || /timed out/.test(String(e?.message ?? e))
      return { kind: "unknown", offline: !timedOut, message: timedOut ? `${this.serverName} did not answer` : String(e?.message ?? e) }
    }
    let body = null
    try {
      body = await res.json()
    } catch {
      // A proxy error page, or a reply cut short.
    }
    if (res.status >= 500 || !body) {
      return { kind: "unknown", offline: false, message: body?.message ?? `${this.serverName} answered ${res.status}` }
    }
    if (res.status === 200 && body.status === "merged") return { kind: "merged", text: body.text, notices: body.notices ?? [] }
    if (body.status === "confirm") return { kind: "confirm", removalId: body.removal_id, removals: body.removals ?? [] }
    if (body.status === "wait") return { kind: "wait", reason: body.reason ?? "" }
    if (res.status === 409) return { kind: "protocol", message: body.message ?? "update needed" }
    return { kind: "refused", message: body.message ?? `${this.serverName} answered ${res.status}` }
  }
}

function stripAnswer({ confirm, keep, ...request }) {
  return request
}

function hhmm(d) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}
