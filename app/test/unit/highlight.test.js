import { test, expect } from "bun:test"
import { Text } from "@codemirror/state"
import { lineTokens, buildDecorations, tokenClass } from "../../src/editor/highlight.js"
import { adaptLang } from "../../src/editor/lang.js"
import * as stub from "../../src/stubs/lang.js"

const lang = adaptLang(stub)

function decorations(text) {
  const doc = Text.of(text.split("\n"))
  const set = buildDecorations(doc, [{ from: 0, to: doc.length }], lang)
  const out = []
  set.between(0, doc.length, (from, to, deco) => {
    out.push({ text: doc.sliceString(from, to), cls: deco.spec.class })
  })
  return out
}

test("each of the 24 kinds maps to class tok-<kind>", () => {
  expect(lang.kinds).toHaveLength(24)
  for (const kind of lang.kinds) expect(tokenClass(kind)).toBe(`tok-${kind}`)
  expect(tokenClass("conflict_date")).toBe("tok-conflict_date")
})

test("a log line becomes marks with the expected classes", () => {
  const d = decorations("- Row 12x25kg")
  expect(d).toEqual([
    { text: "-", cls: "tok-bullet" },
    { text: "Row", cls: "tok-exercise" },
    { text: "12", cls: "tok-reps" },
    { text: "x", cls: "tok-operator" },
    { text: "25", cls: "tok-load" },
    { text: "kg", cls: "tok-unit" },
  ])
})

test("columns are relative to each line", () => {
  const d = decorations("2026-11-07\n18h15~19h40")
  expect(d).toEqual([
    { text: "2026-11-07", cls: "tok-date" },
    { text: "18h15", cls: "tok-time" },
    { text: "~", cls: "tok-operator" },
    { text: "19h40", cls: "tok-time" },
  ])
})

test("a conflict line: red text, orange date, and a line class", () => {
  const d = decorations("; conflict 2026-01-01 phone: - Row 12x30kg")
  expect(d[0]).toEqual({ text: "", cls: "cm-conflict-line" })
  expect(d.slice(1)).toEqual([
    { text: "; conflict", cls: "tok-conflict" },
    { text: "2026-01-01", cls: "tok-conflict_date" },
    { text: "phone: - Row 12x30kg", cls: "tok-conflict" },
  ])
})

test("bad ranges from the module are dropped, not thrown", () => {
  const bad = adaptLang({
    kinds: () => ["date", "reps"],
    tokenize: () => Uint32Array.from([0, 2, 0, 1, 3, 1, 3, 3, 1, 4, 99, 1, 5, 6, 7]),
  })
  expect(lineTokens(bad, "abcdef")).toEqual([{ from: 0, to: 2, kind: "date" }])
})

test("a throwing module gives no tokens", () => {
  const broken = adaptLang({ kinds: () => ["date"], tokenize: () => { throw new Error("boom") } })
  expect(lineTokens(broken, "2026-11-07")).toEqual([])
})
