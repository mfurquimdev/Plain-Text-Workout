# src/editor

The CodeMirror 6 editor for the workout log and its extensions. None of
these files import Nue or the sync client; `src/main.js` connects them.

| File               | Purpose |
|--------------------|---------|
| `editor.js`        | `createEditor()`: builds the `EditorView` with history, keymaps, line wrapping and the extensions below, and returns the API that `main.js` uses: `getText()` (includes merged text still waiting to be shown), `getVisibleText()`, `isComposing()`, `setText()`, `offerRemote()`, `insert()`, `startSession()`, `sameSet()`, `undo()`, `redo()`, `scrollToEnd()`, `destroy()`. |
| `lang.js`          | `adaptLang()`: wraps the language module with parsed JSON, `try`/`catch` and safe defaults, so the editor keeps working when the module is missing or throws. `adaptLang(null)` gives an empty module. |
| `highlight.js`     | Highlighting. Each visible line goes through `lang.tokenize`; each token becomes a mark with class `tok-<kind>`. Lines that start with `;` get `cm-comment-line`, lines with a `conflict` token get `cm-conflict-line`. Drops bad ranges from the module and caches tokens per line text. |
| `diagnostics.js`   | Lint from `lang.diagnostics` through `@codemirror/lint`, with quick fixes. Holds the diagnostics of the line being typed until the cursor leaves it (`heldLine`). `lineDiagnostics()` gives one line's messages for the tap panel. |
| `assist.js`        | Completion (`lang.completions`) and hover (`lang.hover`). On desktop, hover shows a tooltip. On touch devices, a tap on a line calls `onTap` with the line's hover text and diagnostics, which `main.js` shows in the tap panel. On the phone, completion inserts the name and load, not the reps. |
| `decimal-comma.js` | A transaction filter: a comma typed between two digits (`2,5kg`) becomes a point. Only commas next to the typed text change. During IME composition it waits; `decimalCommaOnLine()` fixes the line when composition ends. |
| `remote.js`        | Applies the sync client's merged text. `diffText()` gives line-level changes; `RemoteApplier` waits for a pause in typing (3 s) and for composition to end, maps the remote changes over any typing since the offer, and applies them outside the undo history. `projected()` is the text as it will be after the apply; `editor.getText()` returns it, so saves and syncs include it. |
| `logging.js`       | Pure text functions behind the logging bar: `sameSetEdit()` ("Same set again"), `startSessionEdit()` ("Start session"), `today()`, and `phoneInsert()` for phone completion. |
| `markdown.js`      | `renderMarkdown()`: the small Markdown subset used by hover text (paragraphs, line breaks, `- ` lists, bold, italic, code). Escapes HTML first. |

## How the files relate

    editor.js
      ├── highlight.js
      ├── diagnostics.js
      ├── decimal-comma.js
      ├── remote.js
      ├── assist.js ── logging.js (phoneInsert), markdown.js, diagnostics.js (lineDiagnostics)
      └── logging.js

`lang.js` is not imported here: `main.js` calls `adaptLang()` and passes the
result to `createEditor()` as `lang`. Every file that uses the language
module expects that adapted object.

The `tok-*`, `cm-comment-line` and `cm-conflict-line` classes are styled in
`css/tokens.css`. The tooltip, lint and tap-panel classes are styled in
`css/app.css`.

## Tests

| Test | Covers |
|------|--------|
| `test/unit/highlight.test.js`     | `highlight.js` with `lang.js` over `src/stubs/lang.js`: class names, line classes, dropped bad ranges, a throwing module. |
| `test/unit/decimal-comma.test.js` | `decimal-comma.js`, including undo and composition. |
| `test/unit/logging.test.js`       | `logging.js`. |
| `test/unit/remote.test.js`        | `remote.js`: diffs, cursor, undo history, waiting, typing between offer and apply, `projected()`. |
| `test/ui/app.pw.js`               | The whole editor in a browser, on the stubs. |
| `test/e2e/e2e.pw.js`              | The editor with the real WebAssembly module. |
