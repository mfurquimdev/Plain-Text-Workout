# src/stubs

Plain-JS stand-ins for the language module and the sync client. They let the
page run without the WebAssembly build or a server. `src/deps.js` uses them
only when the app is built with `WORKOUT_STUBS=1`, which `bun run test:ui`
does. The page then shows "(development stubs)" in the settings panel.

| File      | Stands in for | Purpose |
|-----------|---------------|---------|
| `lang.js` | The WebAssembly language module (`/wasm/workout_wasm.js`) | The same functions (`init`, `kinds`, `version`, `tokenize`, `diagnostics`, `unfinished_date`, `completions`, `hover`), with a regex tokenizer that returns all 24 token kinds, two diagnostics (an incomplete date, and an uppercase `X` with a quick fix), exercise-name completion from earlier lines and a short hover. |
| `sync.js` | `src/sync/store.js` and `src/sync/client.js` | An in-memory store that starts with `SAMPLE_LOG`, and a `SyncClient` whose "server" stores the text it receives and sends it back. It emits the same `status`, `merged` and `confirm` events as the real client. |

## Test hooks

- `?stub=notloaded` in the page URL starts with no log on the device and
  the server unreachable, so the "Log not loaded" screen stays.
- `globalThis.__workoutStub` holds `{store, client, server}`. A test can
  call `__workoutStub.client.emit("confirm", q)` to open the removal
  dialog, or change `server.reachable` and `server.text`.

## Used by

- `src/deps.js` imports both files.
- `test/unit/highlight.test.js` uses `lang.js` as the module under
  `adaptLang()`.
- `test/ui/app.pw.js` runs the whole page on both stubs.

The real interfaces are in `../../../docs/web-app-interfaces.md`, sections 1
and 2. The stubs follow them only as far as the UI needs.
