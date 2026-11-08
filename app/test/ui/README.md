# test/ui

Playwright tests of the page in a browser, on the plain-JS stubs
(`src/stubs/`), so they need neither the WebAssembly module nor a server.

    bun run test:ui

This builds the app with `WORKOUT_STUBS=1` and then runs Playwright with
this directory's config.

| File                   | Purpose |
|------------------------|---------|
| `playwright.config.js` | Runs `*.pw.js` here against `.dist`, served by `scripts/serve.js` on 127.0.0.1 port 4174 (or `UI_PORT`). Two projects: `phone` (360 × 780, touch) and `desktop` (1280 × 800). Results go to `../../test-results`. |
| `app.pw.js`            | The page: it loads with the log, status line and logging bar; `tok-*` classes; conflict colours on both themes; the theme setting; parse errors as a wavy underline in Krypton; the three fonts and that they load from `/fonts/`; the symbol row; decimal commas; "Start session"; "Same set again" and Undo; the removal dialog; remote text outside the undo history; the "Log not loaded" screen with "Copy my text"; no horizontal scroll; hover (desktop) or tap (phone); completion. It also saves screenshots. |

## How it relates

- The tests drive the page through `globalThis.__workoutApp` (set by
  `src/main.js`) and `globalThis.__workoutStub` (set by `src/stubs/sync.js`),
  and open `/?stub=notloaded` for the "Log not loaded" screen.
- Each test runs on both projects, so every check is made at phone and
  desktop size.

## Generated files

- `screenshots/`: PNGs written by `app.pw.js` and by `../e2e/e2e.pw.js`.
  Git-ignored.
- `../../test-results/`: Playwright's output. Git-ignored.
