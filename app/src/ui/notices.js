// Notices after a sync ("Session 2026-10-29 moved"): short-lived, and a tap
// dismisses one.

export function showNotices(host, notices = [], ms = 6000) {
  for (const text of notices ?? []) {
    if (!text) continue
    const el = document.createElement("div")
    el.className = "notice"
    el.setAttribute("role", "status")
    el.textContent = String(text)
    el.addEventListener("click", () => el.remove())
    host.append(el)
    setTimeout(() => el.remove(), ms)
  }
}
