import { test, expect } from "bun:test"
import { sameSetEdit, startSessionEdit, phoneInsert, today } from "../../src/editor/logging.js"

const applyEdit = (line, e) => line.slice(0, e.from) + e.insert + line.slice(e.to)
const again = line => { const e = sameSetEdit(line); return e && applyEdit(line, e) }

test("Same set again appends the last set", () => {
  expect(again("- Row 12x25kg 10x25kg")).toBe("- Row 12x25kg 10x25kg 10x25kg")
  expect(again("- Leg Press 63kg++5lbs 12 12 8 7")).toBe("- Leg Press 63kg++5lbs 12 12 8 7 7")
  expect(again("- Leg Curl x2 15kg 12/12 12/11")).toBe("- Leg Curl x2 15kg 12/12 12/11 12/11")
})

test("Same set again counts up a repeat", () => {
  expect(again("- Pec Fly 39kg 12^3")).toBe("- Pec Fly 39kg 12^4")
  expect(again("- Leg Press 12x63kg*2")).toBe("- Leg Press 12x63kg*3")
  expect(again("- Pec Fly 39kg 12^9")).toBe("- Pec Fly 39kg 12^10")
})

test("Same set again keeps the line's separators and its comment", () => {
  expect(again("- Ext 10x23kg, 10x23kg")).toBe("- Ext 10x23kg, 10x23kg, 10x23kg")
  expect(again("- Row 12x25kg ; easy")).toBe("- Row 12x25kg 12x25kg ; easy")
  expect(again("- Chin bw-36kg 12x bw")).toBe(null)
})

test("Same set again: no set, no edit", () => {
  expect(again("- Bench Press")).toBe(null)
  expect(again("- Pec Fly 39kg")).toBe(null)
  expect(again("2026-11-07")).toBe(null)
  expect(again("")).toBe(null)
})

test("Same set again puts the cursor after the new set", () => {
  const e = sameSetEdit("- Row 12x25kg")
  expect(e.cursor).toBe("- Row 12x25kg 12x25kg".length)
})

test("Start session appends today's date after a blank line", () => {
  expect(startSessionEdit("2026-11-05\n- Row 12x25kg\n", "2026-11-07")).toEqual({
    changes: { from: 25, insert: "\n2026-11-07\n" }, cursor: 37,
  })
  expect(startSessionEdit("", "2026-11-07").changes.insert).toBe("2026-11-07\n")
  expect(startSessionEdit("a", "2026-11-07").changes.insert).toBe("\n\n2026-11-07\n")
  expect(startSessionEdit("a\n\n", "2026-11-07", true).changes.insert).toBe("[[2026-11-07]]\n")
})

test("Start session on an existing session moves to its end instead", () => {
  const text = "[[2026-11-07]]\n- Row 12x25kg\n\n"
  expect(startSessionEdit(text, "2026-11-07")).toEqual({ changes: null, cursor: 28 })
})

test("today() is local yyyy-mm-dd", () => {
  expect(today(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05")
})

test("phone completion inserts the name and load, not the reps", () => {
  expect(phoneInsert("Row", "Row 12x25kg 10x25kg")).toEqual({ text: "Row x25kg", cursor: 4 })
  expect(phoneInsert("Pec Fly", "Pec Fly 39kg 12^3")).toEqual({ text: "Pec Fly 39kg ", cursor: 13 })
  expect(phoneInsert("Bench Press", "Bench Press +22kg x2 15x0kg 12x5kg")).toEqual({ text: "Bench Press +22kg x2 x0kg", cursor: 21 })
  expect(phoneInsert("Plank", "Plank")).toEqual({ text: "Plank ", cursor: 6 })
})
