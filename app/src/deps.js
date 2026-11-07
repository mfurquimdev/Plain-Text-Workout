// The one place that picks the language module and the sync client.
// A normal build uses the real modules (docs/web-app-interfaces.md): the
// WebAssembly language module from /wasm/ and src/sync/. The UI tests build
// with WORKOUT_STUBS=1, which swaps in the plain-JS stubs in src/stubs/
// (scripts/build.js defines __WORKOUT_STUBS__; the unused branch is dropped).

import * as langStub from "./stubs/lang.js"
import * as syncStub from "./stubs/sync.js"
import { openStore as realOpenStore } from "./sync/store.js"
import { SyncClient as RealSyncClient } from "./sync/client.js"

/* global __WORKOUT_STUBS__ */
/** True while the page runs on the stubs (the page says so in its footer). */
export const usingStubs = typeof __WORKOUT_STUBS__ !== "undefined" && __WORKOUT_STUBS__ === true

export const openStore = usingStubs ? syncStub.openStore : realOpenStore
export const SyncClient = usingStubs ? syncStub.SyncClient : RealSyncClient

/** Resolves to the language module (section 1 API), already initialised. */
export async function loadLang() {
  if (usingStubs) {
    await langStub.default()
    return langStub
  }
  const lang = await import("/wasm/workout_wasm.js") // external to the bundle
  await lang.default()
  return lang
}
