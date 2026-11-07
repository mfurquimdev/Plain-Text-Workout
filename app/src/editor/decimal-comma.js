// A decimal comma typed between two digits (`2,5kg`, from a Portuguese
// keyboard) is saved as a point. Only commas next to what was just typed
// are touched, and only between two digits, so `10x23kg, 10x23kg` and
// older text stay as they are.

import { EditorState } from "@codemirror/state"

const isDigit = ch => ch >= "0" && ch <= "9"

/** Positions in `doc` of decimal commas touched by the given ranges. */
export function decimalCommas(doc, ranges) {
  const found = new Set()
  for (const { from, to } of ranges) {
    const lo = Math.max(1, from - 1), hi = Math.min(doc.length - 2, to)
    for (let p = lo; p <= hi; p++) {
      if (doc.sliceString(p, p + 1) === "," &&
          isDigit(doc.sliceString(p - 1, p)) && isDigit(doc.sliceString(p + 1, p + 2))) found.add(p)
    }
  }
  return [...found].sort((a, b) => a - b)
}

const toPoints = positions => positions.map(p => ({ from: p, to: p + 1, insert: "." }))

/** Transaction filter: typed input gets its decimal commas replaced. */
export const decimalComma = EditorState.transactionFilter.of(tr => {
  // Leave the text alone while the keyboard composes (IME); the line is
  // fixed when composition ends (see decimalCommaOnLine).
  if (!tr.docChanged || !tr.isUserEvent("input") || tr.isUserEvent("input.type.compose")) return tr
  const ranges = []
  tr.changes.iterChangedRanges((_fa, _ta, from, to) => ranges.push({ from, to }))
  const positions = decimalCommas(tr.newDoc, ranges)
  if (!positions.length) return tr
  return [tr, { changes: toPoints(positions), sequential: true }]
})

/** Changes that fix decimal commas on the cursor's line (after composition). */
export function decimalCommaOnLine(state) {
  const line = state.doc.lineAt(state.selection.main.head)
  const positions = decimalCommas(state.doc, [{ from: line.from, to: line.to }])
  return positions.length ? toPoints(positions) : null
}
