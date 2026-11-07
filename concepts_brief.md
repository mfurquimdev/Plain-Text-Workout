# Plain Text Workout Web App

* **Author:** Mateus Furquim
* **Date:** 2026-11-07

## Overview

A local-first single page web app for reading and editing one plain-text training log, `Workout.md`. The owner logs sets from a Galaxy S25 at the gym and from a desktop. Each device keeps a full copy, so the app opens and saves with no connection. The home machine holds the master file and merges each device's changes into it when the device can reach it over a VPN.

The app highlights each part of the log as it is typed: date, time, exercise name, machine, reps, weights and sets. Nue is the required front-end builder. The existing Rust crate supplies the language knowledge.

The design has four parts:

* **Page:** a Nue page that hosts a CodeMirror 6 editor.
* **Language code:** the Rust analysis code compiled to WebAssembly, so highlighting does not wait on the network.
* **Device copy:** the app and the log stored in the browser.
* **Server:** a small Rust program on the home machine that serves the app and merges changes into the master file.

**Review status:** two rounds of six reviewers examined this concept. The architecture survived. The second round found that the sync protocol and merge rules were incomplete, so this brief replaces them with the rules below. A throwaway prototype tested those rules on both real logs. Nothing has run in a browser yet.

**Implementation status (2026-11-07):** the language code, the merge and the sync server are built in the `workout_syntax` crate, now a git submodule of this repository, with 247 tests. The server has run only on localhost against a copy of the log. The WebAssembly build, the Nue app, HTTPS and the move to `~/workout-log` are not done. See "Proposed order of work".

### Terms

| Term | Meaning |
|---|---|
| Master file | `~/workout-log/Workout.md` on the home machine. The source of truth. |
| Device copy | The full log stored in one browser. Two browsers on one phone are two devices. |
| Session | A date line and everything up to the next date line. |
| Base | The text a device last agreed with the server. It is how the merge tells "added here" from "removed there". |
| Sync | One device sending its text to the server and receiving the merged result. |

A date line has two forms, `[[2026-05-12]]` and `2026-09-21`. Both mean the same date, and the log uses both: 36 bracketed and 12 plain. The brackets make Obsidian treat the date as a link to that day's note. Every date is ISO 8601, `yyyy-mm-dd`.

A date line may carry the day's body weight: `2026-11-07 82.5kg` or `[[2026-11-07]] 181.9lbs`.

## Analysis

### How the local-first ideals are met

| Ideal | How this design meets it |
|---|---|
| No spinners | Every edit and save goes to the device copy. Nothing waits on the network. |
| Multi-device | Phone and desktop each sync with the home machine. |
| Network optional | A service worker holds the app and IndexedDB holds the log, so a cold start works with no connection. The first open needs a connection. |
| Collaboration | One person, but two devices and Neovim still need merging. |
| Longevity | The master is a plain text file that needs no app to read or edit. |
| Privacy | The log travels only between the owner's devices and home machine, over the VPN. |
| User control | The owner holds the file and its git history, and can edit it in Neovim at any time. |

### The merge

The merge is a pure function of three texts: base, server and device. It is a small table applied to each session, not a general text merge.

Sessions are matched by their date. Both date forms give the same key. A missing session counts as empty.

| Base compared with device and server | Result |
|---|---|
| Device equals server | Take it |
| Device equals base | Take the server's version, including a removal |
| Server equals base | Take the device's version, including a removal |
| One side removed it, the other changed it | Keep the changed version |
| Both sides changed it | Apply the line rules below |

Line rules when both sides changed a session:

1. The server's lines stay.
2. A line the device simply added stays as a real line.
3. A device line that edits an existing line becomes a `; conflict` comment.
4. A device line for an exercise the server also added, with different numbers, becomes a `; conflict` comment.
5. `; conflict` comments go last in the session, after every real line.
6. A comment already present is not added again, and a conflict line is never wrapped in another.

After merging, sessions are placed in date order.

**Worked example.** The base holds `- Row 12x20kg` under `2026-01-01`. At home the owner fixes it to `12x25kg`. At the gym, offline, the phone changes it to `12x30kg` and adds a Bench line.

```
2026-01-01
- Row 12x25kg
- Bench 12x40kg
; conflict 2026-01-01 phone: - Row 12x30kg
```

Bench is a real line. The Row line that was there first counts, and the comment does not. Which value counts depends on which change reached the server first, not on which is right, so the app must show that the session needs review.

**Why comments go at the end of the session.** A comment-only line parses as a blank line, and a blank line closes a super set (`src/document.rs:93`). A comment placed directly below a super-set member would silently split the group, and on the label it would dissolve the group. Eight of the last 14 sessions use super sets. Placing comments last avoids this with no parser change.

### Conflict line format

`; conflict YYYY-MM-DD <device>: <original line>`

