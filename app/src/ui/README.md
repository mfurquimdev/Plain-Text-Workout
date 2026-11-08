# src/ui

Small helpers that `src/main.js` uses. Each file is independent and
imports nothing.

| File          | Purpose |
|---------------|---------|
| `copy.js`     | `copyText(text)` for the "Copy my text" buttons. Uses the clipboard API in a secure context; otherwise a hidden textarea and `document.execCommand("copy")`, because a plain-http page has no clipboard API. Resolves `true` or `false`. |
| `keyboard.js` | `watchKeyboard()` keeps the logging bar above the on-screen keyboard. It sets `--app-height` on `<html>` from the visual viewport, for browsers that do not resize the layout for the keyboard (the viewport meta in `site.yaml` asks for `interactive-widget=resizes-content`). |
| `notices.js`  | `showNotices(host, notices, ms)` shows short messages, for example after a sync. Each one goes away after 6 s or on a tap. |
| `settings.js` | Device settings in `localStorage`: `workout.obsidianLinks` (write new dates as `[[yyyy-mm-dd]]`), `workout.theme` (`auto`, `light` or `dark`) and `workout.device` (the device name sent to the server). On first run `settings.device(touch)` stores a default of the kind and four random hex digits, such as `phone-3f9a` or `desktop-07c1`; a stored name that breaks the rule is replaced the same way. `settings.setDevice(name)` stores a new name, or returns why it is refused. The rule (`DEVICE_NAME`, `deviceNameError()`): 1 to 32 ASCII letters, digits, `-` or `_`. `applyTheme()` sets or removes `data-theme` on `<html>`. |
| `storage.js`  | `keepOnDevice(store, {note, log})` calls `store.persist()` once and logs the outcome. If the browser refuses, or `persist()` throws or is missing, it passes a one-line note to `note` (shown in the settings panel) and resolves `false`; nothing else waits on it. |

## How the files relate

- `css/app.css` uses `--app-height` (from `keyboard.js`) and styles the
  `.notice` elements (from `notices.js`).
- `css/tokens.css` reads `data-theme` (from `settings.js`).
- The settings controls and the `[data-copy]` buttons are in
  `../../index.html`.

## The device name

The name goes into every sync request. `workout-server` uses it in git
commit messages ("Sync from phone-3f9a"), in `; conflict YYYY-MM-DD <name>: line`
comments in the log, in the file name of a merge replay
(`.workout-sync/replays/<time>-<name>.json`) and in the removal question's
ID. The server keeps no other state per device. It accepts one word with no
whitespace, colon or control character (`valid_device_name` in
`workout_syntax/src/merge.rs`); the app's rule is stricter so the name is
also a safe file name. The owner can rename the device in the settings
panel; the next sync request carries the new name, and a request already
stored as `pending` is resent with the old one.

## Tests

`test/unit/settings.test.js` covers the device name and
`test/unit/storage.test.js` covers `keepOnDevice()`. `test/ui/app.pw.js`
covers the helpers through the page: the theme setting, renaming the device,
the storage note, "Copy my text" on the "Log not loaded" screen, and
notices.
