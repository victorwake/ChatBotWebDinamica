import { Router } from "express"
import type { RowDataPacket } from "mysql2/promise"
import { z } from "zod"
import { asyncRoute } from "../auth/async-route"
import { sendHttpError } from "../auth/http-error"
import { requireAuthentication } from "../middleware/authentication"
import { pool } from "../db/pool"

const router = Router()

type SpecialtyRow = RowDataPacket & {
  id: number
  name: string
}

type DoctorRow = RowDataPacket & {
  id: number
  firstName: string
  lastName: string
  specialtyId: number
  specialtyName: string
}

router.get(
  "/specialties",
  requireAuthentication,
  asyncRoute(async (_req, res) => {
    const [rows] = await pool.execute<SpecialtyRow[]>(
      `SELECT id, nombre AS name
       FROM especialidades
       WHERE activa = TRUE
       ORDER BY nombre, id`,
    )
    res.json(rows.map((row) => ({ id: String(row.id), name: row.name })))
  }),
)

router.get(
  "/doctors",
  requireAuthentication,
  asyncRoute(async (req, res) => {
    const parsed = z.object({
      specialtyId: z.string().regex(/^\d+$/).optional(),
    }).safeParse(req.query)
    if (!parsed.success) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "El filtro de especialidad no es válido.")
      return
    }

    const specialtyFilter = parsed.data.specialtyId ? "AND m.especialidad_id = ?" : ""
    const parameters = parsed.data.specialtyId ? [Number(parsed.data.specialtyId)] : []
    const [rows] = await pool.execute<DoctorRow[]>(
      `SELECT
         m.id,
         p.nombre AS firstName,
         p.apellido AS lastName,
         e.id AS specialtyId,
         e.nombre AS specialtyName
       FROM medicos m
       INNER JOIN personas p ON p.id = m.persona_id
       INNER JOIN especialidades e ON e.id = m.especialidad_id
       WHERE m.activo = TRUE AND p.activo = TRUE AND e.activa = TRUE ${specialtyFilter}
       ORDER BY p.apellido, p.nombre, m.id`,
      parameters,
    )
    res.json(rows.map((row) => ({
      id: String(row.id),
      displayName: `${row.firstName} ${row.lastName}`.trim(),
      specialty: {
        id: String(row.specialtyId),
        name: row.specialtyName,
      },
    })))
  }),
)

export default router
