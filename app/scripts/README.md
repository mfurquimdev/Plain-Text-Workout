# scripts

Build, preview and asset-generation scripts. They run with bun and are not
part of the page (`site.yaml` skips this directory).

| File         | Command | Purpose |
|--------------|---------|---------|
| `build.js`   | `bun run build` (`--dev`: no minifying) | Builds `.dist` in three steps: bun bundles `src/main.js` into `js/app.js`; Nue builds the page shell into `.dist` (and adds `js/app.js`); `public/` is copied to the root of `.dist` (without its README files). Then it fills the service worker's placeholders in `.dist/sw.js`: the build ID (a hash of every file in `.dist`) and the list of files to pre-cache. With `WORKOUT_STUBS=1` it defines `__WORKOUT_STUBS__` as true, so the page runs on `src/stubs/`. Exports `build()`. |
| `dev.js`     | `bun run dev` | Runs `build()` unminified, serves `.dist` with `serve.js` (port 4173, or `PORT`), and rebuilds when a file in `src`, `css`, `ui`, `public` or `icons` changes, or `index.html`, `site.yaml`, `manifest.webmanifest` or `sw.js`. Reload the page to see a change. |
| `serve.js`   | `bun run serve [port]` | A small static server for `.dist` on 127.0.0.1. Paths without an extension get `index.html`. `/api/` answers 503, since there is no sync server. Sends `cache-control: no-cache`. Exports `serve()`. |
| `palette.js` | `bun scripts/palette.js` (`--check`: exit 1 if stale) | Generates `css/palette.css` from `../palettes/nord.gpl`, adding a `-deep` variant of each accent (OKLCH lightness lowered until it reaches 4.5:1 on Snow Storm 3). Prints the WCAG contrast of every text colour in `css/tokens.css` on both themes' backgrounds. Exports the parser and the colour functions for the tests. |
| `icons.js`   | `bun run icons` | Renders `icons/icon.svg` to `icons/icon-192.png` and `icons/icon-512.png` with Playwright's Chromium. |
| `fonts.sh`   | `bash scripts/fonts.sh [source dir]` | Subsets the installed Monaspace Nerd Font Mono OTFs (default `/usr/share/fonts/OTF`) to WOFF2 in `public/fonts/` and copies the licence there. Needs `pyftsubset` on the PATH, or `uv`. |

## What generates what

| Script       | Reads                  | Writes |
|--------------|------------------------|--------|
| `build.js`   | `src/`, the Nue tree, `public/`, `sw.js` | `js/app.js`, `.dist/` |
| `palette.js` | `../palettes/nord.gpl`, `css/tokens.css` | `css/palette.css` |
| `icons.js`   | `icons/icon.svg`       | `icons/icon-192.png`, `icons/icon-512.png` |
| `fonts.sh`   | installed OTF fonts    | `public/fonts/*.woff2`, `public/fonts/LICENSE` |

`js/` and `.dist/` are git-ignored. The other outputs are committed.

## Used by

- `dev.js` imports `build()` and `serve()`.
- `test/ui/playwright.config.js` starts `serve.js` as its web server.
- `test/unit/palette.test.js` imports `palette.js`.
- `package.json` runs `build.js` before `test:ui` and `test:e2e`.
