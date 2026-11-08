# Workout web app

The phone and desktop editor for `Workout.md`: a Nue 2 page with a
CodeMirror 6 editor, the language module in WebAssembly and a sync client
for `workout-server`. The interfaces are in `../docs/web-app-interfaces.md`.

## Commands

    bun install
    bun run wasm        # build the language module into public/wasm (once)
    bun run build       # app/.dist
    bun run dev         # build and serve with rebuilds
    bun run test        # unit and sync tests
    bun run test:ui     # UI tests on the plain-JS stubs (Playwright)
    bun run test:e2e    # the real app against the real workout-server
    bun run icons       # icons/*.png from icons/icon.svg

The UI and e2e tests save screenshots to `test/ui/screenshots/` (ignored by git).

## Theme

### Colours: the Nord palette

Every colour of the app comes from `../palettes/nord.gpl` (a GIMP palette).
`scripts/palette.js` turns it into `css/palette.css`, one custom property
per colour (`--nord-polar-night-1`, `--nord-aurora-red`, ...), plus a `-deep`
variant of each accent (Frost and Aurora): the same hue and chroma with its
OKLCH lightness lowered until it reaches 4.5:1 on Snow Storm 3, for text on
the light theme. After changing the palette:

    bun scripts/palette.js

It rewrites `css/palette.css` and prints the WCAG contrast of every text
colour on both themes' backgrounds. `bun test` fails while `css/palette.css`
is stale, while a colour literal appears in `css/tokens.css` or `css/app.css`,
or while a text colour drops below 4.5:1 (the only accepted exception is the
conflict red on the dark theme, below).

`css/tokens.css` maps the app's colours (backgrounds, text, the status dot,
buttons, every `tok-*` token kind, lint underlines) to palette colours, each
as `light-dark(<light>, <dark>)`:

- dark: Polar Night backgrounds (Darker Polar Night for the editor), Snow
  Storm text, Frost and Aurora accents;
- light: Snow Storm backgrounds (Lighter Snow Storm for the editor), Polar
  Night text, the same accents in their `-deep` variant.

Conflict lines are Aurora Red with the conflicted date in Aurora Orange;
red and orange are used for nothing else in the editor. On the dark theme the
red reaches only 3.56:1 (the palette has no lighter red); the light theme's
deep red reaches 4.99:1. Parse errors and warnings are a wavy underline
(Aurora Purple and Aurora Yellow) and the Krypton font, never red.

### Fonts: Monaspace Nerd Font Mono

| Family            | Face            | Used for                                                       |
|-------------------|-----------------|----------------------------------------------------------------|
| `MonaspiceAr NFM` | Argon           | the editor and the whole UI (status line, buttons, dialog)     |
| `MonaspiceKr NFM` | Krypton         | text in lint ranges, `invalid` tokens, diagnostic messages in tooltips and in the tap panel |
| `MonaspiceRn NFM` | Radon           | lines starting with `;` (conflict lines too), trailing `; comment`s |

The phone does not have them, so they are bundled: `public/fonts/*.woff2`,
served from `/fonts/` with `font-display: swap` (`css/fonts.css`) and
pre-cached by the service worker with the rest of `.dist`, so they work
offline. They are subsets (Basic Latin, Latin-1, Latin Extended-A, general
punctuation, superscripts, arrows) of the Nerd Fonts builds of GitHub's
Monaspace, made with fontTools from the installed OTFs:

    bash scripts/fonts.sh [/usr/share/fonts/OTF]

It needs `pyftsubset` (`pip install fonttools brotli`) or `uv` on the PATH.

The fonts are licensed under the SIL Open Font License 1.1, copied to
`public/fonts/LICENSE` (Copyright (c) 2023, GitHub, with Reserved Font Name
"Monaspace"; the Nerd Fonts builds are named "Monaspice").
