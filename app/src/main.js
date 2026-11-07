// Page wiring: device store, sync client, language module and editor.
// Plain DOM; the markup is the Nue page (index.html). Bundled by
// scripts/build.js into js/app.js, which Nue adds to the page.

import { openStore, SyncClient, loadLang, usingStubs } from "./deps.js"
import { adaptLang } from "./editor/lang.js"
import { createEditor } from "./editor/editor.js"
import { copyText } from "./ui/copy.js"
import { showNotices } from "./ui/notices.js"
import { watchKeyboard } from "./ui/keyboard.js"
import { settings, applyTheme } from "./ui/settings.js"

const $ = sel => document.querySelector(sel)
const touch = matchMedia("(pointer: coarse)").matches
const FAILURE = new Set(["offline", "attention", "confirm", "not-loaded"])

async function main() {
  watchKeyboard()
  applyTheme(settings.theme())
  document.body.dataset.touch = touch ? "yes" : "no"

  let lang
  try { lang = adaptLang(await loadLang()) } catch (e) {
    console.error("language module failed to load:", e)
    lang = adaptLang(null)
  }
  $("#about").textContent = `Language ${lang.version}${usingStubs ? " (development stubs)" : ""}`

  const store = await openStore()
  const local = await store.load()
  let editor = null
  let lastSaved = local.text

  // saving: debounced, and flushed when the page is hidden
  let saveTimer = null
  const save = () => {
    clearTimeout(saveTimer); saveTimer = null
    if (!editor) return
    const text = editor.getText()
    if (text === lastSaved) return
    lastSaved = text
    store.saveText(text).catch(e => setStatus({ state: "attention", message: `Needs attention: not saved on this device (${e.message ?? e})` }))
  }
  const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 300) }
  addEventListener("pagehide", save)
  document.addEventListener("visibilitychange", () => { if (document.hidden) save() })

  const currentText = () => editor ? editor.getText() : lastSaved
  const client = new SyncClient({
    store,
    device: settings.device(touch),
    endpoint: "/api",
    getText: currentText,
    isReady: () => !!editor && !editor.isComposing() && !lang.unfinishedDate(editor.getText()),
    fetch: (...a) => fetch(...a),
  })

  // status line, always visible
  function setStatus(s) {
    $("#status").dataset.state = s.state
    $("#status-text").textContent = s.message || s.state
    lastState = s.state
    updateCopy()
  }
  let lastState = "loading"
  function updateCopy() {
    const failing = FAILURE.has(lastState) || !lang.available || $("#confirm-dialog").open
    document.querySelectorAll("[data-copy]").forEach(b => { b.hidden = !failing && !b.closest("#not-loaded") })
  }
  client.on("status", setStatus)

  function showEditor(text) {
    document.body.dataset.screen = "editor"
    $("#not-loaded").hidden = true
    if (editor) return
    lastSaved = text
    editor = createEditor({
      parent: $("#editor"),
      doc: text,
      lang,
      touch,
      onChange: () => { scheduleSave(); client.notifyEdit() },
      onTap: showTap,
      onHistory: ({ undo }) => { $("#undo").disabled = !undo },
    })
    editor.scrollToEnd()
    if (!touch) editor.view.focus()
  }

  function showNotLoaded() {
    document.body.dataset.screen = "not-loaded"
    $("#not-loaded").hidden = false
  }

  client.on("merged", ({ text, notices }) => {
    if (!editor) showEditor(text)
    else editor.offerRemote(text)
    showNotices($("#notices"), notices)
  })

  // the removal question
  const dialog = $("#confirm-dialog")
  client.on("confirm", q => {
    const list = $("#removal-list")
    list.replaceChildren(...(q.removals ?? []).map(r => {
      const li = document.createElement("li")
      li.textContent = typeof r === "string" ? r : r?.message ?? JSON.stringify(r)
      return li
    }))
    if (!dialog.open) dialog.showModal()
    updateCopy()
  })
  const answer = choice => { dialog.close(); updateCopy(); client.answer(choice) }
  $("#confirm-keep").addEventListener("click", () => answer("keep"))
  $("#confirm-remove").addEventListener("click", () => answer("remove"))
  dialog.addEventListener("cancel", e => e.preventDefault()) // an answer is needed; Esc does not dismiss

  // copy my text, in every failure state
  document.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", async () => {
    const ok = await copyText(currentText())
    showNotices($("#notices"), [ok ? "Your text is on the clipboard" : "Could not copy: select the text and copy it by hand"])
  }))
  $("#load-now").addEventListener("click", () => client.syncNow())

  // tap panel (touch devices): hover text and messages of the tapped line
  const panel = $("#tap-panel")
  function showTap(info) {
    if (!info) { panel.hidden = true; return }
    panel.replaceChildren()
    for (const d of info.diagnostics) {
      const p = document.createElement("p")
      p.className = `tap-diag tap-${d.severity}`
      p.textContent = d.message
      panel.append(p)
    }
    if (info.html) {
      const div = document.createElement("div")
      div.innerHTML = info.html
      panel.append(div)
    }
    panel.hidden = false
  }
  panel.addEventListener("click", () => { panel.hidden = true })

  // logging bar: buttons must not take focus, so the keyboard stays open
  const bar = $("#logbar")
  bar.addEventListener("pointerdown", e => { if (e.target.closest("button")) e.preventDefault() })
  bar.addEventListener("click", e => {
    const b = e.target.closest("button")
    if (!b || !editor) return
    if (b.dataset.insert) editor.insert(b.dataset.insert)
    else if (b.id === "start-session") editor.startSession({ obsidian: settings.obsidianLinks() })
    else if (b.id === "same-set" && !editor.sameSet()) showNotices($("#notices"), ["No set on this line to repeat"])
    else if (b.id === "undo") editor.undo()
  })

  const obsidian = $("#setting-obsidian")
  obsidian.checked = settings.obsidianLinks()
  obsidian.addEventListener("change", () => settings.setObsidianLinks(obsidian.checked))
  const theme = $("#setting-theme")
  theme.value = settings.theme()
  theme.addEventListener("change", () => { settings.setTheme(theme.value); applyTheme(theme.value) })

  // notices float just above the bar
  new ResizeObserver(() => {
    document.documentElement.style.setProperty("--bar-height", `${bar.offsetHeight}px`)
  }).observe(bar)

  if (local.loaded) showEditor(local.text)
  else showNotLoaded()
  client.on("status", s => { if (s.state === "not-loaded" && !editor) showNotLoaded() })

  client.start()
  if (!usingStubs && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(e => console.warn("service worker:", e))
  }
  globalThis.__workoutApp = { get editor() { return editor }, client, store, lang }
}

main().catch(e => {
  console.error(e)
  const t = document.querySelector("#status-text")
  if (t) t.textContent = `Needs attention: the app failed to start (${e.message ?? e})`
  document.querySelector("#status")?.setAttribute("data-state", "attention")
})
