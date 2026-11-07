// The CodeMirror 6 editor for the workout log. Plain ES module: no Nue.

import { EditorState } from "@codemirror/state"
import { EditorView, keymap } from "@codemirror/view"
import { defaultKeymap, history, historyKeymap, undo, redo, undoDepth } from "@codemirror/commands"
import { completionKeymap } from "@codemirror/autocomplete"
import { lintKeymap } from "@codemirror/lint"

import { highlighter } from "./highlight.js"
import { workoutLinter } from "./diagnostics.js"
import { decimalComma, decimalCommaOnLine } from "./decimal-comma.js"
import { RemoteApplier, remoteSpec } from "./remote.js"
import { completion, hover, tapInfo } from "./assist.js"
import { sameSetEdit, startSessionEdit, today } from "./logging.js"

/**
 * options: {parent, doc, lang (adapted, see lang.js), touch,
 *           onChange(text), onTap(info|null), onHistory({undo})}
 */
export function createEditor({ parent, doc = "", lang, touch = false, onChange = () => {}, onTap = () => {}, onHistory = () => {} }) {
  let view
  const remote = new RemoteApplier({
    state: () => view.state,
    dispatch: spec => view.dispatch(spec),
    composing: () => view.composing || view.compositionStarted,
    now: () => Date.now(),
    later: (fn, ms) => setTimeout(fn, ms),
  })

  const extensions = [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap, ...lintKeymap]),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      autocorrect: "off", autocapitalize: "off", spellcheck: "false",
      "aria-label": "Workout log",
    }),
    highlighter(lang),
    workoutLinter(lang),
    completion(lang, { touch }),
    touch ? tapInfo(lang, onTap) : hover(lang),
    decimalComma,
    EditorView.domEventHandlers({
      compositionend(_e, v) {
        // decimal commas typed inside a composition are fixed when it ends
        setTimeout(() => {
          const changes = decimalCommaOnLine(v.state)
          if (changes) v.dispatch({ changes, userEvent: "input.decimal" })
        }, 0)
      },
    }),
    EditorView.updateListener.of(u => {
      remote.observe(u)
      if (u.docChanged) onChange(u.state.doc.toString())
      if (u.docChanged || u.transactions.length) onHistory({ undo: undoDepth(u.state) > 0 })
    }),
  ]

  view = new EditorView({
    parent,
    state: EditorState.create({ doc, extensions }),
  })

  const api = {
    view,
    getText: () => view.state.doc.toString(),
    isComposing: () => view.composing || view.compositionStarted,

    /** Replace the whole text (a fresh load), outside the undo history. */
    setText(text) {
      view.dispatch({ ...remoteSpec(view.state, text) })
    },

    /** Merged text from the sync client; applied when typing pauses. */
    offerRemote(text) { remote.offer(text) },
    remote,

    /** Insert at the cursor, as if typed (so decimal commas etc. apply). */
    insert(text) {
      view.dispatch(view.state.replaceSelection(text), { userEvent: "input.type", scrollIntoView: true })
      view.focus()
    },

    startSession({ obsidian = false, date = today() } = {}) {
      const { changes, cursor } = startSessionEdit(view.state.doc.toString(), date, obsidian)
      view.dispatch({
        changes: changes ?? undefined,
        selection: { anchor: cursor },
        scrollIntoView: true,
        userEvent: "input.session",
      })
      view.focus()
    },

    /** Repeat the last set on the cursor's line. False when there is none. */
    sameSet() {
      const line = view.state.doc.lineAt(view.state.selection.main.head)
      const edit = sameSetEdit(line.text)
      if (!edit) return false
      view.dispatch({
        changes: { from: line.from + edit.from, to: line.from + edit.to, insert: edit.insert },
        selection: { anchor: line.from + edit.cursor },
        scrollIntoView: true,
        userEvent: "input.sameset",
      })
      view.focus()
      return true
    },

    undo() { undo(view); view.focus() },
    redo() { redo(view); view.focus() },

    /** Cursor and view at the end of the log, where today's sets go. */
    scrollToEnd() {
      const end = view.state.doc.length
      view.dispatch({ selection: { anchor: end }, effects: EditorView.scrollIntoView(end, { y: "end" }) })
    },

    destroy() { view.destroy() },
  }
  return api
}
