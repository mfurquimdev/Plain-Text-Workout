# palettes

The colour source for the web app.

| File | Purpose |
|---|---|
| `nord.gpl` | The Nord colour scheme as a GIMP palette ("Dark Nord"): Polar Night (dark backgrounds), Snow Storm (light backgrounds and text), Frost (blue accents) and Aurora (red, orange, yellow, green, purple). Each colour is one line: red, green, blue (0–255) and a name. |

## How it relates to the rest

`app/scripts/palette.js` reads `nord.gpl` and writes `app/css/palette.css`,
one CSS custom property per colour (`--nord-aurora-red`, ...) plus a darker
`-deep` variant of each accent for text on the light theme.
`app/css/tokens.css` then maps the app's roles (backgrounds, text, token
kinds, lint underlines) onto those properties.

After you edit `nord.gpl`, run `bun scripts/palette.js` in `app/`.
`bun run test` fails while `css/palette.css` is out of date. The theme is
described in `app/README.md`.
