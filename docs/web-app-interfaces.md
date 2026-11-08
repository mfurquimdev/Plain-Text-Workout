# Web app: module interfaces

The web app is built by several people (or agents) at once. These are the
contracts between the parts, so each can be built and tested alone. Change
a contract only together with every part that uses it.

```
app/                      Nue project (bun, nuekit 2.0.0-beta.2), built to app/.dist
  index.html              the page body; ui/head.html is the head
  src/main.js             page wiring: store, sync client, language module, editor
  src/deps.js             picks the real modules or src/stubs/ (WORKOUT_STUBS=1)
  src/editor/             CodeMirror 6 editor, highlighting, diagnostics, completion;
                          lang.js adapts the WebAssembly module (section 1)
  src/sync/               device storage (IndexedDB) and sync client (section 2)
  src/ui/                 small helpers: copy, keyboard, notices, settings, storage
  src/stubs/              plain-JS stand-ins for the language module and sync client
  css/                    palette, colour tokens, fonts, layout
  public/fonts/           bundled Monaspace fonts, served at /fonts/
  public/wasm/            built WebAssembly files (generated, not edited by hand)
  scripts/                build, dev and static servers, generators
  sw.js                   service worker, served at /sw.js (section 3)
  test/                   unit/, sync/, ui/ (stubs), e2e/ (real server)
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
await store.persist()  // true when the browser keeps the storage; the app asks
                       // once the log is on the device, and a refusal blocks nothing
await store.estimate() // {usage, quota} in bytes, or null

const client = new SyncClient({
  store, device: "phone-3f9a",          // device name, see below
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
client.notifyEdit()            // on every owner edit: saves getText() on the device
                               // (the only save path; one error report if it fails)
                               // and syncs after a typing pause
client.device = "kitchen"      // a rename applies to the next sync request
client.syncNow()               // Promise<status>
client.start()                 // sync on open, focus, online, and after typing pauses
client.stop()
```

The device name appears in the server's git commits ("Sync from
phone-3f9a"), in `; conflict YYYY-MM-DD <device>: line` comments in the log
and in the file name of a merge replay. The server accepts one word with no
whitespace, colon or control character. The app keeps names to 1 to 32
ASCII letters, digits, `-` or `_`, and on first run stores the kind of
device plus four random hex digits (`app/src/ui/settings.js`).

## 3. Service worker (`app/sw.js`)

Caches the app files under one build ID, never caches `/api/`, and does
not replace the running app during editing.
