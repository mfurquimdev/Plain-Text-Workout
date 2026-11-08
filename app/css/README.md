# css

The app's stylesheets. Nue adds every `.css` file in this directory to the
page (`site.yaml`), so there is no import list: each file is loaded as is.

| File          | Purpose |
|---------------|---------|
| `palette.css` | Generated. One custom property per Nord colour (`--nord-polar-night-1`, `--nord-aurora-red`, ...) plus a `-deep` variant of each Frost and Aurora accent for text on the light theme. Do not edit by hand. |
| `tokens.css`  | Maps the app's colours to palette colours, each as `light-dark(<light>, <dark>)`: backgrounds, text, the status dot, buttons, lint underlines and one `--tok-<kind>` property per token kind. Also sets `color-scheme` from `[data-theme]` and defines the `.tok-<kind>` classes and `.cm-conflict-line`. |
| `fonts.css`   | `@font-face` rules for the bundled Monaspace faces in `/fonts/` (Argon, Krypton, Radon) and the `--font-text`, `--font-problem` and `--font-comment` properties. |
| `app.css`     | Layout and component styles: the status line, settings panel, "Log not loaded" screen, editor, diagnostics, tooltips, tap panel, notices, logging bar and the removal dialog. Mobile first, with a desktop layout at 760 px and a fine pointer. |

## How the files relate

- `palette.css` is written by [`scripts/palette.js`](../scripts/README.md)
  from `../palettes/nord.gpl`. Run `bun scripts/palette.js` after changing
  the palette.
- `tokens.css` uses only `var(--nord-...)` values from `palette.css`.
  `app.css` uses only the properties from `tokens.css` and `fonts.css`.
  Neither file may contain a colour literal.
- The class names come from the editor: `src/editor/highlight.js` puts a
  `tok-<kind>` class on each token and the `cm-comment-line` and
  `cm-conflict-line` classes on whole lines.
- `fonts.css` points at the files in [`public/fonts/`](../public/fonts/README.md),
  which the build copies to `.dist/fonts/`.
- `src/ui/settings.js` sets `data-theme` on `<html>`; `tokens.css` reads it.
- `src/ui/keyboard.js` and `src/main.js` set `--app-height` and
  `--bar-height`, which `app.css` uses for the page height and the notice
  position.

## Tests

`test/unit/palette.test.js` fails when `palette.css` is stale, when a colour
literal appears in `tokens.css` or `app.css`, when a token kind has no colour
in a theme, or when a text colour falls below 4.5:1 (the dark-theme conflict
red is the only accepted exception). `test/ui/app.pw.js` checks the rendered
colours and fonts in a browser.
