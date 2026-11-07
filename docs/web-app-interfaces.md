# Web app: module interfaces

The web app is built by several people (or agents) at once. These are the
contracts between the parts, so each can be built and tested alone. Change
a contract only together with every part that uses it.

```
app/                      Nue project (bun, nuekit 2.0.0-beta.2), built to app/.dist
  src/lang/               language adapter: loads the WebAssembly module
  src/sync/               device storage (IndexedDB) and sync client
  src/editor/             CodeMirror 6 editor, highlighting, diagnostics, completion
  public/wasm/            built WebAssembly files (generated, not edited by hand)
  sw.js                   service worker, served at /sw.js (not under /lib/)
workout_syntax/           Rust crate (submodule): parser, merge, sync server
  wasm/                   WebAssembly adapter crate (wasm-bindgen)
```

## 1. Language module (WebAssembly)

Built from `workout_syntax/wasm` with `wasm-bindgen --target web` into
`app/public/wasm/` as `workout_wasm.js` and `workout_wasm_bg.wasm`.

```js
import init, * as lang from "/wasm/workout_wasm.js"
await init()                                   // loads workout_wasm_bg.wasm
lang.kinds()               // string[]: token kind names, in TokenKind::ALL order
lang.tokenize(line)        // Uint32Array, flat [from, to, kindIndex, ...] per token,
                           // columns in UTF-16 code units (JS string indexes)
lang.diagnostics(text)     // JSON string: [{line, from, to, severity, message, fix}]
                           //   line 0-based; from/to UTF-16 columns in that line;
                           //   severity "error" | "warning";
                           //   fix null or {title, from, to, text} on the same line
lang.completions(text, line, col)  // JSON string: [{label, detail, from, to, insert}]
lang.hover(text, line, col)        // markdown string, or undefined
lang.unfinished_date(text)         // boolean: sync must wait (half-typed, non-ISO or
                                   // impossible date line)
lang.version()             // crate version string
```

Every function is total: it never throws or panics on any input.

## 2. Device storage and sync client (`app/src/sync/`)

Plain ES modules with no Nue or CodeMirror imports. Server API: see
`workout_syntax/README.md`, section "Sync server" (`GET /api/log`,
`POST /api/sync`).

```js
import { openStore } from "/src/sync/store.js"
import { SyncClient } from "/src/sync/client.js"

const store = await openStore()          // IndexedDB "workout", versioned schema
await store.load()   // {loaded, text, base, pending, savedAt}; loaded=false before
                     // the first download ("log not loaded" is not an empty log)
await store.saveText(text)               // durable before it resolves

const client = new SyncClient({
  store, device: "phone",               // device name: one word
  endpoint: "/api",
  getText: () => editorText,            // the editor's current text
  isReady: () => true,                  // false while composing or a date is unfinished
  fetch,                                // injectable for tests
})
client.on("status", s => ...)  // {state, message, at}; state is one of
                               // "not-loaded" "saved" "syncing" "synced" "waiting"
                               // "offline" "confirm" "attention"
client.on("merged", m => ...)  // {text, notices}: the editor applies `text`
                               // (only emitted when the editor still equals what was sent)
client.on("confirm", q => ...) // {removalId, removals}: ask the owner
client.answer("remove" | "keep")
client.syncNow()               // Promise<status>
client.start()                 // sync on open, focus, online, and after typing pauses
client.stop()
```

## 3. Service worker (`app/sw.js`)

Caches the app files under one build ID, never caches `/api/`, and does
not replace the running app during editing.
