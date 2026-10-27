import { Router, type Request } from "express"
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise"
import { z } from "zod"
import { asyncRoute } from "../auth/async-route"
import { sendHttpError } from "../auth/http-error"
import { requireAuthentication, requirePatientSelfOrRoles, requireRoles } from "../middleware/authentication"
import { requireCsrfToken } from "../middleware/csrf-protection"
import { pool, withTransaction } from "../db/pool"

const router = Router()
const administrativeRoles = ["administrative", "administrator"] as const
const patientSummarySelect = `
  SELECT
    pa.id AS id,
    p.nombre AS firstName,
    p.apellido AS lastName,
    p.telefono AS phone
  FROM pacientes pa
  INNER JOIN personas p ON p.id = pa.persona_id
`

const createPatientSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  nationalId: z.string().trim().min(5).max(20),
  birthDate: z.string().date(),
  phone: z.string().trim().min(5).max(20),
  email: z.string().trim().email().max(254).optional(),
  address: z.string().trim().max(300).optional(),
}).strict()

const updatePatientSchema = z.object({
  phone: z.string().trim().min(5).max(20).optional(),
  email: z.string().trim().email().max(254).optional(),
  address: z.string().trim().max(300).optional(),
}).strict().refine((value) => Object.keys(value).length > 0)

const coverageInputSchema = z.object({
  providerId: z.string().regex(/^\d+$/),
  memberNumber: z.string().trim().min(1).max(50),
  relationship: z.enum(["titular", "beneficiario", "extension"]).optional(),
  holderNationalId: z.string().trim().max(20).optional(),
  holderRelationship: z.string().trim().max(50).optional(),
  primary: z.boolean().optional().default(false),
  validFrom: z.string().date(),
  validUntil: z.string().date().optional(),
  active: z.boolean().optional().default(true),
}).strict().refine((value) => !value.validUntil || value.validUntil >= value.validFrom, {
  message: "validUntil no puede ser anterior a validFrom",
})

type PatientRow = RowDataPacket & {
  id: number
  firstName: string
  lastName: string
  phone: string | null
  nationalId?: string
  birthDate?: Date | string | null
  email?: string | null
  address?: string | null
}

type CoverageRow = RowDataPacket & {
  id: number
  providerId: number
  providerName: string
  memberNumber: string
  relationship: "titular" | "beneficiario" | "extension" | null
  holderNationalId: string | null
  holderRelationship: string | null
  primary: number
  validFrom: Date | string
  validUntil: Date | string | null
  active: number
}

function dateOnly(value: Date | string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string") return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
}

function pathParameter(req: Request, name: string): string {
  const value = req.params[name]
  return typeof value === "string" ? value : ""
}

function patientResponse(row: PatientRow) {
  return {
    id: String(row.id),
    firstName: row.firstName,
    lastName: row.lastName,
    ...(row.phone === null ? {} : { phone: row.phone }),
    ...("nationalId" in row ? { nationalId: row.nationalId } : {}),
    ...("birthDate" in row && dateOnly(row.birthDate) ? { birthDate: dateOnly(row.birthDate) } : {}),
    ...(row.email === null || row.email === undefined ? {} : { email: row.email }),
    ...(row.address === null || row.address === undefined ? {} : { address: row.address }),
  }
}

function coverageResponse(row: CoverageRow) {
  return {
    id: String(row.id),
    providerId: String(row.providerId),
    providerName: row.providerName,
    memberNumber: row.memberNumber,
    ...(row.relationship === null ? {} : { relationship: row.relationship }),
    ...(row.holderNationalId === null ? {} : { holderNationalId: row.holderNationalId }),
    ...(row.holderRelationship === null ? {} : { holderRelationship: row.holderRelationship }),
    primary: Boolean(row.primary),
    validFrom: dateOnly(row.validFrom),
    ...(dateOnly(row.validUntil) ? { validUntil: dateOnly(row.validUntil) } : {}),
    active: Boolean(row.active),
  }
}

