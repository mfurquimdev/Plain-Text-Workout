// Stand-in for the WebAssembly language module (docs/web-app-interfaces.md,
// section 1), in plain JS. Good enough to develop the editor with: a regex
// tokenizer, one diagnostic (a half-typed date) plus a quick-fix example,
// exercise-name completion and a small hover. The real module replaces it
// in src/deps.js.

const KINDS = [
  "date", "date_bracket", "body_weight", "time", "bullet", "superset_label",
  "exercise", "machine", "initial", "sides", "reps", "repeat", "load", "unit",
  "bw", "operator", "distance", "duration", "speed", "range", "comment",
  "conflict", "conflict_date", "invalid",
]
const K = Object.fromEntries(KINDS.map((k, i) => [k, i]))

const MASS = /^(kg|lbs|lb|g|oz)$/i
const DIST = /^(km|mi|m)$/i
const TIME = /^(min|sec|s)$/i
const SPEED = /^(km\/h|kph|mph)$/i
const ANGLE = /^(⁰|°|º|%)$/

export default async function init() {}
export function kinds() { return KINDS.slice() }
export function version() { return "stub-0.1.0" }

/** Flat [from, to, kind, ...] for one line, columns in UTF-16 code units. */
export function tokenize(line) {
  const out = []
  const push = (from, to, kind) => { if (to > from) out.push(from, to, K[kind]) }
  line = String(line ?? "")

  // ; conflict 2026-01-01 phone: - Row 12x30kg
  const conflict = /^(\s*)(; conflict )(\d{4}-\d{2}-\d{2})( [^\s:]+: .*?)\s*$/.exec(line)
  if (conflict) {
    const start = conflict[1].length
    const dateFrom = start + conflict[2].length
    const dateTo = dateFrom + conflict[3].length
    push(start, dateFrom - 1, "conflict")
    push(dateFrom, dateTo, "conflict_date")
    push(dateTo + 1, dateTo + conflict[4].length, "conflict")
    return Uint32Array.from(out)
  }

  // split off the comment
  let end = line.length
  const semi = line.indexOf(";")
  let commentFrom = -1
  if (semi >= 0) {
    commentFrom = semi
    end = semi
  }
  const body = line.slice(0, end)
  const lead = body.length - body.trimStart().length

  const date = /^(\s*)(\[\[)?(\d{1,4}(?:-\d{0,2}(?:-\d{0,2})?)?)(\]\])?(?:(\s+)(\d+(?:[.,]\d*)?)([a-z]*))?\s*$/i.exec(body)
  const time = /^\s*(\d{1,2}h\d{0,2})?(~)?(\d{1,2}h\d{0,2})?\s*$/.exec(body)
  if (date && (date[2] || !/^\d{1,2}h/.test(body.trim()))) {
    let p = date[1].length
    if (date[2]) { push(p, p + 2, "date_bracket"); p += 2 }
    push(p, p + date[3].length, "date"); p += date[3].length
    if (date[4]) { push(p, p + 2, "date_bracket"); p += 2 }
    if (date[6]) {
      p += date[5].length
      push(p, p + date[6].length, "body_weight"); p += date[6].length
      push(p, p + date[7].length, MASS.test(date[7]) ? "unit" : "invalid")
    }
  } else if (time && (time[1] || time[3]) && body.trim()) {
    let p = lead
    if (time[1]) { push(p, p + time[1].length, "time"); p += time[1].length }
    if (time[2]) { push(p, p + 1, "operator"); p += 1 }
    if (time[3]) push(p, p + time[3].length, "time")
  } else if (/^\s*_/.test(body)) {
    const m = /^(\s*)_([^_]*)(_?)/.exec(body)
    let p = m[1].length
    push(p, p + 1, "operator"); p += 1
    const label = m[2].trimEnd()
    push(p, p + label.length, "superset_label"); p += m[2].length
    if (m[3]) push(p, p + 1, "operator")
  } else if (body.trim()) {
    exerciseTokens(body, push)
  }

  if (commentFrom >= 0) push(commentFrom, line.trimEnd().length, "comment")
  return Uint32Array.from(out)
}

function exerciseTokens(body, push) {
  let p = body.length - body.trimStart().length
  const bullet = /^[-+](?=\s|$)/.exec(body.slice(p))
  if (bullet) { push(p, p + 1, "bullet"); p += 1 }

  // words: the name runs until a word that starts with a digit, @, + or is bw / x2
  const words = []
  const re = /\S+/g
  re.lastIndex = p
  for (let m; (m = re.exec(body));) words.push({ from: m.index, to: m.index + m[0].length, text: m[0] })

  let i = 0
  const isData = w => /^[\d@+]/.test(w.text) || /^bw/i.test(w.text) || /^x\d*$/i.test(w.text)
  const name = []
  while (i < words.length && !isData(words[i])) name.push(words[i++])
  if (name.length) push(name[0].from, name.at(-1).to, "exercise")

  // machine
  if (i < words.length && words[i].text.startsWith("@") && !/^@\d/.test(words[i].text)) {
    const at = words[i]
    push(at.from, at.from + 1, "operator")
    const mach = [{ ...at, from: at.from + 1 }]
    i++
    while (i < words.length && !isData(words[i])) mach.push(words[i++])
    if (mach[0].to > mach[0].from || mach.length > 1) push(mach.find(w => w.to > w.from)?.from ?? at.to, mach.at(-1).to, "machine")
  }

  let sawSet = false
  for (; i < words.length; i++) {
    sawSet = dataWord(words[i], push, sawSet)
  }
}

