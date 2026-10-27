import { Router, type Request } from "express"
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise"
import { z } from "zod"
import { asyncRoute } from "../auth/async-route"
import { sendHttpError } from "../auth/http-error"
import type { AuthenticatedUser } from "../auth/types"
import {
  requireAuthentication,
  requireRoles,
} from "../middleware/authentication"
import { requireCsrfToken } from "../middleware/csrf-protection"
import { pool, withTransaction } from "../db/pool"

const router = Router()
const businessTimeZone = "America/Argentina/Buenos_Aires"
const dayNames = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"]
const administrativeRoles = ["administrative", "administrator"] as const
const localDateTimePattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
const dateTimeSchema = z.string().datetime({ offset: true })

type ScheduleRow = RowDataPacket & {
  doctorId: number
  firstName: string
  lastName: string
  specialtyId: number
  specialtyName: string
  weekday: string
  startsAt: string
  endsAt: string
  durationMinutes: number
}

type ExceptionRow = RowDataPacket & {
  doctorId: number
  date: string
  type: "vacacion" | "feriado" | "licencia" | "bloqueo" | "cambio"
  startsAt: string | null
  endsAt: string | null
}

type AppointmentRow = RowDataPacket & {
  id: number
  patientId: number
  patientFirstName: string
  patientLastName: string
  doctorId: number
  doctorFirstName: string
  doctorLastName: string
  specialtyId: number
  specialtyName: string
  startsAt: string | Date
  endsAt: string | Date
  databaseStatus: "pendiente" | "confirmado" | "atendido" | "cancelado" | "ausente"
  reason: string | null
  createdAt: Date | string
}

type SlotData = {
  doctorId: number
  startsAt: string
  endsAt: string
}

type SlotCandidate = SlotData & {
  doctorFirstName: string
  doctorLastName: string
  specialtyId: number
  specialtyName: string
}

