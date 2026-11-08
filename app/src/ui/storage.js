// Asks the browser to keep the log (persistent storage), so it is not
// cleared when the device runs low on space. A refusal blocks nothing: the
// app works the same, and the settings panel says so in one line.

export const NOT_PERSISTED = "This browser may clear the log on this device if space runs low. Synced changes are kept at home."

/**
 * Calls `store.persist()` once and reports the outcome.
 * @param {{persist?: () => Promise<boolean>}} store
 * @param {{note?: (text: string) => void, log?: Pick<Console, "info"|"warn">}} [o]
 *   `note` shows a line in the settings panel; `log` defaults to console.
 * @returns {Promise<boolean>} true when the browser keeps the storage
 */
export async function keepOnDevice(store, { note = () => {}, log = console } = {}) {
  let kept = false
  try {
    kept = (await store.persist?.()) === true
  } catch (e) {
    log.warn("storage: asking for persistent storage failed:", e)
  }
  if (kept) {
    log.info("storage: persistent, the browser keeps the log")
  } else {
    log.info("storage: not persistent, the browser may clear the log when space runs low")
    note(NOT_PERSISTED)
  }
  return kept
}