* It is a whole line, and it is matched as a whole line. A note such as `- Row 12x30kg ; conflict with knee` must not match.
* The date is the session's date. It does not change on a retry, and it still says where the line came from if the line is moved.
* The device is one word with no spaces or colons, set once per device.
* The line is red and its date is orange.
* A conflict is resolved when its line is gone from the file. The count is the number of such lines, and nothing else stores it. It is computed with a plain text scan, so it works with WebAssembly down.
* Tapping the count jumps to the next conflict. Tapping a conflict offers: keep the current line, use this value, or keep it as a note. These are ordinary text edits that sync like any other. Conflicts can wait and never interrupt a workout.

### Sync protocol

`POST /api/sync` with `{protocol, device, base, text}`. The reply is `{text, notices}`. An ETag is not needed, because the device sends its base.

Device rule:

1. One sync at a time. Store the request before sending it.
2. If the outcome is unknown, resend exactly the same base and text. The merge is repeat-safe, so the server needs no memory of past syncs.
3. On a reply, if the editor still equals the text sent, adopt the merged text and make it the base.
4. If the owner typed during the sync, leave the editor alone, make the sent text the base, and sync again. That merge counts only the new typing as device changes. Merging stays on the server, so sync works with WebAssembly down.
5. Save text, base and pending request together in one IndexedDB transaction.

Applying a merged text to the editor:

* Apply it as small CodeMirror changes, so the cursor and view stay on the same logical line.
* Never apply it during keyboard composition, and wait a few seconds after the last keystroke.
* Keep it out of the undo history, so Undo reverts only the owner's edits.

Sync runs on open, on focus, on regaining the network, and after a pause in typing.

**Half-typed dates.** A line like `2026-11-0` is not a date line, so everything below it would join the previous session. The prototype confirmed this corrupts a merge. Sync therefore waits while a date-like line is unfinished or the cursor is on a date line, and the status says so. `2026-11-7` needs its own diagnostic: "looks like a date; this session has not started". The "Start session" action writes the date for the owner, so normal use avoids typing one.

### Server write order

1. Take an in-process lock. Neovim does not honour locks, so this only serializes syncs.
2. Read the file. If it is empty or sharply shorter than the last written text, wait briefly and read again, because Neovim may be mid-save.
3. If the file differs from the last commit, commit it as an outside edit.
4. Compute the merge. If the result equals the file, stop: no write and no commit.
5. Write a temp file in the same directory and fsync it.
6. Check the file's hash again. If it changed, start over.
7. Rename over the file, then fsync the directory.
8. Commit the result, naming the device and the sessions added, moved and conflicted.
9. Reply.

**Stale Neovim saves.** Both rounds flagged this as the worst risk. If a buffer opened before a phone sync is saved afterwards, the phone's session vanishes from the file, and the next sync reads that as a real deletion and removes it from the phone too. Committing after every write (step 8) keeps the session in history. When an outside edit removes whole sessions, the server sends a notice: "Session 2026-11-05 was removed outside the app". A small window remains between steps 6 and 7. It is accepted and documented.

### What the owner sees

* **Status, always visible:** "Saved on this phone", "Synced home at 18:42", "Synced, 1 line needs review", "Sync waiting: finish the date", or "Needs attention, not synced" with the reason.
* **Notices after a sync that changes visible text**, such as "Session 2026-10-29 moved" or "1 session added from desktop". If the session being edited moves, the view follows it.
* **Colours:** a conflict line is red with an orange date. Parse errors use a different treatment, so red keeps one meaning.

### Prototype results

A throwaway Python script tested the table and device rule on both logs.

| Check | Result |
|---|---|
| Merge properties, 1,500 random cases per log: identity, one-sided changes, repeat safety, date order, no lost device lines, no duplicate dates | 0 failures |
| Sync simulation, 800 runs per log: two devices, outside edits, lost replies, typing during a sync | 0 diverged, 0 lost lines, 0 unstable |
| Fixture merged with the live log, correct base | 0 conflicts; the result equals the live text |
| Both devices add the same new date | Both workouts stay as real lines |
| Phone adds a line, desktop fixes the line above it | Clean merge, no comment |
| `; conflict` line last in a super-set session | `workout-lint` reports 0 errors |

Limits of this evidence:

* The random simulation made additions only. The comment path is covered by hand-written examples only.
* Stale Neovim saves were not modelled.
* The prototype drops blank separator lines. The real merge must keep them.
* The first version turned a whole phone workout into comments when both sides added the same date. Rule 2 fixed that.

Known gap: if one side fixes a session's year while the other adds to it, the session is kept under both dates and its sets count twice. The merge must detect the same body under two dates and send a notice.

### Status of the first review's objections

| Objection | Status |
|---|---|
| One file does not mean one writer | Replaced by the merge and sync protocol |
| Offline depends on HTTPS | Open. The work is paused in MFD-319, and most other work does not depend on it |
| A valid save can destroy the log | Closed by the empty-body refusal, the "log not loaded" state and commits |
| Save failures are invisible | Closed by the status design, apart from certificate failures |
| The core phone logging job is not designed | Open. Listed under phone logging below, and needs a real keyboard test |
| The live log has no baseline | Open until step 1 of the order of work |

