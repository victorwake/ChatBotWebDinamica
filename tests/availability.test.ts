import { describe, expect, it } from "vitest"
import {
  argentinaDateKey,
  formatAvailabilityDay,
  formatAvailabilityTime,
  groupAvailabilityByArgentinaDay,
} from "../src/lib/availability"

describe("availability schedule formatting", () => {
  it("formats calendar days and times in Argentina time", () => {
    const startsAt = "2026-11-19T11:15:00.000Z"

    expect(argentinaDateKey(startsAt)).toBe("2026-11-19")
    expect(formatAvailabilityDay(startsAt)).toBe("Jueves, 19 de noviembre de 2026")
    expect(formatAvailabilityTime(startsAt)).toBe("08:15")
  })

  it("groups slots by their Argentina calendar day and sorts them chronologically", () => {
    const morningSlot = {
      id: "morning",
      startsAt: "2026-11-19T11:15:00.000Z",
    }
    const lateNightPreviousDay = {
      id: "previous-day",
      startsAt: "2026-11-19T02:00:00.000Z",
    }
    const laterSlot = {
      id: "later",
      startsAt: "2026-11-19T11:45:00.000Z",
    }
    const nextDaySlot = {
      id: "next-day",
      startsAt: "2026-11-20T11:15:00.000Z",
    }
    const slot = (id: string, startsAt: string) => ({
      id,
      startsAt,
      endsAt: startsAt,
      doctor: { id: "doctor-1", displayName: "Dra. Ejemplo" },
      specialty: { id: "specialty-1", name: "Clínica" },
    })

    const days = groupAvailabilityByArgentinaDay([
      slot(morningSlot.id, morningSlot.startsAt),
      slot(nextDaySlot.id, nextDaySlot.startsAt),
      slot(lateNightPreviousDay.id, lateNightPreviousDay.startsAt),
      slot(laterSlot.id, laterSlot.startsAt),
    ])

    expect(days.map((day) => day.key)).toEqual(["2026-11-18", "2026-11-19", "2026-11-20"])
    expect(days[1].slots.map((item) => item.id)).toEqual(["morning", "later"])
  })
})
