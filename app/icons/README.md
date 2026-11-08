# icons

The app icon, used for the browser tab, the home screen and the installed
app.

| File           | Purpose |
|----------------|---------|
| `icon.svg`     | The source icon: three coloured strokes and two bars on Darker Polar Night, in Nord colours. It is the favicon (`site.yaml`) and the `any`-size icon in the manifest. |
| `icon-192.png` | 192 × 192 PNG. Listed in `manifest.webmanifest` and used as the Apple touch icon (`ui/head.html`). |
| `icon-512.png` | 512 × 512 PNG. Listed in `manifest.webmanifest`, also as the maskable icon. |

## How the files relate

The PNGs are generated from `icon.svg` by
[`scripts/icons.js`](../scripts/README.md) (`bun run icons`), which renders
the SVG in Playwright's Chromium. Run it after changing the SVG and commit
the PNGs.

Nue copies this directory to `.dist/icons/`, and the service worker
pre-caches the files with the rest of `.dist`.
