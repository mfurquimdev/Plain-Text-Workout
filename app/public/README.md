# public

Static files that the build copies as they are to the root of `.dist`.
Nue does not process this directory (`site.yaml` skips it);
`scripts/build.js` copies it after the Nue build.

| Path      | Tracked | Served at | Contents |
|-----------|---------|-----------|----------|
| `fonts/`  | yes     | `/fonts/` | The bundled Monaspace fonts and their licence. See [fonts/README.md](fonts/README.md). |
| `wasm/`   | no (git-ignored) | `/wasm/` | The WebAssembly language module. |

## public/wasm

`bun run wasm` runs `../workout_syntax/wasm/build.sh public/wasm`, which
builds the `workout_wasm` crate and writes:

- `workout_wasm.js`: the wasm-bindgen loader (`--target web`);
- `workout_wasm_bg.wasm`: the module itself;
- `workout_wasm.d.ts` and `workout_wasm_bg.wasm.d.ts`: TypeScript
  declarations.

Build it once before `bun run build`, and again after the language changes.
`src/deps.js` imports `/wasm/workout_wasm.js` at run time; the bundler
leaves it out of `js/app.js` (`external: ["/wasm/*"]` in
`scripts/build.js`). Without it the page still opens, with no highlighting
or diagnostics (`src/editor/lang.js` falls back to an empty module).

The `.d.ts` files are copied to `.dist` too, but the service worker's
pre-cache list leaves them out.

Every file copied from here also changes the service worker's build ID,
because `scripts/build.js` hashes all of `.dist`. README files are left
out of the copy.
