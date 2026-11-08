# Plain Text Workout

Keep your training log in one plain-text Markdown file, `Workout.md`, and
edit it from your phone, your desktop or Neovim. A parser checks every
line as you type, and a small sync server merges the edits from each
device into one master copy.

```markdown
[[2026-11-07]] 82.5kg
18h00~19h10
- Bench Press +22kg x2 15x0kg 12x5kg 10x10kg
- Horizontal Leg Press 63kg++5lbs 12^2 8 7
- Plank bw 60s^2
- Treadmill 5km 30min
```

## Why

A training log is a list of dates, exercises, loads and reps. A text file
holds that well. You can read it in any editor, search it with `grep`,
keep its history in git and open it in Obsidian. Workout apps lock your
history into their own format. A plain file also has problems, and this
project deals with three of them:

- **Typos go unnoticed.** `12X20Kg`, `2026-1-07` or a load with no reps
  only shows up when you read the log months later. The parser
  (`workout_syntax`) follows a formal grammar (`workout_syntax/GRAMMAR.md`).
  It reports errors and warnings, and offers quick fixes where the fix is
  clear.
- **Shorthand hides the numbers.** `63kg++5lbs 12^2 8 7` saves typing, but
  the sets it stands for are not written out. Hover and the outline show
  the expanded sets, the volume, the session duration and cardio totals.
- **Edits on several devices collide.** Each device keeps a full copy and
  works offline. A three-way merge, done one session at a time, combines
  the copies on the home machine. The server always asks before a merge
  would remove a session, a set or a rep.

## What's in the repository

