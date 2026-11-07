// Applying the sync client's merged text to the editor: as small changes
// (a line diff), out of the undo history, never during composition, and
// only after a quiet pause in typing. If the owner typed between the offer
// and the apply, the remote changes are mapped over that typing, so it is
// kept and the cursor stays on the same logical line.

import { Annotation, ChangeSet, Transaction } from "@codemirror/state"

/** Marks transactions that carry remote text. */
export const remoteText = Annotation.define()

function splitLines(s) {
  const out = []
  let start = 0
  for (let i = 0; i < s.length; i++) if (s[i] === "\n") { out.push(s.slice(start, i + 1)); start = i + 1 }
  if (start < s.length) out.push(s.slice(start))
  return out
}

/**
 * Minimal changes turning `a` into `b`: [{from, to, insert}] in `a`'s
 * offsets, sorted. Lines are matched with an LCS; each changed run of lines
 * is then trimmed to the characters that differ.
 */
export function diffText(a, b) {
  if (a === b) return []
  const A = splitLines(a), B = splitLines(b)
  let pre = 0
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++
  let suf = 0
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++

  const a0 = A.slice(pre, A.length - suf), b0 = B.slice(pre, B.length - suf)
  const n = a0.length, m = b0.length
  // pairs of matching line indexes (in a0, b0)
  let pairs = []
  if (n && m && n * m <= 4_000_000) {
    const w = m + 1
    const L = new Uint32Array((n + 1) * w)
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        L[i * w + j] = a0[i] === b0[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1])
    for (let i = 0, j = 0; i < n && j < m;) {
      if (a0[i] === b0[j]) { pairs.push([i, j]); i++; j++ }
      else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) i++
      else j++
    }
  }
  pairs.push([n, m])

  let offset = 0
  for (let k = 0; k < pre; k++) offset += A[k].length
  const changes = []
  let i = 0, j = 0, pos = offset
  for (const [pi, pj] of pairs) {
    if (pi > i || pj > j) {
      const removed = a0.slice(i, pi).join(""), added = b0.slice(j, pj).join("")
      changes.push(trim(pos, removed, added))
      pos += removed.length
    }
    if (pi < n) pos += a0[pi].length
    i = pi + 1; j = pj + 1
  }
  return changes
}

function trim(pos, removed, added) {
  let s = 0
  while (s < removed.length && s < added.length && removed[s] === added[s]) s++
  let e = 0
  while (e < removed.length - s && e < added.length - s &&
         removed[removed.length - 1 - e] === added[added.length - 1 - e]) e++
  return { from: pos + s, to: pos + removed.length - e, insert: added.slice(s, added.length - e) }
}

/** Transaction spec that turns `state`'s text into `text`, outside history. */
export function remoteSpec(state, text) {
  return {
    changes: diffText(state.doc.toString(), text),
    annotations: [Transaction.addToHistory.of(false), remoteText.of(true)],
  }
}

/**
 * Holds one merged text until it can be applied.
 * host: {state(), dispatch(spec), composing(), now(), later(fn, ms)}
 */
export class RemoteApplier {
  constructor(host, { quietMs = 3000 } = {}) {
    this.host = host
    this.quietMs = quietMs
    this.lastInput = -Infinity
    this.pending = null
    this.timer = null
  }

  /** The client's merged text; the editor equals the text that was sent. */
  offer(text) {
    const doc = this.host.state().doc
    this.pending = { startDoc: doc, text, user: ChangeSet.empty(doc.length) }
    this.schedule(0)
  }

  /** Feed every editor update (from an update listener). */
  observe(update) {
    if (!update.docChanged || update.transactions.some(tr => tr.annotation(remoteText))) return
    this.lastInput = this.host.now()
    if (this.pending) this.pending.user = this.pending.user.compose(update.changes)
  }

  schedule(ms) {
    if (this.timer != null) return
    this.timer = this.host.later(() => { this.timer = null; this.tryApply() }, ms)
  }

  /**
   * The document as it will be once the pending remote text is applied:
   * the owner's typing since the offer plus the remote changes. Saving and
   * syncing must use this, not the visible text, or a save during the wait
   * would store the document without the other device's changes while the
   * base already has them, and the next sync would delete them.
   */
  projected() {
    const doc = this.host.state().doc
    const p = this.pending
    if (!p) return doc.toString()
    const remote = ChangeSet.of(diffText(p.startDoc.toString(), p.text), p.startDoc.length)
    return remote.map(p.user).apply(doc).toString()
  }

  /** Apply now if allowed; otherwise try again later. Returns true when applied. */
  tryApply() {
    const p = this.pending
    if (!p) return false
    const wait = this.lastInput + this.quietMs - this.host.now()
    if (this.host.composing() || wait > 0) {
      this.schedule(Math.max(wait, 250))
      return false
    }
    this.pending = null
    const remote = ChangeSet.of(diffText(p.startDoc.toString(), p.text), p.startDoc.length)
    const changes = remote.map(p.user)
    if (changes.empty) return true
    this.host.dispatch({ changes, annotations: [Transaction.addToHistory.of(false), remoteText.of(true)] })
    return true
  }
}
