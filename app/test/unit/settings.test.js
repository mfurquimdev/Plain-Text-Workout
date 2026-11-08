import { afterEach, beforeEach, expect, test } from "bun:test"
import { settings, deviceNameError, defaultDeviceName, DEVICE_NAME } from "../../src/ui/settings.js"

// a localStorage stand-in; bun has none outside a browser
let saved
beforeEach(() => {
  const data = new Map()
  saved = globalThis.localStorage
  globalThis.localStorage = {
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: k => data.delete(k),
    data,
  }
})
afterEach(() => { globalThis.localStorage = saved })

test("on first run the device name is the kind plus a random suffix, stored once", () => {
  const name = settings.device(true)
  expect(name).toMatch(/^phone-[0-9a-f]{4}$/)
  expect(localStorage.getItem("workout.device")).toBe(name)
  expect(settings.device(true)).toBe(name) // set once: the same on the next open
  localStorage.data.clear()
  expect(settings.device(false)).toMatch(/^desktop-[0-9a-f]{4}$/)
})

test("two devices of the same kind get different names", () => {
  const names = new Set(Array.from({ length: 20 }, () => defaultDeviceName(true)))
  expect(names.size).toBeGreaterThan(1)
  expect(defaultDeviceName(false, () => "3f9a")).toBe("desktop-3f9a")
})

test("an old default or a stored name that the server would refuse is replaced", () => {
  localStorage.setItem("workout.device", "my phone")
  expect(settings.device(true, () => "0001")).toBe("phone-0001")
  localStorage.setItem("workout.device", "phone") // kept: a valid name the owner may rely on
  expect(settings.device(true)).toBe("phone")
})

test("setDevice stores a valid name and refuses the rest", () => {
  expect(settings.setDevice("kitchen-tablet")).toBeNull()
  expect(settings.device(true)).toBe("kitchen-tablet")
  for (const bad of ["", "my phone", "phone:2", "a/b", "tab\t", "ç", "x".repeat(33)]) {
    expect(settings.setDevice(bad)).toBeString()
    expect(settings.device(true)).toBe("kitchen-tablet")
  }
})

test("the rule fits the server and the conflict comment format", () => {
  for (const ok of ["phone-3f9a", "Desk_2", "x", "a".repeat(32)]) expect(deviceNameError(ok)).toBeNull()
  // the server's rule: one word, no whitespace, colon or control character
  for (const bad of [" ", "a b", "a:b", "a\nb", "a\u0000b"]) expect(DEVICE_NAME.test(bad)).toBe(false)
  // a conflict comment with a valid name reads back as the stub (and server) parse it
  const line = `; conflict 2026-11-05 ${settings.device(true)}: - Row 12x30kg`
  expect(line).toMatch(/^; conflict \d{4}-\d{2}-\d{2} [^\s:]+: - Row 12x30kg$/)
})