| Path | What it is |
|---|---|
| `workout_syntax/` | Git submodule ([Workout-Syntax](https://github.com/mfurquimdev/Workout-Syntax)): the Rust parser, the `workout-lint` linter, the `workout-lsp` language server, the `workout-server` sync server, the WebAssembly module, the Neovim plugin and TLA+ models |
| `app/` | The web app for phone and desktop: CodeMirror 6 in a Nue page. It works offline as an installable PWA |
| `docs/web-app-interfaces.md` | The interfaces between the web app, the WebAssembly module and the sync server |
| `palettes/nord.gpl` | The Nord palette the app's colours come from |
| `concepts_brief.md` | The design brief and the decisions behind it |
| `Workout Syntax.md` | A short tour of the log syntax |

Every directory has its own README that lists its files and how they
relate: [app](app/README.md), [docs](docs/README.md),
[palettes](palettes/README.md), [src](src/README.md) and
[workout_syntax](workout_syntax/README.md).

## Install

You need:

- [Rust](https://rustup.rs) (edition 2024) and the
  `wasm32-unknown-unknown` target
- `wasm-bindgen-cli` 0.2.130. It must match the version of the crate.
- [Bun](https://bun.sh), for the web app
- git

```sh
git clone --recurse-submodules git@github.com:mfurquimdev/Plain-Text-Workout.git
cd Plain-Text-Workout

rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.130

# workout-lint, workout-lsp and workout-server, into ~/.cargo/bin
cargo install --path workout_syntax

# the web app
cd app
bun install
bun run wasm     # build the language module into public/wasm
bun run build    # the app, in app/.dist
```

If you cloned without `--recurse-submodules`, run
`git submodule update --init` first.

## Use

### Check a log from the command line

```sh
workout-lint Workout.md          # print the errors and warnings
workout-lint Workout.md --sets   # also print every expanded set
```

### Edit on phone and desktop

Keep the log in its own git repository. The server commits every change
it makes, and it never creates the log itself:

```sh
mkdir -p ~/workout-log && cd ~/workout-log
git init && cp /path/to/Workout.md . && git add Workout.md && git commit -m "Workout log"
```

Start the sync server. It also serves the web app:

```sh
workout-server --log ~/workout-log/Workout.md --app /path/to/Plain-Text-Workout/app/.dist
```

Open <http://127.0.0.1:8484> in a browser. It listens on `127.0.0.1:8484`
by default. To reach it from your phone:

- **For a quick test over USB or wireless debugging:** run
  `adb reverse tcp:8484 tcp:8484`. Then open `http://127.0.0.1:8484` on the
  phone.
- **For daily use:** put the server behind HTTPS on a private network,
  such as a VPN or a tailnet. Start it with `--allow-host <your host name>`,
  because the server refuses any `Host` it does not know. Install the page
  as an app from the browser menu.

The app saves every change on the device first, so you can keep logging
with no connection. When it reaches the server again, it syncs. If a
merge would remove anything, the app asks first: **Remove** or **Keep**.
When two devices change the same line, the server keeps both versions.
It records the conflict as a `; conflict` comment at the end of the
session, for you to resolve.

### Edit in Neovim

`workout-lsp` gives you diagnostics, hover, completion of your own
exercise names, an outline, folding, inlay hints, quick fixes and
semantic highlighting. The Neovim plugin starts it only on the log:

```lua
vim.opt.rtp:append('/path/to/Plain-Text-Workout/workout_syntax/editors/nvim')
require('workout').setup({ dirs = { '~/workout-log' } })
```

Edits saved from Neovim are committed and merged on the next sync. See
`workout_syntax/editors/nvim/README.md`.

### Syntax

The full grammar is in `workout_syntax/GRAMMAR.md`. In short:

- **Date lines:** a session starts with an ISO date line, optionally with
  your body weight: `2026-11-07 82.5kg` or `[[2026-11-07]]`. Put an empty
  line before each session.
- **Session time:** `18h00~19h10` gives a duration of 1 h 10 min. No
  session lasts more than 6 hours.
- **Sets:**
  - `12x20kg` is 12 reps at 20 kg. Write `23kg 10 10 10` for three sets
    at the same load.
  - `^2` repeats a set. `+22kg` adds a starting load, such as the bar.
  - `++5lbs` adds the same load to each next set.
  - `x2` counts both sides. `12/11` gives left and right reps.
  - `bw` means body weight.
- **Holds:** `bw 60s^2` is two holds of 60 seconds.
- **Cardio:** `5km 30min`, or several durations that each have a speed.
- **Units:** `kg`, `g`, `lb`, `lbs`, `oz` and `km`, all lowercase.
- **Limits:**
  - Reps go up to 999 and repeats up to 99.
  - Every other number goes up to 9999.
- **Comments:** a line starting with `;` is a comment.

## Contribute

Issues and pull requests are welcome on GitHub: the app and docs in
[Plain-Text-Workout](https://github.com/mfurquimdev/Plain-Text-Workout), and
the parser, language server and sync server in
[Workout-Syntax](https://github.com/mfurquimdev/Workout-Syntax).

1. Open an issue first for anything bigger than a small fix. A change to
   the syntax touches the grammar, the parser, the language server and,
   often, the TLA+ models. Agree on it before you write the code.
2. Work on a branch, and keep each pull request to one change.
3. Add or update tests for what you change, then run the suites:

   ```sh
   cd workout_syntax
   cargo test --workspace          # parser, merge, LSP, sync, wasm conversions
   tla/check.sh                    # if you changed a TLA+ model
   wasm/build.sh && node --test wasm/tests/js/

   cd ../app
   bun run test                    # unit and sync tests
   bun run test:ui                 # UI tests on stubs (Playwright)
   bun run test:e2e                # the real app against a real workout-server
   ```

4. Update `GRAMMAR.md` or the READMEs when the behaviour changes.
5. Don't commit a real training log. The crate's tests read
   `workout_syntax/Workout.md` when it exists. Git ignores that file, so
   your own log stays local.

A change to the parser goes to Workout-Syntax first. Then update the
submodule pointer here in a separate commit.

## Credits

<a href="https://0rwx.com"><img src="https://0rwx.com/static/AI-X.png" alt="0rwx AI level: EXECUTE (AI made)" width="96"></a>

**AI usage: EXECUTE** (`[AI:3]`, the last of the four [0rwx](https://0rwx.com) levels: ZER0, READ, WRITE, EXECUTE). AI made: the code and documents were written by Claude (Anthropic's AI model) working in Claude Code. The owner, Mateus Furquim, directed the work, made the decisions and curated the result.