const filtersSchema = z.object({
  from: dateTimeSchema,
  to: dateTimeSchema,
  doctorId: z.string().regex(/^\d+$/).optional(),
  specialtyId: z.string().regex(/^\d+$/).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict()

const appointmentListSchema = z.object({
  from: dateTimeSchema.optional(),
  to: dateTimeSchema.optional(),
  status: z.enum(["requested", "confirmed", "cancelled", "completed", "no_show"]).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict()

const createAppointmentSchema = z.object({
  slotId: z.string().min(1).max(200),
  patientId: z.string().regex(/^\d+$/).optional(),
  reason: z.string().trim().max(500).optional(),
}).strict()

const cancelSchema = z.object({
  reason: z.string().trim().max(500).optional(),
}).strict()

const rescheduleSchema = z.object({
  slotId: z.string().min(1).max(200),
  reason: z.string().trim().max(500).optional(),
}).strict()

function requestPathParameter(req: Request, name: string): string {
  const value = req.params[name]
  return typeof value === "string" ? value : ""
}

function localDateTimeToInstant(value: string): Date {
  const [date, time] = value.split(" ")
  const [year, month, day] = date.split("-").map(Number)
  const [hour, minute, second] = time.split(":").map(Number)
  const wallTime = Date.UTC(year, month - 1, day, hour, minute, second)
  let instant = wallTime
  for (let attempt = 0; attempt < 3; attempt++) {
    const formatted = new Intl.DateTimeFormat("en-CA", {
      timeZone: businessTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant))
    const field = (type: Intl.DateTimeFormatPartTypes) =>
      Number(formatted.find((part) => part.type === type)?.value ?? 0)
    const representedAsUtc = Date.UTC(
      field("year"),
      field("month") - 1,
      field("day"),
      field("hour"),
      field("minute"),
      field("second"),
    )
    instant = wallTime - (representedAsUtc - instant) 
  }
  return new Date(instant)
}

function instantToLocalDateTime(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: businessTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value)
  const field = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ""
  return `${field("year")}-${field("month")}-${field("day")} ${field("hour")}:${field("minute")}:${field("second")}`
}

function instantToLocalDate(value: Date): string {
  return instantToLocalDateTime(value).slice(0, 10)
}

function localDateTimeToIso(value: string): string {
  return localDateTimeToInstant(value).toISOString()
}

function sqlDateTimeToLocal(value: string | Date): string {
  if (typeof value === "string") return value.replace("T", " ").slice(0, 19)
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")} ${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}:${String(value.getUTCSeconds()).padStart(2, "0")}`
}

function sqlTimestampToIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(`${value.replace(" ", "T")}Z`).toISOString()
}

function addDays(date: string, count: number): string {
  const [year, month, day] = date.split("-").map(Number)
  const result = new Date(Date.UTC(year, month - 1, day + count))
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, "0")}-${String(result.getUTCDate()).padStart(2, "0")}`
}

function dateWeekday(date: string): string {
  const [year, month, day] = date.split("-").map(Number)
  return dayNames[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
}

function encodeSlot(slot: SlotData): string {
  return Buffer.from(`${slot.doctorId}|${slot.startsAt}|${slot.endsAt}`).toString("base64url")
}

function decodeSlot(value: string): SlotData | undefined {
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8")
    const [doctor, startsAt, endsAt, ...extra] = decoded.split("|")
    if (
      extra.length > 0
      || !/^\d+$/.test(doctor)
      || !localDateTimePattern.test(startsAt)
      || !localDateTimePattern.test(endsAt)
      || localDateTimeToInstant(endsAt) <= localDateTimeToInstant(startsAt)
      || encodeSlot({ doctorId: Number(doctor), startsAt, endsAt }) !== value
    ) return undefined
    return { doctorId: Number(doctor), startsAt, endsAt }
  } catch {
    return undefined
  }
}

function databaseStatusToContract(status: AppointmentRow["databaseStatus"]): string {
  switch (status) {
    case "pendiente": return "requested"
    case "confirmado": return "confirmed"
    case "cancelado": return "cancelled"
    case "atendido": return "completed"
    case "ausente": return "no_show"
  }
}

function contractStatusToDatabase(status: string): AppointmentRow["databaseStatus"] | undefined {
  switch (status) {
    case "requested": return "pendiente"
    case "confirmed": return "confirmado"
    case "cancelled": return "cancelado"
    case "completed": return "atendido"
    case "no_show": return "ausente"
    default: return undefined
  }
}

function appointmentResponse(row: AppointmentRow) {
  return {
    id: String(row.id),
    patient: {
      id: String(row.patientId),
      displayName: `${row.patientFirstName} ${row.patientLastName}`.trim(),
    },
    doctor: {
      id: String(row.doctorId),
      displayName: `${row.doctorFirstName} ${row.doctorLastName}`.trim(),
    },
    specialty: {
      id: String(row.specialtyId),
      name: row.specialtyName,
    },
    startsAt: localDateTimeToIso(sqlDateTimeToLocal(row.startsAt)),
    endsAt: localDateTimeToIso(sqlDateTimeToLocal(row.endsAt)),
    status: databaseStatusToContract(row.databaseStatus),
    ...(row.reason === null ? {} : { reason: row.reason }),
    createdAt: sqlTimestampToIso(row.createdAt),
  }
}

function slotResponse(slot: SlotCandidate) {
  return {
    id: encodeSlot(slot),
    doctor: {
      id: String(slot.doctorId),
      displayName: `${slot.doctorFirstName} ${slot.doctorLastName}`.trim(),
    },
    specialty: {
      id: String(slot.specialtyId),
      name: slot.specialtyName,
    },
    startsAt: localDateTimeToIso(slot.startsAt),
    endsAt: localDateTimeToIso(slot.endsAt),
  }
}

function hasPatientRole(user: AuthenticatedUser): boolean {
  return user.roles.includes("patient")
}

function isAdministrative(user: AuthenticatedUser): boolean {
  return administrativeRoles.some((role) => user.roles.includes(role))
}

async function getDoctorIdForUser(userId: number): Promise<number | undefined> {
  const [rows] = await pool.execute<Array<RowDataPacket & { doctorId: number }>>(
    `SELECT m.id AS doctorId
     FROM users u
     INNER JOIN medicos m ON m.persona_id = u.persona_id
     WHERE u.id = ? AND m.activo = TRUE
     LIMIT 1`,
    [userId],
  )
  return rows[0]?.doctorId
}

const appointmentSelect = `
  SELECT
    t.id,
    t.paciente_id AS patientId,
    pp.nombre AS patientFirstName,
    pp.apellido AS patientLastName,
    t.medico_id AS doctorId,
    dp.nombre AS doctorFirstName,
    dp.apellido AS doctorLastName,
    t.especialidad_id AS specialtyId,
    e.nombre AS specialtyName,
    t.datetime_inicio AS startsAt,
    t.datetime_fin AS endsAt,
    t.estado AS databaseStatus,
    t.motivo_consulta AS reason,
    t.created_at AS createdAt
  FROM turnos t
  INNER JOIN pacientes pa ON pa.id = t.paciente_id
  INNER JOIN personas pp ON pp.id = pa.persona_id
  INNER JOIN medicos m ON m.id = t.medico_id
  INNER JOIN personas dp ON dp.id = m.persona_id
  INNER JOIN especialidades e ON e.id = t.especialidad_id
`

async function loadAppointment(appointmentId: string): Promise<AppointmentRow | undefined> {
  if (!/^\d+$/.test(appointmentId)) return undefined
  const [rows] = await pool.execute<AppointmentRow[]>(
    `${appointmentSelect} WHERE t.id = ? LIMIT 1`,
    [Number(appointmentId)],
  )
  return rows[0]
}

async function canViewAppointment(row: AppointmentRow, user: AuthenticatedUser): Promise<boolean> {
  if (isAdministrative(user)) return true
  if (hasPatientRole(user) && user.patientId === String(row.patientId)) return true
  if (user.roles.includes("doctor")) {
    const doctorId = await getDoctorIdForUser(user.databaseId)
    return doctorId === row.doctorId
  }
  return false
}

async function loadAvailabilityCandidates(
  from: Date,
  to: Date,
  filters: { doctorId?: string; specialtyId?: string },
): Promise<SlotCandidate[]> {
  const localStartDate = instantToLocalDate(from)
  const localEndDate = instantToLocalDate(to)
  const where: string[] = ["m.activo = TRUE", "p.activo = TRUE", "e.activa = TRUE"]
  const parameters: Array<string | number> = []
  if (filters.doctorId) {
    where.push("m.id = ?")
    parameters.push(Number(filters.doctorId))
  }
  if (filters.specialtyId) {
    where.push("e.id = ?")
    parameters.push(Number(filters.specialtyId))
  }

  const [schedules] = await pool.execute<ScheduleRow[]>(
    `SELECT
       m.id AS doctorId,
       p.nombre AS firstName,
       p.apellido AS lastName,
       e.id AS specialtyId,
       e.nombre AS specialtyName,
       h.dia_semana AS weekday,
       h.hora_inicio AS startsAt,
       h.hora_fin AS endsAt,
       h.duracion_turno_minutos AS durationMinutes
     FROM horarios_medicos h
     INNER JOIN medicos m ON m.id = h.medico_id
     INNER JOIN personas p ON p.id = m.persona_id
     INNER JOIN especialidades e ON e.id = m.especialidad_id
     WHERE h.activo = TRUE AND ${where.join(" AND ")}`,
    parameters,
  )
  if (schedules.length === 0) return []

  const doctorIds = [...new Set(schedules.map((schedule) => schedule.doctorId))]
  const placeholders = doctorIds.map(() => "?").join(", ")
  const [exceptions] = await pool.execute<ExceptionRow[]>(
    `SELECT
       medico_id AS doctorId,
       DATE_FORMAT(fecha, '%Y-%m-%d') AS date,
       tipo AS type,
       TIME_FORMAT(hora_inicio, '%H:%i:%s') AS startsAt,
       TIME_FORMAT(hora_fin, '%H:%i:%s') AS endsAt
     FROM excepciones_horarios
     WHERE medico_id IN (${placeholders}) AND fecha BETWEEN ? AND ?`,
    [...doctorIds, localStartDate, localEndDate],
  )
  const [appointments] = await pool.execute<Array<RowDataPacket & {
    doctorId: number
    startsAt: string | Date
    endsAt: string | Date
  }>>(
    `SELECT medico_id AS doctorId, datetime_inicio AS startsAt, datetime_fin AS endsAt
     FROM turnos
     WHERE medico_id IN (${placeholders})
       AND estado IN ('pendiente', 'confirmado')
       AND datetime_inicio < ? AND datetime_fin > ?`,
    [...doctorIds, `${localEndDate} 23:59:59`, `${localStartDate} 00:00:00`],
  )

  const exceptionMap = new Map<string, ExceptionRow[]>()
  for (const exception of exceptions) {
    const key = `${exception.doctorId}|${exception.date}`
    exceptionMap.set(key, [...(exceptionMap.get(key) ?? []), exception])
  }

  const occupiedByDoctor = new Map<number, Array<{ startsAt: string; endsAt: string }>>()
  for (const appointment of appointments) {
    occupiedByDoctor.set(appointment.doctorId, [
      ...(occupiedByDoctor.get(appointment.doctorId) ?? []),
      {
        startsAt: sqlDateTimeToLocal(appointment.startsAt),
        endsAt: sqlDateTimeToLocal(appointment.endsAt),
      },
    ])
  }

  const candidates: SlotCandidate[] = []
  const now = Date.now()
  for (let date = localStartDate; date <= localEndDate; date = addDays(date, 1)) {
    const weekday = dateWeekday(date)
    for (const schedule of schedules) {
      const dailyExceptions = exceptionMap.get(`${schedule.doctorId}|${date}`) ?? []
      if (dailyExceptions.some((item) => item.type !== "bloqueo" && item.type !== "cambio")) continue
      const changes = dailyExceptions.filter((item) => item.type === "cambio")
      const windows = changes.length > 0
        ? changes.filter((item) => item.startsAt && item.endsAt).map((item) => ({
          startsAt: item.startsAt as string,
          endsAt: item.endsAt as string,
        }))
        : schedule.weekday === weekday
          ? [{ startsAt: schedule.startsAt, endsAt: schedule.endsAt }]
          : []
      const blocks = dailyExceptions.filter((item) => item.type === "bloqueo")

      for (const window of windows) {
        const [startHour, startMinute, startSecond] = window.startsAt.split(":").map(Number)
        const [endHour, endMinute, endSecond] = window.endsAt.split(":").map(Number)
        let start = startHour * 3600 + startMinute * 60 + startSecond
        const end = endHour * 3600 + endMinute * 60 + endSecond
        while (start + schedule.durationMinutes * 60 <= end) {
          const finish = start + schedule.durationMinutes * 60
          const time = (seconds: number) => `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
          const startsAt = `${date} ${time(start)}`
          const endsAt = `${date} ${time(finish)}`
          const startInstant = localDateTimeToInstant(startsAt)
          const endInstant = localDateTimeToInstant(endsAt)
          const blocked = blocks.some((item) =>
            !item.startsAt
            || !item.endsAt
            || (item.startsAt < time(finish) && item.endsAt > time(start)))
          const occupied = (occupiedByDoctor.get(schedule.doctorId) ?? []).some((item) =>
            item.startsAt < endsAt && item.endsAt > startsAt)
          if (
            !blocked
            && !occupied
            && startInstant.getTime() >= now
            && startInstant >= from
            && endInstant <= to
          ) {
            candidates.push({
              doctorId: schedule.doctorId,
              doctorFirstName: schedule.firstName,
              doctorLastName: schedule.lastName,
              specialtyId: schedule.specialtyId,
              specialtyName: schedule.specialtyName,
              startsAt,
              endsAt,
            })
          }
          start = finish
        }
      }
    }
  }
  return candidates.sort((left, right) =>
    left.startsAt.localeCompare(right.startsAt) || left.doctorId - right.doctorId)
}