async function findPatient(patientId: string): Promise<PatientRow | undefined> {
  if (!/^\d+$/.test(patientId)) return undefined
  const [rows] = await pool.execute<PatientRow[]>(
    `SELECT
       pa.id AS id,
       p.nombre AS firstName,
       p.apellido AS lastName,
       p.telefono AS phone,
       p.dni AS nationalId,
       p.fecha_nacimiento AS birthDate,
       p.email_contacto AS email,
       p.direccion AS address
     FROM pacientes pa
     INNER JOIN personas p ON p.id = pa.persona_id
     WHERE pa.id = ? AND pa.activo = TRUE AND p.activo = TRUE
     LIMIT 1`,
    [Number(patientId)],
  )
  return rows[0]
}

async function findCoverage(patientId: number, coverageId: string): Promise<CoverageRow | undefined> {
  if (!/^\d+$/.test(coverageId)) return undefined
  const [rows] = await pool.execute<CoverageRow[]>(
    `SELECT
       pc.id,
       pc.obra_social_id AS providerId,
       os.nombre AS providerName,
       pc.numero_afiliado AS memberNumber,
       pc.tipo_relacion AS relationship,
       pc.titular_dni AS holderNationalId,
       pc.vinculo_titular AS holderRelationship,
       pc.principal AS \`primary\`,
       pc.fecha_vigencia_desde AS validFrom,
       pc.fecha_vigencia_hasta AS validUntil,
       pc.activa AS active
     FROM pacientes_obras_sociales pc
     INNER JOIN obras_sociales os ON os.id = pc.obra_social_id
     WHERE pc.paciente_id = ? AND pc.id = ?
     LIMIT 1`,
    [patientId, Number(coverageId)],
  )
  return rows[0]
}

function isDuplicateEntry(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY"
}

router.get(
  "/",
  requireAuthentication,
  requireRoles(...administrativeRoles),
  asyncRoute(async (req, res) => {
    const parsedFilters = z.object({
      page: z.coerce.number().int().min(1).max(1_000_000).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
      search: z.string().trim().min(1).max(100).optional(),
    }).safeParse(req.query)
    if (!parsedFilters.success) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "Los filtros o la paginación no son válidos.")
      return
    }

    const { page, pageSize, search } = parsedFilters.data
    const searchClause = search ? "AND (p.nombre LIKE ? OR p.apellido LIKE ? OR p.dni LIKE ?)" : ""
    const searchValues = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : []
    const [rows] = await pool.execute<PatientRow[]>(
      `${patientSummarySelect}
       WHERE pa.activo = TRUE AND p.activo = TRUE ${searchClause}
       ORDER BY p.apellido, p.nombre, pa.id
       LIMIT ? OFFSET ?`,
      [...searchValues, pageSize, (page - 1) * pageSize],
    )
    const [countRows] = await pool.execute<Array<RowDataPacket & { total: number }>>(
      `SELECT COUNT(*) AS total
       FROM pacientes pa
       INNER JOIN personas p ON p.id = pa.persona_id
       WHERE pa.activo = TRUE AND p.activo = TRUE ${searchClause}`,
      searchValues,
    )
    res.json({
      items: rows.map(patientResponse),
      page,
      pageSize,
      totalItems: Number(countRows[0]?.total ?? 0),
    })
  }),
)

