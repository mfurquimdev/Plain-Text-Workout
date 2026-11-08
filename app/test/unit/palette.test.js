import { test, expect } from "bun:test"
import { GPL, OUT, TOKENS, MIN_CONTRAST, paletteCss, parseGpl, themeColours, contrastTable, contrast, fromHex } from "../../scripts/palette.js"

const gpl = await Bun.file(GPL).text()
const palette = await Bun.file(OUT).text()
const tokens = await Bun.file(TOKENS).text()
const app = await Bun.file(new URL("../../css/app.css", import.meta.url)).text()

test("css/palette.css is up to date with palettes/nord.gpl", () => {
  expect(palette).toBe(paletteCss(gpl))
})

test("the palette has the 20 Nord colours, red and orange included", () => {
  const c = Object.fromEntries(parseGpl(gpl).map(c => [c.name, c.hex]))
  expect(Object.keys(c)).toHaveLength(20)
  expect(c["Aurora Red"]).toBe("#bf616a")
  expect(c["Aurora Orange"]).toBe("#d08770")
})

test("every deep accent reaches 4.5:1 on Snow Storm 3", () => {
  const ss3 = fromHex(parseGpl(gpl).find(c => c.name === "Snow Storm 3").hex)
  const deep = [...palette.matchAll(/--nord-[a-z0-9-]+-deep:\s*(#[0-9a-f]{6})/g)].map(m => m[1])
  expect(deep.length).toBeGreaterThan(5)
  for (const h of deep) expect(contrast(fromHex(h), ss3)).toBeGreaterThanOrEqual(MIN_CONTRAST)
})

test("no colour literals outside the palette", () => {
  for (const css of [tokens, app]) expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i)
})

test("every token kind has a colour in both themes", () => {
  const { light, dark } = themeColours(tokens, palette)
  for (const t of [light, dark]) for (const k of ["bg", "fg", "tok-date", "tok-exercise", "tok-reps", "tok-load", "tok-unit", "tok-comment", "tok-conflict", "tok-conflict_date"]) expect(t[k]).toMatch(/^#[0-9a-f]{6}$/)
  expect(dark["tok-conflict"]).toBe("#bf616a") // the palette's red, as the owner asked
  expect(dark["tok-conflict_date"]).toBe("#d08770")
})

test("text colours reach 4.5:1 on the editor background, except the owner's conflict red in dark", () => {
  const low = contrastTable(themeColours(tokens, palette)).filter(r => r.bg < MIN_CONTRAST).map(r => `${r.theme} ${r.name}`)
  expect(low).toEqual(["dark tok-conflict"])
})
