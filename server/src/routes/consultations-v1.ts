import { randomUUID } from "node:crypto"
import { Router, type Request, type Response } from "express"
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise"
import { z } from "zod"
import { asyncRoute } from "../auth/async-route"
import { sendHttpError } from "../auth/http-error"
import type { AuthenticatedUser } from "../auth/types"
import { pool, withTransaction } from "../db/pool"
import { requireAuthentication, requireRoles } from "../middleware/authentication"
import { requireCsrfToken } from "../middleware/csrf-protection"

const router = Router()
const clinicalRoles = ["patient", "doctor"] as const
const consultationTypes = ["programada", "espontanea", "urgencia", "control"] as const

type ConsultationRow = RowDataPacket & {
  id: number
  appointmentId: number | null
  patientId: number
  patientName: string
  doctorId: number
  doctorName: string
  specialtyId: number
  specialtyName: string
  consultationDate: Date | string
  type: typeof consultationTypes[number] | null
  reason: string | null
  primaryDiagnosis: string | null
  secondaryDiagnosis: string | null
  observations: string | null
  systolicPressure: number | null
  diastolicPressure: number | null
  weight: string | number | null
  height: string | number | null
  temperature: string | number | null
  heartRate: number | null
}

type DiagnosisRow = RowDataPacket & {
  id: number
  name: string
  code: string | null
  diagnosisDate: Date | string
  status: "activo" | "controlado" | "resuelto" | "cronico" | "en_remision" | null
  notes: string | null
  primary: number
}

type TreatmentRow = RowDataPacket & {
  id: number
  name: string
  description: string | null
  dose: string | null
  frequency: string | null
  route: string | null
  durationDays: number | null
  startDate: Date | string
  endDate: Date | string | null
  active: number
}

type PrescriptionRow = RowDataPacket & {
  id: number
  number: string
  issueDate: Date | string
  validUntil: Date | string
  generalInstructions: string | null
}

type PrescriptionItemRow = RowDataPacket & {
  id: number
  prescriptionId: number
  medicationName: string
  concentration: string | null
  dose: string
  frequency: string
  duration: string | null
  quantityUnits: number | null
  instructions: string | null
}

const positiveIdSchema = z.string().regex(/^[1-9]\d{0,9}$/)
const pageBaseSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  patientId: positiveIdSchema.optional(),
}).strict()
const pageSchema = pageBaseSchema.refine((value) => !value.from || !value.to || value.from < value.to, {
  message: "El rango de fechas debe ser positivo.",
})
const historyPageSchema = pageBaseSchema.omit({ patientId: true }).refine(
  (value) => !value.from || !value.to || value.from < value.to,
  { message: "El rango de fechas debe ser positivo." },
)

const consultationInputSchema = z.object({
  appointmentId: positiveIdSchema,
  type: z.enum(consultationTypes),
  reason: z.string().trim().max(5000).optional(),
  primaryDiagnosis: z.string().trim().max(5000).optional(),
  secondaryDiagnosis: z.string().trim().max(5000).optional(),
  observations: z.string().trim().max(10000).optional(),
  systolicPressure: z.number().int().min(40).max(300).optional(),
  diastolicPressure: z.number().int().min(20).max(200).optional(),
  weight: z.number().positive().max(500).optional(),
  height: z.number().positive().max(3).optional(),
  temperature: z.number().min(25).max(45).optional(),
  heartRate: z.number().int().min(20).max(300).optional(),
}).strict().refine(
  (value) => value.systolicPressure === undefined
    || value.diastolicPressure === undefined
    || value.systolicPressure > value.diastolicPressure,
  { message: "La presión sistólica debe ser mayor que la diastólica." },
)

const diagnosisInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().max(10).optional(),
  diagnosisDate: z.string().date(),
  status: z.enum(["activo", "controlado", "resuelto", "cronico", "en_remision"]).optional(),
  notes: z.string().trim().max(5000).optional(),
  primary: z.boolean().default(false),
}).strict()

const treatmentInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  dose: z.string().trim().max(100).optional(),
  frequency: z.string().trim().max(100).optional(),
  route: z.string().trim().max(50).optional(),
  durationDays: z.number().int().positive().max(3650).optional(),
  startDate: z.string().date(),
  endDate: z.string().date().optional(),
  active: z.boolean().default(true),
}).strict().refine((value) => !value.endDate || value.endDate >= value.startDate, {
  message: "La fecha de finalización no puede preceder al inicio.",
})

const prescriptionItemSchema = z.object({
  medicationName: z.string().trim().min(1).max(200),
  concentration: z.string().trim().max(50).optional(),
  dose: z.string().trim().min(1).max(100),
  frequency: z.string().trim().min(1).max(100),
  duration: z.string().trim().max(50).optional(),
  quantityUnits: z.number().int().positive().max(100_000).optional(),
  instructions: z.string().trim().max(1000).optional(),
}).strict()

const prescriptionInputSchema = z.object({
  validUntil: z.string().date(),
  generalInstructions: z.string().trim().max(5000).optional(),
  items: z.array(prescriptionItemSchema).min(1).max(30),
}).strict().refine((value) => value.validUntil >= new Date().toISOString().slice(0, 10), {
  message: "La fecha de vencimiento no puede estar en el pasado.",
})

function requestParameter(req: Request, name: string): string {
  const value = req.params[name]
  return typeof value === "string" ? value : ""
}

function authenticatedUser(res: Response): AuthenticatedUser {
  const user = res.locals.auth as AuthenticatedUser | undefined
  if (!user) throw new Error("Authentication middleware did not attach the user")
  return user
}

function dateOnly(value: Date | string): string
function dateOnly(value: Date | string | null): string | undefined
function dateOnly(value: Date | string | null): string | undefined {
  if (value === null) return undefined
  if (typeof value === "string") return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
}

function timestampIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString()
  const normalized = value.includes("T") ? value : value.replace(" ", "T")
  return new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}Z`).toISOString()
}

function numberOrUndefined(value: string | number | null): number | undefined {
  return value === null ? undefined : Number(value)
}

async function doctorIdForUser(user: AuthenticatedUser): Promise<number | undefined> {
  const [rows] = await pool.execute<Array<RowDataPacket & { doctorId: number }>>(
    `SELECT m.id AS doctorId
     FROM medicos m
     INNER JOIN personas p ON p.id = m.persona_id
     INNER JOIN users u ON u.persona_id = p.id
     WHERE u.id = ? AND m.activo = TRUE AND p.activo = TRUE
     LIMIT 1`,
    [user.databaseId],
  )
  return rows[0]?.doctorId
}

function consultationSelect(): string {
  return `SELECT
    c.id,
    c.turno_id AS appointmentId,
    c.paciente_id AS patientId,
    CONCAT(pp.nombre, ' ', pp.apellido) AS patientName,
    c.medico_id AS doctorId,
    CONCAT(dp.nombre, ' ', dp.apellido) AS doctorName,
    c.especialidad_id AS specialtyId,
    e.nombre AS specialtyName,
    c.fecha_consulta AS consultationDate,
    c.tipo_consulta AS type,
    c.motivo_consulta AS reason,
    c.diagnostico_principal AS primaryDiagnosis,
    c.diagnostico_secundario AS secondaryDiagnosis,
    c.observaciones AS observations,
    c.presion_arterial_sistolica AS systolicPressure,
    c.presion_arterial_diastolica AS diastolicPressure,
    c.peso AS weight,
    c.altura AS height,
    c.temperatura AS temperature,
    c.frecuencia_cardiaca AS heartRate
   FROM consultas_medicas c
   INNER JOIN pacientes pa ON pa.id = c.paciente_id
   INNER JOIN personas pp ON pp.id = pa.persona_id
   INNER JOIN medicos m ON m.id = c.medico_id
   INNER JOIN personas dp ON dp.id = m.persona_id
   INNER JOIN especialidades e ON e.id = c.especialidad_id`
}

function consultationResponse(row: ConsultationRow) {
  return {
    id: String(row.id),
    ...(row.appointmentId === null ? {} : { appointmentId: String(row.appointmentId) }),
    patient: { id: String(row.patientId), displayName: row.patientName.trim() },
    doctor: { id: String(row.doctorId), displayName: row.doctorName.trim() },
    specialty: { id: String(row.specialtyId), name: row.specialtyName },
    consultationDate: timestampIso(row.consultationDate),
    ...(row.type === null ? {} : { type: row.type }),
    ...(row.reason === null ? {} : { reason: row.reason }),
    ...(row.primaryDiagnosis === null ? {} : { primaryDiagnosis: row.primaryDiagnosis }),
    ...(row.secondaryDiagnosis === null ? {} : { secondaryDiagnosis: row.secondaryDiagnosis }),
    ...(row.observations === null ? {} : { observations: row.observations }),
    ...(row.systolicPressure === null ? {} : { systolicPressure: row.systolicPressure }),
    ...(row.diastolicPressure === null ? {} : { diastolicPressure: row.diastolicPressure }),
    ...(numberOrUndefined(row.weight) === undefined ? {} : { weight: numberOrUndefined(row.weight) }),
    ...(numberOrUndefined(row.height) === undefined ? {} : { height: numberOrUndefined(row.height) }),
    ...(numberOrUndefined(row.temperature) === undefined ? {} : { temperature: numberOrUndefined(row.temperature) }),
    ...(row.heartRate === null ? {} : { heartRate: row.heartRate }),
  }
}

async function findConsultation(consultationId: number): Promise<ConsultationRow | undefined> {
  const [rows] = await pool.execute<ConsultationRow[]>(
    `${consultationSelect()} WHERE c.id = ? LIMIT 1`,
    [consultationId],
  )
  return rows[0]
}

async function canReadConsultation(user: AuthenticatedUser, row: ConsultationRow): Promise<boolean> {
  if (user.roles.includes("patient")) return user.patientId === String(row.patientId)
  if (!user.roles.includes("doctor")) return false
  return await doctorIdForUser(user) === row.doctorId
}

async function detailResponse(row: ConsultationRow) {
  const [diagnosisRows] = await pool.execute<DiagnosisRow[]>(
    `SELECT
       p.id,
       p.nombre AS name,
       p.codigo_cie10 AS code,
       p.fecha_diagnostico AS diagnosisDate,
       p.estado AS status,
       p.notas AS notes,
       cp.es_principal AS \`primary\`
     FROM consultas_patologias cp
     INNER JOIN patologias p ON p.id = cp.patologia_id
     WHERE cp.consulta_id = ?
     ORDER BY cp.es_principal DESC, p.id`,
    [row.id],
  )
  const [treatmentRows] = await pool.execute<TreatmentRow[]>(
    `SELECT
       id,
       nombre AS name,
       descripcion AS description,
       dosis AS dose,
       frecuencia AS frequency,
       via_administracion AS route,
       duracion_dias AS durationDays,
       fecha_inicio AS startDate,
       fecha_fin AS endDate,
       activo AS active
     FROM tratamientos
     WHERE consulta_id = ?
     ORDER BY id`,
    [row.id],
  )
  const [prescriptionRows] = await pool.execute<PrescriptionRow[]>(
    `SELECT
       id,
       numero_receta AS number,
       fecha_emision AS issueDate,
       fecha_vencimiento AS validUntil,
       indicaciones_generales AS generalInstructions
     FROM recetas
     WHERE consulta_id = ?
     ORDER BY id`,
    [row.id],
  )
  const prescriptionIds = prescriptionRows.map((prescription) => prescription.id)
  const prescriptionItems = prescriptionIds.length === 0
    ? []
    : (await pool.execute<PrescriptionItemRow[]>(
      `SELECT
         id,
         receta_id AS prescriptionId,
         medicamento_nombre AS medicationName,
         concentracion AS concentration,
         dosis AS dose,
         frecuencia AS frequency,
         duracion AS duration,
         cantidad_unidades AS quantityUnits,
         indicaciones AS instructions
       FROM receta_items
       WHERE receta_id IN (${prescriptionIds.map(() => "?").join(", ")})
       ORDER BY receta_id, id`,
      prescriptionIds,
    ))[0]

  return {
    ...consultationResponse(row),
    diagnoses: diagnosisRows.map((diagnosis) => ({
      id: String(diagnosis.id),
      name: diagnosis.name,
      ...(diagnosis.code === null ? {} : { code: diagnosis.code }),
      diagnosisDate: dateOnly(diagnosis.diagnosisDate),
      ...(diagnosis.status === null ? {} : { status: diagnosis.status }),
      ...(diagnosis.notes === null ? {} : { notes: diagnosis.notes }),
      primary: Boolean(diagnosis.primary),
    })),
    treatments: treatmentRows.map((treatment) => ({
      id: String(treatment.id),
      name: treatment.name,
      ...(treatment.description === null ? {} : { description: treatment.description }),
      ...(treatment.dose === null ? {} : { dose: treatment.dose }),
      ...(treatment.frequency === null ? {} : { frequency: treatment.frequency }),
      ...(treatment.route === null ? {} : { route: treatment.route }),
      ...(treatment.durationDays === null ? {} : { durationDays: treatment.durationDays }),
      startDate: dateOnly(treatment.startDate),
      ...(dateOnly(treatment.endDate) === undefined ? {} : { endDate: dateOnly(treatment.endDate) }),
      active: Boolean(treatment.active),
    })),
    prescriptions: prescriptionRows.map((prescription) => ({
      id: String(prescription.id),
      number: prescription.number,
      issueDate: dateOnly(prescription.issueDate),
      validUntil: dateOnly(prescription.validUntil),
      ...(prescription.generalInstructions === null
        ? {}
        : { generalInstructions: prescription.generalInstructions }),
      items: prescriptionItems
        .filter((item) => item.prescriptionId === prescription.id)
        .map((item) => ({
          id: String(item.id),
          medicationName: item.medicationName,
          ...(item.concentration === null ? {} : { concentration: item.concentration }),
          dose: item.dose,
          frequency: item.frequency,
          ...(item.duration === null ? {} : { duration: item.duration }),
          ...(item.quantityUnits === null ? {} : { quantityUnits: item.quantityUnits }),
          ...(item.instructions === null ? {} : { instructions: item.instructions }),
        })),
    })),
  }
}