router.post(
  "/",
  requireAuthentication,
  requireRoles(...administrativeRoles),
  requireCsrfToken,
  asyncRoute(async (req, res) => {
    const parsed = createPatientSchema.safeParse(req.body)
    if (!parsed.success) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "Los datos del paciente no son válidos.")
      return
    }

    try {
      const patientId = await withTransaction(async (connection) => {
        const [person] = await connection.execute<ResultSetHeader>(
          `INSERT INTO personas
            (nombre, apellido, dni, fecha_nacimiento, telefono, direccion, email_contacto, activo)
           VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
          [
            parsed.data.firstName,
            parsed.data.lastName,
            parsed.data.nationalId,
            parsed.data.birthDate,
            parsed.data.phone,
            parsed.data.address ?? null,
            parsed.data.email ?? null,
          ],
        )
        const [patient] = await connection.execute<ResultSetHeader>(
          "INSERT INTO pacientes (persona_id, activo) VALUES (?, TRUE)",
          [person.insertId],
        )
        return patient.insertId
      })

      const patient = await findPatient(String(patientId))
      if (!patient) {
        sendHttpError(res, 500, "INTERNAL_ERROR", "No se pudo recuperar el paciente creado.")
        return
      }
      res.status(201).location(`/api/v1/patients/${patientId}`).json(patientResponse(patient))
    } catch (error) {
      if (!isDuplicateEntry(error)) throw error
      sendHttpError(res, 409, "RESOURCE_CONFLICT", "Ya existe un paciente con esos datos identificatorios.")
    }
  }),
)

router.get(
  "/:patientId",
  requireAuthentication,
  requirePatientSelfOrRoles("patientId", ...administrativeRoles),
  asyncRoute(async (req, res) => {
    const patientId = pathParameter(req, "patientId")
    const patient = await findPatient(patientId)
    if (!patient) {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró el paciente solicitado.")
      return
    }
    res.json(patientResponse(patient))
  }),
)

router.patch(
  "/:patientId",
  requireAuthentication,
  requirePatientSelfOrRoles("patientId", ...administrativeRoles),
  requireCsrfToken,
  asyncRoute(async (req, res) => {
    const patientId = pathParameter(req, "patientId")
    const parsed = updatePatientSchema.safeParse(req.body)
    if (!parsed.success) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "Los datos del paciente no son válidos.")
      return
    }

    const current = await findPatient(patientId)
    if (!current) {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró el paciente solicitado.")
      return
    }

    const user = res.locals.auth
    if (user?.roles.includes("patient") && !administrativeRoles.some((role) => user.roles.includes(role))) {
      const forbiddenField = Object.keys(parsed.data).some((field) => !["phone", "email", "address"].includes(field))
      if (forbiddenField) {
        sendHttpError(res, 403, "FORBIDDEN", "No tenés permiso para modificar esos datos.")
        return
      }
    }

    try {
      await pool.execute(
        `UPDATE personas p
         INNER JOIN pacientes pa ON pa.persona_id = p.id
         SET p.telefono = ?, p.email_contacto = ?, p.direccion = ?
         WHERE pa.id = ?`,
        [
          parsed.data.phone ?? current.phone,
          parsed.data.email ?? current.email ?? null,
          parsed.data.address ?? current.address ?? null,
          Number(patientId),
        ],
      )
    } catch (error) {
      if (!isDuplicateEntry(error)) throw error
      sendHttpError(res, 409, "RESOURCE_CONFLICT", "El email indicado ya está asociado a otro registro.")
      return
    }

    const updated = await findPatient(patientId)
    if (!updated) {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró el paciente solicitado.")
      return
    }
    res.json(patientResponse(updated))
  }),
)

router.get(
  "/:patientId/coverage",
  requireAuthentication,
  requirePatientSelfOrRoles("patientId", ...administrativeRoles),
  asyncRoute(async (req, res) => {
    const patient = await findPatient(pathParameter(req, "patientId"))
    if (!patient) {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró el paciente solicitado.")
      return
    }

    const [rows] = await pool.execute<CoverageRow[]>(
      `SELECT
         pc.id,
         pc.obra_social_id AS providerId,
         os.nombre AS providerName,
         pc.numero_afiliado AS memberNumber,
         pc.tipo_relacion AS relationship,
         pc.titular_dni AS holderNationalId,
         pc.vinculo_titular AS holderRelationship,
         pc.principal AS \`primary\`,
         pc.fecha_vigencia_desde AS validFrom,
         pc.fecha_vigencia_hasta AS validUntil,
         pc.activa AS active
       FROM pacientes_obras_sociales pc
       INNER JOIN obras_sociales os ON os.id = pc.obra_social_id
       WHERE pc.paciente_id = ?
       ORDER BY pc.principal DESC, pc.fecha_vigencia_desde DESC, pc.id DESC`,
      [patient.id],
    )
    res.json(rows.map(coverageResponse))
  }),
)

router.post(
  "/:patientId/coverage",
  requireAuthentication,
  requirePatientSelfOrRoles("patientId", ...administrativeRoles),
  requireCsrfToken,
  asyncRoute(async (req, res) => {
    const patientId = pathParameter(req, "patientId")
    const parsed = coverageInputSchema.safeParse(req.body)
    if (!parsed.success) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "Los datos de la cobertura no son válidos.")
      return
    }
    const patient = await findPatient(patientId)
    if (!patient) {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró el paciente solicitado.")
      return
    }

    const [providerRows] = await pool.execute<Array<RowDataPacket & { id: number }>>(
      "SELECT id FROM obras_sociales WHERE id = ? AND activa = TRUE LIMIT 1",
      [Number(parsed.data.providerId)],
    )
    if (!providerRows[0]) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "La cobertura indicada no está disponible.")
      return
    }

    try {
      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO pacientes_obras_sociales
          (paciente_id, obra_social_id, numero_afiliado, tipo_relacion, titular_dni,
           vinculo_titular, principal, fecha_vigencia_desde, fecha_vigencia_hasta, activa)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          patient.id,
          Number(parsed.data.providerId),
          parsed.data.memberNumber,
          parsed.data.relationship ?? null,
          parsed.data.holderNationalId ?? null,
          parsed.data.holderRelationship ?? null,
          parsed.data.primary,
          parsed.data.validFrom,
          parsed.data.validUntil ?? null,
          parsed.data.active,
        ],
      )
      const coverage = await findCoverage(patient.id, String(result.insertId))
      if (!coverage) {
        sendHttpError(res, 500, "INTERNAL_ERROR", "No se pudo recuperar la cobertura creada.")
        return
      }
      res.status(201).json(coverageResponse(coverage))
    } catch (error) {
      if (!isDuplicateEntry(error)) throw error
      sendHttpError(res, 409, "RESOURCE_CONFLICT", "La cobertura duplicaría una afiliación o cobertura principal.")
    }
  }),
)