// One data word such as 12x63kg^2, 63kg++5lbs, +22kg, x2, 12/11, bw-36kg,
// 20min@4.7km/h, 4.5~15⁰. Returns whether a set has been seen.
function dataWord(w, push, sawSet) {
  const t = w.text
  const base = w.from
  if (/^x\d*$/i.test(t) || /^\d+x$/i.test(t)) { push(base, w.to, "sides"); return sawSet }

  const parts = []
  const re = /(\d+(?:\.\d+)?)|(\+\+|[x^*+\-/:~@_,])|([a-z]+(?:\/h)?|[⁰°º%])|(.)/giy
  for (let m; (m = re.exec(t));) parts.push({ from: base + m.index, to: base + m.index + m[0].length, m })

  let prevOp = null
  for (let j = 0; j < parts.length; j++) {
    const { from, to, m } = parts[j]
    const next = parts[j + 1]
    if (m[1] !== undefined) {
      const unit = next && next.m[3] !== undefined ? next.m[3] : null
      let kind = "reps"
      if (prevOp === "+" && !sawSet) kind = "initial"
      else if (prevOp === "^" || prevOp === "*") kind = "repeat"
      else if (prevOp === "x" || prevOp === "++" || prevOp === "-" && /^bw$/i.test(parts[j - 2]?.m[0] ?? "") || prevOp === "+" && sawSet) kind = "load"
      else if (unit && MASS.test(unit)) kind = "load"
      else if (unit && DIST.test(unit)) kind = "distance"
      else if (unit && TIME.test(unit)) kind = "duration"
      else if (unit && SPEED.test(unit)) kind = "speed"
      else if (prevOp === "@") kind = "speed"
      else if (prevOp === "~" || (next?.m[2] === "~") || (unit && ANGLE.test(unit))) kind = "range"
      if (kind === "reps" || kind === "load") sawSet = true
      push(from, to, kind)
      prevOp = null
    } else if (m[2] !== undefined) {
      const op = m[2]
      push(from, to, op === "x" && !(parts[j - 1]?.m[1] !== undefined) ? "sides" : "operator")
      prevOp = op.toLowerCase()
    } else if (m[3] !== undefined) {
      if (/^bw$/i.test(m[3])) push(from, to, "bw")
      else if (MASS.test(m[3]) || DIST.test(m[3]) || TIME.test(m[3]) || SPEED.test(m[3]) || ANGLE.test(m[3])) push(from, to, "unit")
      else if (/^x$/i.test(m[3])) { push(from, to, "operator"); prevOp = "x"; continue }
      else push(from, to, "invalid")
      prevOp = null
    } else {
      push(from, to, "invalid")
    }
  }
  return sawSet
}

const DATE_LIKE = /^\s*(\[\[)?(\d{4}-[\d-]*)(\]\])?\s*(?:\S.*)?$/

function lineState(line) {
  const m = DATE_LIKE.exec(line.split(";")[0])
  if (!m) return null
  const full = /^\d{4}-\d{2}-\d{2}$/.test(m[2])
  if (!full || (m[1] && !m[3])) return "incomplete"
  return "date"
}

/** JSON string: [{line, from, to, severity, message, fix}] */
export function diagnostics(text) {
  const out = []
  String(text ?? "").split("\n").forEach((line, n) => {
    if (lineState(line) === "incomplete") {
      const from = line.length - line.trimStart().length
      out.push({ line: n, from, to: line.trimEnd().length, severity: "warning", message: "date is incomplete: write yyyy-mm-dd", fix: null })
    }
    // the x of a set is lowercase: 12X40kg
    const re = /\d(X)\d/g
    for (let m; (m = re.exec(line));) {
      const col = m.index + 1
      out.push({ line: n, from: col, to: col + 1, severity: "warning", message: "write x in lowercase: 12x40kg", fix: { title: "Write x", from: col, to: col + 1, text: "x" } })
    }
  })
  return JSON.stringify(out)
}

/** True while a date-like line is half typed, so sync must wait. */
export function unfinished_date(text) {
  return String(text ?? "").split("\n").some(l => lineState(l) === "incomplete")
}

/** JSON string: [{label, detail, from, to, insert}] */
export function completions(text, line, col) {
  const lines = String(text ?? "").split("\n")
  const cur = lines[line]
  if (cur == null) return "[]"
  const prefix = cur.slice(0, col)
  const m = /^(\s*[-+]\s+)([A-Za-z][A-Za-z ]*)$/.exec(prefix)
  if (!m) return "[]"
  const typed = m[2].toLowerCase()
  const latest = new Map()
  lines.forEach((l, n) => {
    if (n === line) return
    const e = /^\s*[-+]\s+([A-Za-z][A-Za-z ]*?)\s+(\S.*?)\s*(?:;.*)?$/.exec(l)
    if (e) latest.set(e[1], { n, body: e[2] })
  })
  const items = [...latest.entries()]
    .sort((a, b) => Number(b[0].toLowerCase().startsWith(typed)) - Number(a[0].toLowerCase().startsWith(typed)) || b[1].n - a[1].n)
    .map(([name, { body }]) => ({ label: name, detail: body, from: m[1].length, to: col, insert: `${name} ${body}` }))
  return JSON.stringify(items)
}

/** Markdown for the line under the cursor, or undefined. */
export function hover(text, line, col) {
  const cur = String(text ?? "").split("\n")[line]
  if (cur == null || !cur.trim()) return undefined
  if (lineState(cur) === "date") return `**${cur.trim()}**\n\nsession`
  const e = /^\s*[-+]\s+([A-Za-z][A-Za-z ]*?)\s+(\S.*?)\s*$/.exec(cur)
  if (!e) return undefined
  const sets = e[2].split(/[\s,]+/).filter(w => /^\d/.test(w)).length
  return `**${e[1]}**\n\n${sets} sets · \`${e[2]}\``
}