function parsePage(
  req: Request,
  res: Response,
  schema: typeof pageSchema,
): z.output<typeof pageSchema> | undefined
function parsePage(
  req: Request,
  res: Response,
  schema: typeof historyPageSchema,
): z.output<typeof historyPageSchema> | undefined
function parsePage(
  req: Request,
  res: Response,
  schema: typeof pageSchema | typeof historyPageSchema,
): z.output<typeof pageSchema> | z.output<typeof historyPageSchema> | undefined {
  const parsed = schema.safeParse(req.query)
  if (!parsed.success) {
    sendHttpError(res, 422, "VALIDATION_ERROR", "Los filtros o la paginación no son válidos.")
    return undefined
  }
  return parsed.data
}

async function listConsultations(
  user: AuthenticatedUser,
  page: number,
  pageSize: number,
  from?: string,
  to?: string,
  requestedPatientId?: string,
) {
  const conditions: string[] = []
  const values: Array<string | number> = []
  if (user.roles.includes("patient")) {
    if (!user.patientId) return undefined
    conditions.push("c.paciente_id = ?")
    values.push(Number(user.patientId))
  } else if (user.roles.includes("doctor")) {
    const doctorId = await doctorIdForUser(user)
    if (!doctorId) return undefined
    conditions.push("c.medico_id = ?")
    values.push(doctorId)
    if (requestedPatientId) {
      conditions.push("c.paciente_id = ?")
      values.push(Number(requestedPatientId))
    }
  } else {
    return undefined
  }
  if (from) {
    conditions.push("c.fecha_consulta >= ?")
    values.push(`${from} 00:00:00`)
  }
  if (to) {
    conditions.push("c.fecha_consulta < ?")
    values.push(`${to} 00:00:00`)
  }
  const where = conditions.join(" AND ")
  const [rows] = await pool.execute<ConsultationRow[]>(
    `${consultationSelect()}
     WHERE ${where}
     ORDER BY c.fecha_consulta DESC, c.id DESC
     LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize],
  )
  const [countRows] = await pool.execute<Array<RowDataPacket & { total: number }>>(
    `SELECT COUNT(*) AS total FROM consultas_medicas c WHERE ${where}`,
    values,
  )
  return {
    items: rows.map(consultationResponse),
    page,
    pageSize,
    totalItems: Number(countRows[0]?.total ?? 0),
  }
}

async function consultationForDoctor(
  connection: PoolConnection,
  consultationId: number,
  doctorId: number,
): Promise<{ id: number; patientId: number } | undefined> {
  const [rows] = await connection.execute<Array<RowDataPacket & { id: number; patientId: number }>>(
    `SELECT id, paciente_id AS patientId
     FROM consultas_medicas
     WHERE id = ? AND medico_id = ?
     FOR UPDATE`,
    [consultationId, doctorId],
  )
  return rows[0]
}

function duplicateEntry(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY"
}

router.get(
  "/consultations",
  requireAuthentication,
  requireRoles(...clinicalRoles),
  asyncRoute(async (req, res) => {
    const filters = parsePage(req, res, pageSchema)
    if (!filters) return
    const user = authenticatedUser(res)
    const page = await listConsultations(
      user,
      filters.page,
      filters.pageSize,
      filters.from,
      filters.to,
      filters.patientId,
    )
    if (!page) {
      sendHttpError(res, 403, "FORBIDDEN", "No tenés permiso para consultar estas atenciones.")
      return
    }
    res.json(page)
  }),
)

router.post(
  "/consultations",
  requireAuthentication,
  requireRoles("doctor"),
  requireCsrfToken,
  asyncRoute(async (req, res) => {
    const user = authenticatedUser(res)
    if (user.roles.includes("patient")) {
      sendHttpError(res, 403, "FORBIDDEN", "No tenés permiso para registrar atenciones.")
      return
    }
    const doctorId = await doctorIdForUser(user)
    if (!doctorId) {
      sendHttpError(res, 403, "FORBIDDEN", "El usuario no tiene un perfil profesional activo.")
      return
    }
    const parsed = consultationInputSchema.safeParse(req.body)
    if (!parsed.success) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "Los datos de la atención no son válidos.")
      return
    }

    const consultationId = await withTransaction(async (connection) => {
      const [appointments] = await connection.execute<Array<RowDataPacket & {
        id: number
        patientId: number
        doctorId: number
        specialtyId: number
        status: string
        started: number
      }>>(
        `SELECT
           id,
           paciente_id AS patientId,
           medico_id AS doctorId,
           especialidad_id AS specialtyId,
           estado AS status,
           (datetime_inicio <= UTC_TIMESTAMP()) AS started
         FROM turnos
         WHERE id = ?
         FOR UPDATE`,
        [Number(parsed.data.appointmentId)],
      )
      const appointment = appointments[0]
      if (!appointment || appointment.doctorId !== doctorId) {
        sendHttpError(res, 404, "NOT_FOUND", "No se encontró el turno autorizado para registrar la atención.")
        return undefined
      }
      if (appointment.status === "cancelado" || appointment.status === "ausente" || !appointment.started) {
        sendHttpError(res, 409, "APPOINTMENT_NOT_COMPLETABLE", "El turno no puede registrarse como atendido.")
        return undefined
      }
      const [existing] = await connection.execute<Array<RowDataPacket & { id: number }>>(
        "SELECT id FROM consultas_medicas WHERE turno_id = ? LIMIT 1",
        [appointment.id],
      )
      if (existing[0]) {
        sendHttpError(res, 409, "CONSULTATION_ALREADY_EXISTS", "El turno ya tiene una atención registrada.")
        return undefined
      }
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO consultas_medicas (
           turno_id, paciente_id, medico_id, especialidad_id, tipo_consulta,
           motivo_consulta, diagnostico_principal, diagnostico_secundario,
           observaciones, presion_arterial_sistolica, presion_arterial_diastolica,
           peso, altura, temperatura, frecuencia_cardiaca
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          appointment.id,
          appointment.patientId,
          doctorId,
          appointment.specialtyId,
          parsed.data.type,
          parsed.data.reason ?? null,
          parsed.data.primaryDiagnosis ?? null,
          parsed.data.secondaryDiagnosis ?? null,
          parsed.data.observations ?? null,
          parsed.data.systolicPressure ?? null,
          parsed.data.diastolicPressure ?? null,
          parsed.data.weight ?? null,
          parsed.data.height ?? null,
          parsed.data.temperature ?? null,
          parsed.data.heartRate ?? null,
        ],
      )
      if (appointment.status !== "atendido") {
        await connection.execute(
          "UPDATE turnos SET estado = 'atendido' WHERE id = ?",
          [appointment.id],
        )
        await connection.execute(
          `INSERT INTO turnos_historial
            (turno_id, accion, usuario_id, estado_anterior, estado_nuevo, motivo)
           VALUES (?, 'estado_cambiado', ?, ?, 'atendido', 'Atención clínica registrada')`,
          [appointment.id, user.databaseId, appointment.status],
        )
      }
      return result.insertId
    })
    if (consultationId === undefined) return
    const consultation = await findConsultation(consultationId)
    if (!consultation) throw new Error("Created consultation could not be reloaded")
    res.status(201).location(`/api/v1/consultations/${consultationId}`)
      .json(await detailResponse(consultation))
  }),
)

router.get(
  "/consultations/:consultationId",
  requireAuthentication,
  requireRoles(...clinicalRoles),
  asyncRoute(async (req, res) => {
    const rawId = requestParameter(req, "consultationId")
    if (!positiveIdSchema.safeParse(rawId).success) {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró la atención solicitada.")
      return
    }
    const consultation = await findConsultation(Number(rawId))
    if (!consultation || !await canReadConsultation(authenticatedUser(res), consultation)) {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró la atención solicitada.")
      return
    }
    res.json(await detailResponse(consultation))
  }),
)

router.get(
  "/patients/:patientId/medical-history",
  requireAuthentication,
  requireRoles(...clinicalRoles),
  asyncRoute(async (req, res) => {
    const rawPatientId = requestParameter(req, "patientId")
    if (!positiveIdSchema.safeParse(rawPatientId).success) {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró el historial solicitado.")
      return
    }
    const user = authenticatedUser(res)
    const patientId = Number(rawPatientId)
    if (user.roles.includes("patient")) {
      if (user.patientId !== rawPatientId) {
        sendHttpError(res, 403, "FORBIDDEN", "Solo podés consultar tu propio historial clínico.")
        return
      }
    } else {
      const doctorId = await doctorIdForUser(user)
      if (!doctorId) {
        sendHttpError(res, 403, "FORBIDDEN", "El usuario no tiene un perfil profesional activo.")
        return
      }
      const [careRelation] = await pool.execute<Array<RowDataPacket & { found: number }>>(
        `SELECT 1 AS found FROM consultas_medicas WHERE paciente_id = ? AND medico_id = ?
         UNION ALL
         SELECT 1 AS found FROM turnos
         WHERE paciente_id = ? AND medico_id = ? AND estado NOT IN ('cancelado', 'ausente')
         LIMIT 1`,
        [patientId, doctorId, patientId, doctorId],
      )
      if (!careRelation[0]) {
        sendHttpError(res, 404, "NOT_FOUND", "No se encontró un vínculo de atención con ese paciente.")
        return
      }
    }
    const filters = parsePage(req, res, historyPageSchema)
    if (!filters) return
    if (user.roles.includes("patient")) {
      const page = await listConsultations(
        user,
        filters.page,
        filters.pageSize,
        filters.from,
        filters.to,
      )
      if (!page) {
        sendHttpError(res, 403, "FORBIDDEN", "No tenés permiso para consultar este historial.")
        return
      }
      res.json(page)
      return
    }
    const doctorId = await doctorIdForUser(user)
    if (!doctorId) {
      sendHttpError(res, 403, "FORBIDDEN", "El usuario no tiene un perfil profesional activo.")
      return
    }
    const [rows] = await pool.execute<ConsultationRow[]>(
      `${consultationSelect()}
       WHERE c.medico_id = ? AND c.paciente_id = ?
       ${filters.from ? "AND c.fecha_consulta >= ?" : ""}
       ${filters.to ? "AND c.fecha_consulta < ?" : ""}
       ORDER BY c.fecha_consulta DESC, c.id DESC
       LIMIT ? OFFSET ?`,
      [
        doctorId,
        patientId,
        ...(filters.from ? [`${filters.from} 00:00:00`] : []),
        ...(filters.to ? [`${filters.to} 00:00:00`] : []),
        filters.pageSize,
        (filters.page - 1) * filters.pageSize,
      ],
    )
    const [countRows] = await pool.execute<Array<RowDataPacket & { total: number }>>(
      `SELECT COUNT(*) AS total FROM consultas_medicas
       WHERE medico_id = ? AND paciente_id = ?
       ${filters.from ? "AND fecha_consulta >= ?" : ""}
       ${filters.to ? "AND fecha_consulta < ?" : ""}`,
      [
        doctorId,
        patientId,
        ...(filters.from ? [`${filters.from} 00:00:00`] : []),
        ...(filters.to ? [`${filters.to} 00:00:00`] : []),
      ],
    )
    res.json({
      items: rows.map(consultationResponse),
      page: filters.page,
      pageSize: filters.pageSize,
      totalItems: Number(countRows[0]?.total ?? 0),
    })
  }),
)

router.post(
  "/consultations/:consultationId/diagnoses",
  requireAuthentication,
  requireRoles("doctor"),
  requireCsrfToken,
  asyncRoute(async (req, res) => {
    const user = authenticatedUser(res)
    if (user.roles.includes("patient")) {
      sendHttpError(res, 403, "FORBIDDEN", "No tenés permiso para registrar diagnósticos.")
      return
    }
    const rawId = requestParameter(req, "consultationId")
    const parsed = diagnosisInputSchema.safeParse(req.body)
    if (!positiveIdSchema.safeParse(rawId).success || !parsed.success) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "Los datos del diagnóstico no son válidos.")
      return
    }
    const doctorId = await doctorIdForUser(user)
    if (!doctorId) {
      sendHttpError(res, 403, "FORBIDDEN", "El usuario no tiene un perfil profesional activo.")
      return
    }
    try {
      const diagnosisId = await withTransaction(async (connection) => {
        const consultation = await consultationForDoctor(connection, Number(rawId), doctorId)
        if (!consultation) return undefined
        const [diagnosis] = await connection.execute<ResultSetHeader>(
          `INSERT INTO patologias
            (paciente_id, nombre, codigo_cie10, fecha_diagnostico, estado, notas, diagnosticado_por)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            consultation.patientId,
            parsed.data.name,
            parsed.data.code ?? null,
            parsed.data.diagnosisDate,
            parsed.data.status ?? null,
            parsed.data.notes ?? null,
            doctorId,
          ],
        )
        await connection.execute(
          `INSERT INTO consultas_patologias (consulta_id, patologia_id, es_principal, notas)
           VALUES (?, ?, ?, ?)`,
          [Number(rawId), diagnosis.insertId, parsed.data.primary, parsed.data.notes ?? null],
        )
        return diagnosis.insertId
      })
      if (!diagnosisId) {
        sendHttpError(res, 404, "NOT_FOUND", "No se encontró la atención autorizada.")
        return
      }
      res.status(201).json({
        id: String(diagnosisId),
        name: parsed.data.name,
        ...(parsed.data.code === undefined ? {} : { code: parsed.data.code }),
        diagnosisDate: parsed.data.diagnosisDate,
        ...(parsed.data.status === undefined ? {} : { status: parsed.data.status }),
        ...(parsed.data.notes === undefined ? {} : { notes: parsed.data.notes }),
        primary: parsed.data.primary,
      })
    } catch (error) {
      if (!duplicateEntry(error)) throw error
      sendHttpError(res, 409, "DIAGNOSIS_CONFLICT", "El diagnóstico ya está asociado a esta atención.")
    }
  }),
)

