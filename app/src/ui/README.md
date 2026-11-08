# src/ui

Small DOM helpers that `src/main.js` uses. Each file is independent and
imports nothing.

| File          | Purpose |
|---------------|---------|
| `copy.js`     | `copyText(text)` for the "Copy my text" buttons. Uses the clipboard API in a secure context; otherwise a hidden textarea and `document.execCommand("copy")`, because a plain-http page has no clipboard API. Resolves `true` or `false`. |
| `keyboard.js` | `watchKeyboard()` keeps the logging bar above the on-screen keyboard. It sets `--app-height` on `<html>` from the visual viewport, for browsers that do not resize the layout for the keyboard (the viewport meta in `site.yaml` asks for `interactive-widget=resizes-content`). |
| `notices.js`  | `showNotices(host, notices, ms)` shows short messages, for example after a sync. Each one goes away after 6 s or on a tap. |
| `settings.js` | Device settings in `localStorage`: `workout.obsidianLinks` (write new dates as `[[yyyy-mm-dd]]`), `workout.theme` (`auto`, `light` or `dark`) and `workout.device` (the device name sent to the server, default `phone` on touch devices and `desktop` otherwise). `applyTheme()` sets or removes `data-theme` on `<html>`. |

## How the files relate

- `css/app.css` uses `--app-height` (from `keyboard.js`) and styles the
  `.notice` elements (from `notices.js`).
- `css/tokens.css` reads `data-theme` (from `settings.js`).
- The settings controls and the `[data-copy]` buttons are in
  `../../index.html`.

These helpers have no unit tests. `test/ui/app.pw.js` covers them through
the page: the theme setting, "Copy my text" on the "Log not loaded" screen,
and notices.
