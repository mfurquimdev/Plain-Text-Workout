// Stand-in for app/src/sync/ (docs/web-app-interfaces.md, section 2): an
// in-memory store and a SyncClient whose "server" echoes the device text.
// Development and UI tests only; src/deps.js switches to the real modules.
//
// Test hooks: `?stub=notloaded` starts with no log on the device, and
// `globalThis.__workoutStub` holds {store, client, server} so a test can
// make the client emit an event: `__workoutStub.client.emit("confirm", q)`.

export const SAMPLE_LOG = `[[2026-10-27]]
18h15~19h15
_Lat Pulldown Super Set_
+ Pronated Wide 39kg++5lbs 12^3
+ Supinated Close 39kg++5lbs 12^3
- Pec Fly 39kg 12^3
- Chin Assisted bw-36kg 12^3
- Treadmill 1.57km 20min@4.7km/h 4.5~15⁰

2026-11-05 82.5kg
18h20~19h30
- Row 12x25kg 10x25kg
- Bench Press +22kg x2 15x0kg 12x5kg 10x10kg
- Calf Raise @Step Up Machine 24x54kg 20x54kg
; conflict 2026-11-05 phone: - Row 12x30kg

2026-11-07
18h15
- Leg Press 63kg++5lbs 12 12 8 7 ; heavy today
- Loaded Back Extension 10x23kg, 10x23kg
`

function params() {
  try { return new URLSearchParams(globalThis.location?.search ?? "") } catch { return new URLSearchParams() }
}

const hooks = (globalThis.__workoutStub ??= {})

export async function openStore() {
  const notLoaded = params().get("stub") === "notloaded"
  let state = notLoaded
    ? { loaded: false, text: "", base: "", pending: null, savedAt: null }
    : { loaded: true, text: SAMPLE_LOG, base: SAMPLE_LOG, pending: null, savedAt: Date.now() }
  const store = {
    async load() { return { ...state } },
    async saveText(text) { state = { ...state, text, savedAt: Date.now() } },
    async _setLoaded(text) { state = { ...state, loaded: true, text, base: text, savedAt: Date.now() } },
  }
  hooks.store = store
  return store
}

const hhmm = d => d.toTimeString().slice(0, 5)

export class SyncClient {
  constructor({ store, device, endpoint, getText, isReady, fetch } = {}) {
    Object.assign(this, { store, device, endpoint, getText, isReady })
    this.handlers = {}
    this.timer = null
    // ?stub=notloaded also starts with home unreachable, so the screen stays
    this.server = { text: SAMPLE_LOG, delay: 200, reachable: params().get("stub") !== "notloaded" }
    hooks.client = this
    hooks.server = this.server
  }

  on(event, fn) { (this.handlers[event] ??= []).push(fn); return this }

  emit(event, payload) {
    for (const fn of this.handlers[event] ?? []) fn(payload)
  }

  status(state, message) {
    const s = { state, message, at: Date.now() }
    this.last = s
    this.emit("status", s)
    return s
  }

  async syncNow() {
    const local = await this.store.load()
    if (!this.server.reachable) {
      return this.status(local.loaded ? "offline" : "not-loaded",
        local.loaded ? "Saved on this phone, offline" : "Log not loaded: no connection to home")
    }
    if (!local.loaded) {
      this.status("syncing", "Downloading the log")
      await new Promise(r => setTimeout(r, this.server.delay))
      await this.store._setLoaded(this.server.text)
      this.emit("merged", { text: this.server.text, notices: ["Log downloaded: offline use is ready"] })
      return this.status("synced", `Synced home at ${hhmm(new Date())}`)
    }
    if (!this.isReady()) return this.status("waiting", "Sync waiting: finish the date")
    const sent = this.getText()
    this.status("syncing", "Syncing")
    await new Promise(r => setTimeout(r, this.server.delay))
    this.server.text = sent
    if (this.getText() === sent) this.emit("merged", { text: sent, notices: [] })
    const conflicts = sent.split("\n").filter(l => /^\s*; conflict \d{4}-\d{2}-\d{2} [^\s:]+: /.test(l)).length
    return conflicts
      ? this.status("synced", `Synced, ${conflicts} line${conflicts > 1 ? "s" : ""} need${conflicts > 1 ? "" : "s"} review`)
      : this.status("synced", `Synced home at ${hhmm(new Date())}`)
  }

  answer(choice) {
    this.emit("merged", { text: this.getText(), notices: [choice === "remove" ? "Removed as asked" : "Kept your version"] })
    this.status("synced", `Synced home at ${hhmm(new Date())}`)
  }

  start() {
    this.syncNow()
    this.timer = setInterval(() => {
      if (this.last?.state === "confirm") return
      if (this.isReady() && this.getText && this.getText() !== this.server.text) this.syncNow()
      else if (!this.isReady()) this.status("waiting", "Sync waiting: finish the date")
    }, 4000)
  }

  stop() { clearInterval(this.timer) }
}
