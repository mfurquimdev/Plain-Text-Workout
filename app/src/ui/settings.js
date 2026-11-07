// Device settings kept in localStorage. "Obsidian links" is a placeholder:
// the brief keeps it on the server, shared by every device.

const get = (key, fallback) => {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}
const set = (key, value) => {
  try { localStorage.setItem(key, value) } catch { /* private mode: not kept */ }
}

export const settings = {
  obsidianLinks: () => get("workout.obsidianLinks", "off") === "on",
  setObsidianLinks: on => set("workout.obsidianLinks", on ? "on" : "off"),
  theme: () => get("workout.theme", "auto"),
  setTheme: t => set("workout.theme", t),
  /** One word, set once per device. */
  device: touch => get("workout.device", touch ? "phone" : "desktop"),
}

/** Applies the theme setting: [data-theme] on <html>, or none for "auto". */
export function applyTheme(theme) {
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme
  else delete document.documentElement.dataset.theme
}