router.post(
  "/consultations/:consultationId/treatments",
  requireAuthentication,
  requireRoles("doctor"),
  requireCsrfToken,
  asyncRoute(async (req, res) => {
    const user = authenticatedUser(res)
    if (user.roles.includes("patient")) {
      sendHttpError(res, 403, "FORBIDDEN", "No tenés permiso para registrar tratamientos.")
      return
    }
    const rawId = requestParameter(req, "consultationId")
    const parsed = treatmentInputSchema.safeParse(req.body)
    if (!positiveIdSchema.safeParse(rawId).success || !parsed.success) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "Los datos del tratamiento no son válidos.")
      return
    }
    const doctorId = await doctorIdForUser(user)
    if (!doctorId) {
      sendHttpError(res, 403, "FORBIDDEN", "El usuario no tiene un perfil profesional activo.")
      return
    }
    const treatmentId = await withTransaction(async (connection) => {
      if (!await consultationForDoctor(connection, Number(rawId), doctorId)) return undefined
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO tratamientos
          (consulta_id, nombre, descripcion, dosis, frecuencia, via_administracion,
           duracion_dias, fecha_inicio, fecha_fin, activo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(rawId),
          parsed.data.name,
          parsed.data.description ?? null,
          parsed.data.dose ?? null,
          parsed.data.frequency ?? null,
          parsed.data.route ?? null,
          parsed.data.durationDays ?? null,
          parsed.data.startDate,
          parsed.data.endDate ?? null,
          parsed.data.active,
        ],
      )
      return result.insertId
    })
    if (!treatmentId) {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró la atención autorizada.")
      return
    }
    res.status(201).json({
      id: String(treatmentId),
      name: parsed.data.name,
      ...(parsed.data.description === undefined ? {} : { description: parsed.data.description }),
      ...(parsed.data.dose === undefined ? {} : { dose: parsed.data.dose }),
      ...(parsed.data.frequency === undefined ? {} : { frequency: parsed.data.frequency }),
      ...(parsed.data.route === undefined ? {} : { route: parsed.data.route }),
      ...(parsed.data.durationDays === undefined ? {} : { durationDays: parsed.data.durationDays }),
      startDate: parsed.data.startDate,
      ...(parsed.data.endDate === undefined ? {} : { endDate: parsed.data.endDate }),
      active: parsed.data.active,
    })
  }),
)

