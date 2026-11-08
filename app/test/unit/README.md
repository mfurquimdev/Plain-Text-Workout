# test/unit

Unit tests for the editor code and the colour palette. They run with
`bun test` and need no browser. `bun run test` runs them together with
[`test/sync/`](../sync/README.md).

| File                    | Tests |
|-------------------------|-------|
| `decimal-comma.test.js` | `src/editor/decimal-comma.js`: `2,5kg` typed key by key or in one batch becomes `2.5kg`; commas between sets, older text and non-input changes stay; the fix is part of the typing's undo step; the line is fixed after a composition. |
| `highlight.test.js`     | `src/editor/highlight.js` through `adaptLang()` over `src/stubs/lang.js`: the 24 kinds map to `tok-<kind>`, the classes of a log line, columns per line, conflict and comment line classes, and that bad ranges or a throwing module do not break it. |
| `logging.test.js`       | `src/editor/logging.js`: "Same set again", "Start session", `today()` and phone completion. |
| `palette.test.js`       | `scripts/palette.js` and the CSS: `css/palette.css` matches `../palettes/nord.gpl`; the palette has the 20 Nord colours; each `-deep` accent reaches 4.5:1 on Snow Storm 3; `css/tokens.css` and `css/app.css` have no colour literals; each token kind has a colour in both themes; text colours reach 4.5:1, except the dark-theme conflict red. |
| `remote.test.js`        | `src/editor/remote.js`: `diffText()`, the cursor staying on the same line, remote text outside the undo history, `RemoteApplier` waiting for a pause and for composition, typing between offer and apply, and `projected()`. |

The editor tests build `EditorState` objects from `@codemirror/state` with
no `EditorView`, so they run outside a browser.
