# src

The app's JavaScript. `scripts/build.js` bundles it with bun, from
`main.js`, into `js/app.js` (git-ignored), and Nue adds that file to the
page. Nue does not read this directory itself (`site.yaml` skips it).

| File      | Purpose |
|-----------|---------|
| `main.js` | The page wiring. Opens the device store, creates the sync client, loads the language module and creates the editor in `#editor`. Handles the status line, the "Log not loaded" screen, the removal dialog, "Copy my text", the tap panel, the logging bar, the settings and notices. Each edit calls `client.notifyEdit()`, which is the one place that saves the editor text on the device (see [`sync/`](sync/README.md)). Once the log is on the device (on open, or after the first download) it asks the browser once to keep it (`ui/storage.js`). Registers `/sw.js`. Exposes `globalThis.__workoutApp` for the tests. |
| `deps.js` | The one place that chooses the real modules or the stubs. A normal build uses `/wasm/workout_wasm.js` and [`sync/`](sync/README.md). A build with `WORKOUT_STUBS=1` uses [`stubs/`](stubs/README.md). The bundler drops the unused branch. Exports `openStore`, `SyncClient`, `loadLang` and `usingStubs`. |

## Subdirectories

| Directory | Contents |
|-----------|----------|
| [`editor/`](editor/README.md) | The CodeMirror 6 editor and its extensions. |
| [`sync/`](sync/README.md)     | IndexedDB storage and the sync client for `workout-server`. |
| [`stubs/`](stubs/README.md)   | Plain-JS stand-ins for the language module and the sync client. |
| [`ui/`](ui/README.md)         | Small DOM helpers used by `main.js`. |

## How the parts relate

    main.js
      ├── deps.js ──┬── sync/store.js, sync/client.js   (normal build)
      │             ├── stubs/lang.js, stubs/sync.js    (WORKOUT_STUBS=1)
      │             └── /wasm/workout_wasm.js           (loaded at run time)
      ├── editor/lang.js     wraps the language module
      ├── editor/editor.js   the editor
      └── ui/*.js

`editor/` and `sync/` do not import each other. `main.js` connects them:
the sync client reads the text through `editor.getText()`, and its `merged`
event calls `editor.offerRemote()`. The markup that `main.js` fills is in
`../index.html`; the styles are in `../css/`.

The interfaces between these parts (language module, store and sync client,
service worker) are described in `../../docs/web-app-interfaces.md`.
