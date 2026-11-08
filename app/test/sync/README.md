# test/sync

Tests for the device store, the sync client and the service worker. They run
with `bun test`; `bun run test` runs them together with
[`test/unit/`](../unit/README.md).

| File             | Tests |
|------------------|-------|
| `helpers.js`     | Not a test. `fakeFetch()` (a fetch that hands each call to a handler and records it), `merged()` (a merged reply), `freshStore()` and `loadedStore()` (a store on its own `fake-indexeddb`), `makeClient()` (a `SyncClient` with a fake editor, navigator, window and document, short timers and a fixed clock, recording its events), `tick()` and `until()`. |
| `store.test.js`  | `src/sync/store.js` on `fake-indexeddb`: a new device is not loaded; `saveText()` before the first download is refused; text, base and pending are saved together and survive a reopen; the database name and version; write errors; `persist()` and `estimate()`. |
| `client.test.js` | `src/sync/client.js` with `fakeFetch`: first open, the device rule (pending stored before sending, lost replies resent exactly, 5xx and timeouts, typing during a sync), the removal question with both answers, `wait` replies, not ready, offline and online, protocol and 400 errors, conflict notices, one sync in flight, the typing-pause and visibility triggers, and one save and one error report per edit. |
| `server.test.js` | Integration. Builds `workout-server` with cargo in `../../../workout_syntax`, starts it on a free local port with a copy of `tests/fixtures/Workout.md` in a new git repository, and runs two clients (phone and desktop) against it: first download, sessions from both devices, typing during a sync, a stale save on the server that triggers the removal question, and convergence with every step in git. |
| `sw.test.js`     | `../../sw.js` in Playwright's Chromium, served by a small bun server with a test page, one script and `/api/log`. Checks that offline the page loads from the cache, that `/api/` is never cached, and that a new build installs and waits until the page posts `skip-waiting`. |

## Requirements

- `server.test.js` needs cargo and the `workout_syntax` submodule. The first
  run compiles the server, so it can take minutes (the timeout is 600 s).
- `sw.test.js` needs Playwright's Chromium (`bunx playwright install
  chromium`).

The temporary log directories are made under `$TMPDIR` and removed after
the tests.