### Bugs found in the existing code

All of these were reproduced by running `workout-lint`.

| Input | Result | Why it matters |
|---|---|---|
| `- Row 99999999999` | Panic at `src/parser.rs:198` | Parse errors never block a sync, so the line stays in the file. From reading the code, every reload would then crash the language code, and `workout-lsp` too. |
| `- Row 20kg 12^3000000000` | Out of memory under a 4 GB limit | Same as above: `parse_document` expands every line. |
| `- Biceps Curl X2 12x8kg` | No error; "X2" joins the name, and the set counts 8 kg instead of 16 kg. Lowercase `x2` works. | The doubling is lost, so recorded volume is wrong. |
| `- Treadmill KM 16min` | No error; "KM" joins the name | `GRAMMAR.md` says this case should be an error. |
| `- Leg Extension q12x90lbs` | Warning only; the set joins the name | A one-letter slip loses a whole set. |
| `- Chin Assisted BW-36` | Warning only; the load joins the name | This is a normal state on the way to typing `BW-36Kg`. |
| `- Pec Fly 39kg` | Error, but the message is "unrecognised token `39kg`" | Rejecting it is right: it has no reps. The message should say "39kg has no reps; write 12x39kg or 39kg 12". While typing it is a normal state, so the error waits until the cursor leaves the line. |
| `- Treadmill 20min@4.7km/h` | No error, no warning | A missing distance goes unnoticed. |
| `- Treadmill 1.57KM 20min` | Error | `km` and `mi` match lowercase only, unlike `kg` and `lbs`. |
| `- Row 12X20kg`, `- Biceps Curl 2X 12x8kg` | Error | `x` between reps and load, and `2x`, match lowercase only. |
| `2026-02-30` | Accepted as a date | Impossible dates pass, and sort as if real. |

Causes, from the code:

* **The panic.** The grammar's `count` rule accepts any number of digits. `src/parser.rs:198` then converts the text to a 32-bit number with `.parse().unwrap()`. Anything above 4,294,967,295 fails, and `unwrap` turns the failure into a crash. The other number conversions in `parser.rs` have the same pattern.
* **The memory blow-up.** `3000000000` fits in 32 bits, so it parses. `Exercise::expand` in `src/expand.rs` then builds a list with one entry per performed set: three billion entries, tens of gigabytes. `parse_document` calls `expand` for every line to check rule R1 and R2, so just opening the file triggers it. In WebAssembly the limit is 4 GB, so the module would crash.
* **`X2`.** The rule `sides = { "x2" | "2x" }` is case-sensitive. A word that isn't reserved becomes part of the name, so `X2` is read as a name word.

Fixes:

