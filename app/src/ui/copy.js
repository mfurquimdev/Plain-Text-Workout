// "Copy my text": the clipboard API, or a hidden textarea where it is
// missing (an http page on the VPN is not a secure context).

export async function copyText(text) {
  try {
    if (navigator.clipboard && globalThis.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fall back */ }
  const ta = document.createElement("textarea")
  ta.value = text
  ta.setAttribute("readonly", "")
  ta.style.cssText = "position:fixed;top:0;left:0;opacity:0"
  document.body.append(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand("copy") } catch { ok = false }
  ta.remove()
  return ok
}
