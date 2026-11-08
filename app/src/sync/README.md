# src/sync

Device storage and the sync client. They keep the log on the device and
sync it with `workout-server` through `/api/log` and `/api/sync`. Neither
file imports Nue, CodeMirror or the DOM; `src/main.js` passes in the
functions they need.

| File        | Purpose |
|-------------|---------|
| `store.js`  | One IndexedDB record (database `workout`, object store `log`, key `current`) with `loaded`, `text`, `base` (the text this device last agreed with the server), `pending` (the sync request in flight) and `savedAt`. `openStore()` opens it and runs schema migrations. `update(patch)` writes fields in one readwrite transaction with strict durability, so text, base and pending never disagree. `saveText()` is refused with code `not-loaded` before the first download, so an empty editor is never saved as the log. Also `persist()`, `estimate()` and `StoreError`. |
| `client.js` | `SyncClient`. Downloads the log on first open (`GET /api/log`), then syncs (`POST /api/sync`) on start, when the page becomes visible, when the network comes back and after a 2 s pause in typing. It follows the device rule: one sync at a time; the request is stored as `pending` before it is sent; an unknown outcome (network error, timeout, 5xx) resends the same request after a backoff; a merged reply is adopted only if the editor still holds the sent text, otherwise the sent text becomes the base and it syncs again. Handles the `confirm` (removal question), `wait` and protocol replies. Emits `status`, `merged` and `confirm` events. |

## How the files relate

- `client.js` uses the store passed to it (`load`, `update`, `saveText`);
  it does not import `store.js`.
- `src/deps.js` imports both and gives them to `src/main.js`, unless the
  build uses the stubs in `src/stubs/sync.js`.
- `main.js` gives the client `getText` (the editor's `getText()`),
  `isReady` (false while composing or while a date is half typed),
  `device` (from `src/ui/settings.js`) and `endpoint: "/api"`.
- The request and reply formats are in `../../../docs/web-app-interfaces.md`,
  section 2. The server side is `workout-server` in `../../../workout_syntax`.

## Tests

| Test | Covers |
|------|--------|
| `test/sync/store.test.js`  | `store.js` on `fake-indexeddb`: not loaded, refused saves, one transaction, schema name and version, write errors, `persist()` and `estimate()`. |
| `test/sync/client.test.js` | `client.js` with a fake fetch: first open, the device rule, lost replies, 5xx, timeouts, typing during a sync, the removal question, offline and online, protocol errors. |
| `test/sync/server.test.js` | Two clients (phone and desktop) against the real `workout-server`. |
| `test/e2e/e2e.pw.js`       | The built app in a browser against the real server. |
