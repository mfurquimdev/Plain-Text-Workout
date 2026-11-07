// Text edits behind the phone logging bar, as pure functions of the text
// so they can be tested without a browser.

// A set as written in the log: 12x63kg, 12, 12/11, 12^3, 12x63kg*2, 15x0kg
const SET = /^(\d+(?:\/\d+)?)(x(?:[\d.]+[a-z]*|bw(?:[+-][\d.]+[a-z]*)?))?([\^*]\d+)?$/i

/**
 * "Same set again": the edit that repeats the last set on a line.
 * `12x40kg 10x40kg` → appends ` 10x40kg`; `12^3` → `12^4`;
 * `10x23kg, 10x23kg` → appends `, 10x23kg`. Returns {from, to, insert}
 * relative to the line, or null when the line has no set.
 */
export function sameSetEdit(line) {
  const semi = line.indexOf(";")
  const body = semi >= 0 ? line.slice(0, semi) : line
  const re = /\S+/g
  let last = null, prev = null
  for (let m; (m = re.exec(body));) { prev = last; last = { from: m.index, text: m[0] } }
  if (!last) return null
  const word = last.text.replace(/,$/, "")
  const m = SET.exec(word)
  if (!m || !prev) return null

  const end = last.from + word.length
  if (m[3]) {
    const op = m[3][0], count = Number(m[3].slice(1)) + 1
    const at = end - m[3].length
    return { from: at, to: end, insert: `${op}${count}`, cursor: at + 1 + String(count).length }
  }
  const comma = /,\s*$/.test(body.slice(0, last.from)) || last.text.endsWith(",")
  const sep = comma ? ", " : " "
  // after a trailing comma on the last word, insert after the comma
  const at = last.text.endsWith(",") ? end + 1 : end
  const insert = last.text.endsWith(",") ? ` ${word}` : `${sep}${word}`
  return { from: at, to: at, insert, cursor: at + insert.length }
}

/** Today's date as yyyy-mm-dd, local time. */
export function today(d = new Date()) {
  const p = n => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const dateOf = line => /^\s*(?:\[\[)?(\d{4}-\d{2}-\d{2})(?:\]\])?(?:\s|;|$)/.exec(line)?.[1]

/**
 * "Start session": a date line for `date` at the end of the log (sessions
 * are in date order), after a blank line. If that session already exists,
 * no insert: the cursor goes to its end. Returns {changes, cursor}.
 */
export function startSessionEdit(text, date, obsidian = false) {
  const lines = text.split("\n")
  const at = lines.findIndex(l => dateOf(l) === date)
  if (at >= 0) {
    let end = at
    for (let i = at + 1; i < lines.length && !dateOf(lines[i]); i++) if (lines[i].trim()) end = i
    const cursor = lines.slice(0, end + 1).join("\n").length
    return { changes: null, cursor }
  }
  const head = obsidian ? `[[${date}]]` : date
  const sep = text === "" ? "" : text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n"
  const insert = `${sep}${head}\n`
  return { changes: { from: text.length, insert }, cursor: text.length + insert.length }
}

/**
 * Completion on the phone inserts the name and load, not the last reps:
 * `Row 12x25kg 10x25kg` → `Row ` + cursor + `x25kg`, and
 * `Pec Fly 39kg 12^3` → `Pec Fly 39kg ` + cursor. Words before the first
 * set (initial weight, sides, machine, load) are kept.
 * Returns {text, cursor} with cursor an offset into text.
 */
export function phoneInsert(label, insert) {
  const body = insert.startsWith(label) ? insert.slice(label.length).trim() : ""
  const keep = []
  let load = ""
  for (const word of body ? body.split(/\s+/) : []) {
    const w = word.replace(/,$/, "")
    const m = SET.exec(w)
    if (m) { load = m[2] ?? ""; break }
    keep.push(word)
  }
  const text = `${label} ${keep.length ? keep.join(" ") + " " : ""}`
  return { text: text + load, cursor: text.length }
}
