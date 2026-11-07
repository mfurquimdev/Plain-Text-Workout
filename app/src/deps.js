// The one place that picks the language module and the sync client.
// Development uses the plain-JS stubs in src/stubs/. To switch to the real
// modules (docs/web-app-interfaces.md):
//
//   export { openStore } from "./sync/store.js"
//   export { SyncClient } from "./sync/client.js"
//   export async function loadLang() {
//     const lang = await import("/wasm/workout_wasm.js")  // external to the bundle
//     await lang.default()
//     return lang
//   }

import * as langStub from "./stubs/lang.js"

export { openStore, SyncClient } from "./stubs/sync.js"

/** Resolves to the language module (section 1 API), already initialised. */
export async function loadLang() {
  await langStub.default()
  return langStub
}

/** True while the page runs on the stubs (the page says so in its footer). */
export const usingStubs = true
