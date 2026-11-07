// Highlighting from the tokenizer: each visible line goes through
// lang.tokenize, and each token becomes a mark with class `tok-<kind>`.
// The colours are CSS custom properties (css/tokens.css).

import { Decoration, ViewPlugin } from "@codemirror/view"
import { RangeSetBuilder } from "@codemirror/state"

export const tokenClass = kind => `tok-${kind}`

/**
 * Tokens of one line as [{from, to, kind}], columns relative to the line.
 * Bad ranges from the module (out of order, overlapping, past the end,
 * unknown kind) are dropped, so a bug there cannot break the editor.
 */
export function lineTokens(lang, text) {
  const flat = lang.tokenize(text)
  const out = []
  let last = 0
  for (let i = 0; i + 2 < flat.length; i += 3) {
    const from = flat[i], to = flat[i + 1], kind = lang.kinds[flat[i + 2]]
    if (!kind || from < last || to <= from || to > text.length) continue
    out.push({ from, to, kind })
    last = to
  }
  return out
}

const marks = new Map()
const mark = kind => {
  let m = marks.get(kind)
  if (!m) marks.set(kind, m = Decoration.mark({ class: tokenClass(kind) }))
  return m
}
const conflictLine = Decoration.line({ class: "cm-conflict-line" })

/** Decorations for the given document ranges (the visible ones in the view). */
export function buildDecorations(doc, ranges, lang, cache = new Map()) {
  const builder = new RangeSetBuilder()
  let lastLine = -1
  for (const { from, to } of ranges) {
    for (let pos = from; pos <= to;) {
      const line = doc.lineAt(pos)
      if (line.number > lastLine) {
        lastLine = line.number
        let toks = cache.get(line.text)
        if (!toks) {
          toks = lineTokens(lang, line.text)
          if (cache.size > 2000) cache.clear()
          cache.set(line.text, toks)
        }
        if (toks.some(t => t.kind === "conflict")) builder.add(line.from, line.from, conflictLine)
        for (const t of toks) builder.add(line.from + t.from, line.from + t.to, mark(t.kind))
      }
      pos = line.to + 1
    }
  }
  return builder.finish()
}

export function highlighter(lang) {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.cache = new Map()
      this.decorations = buildDecorations(view.state.doc, view.visibleRanges, lang, this.cache)
    }
    update(u) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = buildDecorations(u.state.doc, u.view.visibleRanges, lang, this.cache)
      }
    }
  }, { decorations: v => v.decorations })
}
