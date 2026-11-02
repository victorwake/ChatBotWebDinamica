import type { AvailabilitySlot } from "./clinic"

const argentinaTimeZone = "America/Argentina/Buenos_Aires"

export type AvailabilityDay = {
  key: string
  label: string
  slots: AvailabilitySlot[]
}

function dateParts(value: string): { date: Date; year: string; month: string; day: string } {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError("Availability timestamps must be valid dates.")
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: argentinaTimeZone,
  }).formatToParts(date)
  const getPart = (type: "year" | "month" | "day") => {
    const part = parts.find((item) => item.type === type)?.value
    if (!part) throw new Error(`Missing ${type} in formatted availability date.`)
    return part
  }

  return { date, year: getPart("year"), month: getPart("month"), day: getPart("day") }
}

export function argentinaDateKey(value: string): string {
  const { year, month, day } = dateParts(value)
  return `${year}-${month}-${day}`
}

export function formatAvailabilityDay(value: string): string {
  const { date } = dateParts(value)
  const label = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: argentinaTimeZone,
  }).format(date)
  return label.charAt(0).toLocaleUpperCase("es-AR") + label.slice(1)
}

export function formatAvailabilityTime(value: string): string {
  const { date } = dateParts(value)
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: argentinaTimeZone,
  }).format(date)
}

export function groupAvailabilityByArgentinaDay(slots: AvailabilitySlot[]): AvailabilityDay[] {
  const orderedSlots = [...slots].sort(
    (left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
  )
  const groups = new Map<string, AvailabilityDay>()

  for (const slot of orderedSlots) {
    const key = argentinaDateKey(slot.startsAt)
    const group = groups.get(key)
    if (group) {
      group.slots.push(slot)
    } else {
      groups.set(key, {
        key,
        label: formatAvailabilityDay(slot.startsAt),
        slots: [slot],
      })
    }
  }

  return [...groups.values()]
}
