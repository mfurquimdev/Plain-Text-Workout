import { test, expect } from "bun:test"
import { EditorState } from "@codemirror/state"
import { history, undo, undoDepth } from "@codemirror/commands"
import { diffText, remoteSpec, RemoteApplier } from "../../src/editor/remote.js"

const apply = (a, changes) => {
  let out = "", pos = 0
  for (const c of changes) { out += a.slice(pos, c.from) + c.insert; pos = c.to }
  return out + a.slice(pos)
}

test("diffText gives changes that turn a into b", () => {
  const cases = [
    ["", "x"], ["x", ""], ["a\nb\nc\n", "a\nB\nc\n"], ["a\nb\nc", "z\na\nb\nc\nd"],
    ["2026-01-01\n- Row 12x20kg\n", "2026-01-01\n- Row 12x25kg\n- Bench 12x40kg\n; conflict 2026-01-01 phone: - Row 12x30kg\n"],
    ["a\nb\na\nb\n", "b\na\nb\na\n"],
  ]
  for (const [a, b] of cases) expect(apply(a, diffText(a, b))).toBe(b)
})

test("diffText keeps unchanged lines out of the changes", () => {
  const a = "l1\nl2\nl3\nl4\n"
  const changes = diffText(a, "l1\nl2 more\nl3\nl4\n")
  expect(changes).toEqual([{ from: 5, to: 5, insert: " more" }])
})

const LOG = "2026-11-05\n- Row 12x25kg\n\n2026-11-07\n- Bench 12x40kg\n"

function host(state, now = { t: 0 }) {
  const h = {
    st: state,
    timers: [],
    state: () => h.st,
    dispatch(spec) { const tr = h.st.update(spec); h.st = tr.state; return tr },
    composing: () => h.isComposing ?? false,
    now: () => now.t,
    later: (fn, ms) => { h.timers.push({ fn, ms }); return h.timers.length },
  }
  return h
}

test("remote text keeps the cursor on the same logical line", () => {
  let state = EditorState.create({ doc: LOG, extensions: [history()] })
  const bench = LOG.indexOf("Bench")
  state = state.update({ selection: { anchor: bench } }).state
  const merged = "2026-11-01\n- Squat 5x100kg\n\n" + LOG
  state = state.update(remoteSpec(state, merged)).state
  expect(state.doc.toString()).toBe(merged)
  const line = state.doc.lineAt(state.selection.main.head)
  expect(line.text).toBe("- Bench 12x40kg")
  expect(state.selection.main.head - line.from).toBe(2)
})

test("remote text is not in the undo history", () => {
  let state = EditorState.create({ doc: LOG, extensions: [history()] })
  // the owner types a set...
  state = state.update({ changes: { from: LOG.length - 1, insert: " 10x40kg" }, userEvent: "input.type" }).state
  const typed = state.doc.toString()
  // ...then a remote change arrives
  const merged = typed.replace("12x25kg", "12x25kg 10x25kg")
  state = state.update(remoteSpec(state, merged)).state
  expect(undoDepth(state)).toBe(1)
  let after
  undo({ state, dispatch: tr => { after = tr.state } })
  // undo removes only the owner's typing; the remote change stays
  expect(after.doc.toString()).toBe(LOG.replace("12x25kg", "12x25kg 10x25kg"))
})

test("RemoteApplier waits for a quiet pause and for composition to end", () => {
  const now = { t: 10_000 }
  const h = host(EditorState.create({ doc: LOG, extensions: [history()] }), now)
  const r = new RemoteApplier(h, { quietMs: 3000 })
  r.lastInput = 9_000           // last keystroke one second ago
  r.offer(LOG + "\n2026-11-08\n")
  expect(r.tryApply()).toBe(false)
  now.t = 12_100
  h.isComposing = true
  expect(r.tryApply()).toBe(false)
  h.isComposing = false
  expect(r.tryApply()).toBe(true)
  expect(h.st.doc.toString()).toBe(LOG + "\n2026-11-08\n")
})

test("typing between offer and apply is kept (remote changes are mapped over it)", () => {
  const now = { t: 0 }
  const h = host(EditorState.create({ doc: LOG, extensions: [history()] }), now)
  const r = new RemoteApplier(h, { quietMs: 3000 })
  r.offer("2026-11-01\n- Squat 5x100kg\n\n" + LOG)
  // the owner types at the end before it applies
  const tr = h.dispatch({ changes: { from: LOG.length - 1, insert: " 8x40kg" }, userEvent: "input.type" })
  r.observe({ docChanged: true, transactions: [tr], changes: tr.changes })
  now.t = 5000
  expect(r.tryApply()).toBe(true)
  expect(h.st.doc.toString()).toBe("2026-11-01\n- Squat 5x100kg\n\n" + LOG.replace("12x40kg\n", "12x40kg 8x40kg\n"))
})