router.put(
  "/:patientId/coverage/:coverageId",
  requireAuthentication,
  requirePatientSelfOrRoles("patientId", ...administrativeRoles),
  requireCsrfToken,
  asyncRoute(async (req, res) => {
    const patientId = pathParameter(req, "patientId")
    const coverageId = pathParameter(req, "coverageId")
    const parsed = coverageInputSchema.safeParse(req.body)
    if (!parsed.success) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "Los datos de la cobertura no son válidos.")
      return
    }
    const patient = await findPatient(patientId)
    if (!patient) {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró el paciente solicitado.")
      return
    }
    const existing = await findCoverage(patient.id, coverageId)
    if (!existing) {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró la cobertura solicitada.")
      return
    }
    const [providerRows] = await pool.execute<Array<RowDataPacket & { id: number }>>(
      "SELECT id FROM obras_sociales WHERE id = ? AND activa = TRUE LIMIT 1",
      [Number(parsed.data.providerId)],
    )
    if (!providerRows[0]) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "La cobertura indicada no está disponible.")
      return
    }

    try {
      await pool.execute(
        `UPDATE pacientes_obras_sociales SET
           obra_social_id = ?, numero_afiliado = ?, tipo_relacion = ?, titular_dni = ?,
           vinculo_titular = ?, principal = ?, fecha_vigencia_desde = ?,
           fecha_vigencia_hasta = ?, activa = ?
         WHERE id = ? AND paciente_id = ?`,
        [
          Number(parsed.data.providerId),
          parsed.data.memberNumber,
          parsed.data.relationship ?? null,
          parsed.data.holderNationalId ?? null,
          parsed.data.holderRelationship ?? null,
          parsed.data.primary,
          parsed.data.validFrom,
          parsed.data.validUntil ?? null,
          parsed.data.active,
          existing.id,
          patient.id,
        ],
      )
    } catch (error) {
      if (!isDuplicateEntry(error)) throw error
      sendHttpError(res, 409, "RESOURCE_CONFLICT", "La cobertura duplicaría una afiliación o cobertura principal.")
      return
    }
    const updated = await findCoverage(patient.id, coverageId)
    if (!updated) {
      sendHttpError(res, 404, "NOT_FOUND", "No se encontró la cobertura solicitada.")
      return
    }
    res.json(coverageResponse(updated))
  }),
)

export default router
