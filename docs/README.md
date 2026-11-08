# docs

Design documents for the web app. They sit next to the code instead of
inside it, because each one describes how several parts fit together.

| File | Purpose |
|---|---|
| `web-app-interfaces.md` | The contracts between the parts of the web app: (1) the WebAssembly language module's JavaScript API, (2) the device store and sync client in `app/src/sync/`, and (3) the service worker `app/sw.js`. Each part can be built and tested alone against these contracts. |

## How it relates to the rest

- Section 1 is the API that `workout_syntax/wasm/` exports and that
  `app/src/editor/` calls. The plain-JS stubs in `app/src/stubs/` follow
  the same API, so the UI tests can run without the WebAssembly build.
- Section 2 describes the client side of the sync protocol. The server
  side (`GET /api/log`, `POST /api/sync`) is described in
  `workout_syntax/README.md` and implemented in `workout_syntax/src/sync.rs`
  and `src/server.rs`.
- Section 3 is the contract for `app/sw.js`, which `app/scripts/build.js`
  stamps with a build ID and a file list.

Change a contract only together with every part that uses it. The reasons
behind the design are in `../concepts_brief.md`.