async function slotMatchesSchedule(connection: PoolConnection, slot: SlotData): Promise<boolean> {
  const date = slot.startsAt.slice(0, 10)
  const weekday = dateWeekday(date)
  const startTime = slot.startsAt.slice(11)
  const endTime = slot.endsAt.slice(11)
  const [scheduleRows] = await connection.execute<Array<RowDataPacket & {
    startsAt: string
    endsAt: string
    durationMinutes: number
  }>>(
    `SELECT
       TIME_FORMAT(h.hora_inicio, '%H:%i:%s') AS startsAt,
       TIME_FORMAT(h.hora_fin, '%H:%i:%s') AS endsAt,
       h.duracion_turno_minutos AS durationMinutes
     FROM horarios_medicos h
     INNER JOIN medicos m ON m.id = h.medico_id
     INNER JOIN personas p ON p.id = m.persona_id
     INNER JOIN especialidades e ON e.id = m.especialidad_id
     WHERE h.medico_id = ? AND h.dia_semana = ? AND h.activo = TRUE
       AND m.activo = TRUE AND p.activo = TRUE AND e.activa = TRUE`,
    [slot.doctorId, weekday],
  )
  const [exceptionRows] = await connection.execute<ExceptionRow[]>(
    `SELECT
       medico_id AS doctorId,
       DATE_FORMAT(fecha, '%Y-%m-%d') AS date,
       tipo AS type,
       TIME_FORMAT(hora_inicio, '%H:%i:%s') AS startsAt,
       TIME_FORMAT(hora_fin, '%H:%i:%s') AS endsAt
     FROM excepciones_horarios
     WHERE medico_id = ? AND fecha = ?`,
    [slot.doctorId, date],
  )
  if (exceptionRows.some((item) =>
    item.type === "vacacion" || item.type === "feriado" || item.type === "licencia")) return false

  const changes = exceptionRows.filter((item) => item.type === "cambio")
  const windows = changes.length > 0
    ? changes.filter((item) => item.startsAt && item.endsAt).map((item) => ({
      startsAt: item.startsAt as string,
      endsAt: item.endsAt as string,
      durationMinutes: scheduleRows[0]?.durationMinutes ?? 30,
    }))
    : scheduleRows.map((item) => ({
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      durationMinutes: item.durationMinutes,
    }))
  const matches = windows.some((window) => {
    const [hour, minute, second] = window.startsAt.split(":").map(Number)
    const windowStart = hour * 3600 + minute * 60 + second
    const [endHour, endMinute, endSecond] = window.endsAt.split(":").map(Number)
    const windowEnd = endHour * 3600 + endMinute * 60 + endSecond
    let cursor = windowStart
    while (cursor + window.durationMinutes * 60 <= windowEnd) {
      const next = cursor + window.durationMinutes * 60
      const format = (seconds: number) => `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
      if (format(cursor) === startTime && format(next) === endTime) return true
      cursor = next
    }
    return false
  })
  if (!matches) return false

  return !exceptionRows.some((item) =>
    item.type === "bloqueo"
    && (!item.startsAt || !item.endsAt || (item.startsAt < endTime && item.endsAt > startTime)))
}

async function loadAppointmentForUpdate(
  connection: PoolConnection,
  appointmentId: number,
): Promise<AppointmentRow | undefined> {
  const [rows] = await connection.execute<AppointmentRow[]>(
    `${appointmentSelect} WHERE t.id = ? FOR UPDATE`,
    [appointmentId],
  )
  return rows[0]
}

router.get(
  "/availability",
  requireAuthentication,
  asyncRoute(async (req, res) => {
    const parsed = filtersSchema.safeParse(req.query)
    if (!parsed.success) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "El rango o los filtros de disponibilidad no son válidos.")
      return
    }
    const from = new Date(parsed.data.from)
    const to = new Date(parsed.data.to)
    const rangeMilliseconds = to.getTime() - from.getTime()
    if (rangeMilliseconds <= 0 || rangeMilliseconds > 31 * 24 * 60 * 60 * 1000) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "El rango debe ser positivo y no superar 31 días.")
      return
    }
    const slots = await loadAvailabilityCandidates(from, to, parsed.data)
    const { page, pageSize } = parsed.data
    res.json({
      items: slots.slice((page - 1) * pageSize, page * pageSize).map(slotResponse),
      page,
      pageSize,
      totalItems: slots.length,
    })
  }),
)

router.get(
  "/",
  requireAuthentication,
  asyncRoute(async (req, res) => {
    const parsed = appointmentListSchema.safeParse(req.query)
    if (!parsed.success) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "Los filtros o la paginación no son válidos.")
      return
    }

    const user = res.locals.auth as AuthenticatedUser
    const where: string[] = []
    const parameters: Array<string | number> = []
    if (hasPatientRole(user) && !isAdministrative(user)) {
      if (!user.patientId) {
        sendHttpError(res, 403, "FORBIDDEN", "La cuenta no tiene un perfil de paciente asociado.")
        return
      }
      where.push("t.paciente_id = ?")
      parameters.push(Number(user.patientId))
    } else if (user.roles.includes("doctor") && !isAdministrative(user)) {
      const doctorId = await getDoctorIdForUser(user.databaseId)
      if (!doctorId) {
        sendHttpError(res, 403, "FORBIDDEN", "La cuenta no tiene un perfil profesional activo.")
        return
      }
      where.push("t.medico_id = ?")
      parameters.push(doctorId)
    } else if (!isAdministrative(user)) {
      sendHttpError(res, 403, "FORBIDDEN", "No tenés permiso para consultar turnos.")
      return
    }

    if (parsed.data.from) {
      where.push("t.datetime_inicio >= ?")
      parameters.push(instantToLocalDateTime(new Date(parsed.data.from)))
    }
    if (parsed.data.to) {
      where.push("t.datetime_inicio < ?")
      parameters.push(instantToLocalDateTime(new Date(parsed.data.to)))
    }
    if (parsed.data.status) {
      where.push("t.estado = ?")
      parameters.push(contractStatusToDatabase(parsed.data.status) ?? "")
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""
    const [rows] = await pool.execute<AppointmentRow[]>(
      `${appointmentSelect} ${whereSql}
       ORDER BY t.datetime_inicio DESC, t.id DESC
       LIMIT ? OFFSET ?`,
      [...parameters, parsed.data.pageSize, (parsed.data.page - 1) * parsed.data.pageSize],
    )
    const [countRows] = await pool.execute<Array<RowDataPacket & { total: number }>>(
      `SELECT COUNT(*) AS total FROM turnos t ${whereSql}`,
      parameters,
    )
    res.json({
      items: rows.map(appointmentResponse),
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      totalItems: Number(countRows[0]?.total ?? 0),
    })
  }),
)

router.post(
  "/",
  requireAuthentication,
  requireCsrfToken,
  asyncRoute(async (req, res) => {
    const parsed = createAppointmentSchema.safeParse(req.body)
    if (!parsed.success) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "Los datos para reservar el turno no son válidos.")
      return
    }
    const user = res.locals.auth as AuthenticatedUser
    const slot = decodeSlot(parsed.data.slotId)
    if (!slot) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "El espacio indicado no es válido.")
      return
    }
    let patientId: number
    if (isAdministrative(user)) {
      const value = parsed.data.patientId ?? user.patientId
      if (!value) {
        sendHttpError(res, 422, "VALIDATION_ERROR", "Personal administrativo debe indicar un paciente.")
        return
      }
      patientId = Number(value)
    } else if (hasPatientRole(user) && user.patientId) {
      if (parsed.data.patientId && parsed.data.patientId !== user.patientId) {
        sendHttpError(res, 403, "FORBIDDEN", "Un paciente solo puede reservar para sí mismo.")
        return
      }
      patientId = Number(user.patientId)
    } else {
      sendHttpError(res, 403, "FORBIDDEN", "No tenés permiso para reservar turnos.")
      return
    }

    const result = await withTransaction(async (connection) => {
      await connection.execute("SELECT id FROM medicos WHERE id = ? FOR UPDATE", [slot.doctorId])
      const [patientRows] = await connection.execute<Array<RowDataPacket & { id: number }>>(
        `SELECT pa.id
         FROM pacientes pa
         INNER JOIN personas p ON p.id = pa.persona_id
         WHERE pa.id = ? AND pa.activo = TRUE AND p.activo = TRUE
         LIMIT 1`,
        [patientId],
      )
      if (!patientRows[0]) return { kind: "patient-not-found" as const }

      const doctorValid = await slotMatchesSchedule(connection, slot)
      if (!doctorValid) return { kind: "unavailable" as const }

      const [overlaps] = await connection.execute<Array<RowDataPacket & { id: number }>>(
        `SELECT id FROM turnos
         WHERE medico_id = ?
           AND estado IN ('pendiente', 'confirmado')
           AND datetime_inicio < ? AND datetime_fin > ?
         LIMIT 1 FOR UPDATE`,
        [slot.doctorId, slot.endsAt, slot.startsAt],
      )
      if (overlaps[0]) return { kind: "unavailable" as const }

      const [doctorRows] = await connection.execute<Array<RowDataPacket & {
        specialtyId: number
      }>>(
        `SELECT m.especialidad_id AS specialtyId
         FROM medicos m
         INNER JOIN personas p ON p.id = m.persona_id
         INNER JOIN especialidades e ON e.id = m.especialidad_id
         WHERE m.id = ? AND m.activo = TRUE AND p.activo = TRUE AND e.activa = TRUE
         LIMIT 1`,
        [slot.doctorId],
      )
      if (!doctorRows[0]) return { kind: "unavailable" as const }

      const [coverageRows] = await connection.execute<Array<RowDataPacket & { id: number }>>(
        `SELECT id
         FROM pacientes_obras_sociales
         WHERE paciente_id = ? AND principal = TRUE AND activa = TRUE
           AND fecha_vigencia_desde <= ? AND (fecha_vigencia_hasta IS NULL OR fecha_vigencia_hasta >= ?)
         LIMIT 1`,
        [patientId, slot.startsAt.slice(0, 10), slot.startsAt.slice(0, 10)],
      )
      const [insert] = await connection.execute<ResultSetHeader>(
        `INSERT INTO turnos
          (paciente_id, medico_id, especialidad_id, datetime_inicio, datetime_fin,
           estado, motivo_consulta, paciente_obra_social_id)
         VALUES (?, ?, ?, ?, ?, 'pendiente', ?, ?)`,
        [
          patientId,
          slot.doctorId,
          doctorRows[0].specialtyId,
          slot.startsAt,
          slot.endsAt,
          parsed.data.reason ?? null,
          coverageRows[0]?.id ?? null,
        ],
      )
      await connection.execute(
        `INSERT INTO turnos_historial
          (turno_id, accion, usuario_id, datetime_nuevo_inicio, datetime_nuevo_fin, estado_nuevo)
         VALUES (?, 'creado', ?, ?, ?, 'pendiente')`,
        [insert.insertId, user.databaseId, slot.startsAt, slot.endsAt],
      )
      return { kind: "created" as const, id: insert.insertId }
    })

    if (result.kind === "patient-not-found") {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró el paciente solicitado.")
      return
    }
    if (result.kind === "unavailable") {
      sendHttpError(res, 409, "SLOT_UNAVAILABLE", "El horario ya no está disponible.")
      return
    }
    const appointment = await loadAppointment(String(result.id))
    if (!appointment) {
      sendHttpError(res, 500, "INTERNAL_ERROR", "No se pudo recuperar el turno creado.")
      return
    }
    res.status(201)
      .location(`/api/v1/appointments/${appointment.id}`)
      .json(appointmentResponse(appointment))
  }),
)

router.get(
  "/:appointmentId",
  requireAuthentication,
  asyncRoute(async (req, res) => {
    const appointment = await loadAppointment(requestPathParameter(req, "appointmentId"))
    if (!appointment) {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró el turno solicitado.")
      return
    }
    if (!await canViewAppointment(appointment, res.locals.auth as AuthenticatedUser)) {
      sendHttpError(res, 403, "FORBIDDEN", "No tenés permiso para consultar este turno.")
      return
    }
    res.json(appointmentResponse(appointment))
  }),
)

router.post(
  "/:appointmentId/confirm",
  requireAuthentication,
  requireRoles(...administrativeRoles),
  requireCsrfToken,
  asyncRoute(async (req, res) => {
    const appointmentId = requestPathParameter(req, "appointmentId")
    if (!/^\d+$/.test(appointmentId)) {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró el turno solicitado.")
      return
    }
    const user = res.locals.auth as AuthenticatedUser
    const result = await withTransaction(async (connection) => {
      const appointment = await loadAppointmentForUpdate(connection, Number(appointmentId))
      if (!appointment) return { kind: "not-found" as const }
      if (appointment.databaseStatus !== "pendiente") return { kind: "conflict" as const }
      await connection.execute(
        "UPDATE turnos SET estado = 'confirmado' WHERE id = ?",
        [Number(appointmentId)],
      )
      await connection.execute(
        `INSERT INTO turnos_historial
          (turno_id, accion, usuario_id, estado_anterior, estado_nuevo)
         VALUES (?, 'confirmado', ?, 'pendiente', 'confirmado')`,
        [Number(appointmentId), user.databaseId],
      )
      return { kind: "updated" as const }
    })
    if (result.kind === "not-found") {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró el turno solicitado.")
      return
    }
    if (result.kind === "conflict") {
      sendHttpError(res, 409, "INVALID_STATUS_TRANSITION", "Solo se pueden confirmar turnos solicitados.")
      return
    }
    const appointment = await loadAppointment(appointmentId)
    if (!appointment) {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró el turno solicitado.")
      return
    }
    res.json(appointmentResponse(appointment))
  }),
)

router.post(
  "/:appointmentId/cancel",
  requireAuthentication,
  requireCsrfToken,
  asyncRoute(async (req, res) => {
    const parsed = cancelSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "El motivo de cancelación no es válido.")
      return
    }
    const appointmentId = requestPathParameter(req, "appointmentId")
    if (!/^\d+$/.test(appointmentId)) {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró el turno solicitado.")
      return
    }
    const user = res.locals.auth as AuthenticatedUser
    const result = await withTransaction(async (connection) => {
      const appointment = await loadAppointmentForUpdate(connection, Number(appointmentId))
      if (!appointment) return { kind: "not-found" as const }
      const isOwner = hasPatientRole(user) && user.patientId === String(appointment.patientId)
      if (!isOwner && !isAdministrative(user)) return { kind: "forbidden" as const }
      if (!["pendiente", "confirmado"].includes(appointment.databaseStatus)) {
        return { kind: "conflict" as const }
      }
      await connection.execute(
        "UPDATE turnos SET estado = 'cancelado' WHERE id = ?",
        [Number(appointmentId)],
      )
      await connection.execute(
        `INSERT INTO turnos_historial
          (turno_id, accion, usuario_id, estado_anterior, estado_nuevo, motivo)
         VALUES (?, 'cancelado', ?, ?, 'cancelado', ?)`,
        [Number(appointmentId), user.databaseId, appointment.databaseStatus, parsed.data.reason ?? null],
      )
      return { kind: "updated" as const }
    })
    if (result.kind === "not-found") {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró el turno solicitado.")
      return
    }
    if (result.kind === "forbidden") {
      sendHttpError(res, 403, "FORBIDDEN", "No tenés permiso para cancelar este turno.")
      return
    }
    if (result.kind === "conflict") {
      sendHttpError(res, 409, "INVALID_STATUS_TRANSITION", "El estado actual del turno no permite cancelarlo.")
      return
    }
    const appointment = await loadAppointment(appointmentId)
    if (!appointment) {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró el turno solicitado.")
      return
    }
    res.json(appointmentResponse(appointment))
  }),
)

router.patch(
  "/:appointmentId/reschedule",
  requireAuthentication,
  requireCsrfToken,
  asyncRoute(async (req, res) => {
    const parsed = rescheduleSchema.safeParse(req.body)
    if (!parsed.success) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "Los datos para reprogramar el turno no son válidos.")
      return
    }
    const appointmentId = requestPathParameter(req, "appointmentId")
    const slot = decodeSlot(parsed.data.slotId)
    if (!/^\d+$/.test(appointmentId)) {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró el turno solicitado.")
      return
    }
    if (!slot) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "El espacio indicado no es válido.")
      return
    }

    const user = res.locals.auth as AuthenticatedUser
    const original = await loadAppointment(appointmentId)
    if (!original) {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró el turno solicitado.")
      return
    }
    const result = await withTransaction(async (connection) => {
      const doctorIds = [...new Set([original.doctorId, slot.doctorId])].sort((a, b) => a - b)
      const [doctorLocks] = await connection.execute<Array<RowDataPacket & { id: number }>>(
        `SELECT id FROM medicos WHERE id IN (${doctorIds.map(() => "?").join(", ")}) ORDER BY id FOR UPDATE`,
        doctorIds,
      )
      if (!doctorLocks.length) return { kind: "unavailable" as const }
      const appointment = await loadAppointmentForUpdate(connection, Number(appointmentId))
      if (!appointment) return { kind: "not-found" as const }
      if (appointment.doctorId !== original.doctorId) return { kind: "conflict" as const }
      const isOwner = hasPatientRole(user) && user.patientId === String(appointment.patientId)
      if (!isOwner && !isAdministrative(user)) return { kind: "forbidden" as const }
      if (!["pendiente", "confirmado"].includes(appointment.databaseStatus)) {
        return { kind: "conflict" as const }
      }
      if (!await slotMatchesSchedule(connection, slot)) return { kind: "unavailable" as const }
      const [overlaps] = await connection.execute<Array<RowDataPacket & { id: number }>>(
        `SELECT id FROM turnos
         WHERE medico_id = ? AND id <> ?
           AND estado IN ('pendiente', 'confirmado')
           AND datetime_inicio < ? AND datetime_fin > ?
         LIMIT 1 FOR UPDATE`,
        [slot.doctorId, Number(appointmentId), slot.endsAt, slot.startsAt],
      )
      if (overlaps[0]) return { kind: "unavailable" as const }
      await connection.execute(
        `UPDATE turnos
         SET medico_id = ?,
             especialidad_id = (SELECT especialidad_id FROM medicos WHERE id = ?),
             datetime_inicio = ?,
             datetime_fin = ?
         WHERE id = ?`,
        [slot.doctorId, slot.doctorId, slot.startsAt, slot.endsAt, Number(appointmentId)],
      )
      await connection.execute(
        `INSERT INTO turnos_historial
          (turno_id, accion, usuario_id, datetime_anterior_inicio, datetime_anterior_fin,
           datetime_nuevo_inicio, datetime_nuevo_fin, estado_anterior, estado_nuevo, motivo)
         VALUES (?, 'reprogramado', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(appointmentId),
          user.databaseId,
          appointment.startsAt,
          appointment.endsAt,
          slot.startsAt,
          slot.endsAt,
          appointment.databaseStatus,
          appointment.databaseStatus,
          parsed.data.reason ?? null,
        ],
      )
      return { kind: "updated" as const }
    })

    if (result.kind === "not-found") {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró el turno solicitado.")
      return
    }
    if (result.kind === "forbidden") {
      sendHttpError(res, 403, "FORBIDDEN", "No tenés permiso para reprogramar este turno.")
      return
    }
    if (result.kind === "conflict") {
      sendHttpError(res, 409, "INVALID_STATUS_TRANSITION", "El estado actual del turno no permite reprogramarlo.")
      return
    }
    if (result.kind === "unavailable") {
      sendHttpError(res, 409, "SLOT_UNAVAILABLE", "El horario ya no está disponible.")
      return
    }
    const appointment = await loadAppointment(appointmentId)
    if (!appointment) {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró el turno solicitado.")
      return
    }
    res.json(appointmentResponse(appointment))
  }),
)

export default router
