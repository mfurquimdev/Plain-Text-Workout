# ui

Nue components for the page shell.

| File        | Purpose |
|-------------|---------|
| `head.html` | A Nue library file (`<!doctype html lib>`) with a component named `head`, which Nue renders into the page `<head>`. It adds the web manifest link, the Apple touch icon, `mobile-web-app-capable` and `color-scheme: light dark`. |

## How it relates

- The page body is `../index.html`. The title, description, viewport,
  theme colour and favicon come from `../site.yaml` (`meta`).
- It links to `../manifest.webmanifest` and `../icons/icon-192.png`.
- `scripts/dev.js` rebuilds when a file here changes.
