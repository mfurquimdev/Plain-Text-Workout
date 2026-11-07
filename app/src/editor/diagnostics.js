// Diagnostics from lang.diagnostics(text) through @codemirror/lint, with
// quick fixes. Set-by-set logging leaves the active line unfinished most
// of the time, so diagnostics on the line being typed are held until the
// cursor leaves it.

import { StateField } from "@codemirror/state"
import { linter } from "@codemirror/lint"

/**
 * The line being typed: the start of the line the owner last edited, while
 * the cursor is still on it; null otherwise. Moving onto a line without
 * typing does not hold it, so its messages stay readable.
 */
export const heldLine = StateField.define({
  create: () => null,
  update(value, tr) {
    const head = tr.state.selection.main.head
    const line = tr.state.doc.lineAt(head)
    if (tr.docChanged && (tr.isUserEvent("input") || tr.isUserEvent("delete"))) return line.from
    if (value == null) return null
    const mapped = tr.changes.mapPos(value)
    const held = tr.state.doc.lineAt(Math.min(mapped, tr.state.doc.length)).from
    return held === line.from ? held : null
  },
})

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n | 0))

/** Section-1 diagnostics to CodeMirror diagnostics, skipping the held line. */
export function toCmDiagnostics(doc, list, held = null) {
  const out = []
  for (const d of list) {
    const n = (d?.line | 0) + 1
    if (n < 1 || n > doc.lines) continue
    const line = doc.line(n)
    if (held != null && line.from === held) continue
    const from = line.from + clamp(d.from, 0, line.length)
    const to = line.from + clamp(d.to, 0, line.length)
    const fix = d.fix
    out.push({
      from,
      to: Math.max(from, to),
      severity: d.severity === "error" ? "error" : "warning",
      message: String(d.message ?? ""),
      actions: fix ? [{
        name: fix.title || "Fix",
        apply(view, dfrom) {
          // the diagnostic's range is kept mapped; the fix columns are on its line
          const l = view.state.doc.lineAt(Math.min(dfrom, view.state.doc.length))
          view.dispatch({
            changes: {
              from: l.from + clamp(fix.from, 0, l.length),
              to: l.from + clamp(fix.to, 0, l.length),
              insert: String(fix.text ?? ""),
            },
            userEvent: "fix",
          })
        },
      }] : [],
    })
  }
  return out
}

export function workoutLinter(lang, { delay = 400 } = {}) {
  return [
    heldLine,
    linter(view => toCmDiagnostics(view.state.doc, lang.diagnostics(view.state.doc.toString()), view.state.field(heldLine)), {
      delay,
      needsRefresh: u => u.startState.field(heldLine) !== u.state.field(heldLine),
    }),
  ]
}

/** Diagnostics on one line (for the tap panel on touch devices). */
export function lineDiagnostics(lang, doc, lineNumber) {
  return lang.diagnostics(doc.toString()).filter(d => (d?.line | 0) + 1 === lineNumber)
}
