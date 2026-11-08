// Service worker for the workout app, served at /sw.js.
//
// - Caches the app files under one build ID, so a new build gets a new cache.
// - Never caches or intercepts /api/: the log always comes from the server
//   or from IndexedDB, never from a stale HTTP cache.
// - Never swaps the running app by itself. A new worker installs and then
//   waits; the page posts {type: "skip-waiting"} when the owner is not
//   editing (for example after "Reload to update"), then reloads.
//
// Build placeholders. The build replaces the two quoted placeholders in the
// constants below (they appear nowhere else in this file):
//   BUILD_ID   a unique build string, such as the git commit or a content
//              hash; it names the cache, so each build gets its own
//   APP_FILES  the whole placeholder array becomes a JSON array of the
//              app's paths, such as ["/", "/index.html", "/js/app.js",
//              "/wasm/workout_wasm_bg.wasm"]
// For example, in a bun build script:
//   sw.replace('"__BUILD' + '_ID__"', JSON.stringify(id))
//     .replace('["__APP' + '_FILES__"]', JSON.stringify(files))
// A new build ID also changes sw.js's bytes, which is how the browser finds
// the update. While the placeholders are left in (development), the worker
// still works: it caches "/" and "/index.html" and app files as fetched.

const BUILD_ID = "__BUILD_ID__"
const APP_FILES = ["__APP_FILES__"]

const CACHE_PREFIX = "workout-app-"
const CACHE = CACHE_PREFIX + BUILD_ID
const PRECACHE = [...new Set(["/", "/index.html", ...APP_FILES.filter((f) => !f.startsWith("__"))])]

const isApi = (url) => url.origin === self.location.origin && (url.pathname === "/api" || url.pathname.startsWith("/api/"))

self.addEventListener("install", (event) => {
  // No skipWaiting() here: the page decides when to switch.
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // cache: "reload" skips the HTTP cache, so this build's files are fresh.
      cache.addAll(PRECACHE.map((path) => new Request(path, { cache: "reload" }))),
    ),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(CACHE_PREFIX) && key !== CACHE) await caches.delete(key)
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener("message", (event) => {
  if (event.data?.type === "skip-waiting") self.skipWaiting()
  if (event.data?.type === "build-id") event.ports[0]?.postMessage(BUILD_ID)
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  const url = new URL(req.url)
  // Only this site's GETs; /api/ goes straight to the network, untouched.
  if (req.method !== "GET" || url.origin !== self.location.origin || isApi(url)) return

  if (req.mode === "navigate") {
    event.respondWith(navigate(req))
    return
  }
  event.respondWith(cacheFirst(req))
})

/**
 * Pages: this build's cached page, so the page and its files always come
 * from the same build. The network is used only when the page is not
 * cached; offline, any page falls back to the cached /index.html.
 * (The browser still fetches /sw.js itself on navigation, which is how a
 * new build is found.)
 */
async function navigate(req) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req, { ignoreSearch: true })
  if (hit) return hit
  try {
    return await fetch(req)
  } catch {
    return (await cache.match("/index.html")) ?? Response.error()
  }
}

/** App files: from this build's cache, else the network (and kept). */
async function cacheFirst(req) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok && res.type === "basic") await cache.put(req, res.clone())
  return res
}