* Check each number's size before converting it, and never `unwrap` a conversion. A number over its limit is an error on that token, for example "99999999999 reps is over the limit of 999".
* Limits (owner's decision): reps up to 999, repeats (`^`, `*`) up to 99, loads up to 9999. No other number may exceed 9999 either: sets per line after expanding, durations in minutes or seconds, distances, speeds, ranges and body weight.
* With repeats capped at 99 and sets per line capped at 9999, `expand` stays small. A fuzz test checks that no input panics or allocates without limit.
* `x` stays lowercase (owner's decision). `X2`, `2X` and `12X20kg` get a warning: "x must be lowercase: write x2" or "write 12x20kg". `X2` is no longer silently added to the name.
* Every unit is lowercase too (owner's decision): `kg`, `lb`, `lbs`, `km`, `mi`, `km/h`, `kph`, `mph`, `min`, `m`, `sec`, `s`, and `bw`. Uppercase still parses, with a warning and a quick fix. Built in MFD-341.

The parser rejects lines that are only unfinished, and it accepts lines that are wrong, so highlighting cannot rely on it. One never-failing line tokenizer in Rust is the single source of highlighting, shared by the browser and Neovim.

### Corrections to earlier technical claims

* **`semantic_tokens` does not fit in `analysis.rs`.** The syntax tree has no column positions, and `WorkoutParser` is private. The real work is in `parser.rs`.
* **Positions need care.** pest counts bytes, the library counts characters, and LSP and CodeMirror count UTF-16 units.
* **Symbols have no tokens yet.** Several, such as `x`, `^`, `++` and `~`, are unnamed in the grammar.
* **`analysis.rs` returns `lsp_types` shapes**, so LSP-shaped data still reaches JavaScript.
* **`lib.rs` always compiles the LSP server**, so the core must be split from the adapters.
* **The WebAssembly path is unproven.** `cargo check` does not link or run anything, and pest pulls in native stack-switching crates.
* **Neovim gets no colour from custom token types** until highlight groups exist.

### Nue

Nue can do this job, but it buys little here. It is the owner's requirement, so it is contained:

* Keep it to the page shell. The editor, Worker, sync and storage code are plain modules that do not import Nue.
* Pin the exact version and keep a copy of the package, because the last release was October 2025.
* Keep Worker and service worker files out of `lib/`. Nue auto-added a `lib/` script to the page, and a service worker under `/lib/` would only control that path.
* Serve the app at the root of its host, because built paths are absolute.

### Cost and upkeep

Estimates from a reviewer, not measurements:

* The log is about 11 KB and grows about 24 KB a year. A sync carries about three copies, so about 33 KB today.
* Device log data stays near 0.5 MB after 10 years. Quota is not the risk; eviction is.
* Git history stays small, because each commit stores only a small change.

Rules that keep this cheap: a sync with no change does not write or commit, syncs are debounced, and the reply omits the text when nothing changed.

The real cost is upkeep by one person: the build chain, the certificate, the sync protocol, device data migrations, git automation and backup checks. Everything that runs unattended must report failure somewhere the owner looks. The target is "nothing to do unless the app warns you".

## Goals vs. Non-Goals

* **In-Scope Goals:**
  * Open, edit and save the log on a phone or desktop with no connection, after a first online open.
  * Sync each device with the master file, merging changes without interrupting the owner.
  * Highlight date, time, exercise, machine, reps, weights, sets and the remaining token types, including on half-typed lines.
  * Never lose a logged workout, and always show whether it has reached the home machine.
  * Make logging a set on a phone fast enough to beat a notes app.
  * Change the file only through the owner's edits, session ordering, `; conflict` comments and two conversions the owner asked for: decimal comma to point, and plain dates to `[[yyyy-mm-dd]]` when that setting is on. The merge never changes bytes inside a line.
  * Keep `workout-lsp` working in Neovim, with colour from its own highlight groups.
  * Record body weight on the date line.
  * Optionally write dates as `[[yyyy-mm-dd]]` for Obsidian.
  * Ask before any sync removes a session, set or rep.
* **Out-of-Scope Non-Goals:**
  * Multiple users and login.
  * Public internet access.
  * Charts and progress analysis.
  * Patch-based saves, a server-side database, or incremental parsing.
  * CRDT libraries and real-time collaboration.
  * Syncing through Syncthing, Obsidian or any third party.
  * Automatic line-level merging beyond the rules above.
  * Converting sets between long form (`12x12kg 12x12kg 12x12kg`) and short form (`12kg 12^3`). Kept as an idea in Linear, not for now.
  * An off-machine backup. The owner decided against one (see Backup).

## Alternatives Weighed

* **Run `workout-lsp` on the server over a WebSocket.** Rejected: every keystroke would wait on the connection, and features would stop when the signal drops.
* **Run a full LSP server in a browser Worker.** Rejected: a protocol layer adds nothing with one client.
* **Use Nueglow for highlighting.** Rejected: it has no documented way to add a language and targets static code blocks.
* **Use Nue's own server as the backend.** Rejected: its README says it works for local development only, and `nue build` leaves it out.
* **Use a file on the phone as the app's only device copy.** Rejected: Chrome may ask for permission again on every launch, and an editor could overwrite the file while the app has it open. IndexedDB stays the app's working copy, and the phone file is a second copy kept beside it (see "Phone file").
* **Export and import buttons for the phone file.** Kept as the fallback if the phone-file spike fails: no permission problems, but the owner must remember to export before editing and import after.
* **Syncthing between the phone and the home machine.** Rejected for now: it adds a third sync system with its own conflict files, next to the app's merge.
* **A static-file server such as nginx, or WebDAV.** Rejected: neither can merge changes.
* **A CRDT library such as Yjs or Automerge.** Rejected: the plain file would stop being the real data, Neovim edits would need converting back in, and a character merge could silently produce a wrong weight.
* **A plain line merge (`git merge-file`).** Rejected: both devices adding a session at the end conflicts every time, and `--union` silently records false sets.
* **A conflict file with no merge.** Rejected: offline work is normal, so most syncs would create one.
* **Treat every both-changed session as conflicts.** Rejected after the prototype: a whole phone workout became comments.
* **A sync ID stored on the server for repeat safety.** Rejected for v1: the merge is repeat-safe by itself in the prototype, so the server stays free of per-device state. One case stays open: a lost reply followed by an outside edit to the same session can produce a false comment or restore a deleted session. Nothing is lost.
* **A JavaScript highlighter plus a server-side analysis endpoint.** Rejected: language features would stop working offline.
* **Neovim over SSH from the phone.** Rejected: it needs a connection, and it fails on thumb usability.

Still to decide in the design:

* **WebAssembly for highlighting only**, or for diagnostics and completion too.
* **A plain textarea instead of CodeMirror**, if CodeMirror fails the phone keyboard test.

## Key Decisions & Staging for Next Steps

### Decisions already made

* Nue is the front-end builder.
* The app is local-first and works offline, including a cold start after the first online open.
* The file stays plain text and is the source of truth, at `~/workout-log/Workout.md` in its own private git repository on the home machine. The move has not been done yet.
* The home machine hosts the app and stays on.
* Sessions are always in chronological order, and each has a unique date.
* A conflicted line stays as a `; conflict` comment, highlighted red with its date in orange.
* The app requests the file and persists it on the phone.
* Neovim stays a writer of the file.
* The phone keeps a real `Workout.md` that any text editor can open and edit (added 2026-11-07).
* `; conflict` comments go at the end of the session, not directly below the line (accepted 2026-11-07).
* WebAssembly built from the Rust crate supplies highlighting, diagnostics and completion in the app (2026-11-07).
* Every date is ISO `yyyy-mm-dd`. Half-typed and non-ISO dates get a warning with no quick fix: the owner corrects every date by hand. The message may suggest the likely date (`07/11/2026` → "did you mean 2026-11-07?").
* A one-digit month (`2026-1-07`) is treated as a typo, because it could mean 2026-01-07, 2026-10-07, 2026-11-07 or 2026-12-07. The warning lists those dates when there are at most four.
* One shared rule decides which lines start a session, used by both the parser and the merge, so the two agree on every line (see "Which lines start a session").
* An app setting writes dates as `[[yyyy-mm-dd]]` for Obsidian, and converts all existing plain dates when on.
* Impossible dates are errors. No number in the log may exceed 9999. Reps are capped at 999, repeats at 99 and loads at 9999.
* `x`, `bw` and all units must be lowercase. `X2`, `12X20kg`, `BW`, `Kg` and `KM` get a warning and a quick fix.
* Decimal commas are accepted and saved as decimal points. In a body weight, `82,5kg` is an error with a quick fix to `82.5kg`.
* A body weight in grams over 9999 (`82500g`) is an error with a quick fix to kilograms (`82.5kg`). Any other weight over 9999 is an error with no fix. A bad weight never stops the day's session from starting.
* No session lasts more than 6 hours. A time range whose end is earlier than its start crosses midnight when that gives at most 6 hours (`23h30~00h40` is 1 h 10 min). Otherwise it is a typo (`19h40~18h15`): a warning with a quick fix that swaps the two times.
* A time line may be a start time alone (`18h15`). Start and end are stored as minutes, and the duration is shown in hover and the outline.
* Several durations on one cardio line are segments only when every one has a speed (`10min@6km/h 10min@3km/h`). Each segment's distance is time × speed, and they add up. When one has no speed (`5min 20min`), the line is an error with no fix, asking the owner to make the first a distance (`5km 20min`).
* Hover and the outline show a cardio line's total time, distance and pace.
* Autocorrect is off in the editor.
* The phone file is `Documents/Obsidian/Workout.md`. The app may ask the owner to pick it.
* Monthly files are planned, not built.
* Body weight goes on the date line, in kg, g, lb/lbs or oz.
* An exercise with a load and no reps, such as `- Pec Fly 39kg`, is an error.
* A sync never removes a session, set or rep without asking first.
* The only log is `workout_syntax/Workout.md`, to be moved to `~/workout-log/`. Other copies are ignored. Git ignores it inside the crate; the crate's tests read it from disk when present (`build.rs`) and use the fixture otherwise.
* The crate `workout_syntax` is a git submodule of this repository. Its URL is local until it has a remote.
* Its first date was a typo and is now `[[2026-05-11]]`.
* The phone runs Vivaldi with the Portuguese Google keyboard. Logging is set by set during the workout.
* The phone file is opened in Obsidian or in Neovim.
* There is no off-machine backup.
* Parse errors never block a sync.
* The server is separate from Nue. It is `workout-server` in the crate: Rust, standard library and `serde_json` only (MFD-309).
* The language code runs in the browser as WebAssembly (MFD-307, decided).

Proposed, awaiting the owner:

* The app's HTTPS address and certificate (MFD-319, paused). The details are kept out of this public brief.

### Open questions for the owner

None at the moment.

### Requirements to carry into `/egm-draft`

**Merge:**

* Keep it a pure function with no dependency on the parser, Nue or the server. Pass in any device name.
* One panic-free `date_key(line)` function, shared with the parser. It must accept indentation and a trailing comment, and must never match a `; conflict` line.
* Duplicate dates are matched by date and occurrence number, and raise an error diagnostic. Repeated syncs must not add blocks.
* Always place a newline between sessions, so a date cannot join the end of the previous line.
* Blank separator lines stay with the session above and are ignored when comparing.
* Report every move and removal in the sync reply and the commit message.

**Text handling:**

* The file is UTF-8 with LF line endings. If it is not valid UTF-8, or holds a CR, stop merging, leave it untouched and report it.
* A load and sync with no edit must change no bytes.

**Dates:**

* Sorting removes the "earlier than previous session" warning, so warn before moving when a new session's date is far from today, in either direction.
* Reject impossible dates such as `2026-13-45`.

**Server:**

* Refuse an empty body. Never create a missing log.
* A failed commit does not undo the write, and it reaches the owner as a notice.
* Keep base and device text when both sides changed a session, so a bad merge can be replayed.
* Bind to `127.0.0.1` or the VPN address only. Check `Host` and `Origin`, and send no CORS headers.
* Refuse an old `protocol` value clearly, so the device can show "update needed, your text is safe".

**On the device:**

* Fetch the whole file into IndexedDB on first open, and tell the owner when offline use is ready.
* Request persistent storage with `navigator.storage.persist()`, and show the result with a next step. Installing to the home screen should be tested on the S25.
* Use strict IndexedDB durability for text commits, debounced, if the spike confirms the default is relaxed. A failed local write has its own status.
* Version the IndexedDB schema. Migrations never touch unsynced text.
* Allow one editing tab per browser with the Web Locks API.
* Cache app, WebAssembly and Worker files under one build ID. Never cache `/api/`. Do not swap the app during editing.
* Treat "log not loaded" as its own state, never as an empty document.
* Keep "copy my text" available in every failure state.

**Phone file:**

* The phone file is `Documents/Obsidian/Workout.md` in main storage, inside the Obsidian vault. The app asks the owner to pick it on first use, and may ask again later, for example after permission is lost.
* The owner picks or creates the file once with the browser's file picker. Chrome for Android has it from version 132. The phone runs Vivaldi, which is built on the same engine, but whether Vivaldi turns this picker on is unverified. The app stores the file handle in IndexedDB.
* Obsidian on Android needs the file inside its vault folder. Neovim on Android runs in Termux, which reaches shared storage after `termux-setup-storage`, so one file in the vault serves both.
* The app writes its text to the file after each local save, with a delay so it doesn't write on every keystroke, and keeps a copy of what it last wrote ("file base").
* When the app opens or comes back to the front, it reads the file. If the file differs from the file base, a text editor changed it. The app merges that edit into its own text with the same session merge, using the file base as the base, then syncs as usual.
* The app only sees editor changes when it is open. An edit made in an editor while the app is closed is merged the next time the app opens.
* If Chrome no longer has permission, the app shows "Allow access to Workout.md" and keeps working from IndexedDB. It never treats a missing or unreadable file as an empty log.
* Risk: an editor that still has an old version open can save over the app's newer writes. This is the same stale-save case as Neovim, so the merge shows it as a removed session with a notice, and the server's git history keeps the lost lines.
* Spike on the S25 before building: whether permission lasts between launches, whether the installed app keeps it, whether Chrome's write (it writes a temporary file, then replaces the original) breaks a text editor that has the file open, and whether Vivaldi offers the picker at all.
* Fallback if the spike fails: "Save to phone" and "Load from phone" buttons that run the same merge.

**Dates:**

* Warn on a half-typed date, such as `2026-11-0` or `2026-11-7`: "date is incomplete: write yyyy-mm-dd". Sync waits until it is finished.
* Warn on a date in another format, such as `07/11/2026` or `2026/11/07`: "dates are written yyyy-mm-dd: did you mean 2026-11-07? please correct the date". No quick fix; day first is assumed when the year is last.
* Warn on a one-digit month, such as `2026-1-07`, as a likely typo: "…the month in 2026-1-07 has one digit (perhaps 2026-01-07, 2026-10-07, 2026-11-07 or 2026-12-07); please correct the date". No quick fix.
* Reject impossible dates, such as `2026-02-30` or `2026-13-01`, as errors.
* Until corrected, none of these lines starts a session, and sync waits (`Document::has_unfinished_date`).
* Reject impossible times of day, such as `25h70`, in the same way.
* Date setting "Obsidian links": when on, the app writes new date lines as `[[yyyy-mm-dd]]` and converts every existing plain date to that form, including dates Neovim writes later. The merge, sorting and highlighting treat both forms as the same date. Both forms already parse.
* The setting is shared by all devices and kept on the server, so one device doesn't keep adding brackets while another writes plain dates.
* Turning it on converts 12 date lines in today's log in one edit, which syncs like any other change. Turning it off leaves existing brackets as they are.

**Body weight:**

* Form: `2026-11-07 82.5kg`, or `[[2026-11-07]] 82.5kg`, with units kg, g, lb, lbs or oz, any case. A comment may follow.
* It sits on the date line, so a date is still unique: a day with a weigh-in and no workout is a session with no exercises.
* The merge key stays the date alone, so changing the weight is an edit to the session's first line.
* Before this, such a line was an error, so no existing line changed meaning.
* The limit is 9999 in the unit written. `82500g` is an error: "a body weight of 82500g is over the limit of 9999g: write 82.5kg", with a quick fix to `82.5kg`.
* `82,5kg` is an error: "body weights use a decimal point: write 82.5kg", with a quick fix.
* A wrong weight is an error on the weight alone. The session still starts, so a typo in the weight never moves that day's sets under another date.
* Highlight the weight in its own colour, and offer completion from the last recorded weight.

**Cardio:**

* A cardio line with a duration and speed but no distance, such as `- Treadmill 20min@4.7km/h`, gets a warning: "no distance". A quick fix inserts the distance from time and speed: 20 min at 4.7 km/h is 1.57 km. This matches the log's own `1.57km 20min@4.7km/h` line.
* The check uses the line's shape, not the word "Treadmill", so it also covers a bike or an elliptical.
* Several durations are segments when every one has a speed. Each is time × speed, the distances add up, and the "no distance" fix inserts the sum: `10min@6km/h 10min@3km/h` → `1.5km`.
* When one of several durations has no speed, the line is an error with no fix: "a cardio line has one duration unless each has a speed, but this one has 2 (`5min`, `20min`): turn the first into a distance, such as `5km 20min`, and correct the line". With a distance already written, the advice is "keep one and correct the line".
* Hover and the outline show the totals: `total 20 min · 1.5 km (from speed) · 13:20 /km`, or `total 15 min · 5 km · 3:00 /km` with a written distance.

**Session time:**

* A time line follows the date line: `18h15~19h40`, `~17h00`, `12h55~`, or a start time alone, `18h15`.
* Start and end are stored as minutes after midnight, and the duration is computed. Hover and the outline show `18h15~19h40 · 1 h 25 min`.
* No session lasts more than 6 hours. `08h00~15h30` warns: "lasts 7 h 30 min, but a session lasts at most 6 h: please correct the times".
* An end earlier than the start crosses midnight when that gives at most 6 hours: `23h30~00h40` is 1 h 10 min.
* Otherwise it is a typo. `19h40~18h15` warns "19h40~18h15 ends before it starts: did you mean 18h15~19h40? please correct the times", with a quick fix that swaps the times. There is no fix when the swap is also over 6 hours.
* `18h15~18h15` warns that the session starts and ends at the same time.
* Impossible times (`25h70`) are errors.

**Which lines start a session:**

* One function, `session::session_date`, decides it for both the parser and the merge. Before this, a comparison of 96,349 lines found 7,168 that the merge treated as sessions and the parser did not: impossible dates, weights over 9999, and decimal commas. Now there are none, and the comparison is a permanent test.
* A line starts a session when, after optional spaces or tabs, it has a real date `yyyy-mm-dd` or `[[yyyy-mm-dd]]`, then optionally a body weight (a number with a point or comma, and a unit `kg g lb lbs oz` in any case), then optionally a `; comment`, and nothing else.
* An impossible date starts no session in either, and sync waits until it is corrected.

**Grammar symbols:**

* Every symbol gets a name in the grammar so it can be coloured: `x`, `^`, `*`, `++`, `/`, `~`, `@`, `+`, `:`, `[[`, `]]`, `_`.
* `x` and every unit are lowercase, with a warning for uppercase (see the fixes above).
* A load with no reps gets its own message instead of "unrecognised token".

**Confirm before a sync removes data:**

* After merging, compare each session's sets before and after: sessions, sets per exercise, and reps per set. Any loss is a removal.
* If a sync would remove anything the device still has, the server writes nothing and replies with the list, for example "Neovim's save removes session 2026-11-07 (5 exercises, 14 sets). Remove it, or keep it?"
* Remove: the device resends with the list's ID, and the server applies it. Keep: the device resends with its version of those sessions marked to win, so the removed lines come back.
* This covers a stale Neovim save and a stale save in Obsidian on the phone. It does not cover edits made on the device itself, which are the owner's own.
* While the question is open, the device keeps working and keeps its text. Only that sync waits.

**Monthly files (planned, not built yet):**

The owner asked for this to be planned now and built later. The log is 11 KB after six months, about 24 KB a year, so size is not yet a problem.

* Layout: `~/workout-log/Workout.md` holds the current month. Each past month lives in `~/workout-log/archive/yyyy-mm.md`, for example `archive/2026-10.md`. On the phone the same layout sits next to `Documents/Obsidian/Workout.md`.
* A session's file comes from its date. Nothing else decides it.
* The month change: the first sync after a month ends moves that month's sessions from `Workout.md` to its archive file, in one commit. The merge treats this as a move, never as a removal, so it does not ask for confirmation.
* Each file has its own base, and the sync sends only files that changed. Archive files rarely change, so a normal sync sends one small file.
* A late session, such as an October workout from a device that was offline until November, goes straight to `archive/2026-10.md`.
* An edit to an old session in Neovim or Obsidian goes in that month's file, and syncs like any other change.
* Highlighting, diagnostics and completion read the current file plus the recent archive files, so completion still offers last month's exercises.
* Build it first in the merge design: keep the merge per file and route sessions by date, so splitting later doesn't change the merge rules.
* Build trigger: the log passes about 200 KB, or Obsidian or Neovim gets slow.

**Phone typing (Vivaldi, Portuguese Google keyboard, set by set):**

* Set-by-set logging means the active line is unfinished most of the time. Highlighting must come from the tokenizer, and errors wait until the cursor leaves the line.
* Autocorrect is off (owner's decision), along with auto-capitalise and spellcheck, because Portuguese autocorrect would change English exercise names.
* Accept a decimal comma, such as `2,5kg`, and save it as `2.5kg`. A comma counts as decimal only between two digits, so `10x23kg, 10x23kg` is not touched. A comma in reps, such as `12,5`, becomes `12.5` and is then an error, because reps are whole numbers.
* Test CodeMirror with the Google keyboard on Vivaldi early. Android keyboards send text in batches, which has caused editor bugs before.

**Neovim highlight groups:**

* `workout-lsp` sends semantic tokens with custom types, one per token kind.
* A small Neovim plugin defines `Workout*` groups and links the LSP groups to them, so colour works with any colour scheme. For example `@lsp.type.workoutDate` links to `WorkoutDate`.
* Default links: date to `Title`, time to `Special`, exercise to `Function`, machine to `Type`, reps to `Number`, load to `Constant`, units and symbols to `Operator`, super-set label to `Label`, comment to `Comment`, body weight to `Identifier`.
* `WorkoutConflict` is red and `WorkoutConflictDate` orange, set directly rather than linked, so they look the same in every colour scheme.
* LSP colours draw over the Markdown Tree-sitter colours, so the file can stay `.md` for Obsidian.

**Neovim:**

* Document `autoread`, a `checktime` trigger, and what to do when warned that the file changed.
* Add a `workout-lsp` diagnostic and highlight links for `; conflict` lines, sharing one token list with the app.

**Language code:**

* Editing and syncing must work with WebAssembly absent or crashed.
* Make the parser total: out-of-range numbers become parse errors, and repeat counts are capped.
* Fuzz the parser, and test every prefix of every log line.
* Split the core code from the LSP and WebAssembly adapters.

**Phone logging:**

* Open at the end of the file, with line wrapping and text readable at arm's length.
* Start session, Finish, Same set again, and a symbol row (`x ^ ++ @ ~ kg lbs ;`) with visible Undo.
* Turn off autocorrect, auto-capitalise and spellcheck on the editor.
* Hold errors on the active line until the cursor leaves it, and show messages above the keyboard.
* On the phone, completion inserts the name and load, not the last reps.
* Replace hover with a tap on a line. Hide inlay hints at narrow widths.

**Backup and restore:**

* No off-machine backup, by the owner's decision. Git history on the home machine covers mistakes and bad merges, but not a lost disk or a stolen machine. The phone and desktop copies are then the only other copies, and they hold the whole log only while their storage survives.
* Write short restore steps from git history. A restore is a new commit that removes nothing else, and it must be rehearsed once.

### Proposed order of work

Steps 1 to 5 do not depend on HTTPS, so the paused network work blocks nothing until step 6.

1. Commit the crate, move the live log to `~/workout-log`, and decide the repository layout. **Partly done:** the crate is committed and is a submodule of this repository. The live log has not moved.
2. Fix the parser crashes, add the missing symbols, and add `date_key`, the date checks, body weight, conflict detection in `workout-lint`, the conflict tokens and the Neovim highlight groups. **Done** (MFD-330 to 336, 341, 343 to 346), except conflict detection in `workout-lint`. The Neovim plugin is in `editors/nvim/` but not installed.
3. Build the merge in Rust with property tests, every table row as a test, both logs as real data, and small fixtures for what neither log contains. **Done** (MFD-342). 1,500 property cases per log and a sync simulation, with 0 failures.
4. Build the server on `127.0.0.1` against a copy of the log, then test lost replies, a crash at each write step, a Neovim save at each step, a full disk and an empty save. **Built** (MFD-309, MFD-337): `workout-server`, with 13 tests and a live run on a copy of the log. Not yet tested: a crash at each write step, a Neovim save at each step, and a full disk. No systemd unit yet.
5. **Not started.** Build the Nue page, IndexedDB layer, service worker and WebAssembly build. `localhost` counts as a secure context, and `adb reverse tcp:8080 tcp:8080` lets the S25 test offline behaviour and its real keyboard over USB. This is untested here.
6. Finish MFD-319, then confirm a cold start with the VPN off on the real address.
7. Run in shadow mode against a copy of the real log for two weeks, then switch to the real file.

### What the design document must add

The problem statement, measurable goals, user journeys, the merge specification, API contract, sync state machine, repository layout, upgrade path, device recovery, backup monitoring, non-functional requirements, risks and a verification plan.

Journeys should cover: a clean merge while the app is open, a conflict found at the gym and resolved later, a session moved by ordering, and remote text arriving during typing.

The crate models its state machines in TLA+. `tla/DocumentSync.tla` cannot be reused, because it models LSP notifications. After the property tests, a new model should cover the send and reply loop with lost replies, an outside writer and two devices.
