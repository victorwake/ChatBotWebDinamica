import type { Server } from "node:http"
import type { ResultSetHeader } from "mysql2/promise"
import { pool, withTransaction } from "../src/db/pool"
import { closeServer, createPhase3Fixture, type Phase3Fixture } from "./phase3-fixtures"

const timezone = "America/Argentina/Buenos_Aires"
const weekdays = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"]

export type Phase4Fixture = Phase3Fixture & {
  server: Server
  baseUrl: string
  date: string
  from: string
  to: string
  slots(cookie: string): Promise<TestSlot[]>
  close(): Promise<void>
}

export type TestSlot = {
  id: string
  doctor: { id: string; displayName: string }
  specialty: { id: string; name: string }
  startsAt: string
  endsAt: string
}

function localDateAfter(days: number): string {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""
  return `${value("year")}-${value("month")}-${value("day")}`
}

function weekdayFor(date: string): string {
  const [year, month, day] = date.split("-").map(Number)
  return weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
}

export async function createPhase4Fixture(): Promise<Phase4Fixture> {
  const fixture = await createPhase3Fixture()
  const date = localDateAfter(10)
  const { server, baseUrl } = await fixture.startServer()
  await withTransaction(async (connection) => {
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO horarios_medicos
        (medico_id, dia_semana, hora_inicio, hora_fin, duracion_turno_minutos, activo)
       VALUES (?, ?, '09:00:00', '12:00:00', 30, TRUE)`,
      [fixture.doctorId, weekdayFor(date)],
    )
    if (!result.insertId) throw new Error("Could not create the appointment test schedule")
  })

  return {
    ...fixture,
    server,
    baseUrl,
    date,
    from: `${date}T00:00:00-03:00`,
    to: `${localDateAfter(11)}T00:00:00-03:00`,
    async slots(cookie) {
      const response = await fetch(
        `${baseUrl}/api/v1/appointments/availability?from=${encodeURIComponent(`${date}T00:00:00-03:00`)}&to=${encodeURIComponent(`${localDateAfter(11)}T00:00:00-03:00`)}&doctorId=${fixture.doctorId}&page=1&pageSize=100`,
        { headers: { Cookie: cookie } },
      )
      if (!response.ok) throw new Error(`Could not list appointment slots: ${response.status}`)
      const body = await response.json() as { items: TestSlot[] }
      return body.items
    },
    async close() {
      await closeServer(server)
      await fixture.cleanup()
    },
  }
}
