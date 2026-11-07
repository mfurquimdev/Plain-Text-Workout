// Keeps the logging bar above the on-screen keyboard. The viewport meta
// asks Chrome to resize the layout for the keyboard
// (interactive-widget=resizes-content); where a browser only shrinks the
// visual viewport, --app-height follows it instead.

export function watchKeyboard() {
  const vv = globalThis.visualViewport
  if (!vv) return
  const update = () => {
    document.documentElement.style.setProperty("--app-height", `${Math.round(vv.height)}px`)
  }
  vv.addEventListener("resize", update)
  vv.addEventListener("scroll", update)
  update()
}