router.post(
  "/consultations/:consultationId/prescriptions",
  requireAuthentication,
  requireRoles("doctor"),
  requireCsrfToken,
  asyncRoute(async (req, res) => {
    const user = authenticatedUser(res)
    if (user.roles.includes("patient")) {
      sendHttpError(res, 403, "FORBIDDEN", "No tenés permiso para emitir recetas.")
      return
    }
    const rawId = requestParameter(req, "consultationId")
    const parsed = prescriptionInputSchema.safeParse(req.body)
    if (!positiveIdSchema.safeParse(rawId).success || !parsed.success) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "Los datos de la receta no son válidos.")
      return
    }
    const doctorId = await doctorIdForUser(user)
    if (!doctorId) {
      sendHttpError(res, 403, "FORBIDDEN", "El usuario no tiene un perfil profesional activo.")
      return
    }
    const prescriptionId = await withTransaction(async (connection) => {
      if (!await consultationForDoctor(connection, Number(rawId), doctorId)) return undefined
      const [prescription] = await connection.execute<ResultSetHeader>(
        `INSERT INTO recetas
          (consulta_id, numero_receta, fecha_vencimiento, indicaciones_generales)
         VALUES (?, ?, ?, ?)`,
        [
          Number(rawId),
          `RX-${randomUUID()}`,
          parsed.data.validUntil,
          parsed.data.generalInstructions ?? null,
        ],
      )
      for (const item of parsed.data.items) {
        await connection.execute(
          `INSERT INTO receta_items
            (receta_id, medicamento_nombre, concentracion, dosis, frecuencia,
             duracion, cantidad_unidades, indicaciones)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            prescription.insertId,
            item.medicationName,
            item.concentration ?? null,
            item.dose,
            item.frequency,
            item.duration ?? null,
            item.quantityUnits ?? null,
            item.instructions ?? null,
          ],
        )
      }
      return prescription.insertId
    })
    if (!prescriptionId) {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró la atención autorizada.")
      return
    }
    const consultation = await findConsultation(Number(rawId))
    if (!consultation) throw new Error("Prescription consultation could not be reloaded")
    const detail = await detailResponse(consultation)
    const prescription = detail.prescriptions.find((item) => item.id === String(prescriptionId))
    if (!prescription) throw new Error("Created prescription could not be reloaded")
    res.status(201).json(prescription)
  }),
)

export default router
