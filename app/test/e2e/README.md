# test/e2e

End-to-end tests: the built app, with the real WebAssembly language module,
sync client and service worker, served by the real `workout-server`.

    bun run wasm        # once, so .dist has /wasm/
    bun run test:e2e

`test:e2e` builds the app (without the stubs) and runs Playwright with this
directory's config.

| File                   | Purpose |
|------------------------|---------|
| `playwright.config.js` | Runs `*.pw.js` here, one worker, 90 s per test. Results go to `../../test-results/e2e`. |
| `e2e.pw.js`            | Builds `workout-server` with cargo in `../../../workout_syntax`, copies `tests/fixtures/Workout.md` into a new git repository in a temporary directory, and starts the server on a free local port with `--app .dist`, so one server serves the page and `/api/`. The tests run in order: the real module colours the log and reports a parse error; a session typed on the phone reaches the server and the desktop; offline, the app opens from the service worker, keeps the typing and syncs when back online; a stale save on the server asks before removing, and Keep restores the session; screenshots in light and dark. |

## How it relates

- Unlike [`test/ui/`](../ui/README.md), this uses no stubs and no
  `scripts/serve.js`.
- It reads the editor through `globalThis.__workoutApp` (set by
  `src/main.js`).
- [`test/sync/server.test.js`](../sync/README.md) runs the same server
  without a browser.

## Requirements and generated files

- cargo, the `workout_syntax` submodule, Playwright's Chromium, and
  `public/wasm/` (from `bun run wasm`).
- Screenshots go to `../ui/screenshots/e2e-*.png` (git-ignored).
