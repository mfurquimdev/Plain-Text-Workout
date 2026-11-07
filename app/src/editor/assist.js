// Completion and hover from the language module. On touch devices a tap
// on a line replaces hover: the editor reports the line's hover text and
// diagnostics, and the page shows them in a panel above the keyboard.

import { EditorView, hoverTooltip } from "@codemirror/view"
import { autocompletion } from "@codemirror/autocomplete"
import { phoneInsert } from "./logging.js"
import { renderMarkdown } from "./markdown.js"
import { lineDiagnostics } from "./diagnostics.js"

const position = (state, pos) => {
  const line = state.doc.lineAt(pos)
  return { line, n: line.number - 1, col: pos - line.from }
}

/** Completion source; `touch` makes it insert the name and load only. */
export function completionSource(lang, { touch = false } = {}) {
  return context => {
    const { state, pos } = context
    const { line, n, col } = position(state, pos)
    const items = lang.completions(state.doc.toString(), n, col)
    if (!items.length) return null
    const from = line.from + Math.max(0, Math.min(line.length, items[0].from | 0))
    const to = line.from + Math.max(0, Math.min(line.length, items[0].to | 0))
    if (!context.explicit && from === pos) return null
    return {
      from,
      to,
      options: items.map((it, rank) => ({
        label: String(it.label),
        detail: it.detail ? String(it.detail) : undefined,
        boost: -rank,
        apply: touch ? applyPhone(it) : String(it.insert ?? it.label),
      })),
      filter: true,
    }
  }
}

function applyPhone(item) {
  return (view, _completion, from, to) => {
    const { text, cursor } = phoneInsert(String(item.label), String(item.insert ?? item.label))
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + cursor },
      userEvent: "input.complete",
    })
  }
}

export function completion(lang, opts) {
  return autocompletion({ override: [completionSource(lang, opts)], icons: false, activateOnTyping: true })
}

/** Desktop: hover tooltips rendered from lang.hover's markdown. */
export function hover(lang) {
  return hoverTooltip((view, pos) => {
    const { line, n, col } = position(view.state, pos)
    if (!line.length) return null
    const md = lang.hover(view.state.doc.toString(), n, col)
    if (!md) return null
    return {
      pos: line.from,
      end: line.to,
      above: true,
      create() {
        const dom = document.createElement("div")
        dom.className = "workout-hover"
        dom.innerHTML = renderMarkdown(md)
        return { dom }
      },
    }
  }, { hoverTime: 350 })
}

/**
 * Touch: on a tap (a pointer selection), call onTap({line, html,
 * diagnostics}) with the line's hover markdown rendered to HTML, or with
 * null when there is nothing to show.
 */
export function tapInfo(lang, onTap) {
  return EditorView.updateListener.of(u => {
    if (!u.transactions.some(tr => tr.isUserEvent("select.pointer"))) return
    const { line, n, col } = position(u.state, u.state.selection.main.head)
    const md = line.length ? lang.hover(u.state.doc.toString(), n, col) : null
    const diagnostics = lineDiagnostics(lang, u.state.doc, line.number)
    onTap(md || diagnostics.length ? { line: line.number, html: md ? renderMarkdown(md) : "", diagnostics } : null)
  })
}
