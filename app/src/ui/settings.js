// Device settings kept in localStorage. "Obsidian links" is a placeholder:
// the brief keeps it on the server, shared by every device.

const get = (key, fallback) => {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}
const set = (key, value) => {
  try { localStorage.setItem(key, value) } catch { /* private mode: not kept */ }
}

/**
 * The device name goes into every sync request. workout-server names it in
 * git commits ("Sync from phone-3f9a"), in `; conflict YYYY-MM-DD <name>: line`
 * comments in the log, and in the file name of a merge replay. The server
 * accepts one word without spaces, colons or control characters; this is
 * stricter, so the name is also a safe file name: 1 to 32 ASCII letters,
 * digits, "-" or "_".
 */
export const DEVICE_NAME = /^[A-Za-z0-9_-]{1,32}$/
export const DEVICE_RULE = "1 to 32 letters, digits, - or _ (no spaces or colons)"

/** null when `name` is a valid device name, otherwise why it is not. */
export function deviceNameError(name) {
  if (typeof name !== "string" || name === "") return "Enter a name"
  return DEVICE_NAME.test(name) ? null : `Use ${DEVICE_RULE}`
}

/** A first-run name: the kind of device and four random hex digits, such as "phone-3f9a". */
export function defaultDeviceName(touch, random = randomHex) {
  return `${touch ? "phone" : "desktop"}-${random(4)}`
}

function randomHex(n) {
  const bytes = new Uint8Array(Math.ceil(n / 2))
  try { crypto.getRandomValues(bytes) } catch { for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256) }
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("").slice(0, n)
}

export const settings = {
  obsidianLinks: () => get("workout.obsidianLinks", "off") === "on",
  setObsidianLinks: on => set("workout.obsidianLinks", on ? "on" : "off"),
  theme: () => get("workout.theme", "auto"),
  setTheme: t => set("workout.theme", t),
  /**
   * This device's name. On first run (or if the stored name is not valid)
   * it stores and returns a default such as "phone-3f9a".
   */
  device: (touch, random) => {
    const name = get("workout.device", null)
    if (name !== null && !deviceNameError(name)) return name
    const fresh = defaultDeviceName(touch, random)
    set("workout.device", fresh)
    return fresh
  },
  /** Stores a new device name. Returns null, or the error for an invalid name (nothing stored). */
  setDevice: name => {
    const error = deviceNameError(name)
    if (!error) set("workout.device", name)
    return error
  },
}

/** Applies the theme setting: [data-theme] on <html>, or none for "auto". */
export function applyTheme(theme) {
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme
  else delete document.documentElement.dataset.theme
}
