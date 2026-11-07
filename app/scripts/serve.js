// A tiny static server for app/.dist, served at the site root (Nue's
// built paths are absolute). Paths without an extension get index.html.
// Usage: bun scripts/serve.js [port]   (or PORT=...)

import { join, normalize, extname } from "node:path"

const dist = join(import.meta.dir, "..", ".dist")
const TYPES = {
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
  ".js": "text/javascript; charset=utf-8",
}

export function serve(port = Number(process.argv[2] ?? process.env.PORT ?? 4173)) {
  return Bun.serve({
    port,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url)
      if (url.pathname.startsWith("/api/")) return new Response("no sync server here", { status: 503 })
      let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "")
      if (path.endsWith("/")) path += "index.html"
      if (!extname(path)) path = "/index.html"
      const file = Bun.file(join(dist, path))
      if (!(await file.exists())) return new Response("not found", { status: 404 })
      const type = TYPES[extname(path)]
      return new Response(file, { headers: { ...(type ? { "content-type": type } : {}), "cache-control": "no-cache" } })
    },
  })
}

if (import.meta.main) {
  const server = serve()
  console.log(`serving app/.dist on ${server.url}`)
}
