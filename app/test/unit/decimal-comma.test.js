import { test, expect } from "bun:test"
import { EditorState } from "@codemirror/state"
import { history, undo, undoDepth } from "@codemirror/commands"
import { decimalComma, decimalCommaOnLine } from "../../src/editor/decimal-comma.js"

const make = (doc = "") => EditorState.create({ doc, extensions: [decimalComma, history()] })

// type a string at the end, one keystroke at a time
function typeChars(state, chars) {
  for (const ch of chars) {
    state = state.update({ changes: { from: state.doc.length, insert: ch }, selection: { anchor: state.doc.length + 1 }, userEvent: "input.type" }).state
  }
  return state
}

test("2,5kg typed key by key is saved as 2.5kg", () => {
  expect(typeChars(make("- Curl "), "12x2,5kg").doc.toString()).toBe("- Curl 12x2.5kg")
})

test("a batch from an Android keyboard is fixed too", () => {
  const s = make("- Curl ").update({ changes: { from: 7, insert: "12x2,5kg" }, userEvent: "input.type" }).state
  expect(s.doc.toString()).toBe("- Curl 12x2.5kg")
})

test("a comma between sets is not touched", () => {
  expect(typeChars(make("- Ext "), "10x23kg, 10x23kg").doc.toString()).toBe("- Ext 10x23kg, 10x23kg")
  expect(typeChars(make("- Ext "), "10x23kg,10x23kg").doc.toString()).toBe("- Ext 10x23kg,10x23kg")
})

test("a comma in reps becomes a point too (then the parser flags it)", () => {
  expect(typeChars(make("- Row "), "12,5").doc.toString()).toBe("- Row 12.5")
})

test("older text is left alone; only commas next to the input change", () => {
  const s = make("- A 1,5kg\n- B ").update({ changes: { from: 14, insert: "2,5kg" }, userEvent: "input.type" }).state
  expect(s.doc.toString()).toBe("- A 1,5kg\n- B 2.5kg")
})

test("non-input changes (remote text, fixes) are not touched", () => {
  const s = make("").update({ changes: { from: 0, insert: "2,5kg" } }).state
  expect(s.doc.toString()).toBe("2,5kg")
})

test("the fix is part of the typing's undo step: undo never brings the comma back", () => {
  let s = typeChars(make("- Curl 12x"), "2,5")
  expect(s.doc.toString()).toBe("- Curl 12x2.5")
  expect(undoDepth(s)).toBe(1)
  let after
  undo({ state: s, dispatch: tr => { after = tr.state } })
  expect(after.doc.toString()).toBe("- Curl 12x")
})

test("after a composition, the cursor's line is fixed", () => {
  let s = make("- Row 2,5kg")
  s = s.update({ selection: { anchor: 5 } }).state
  const changes = decimalCommaOnLine(s)
  expect(s.update({ changes }).state.doc.toString()).toBe("- Row 2.5kg")
})
