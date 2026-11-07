// Wraps the language module (docs/web-app-interfaces.md, section 1) with
// parsed JSON and safe defaults, so the editor keeps working when the
// module is missing or misbehaves: editing never depends on it.

const NONE = {
  kinds: () => [],
  tokenize: () => new Uint32Array(0),
  diagnostics: () => "[]",
  completions: () => "[]",
  hover: () => undefined,
  unfinished_date: () => false,
  version: () => "none",
}

function guard(fn, fallback) {
  return (...args) => {
    try { return fn(...args) } catch (e) { console.error("language module:", e); return fallback }
  }
}

function parseList(json) {
  try {
    const v = typeof json === "string" ? JSON.parse(json) : json
    return Array.isArray(v) ? v : []
  } catch { return [] }
}

/** Adapter over a section-1 module (or null, for "no language module"). */
export function adaptLang(mod) {
  const m = mod ?? NONE
  const kinds = guard(() => Array.from(m.kinds()), [])()
  return {
    available: !!mod,
    kinds,
    version: guard(() => String(m.version()), "none")(),
    tokenize: guard(line => m.tokenize(line) ?? new Uint32Array(0), new Uint32Array(0)),
    diagnostics: guard(text => parseList(m.diagnostics(text)), []),
    completions: guard((text, line, col) => parseList(m.completions(text, line, col)), []),
    hover: guard((text, line, col) => {
      const h = m.hover(text, line, col)
      return typeof h === "string" && h.trim() ? h : null
    }, null),
    unfinishedDate: guard(text => !!m.unfinished_date(text), false),
  }
}
