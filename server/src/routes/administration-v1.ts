import { Router, type Request } from "express"
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise"
import { z } from "zod"
import { normalizeRole, type UserRole } from "../auth/security"
import { asyncRoute } from "../auth/async-route"
import { sendHttpError } from "../auth/http-error"
import { requireAuthentication, requireRoles } from "../middleware/authentication"
import { requireCsrfToken } from "../middleware/csrf-protection"
import { pool, withTransaction } from "../db/pool"

const router = Router()
const roleDatabaseNames: Record<UserRole, string> = {
  patient: "paciente",
  doctor: "medico",
  administrative: "administrativo",
  administrator: "administrador",
}
const contractRoles = ["patient", "doctor", "administrative", "administrator"] as const satisfies readonly UserRole[]

type AccountRow = RowDataPacket & {
  id: number
  firstName: string
  lastName: string
  email: string
  active: number
}

type AccountStateRow = RowDataPacket & {
  id: number
  active: number
  personActive: number
  firstName: string
  lastName: string
  email: string
}

type AuditRow = RowDataPacket & {
  id: number
  actorId: number
  action: string
  resourceId: number | null
  occurredAt: Date | string
}

type AccountUpdateResult = {
  id: number
  firstName: string
  lastName: string
  email: string
  active: number
  roles: UserRole[]
} | {
  conflict: "ACTOR_NO_LONGER_ADMIN" | "SELF_ADMIN_CHANGE" | "LAST_ACTIVE_ADMINISTRATOR"
}

function pathUserId(req: Request): number | undefined {
  const value = req.params.userId
  if (typeof value !== "string" || !/^[1-9]\d{0,9}$/.test(value)) return undefined
  const id = Number(value)
  return Number.isSafeInteger(id) && id <= 2_147_483_647 ? id : undefined
}

function accountResponse(row: Pick<AccountRow, "id" | "firstName" | "lastName" | "email" | "active">, roles: UserRole[]) {
  return {
    id: String(row.id),
    displayName: `${row.firstName} ${row.lastName}`.trim(),
    email: row.email,
    active: Boolean(row.active),
    roles,
  }
}

function roleValues(roleNames: string[]): UserRole[] {
  return [...new Set(roleNames.flatMap((name) => {
    const role = normalizeRole(name)
    return role ? [role] : []
  }))].sort()
}

async function loadRoles(userIds: number[]): Promise<Map<number, UserRole[]>> {
  if (userIds.length === 0) return new Map()
  const placeholders = userIds.map(() => "?").join(", ")
  const [rows] = await pool.execute<Array<RowDataPacket & { userId: number; roleName: string }>>(
    `SELECT ur.user_id AS userId, r.nombre AS roleName
     FROM usuarios_roles ur
     INNER JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id IN (${placeholders})
     ORDER BY r.nombre`,
    userIds,
  )
  const rolesByUser = new Map<number, string[]>()
  for (const row of rows) {
    const names = rolesByUser.get(row.userId) ?? []
    names.push(row.roleName)
    rolesByUser.set(row.userId, names)
  }
  return new Map([...rolesByUser].map(([userId, names]) => [userId, roleValues(names)]))
}

const listAccountsQuery = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(100).optional(),
  role: z.enum(contractRoles).optional(),
  active: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
}).strict()

router.get(
  "/users",
  requireAuthentication,
  requireRoles("administrator"),
  asyncRoute(async (req, res) => {
    const parsed = listAccountsQuery.safeParse(req.query)
    if (!parsed.success) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "Los filtros o la paginación no son válidos.")
      return
    }

    const { page, pageSize, search, role, active } = parsed.data
    const conditions: string[] = []
    const values: Array<string | number | boolean> = []
    if (search) {
      conditions.push("(p.nombre LIKE ? OR p.apellido LIKE ? OR u.email LIKE ?)")
      values.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }
    if (role) {
      conditions.push(
        "EXISTS (SELECT 1 FROM usuarios_roles filter_ur INNER JOIN roles filter_r ON filter_r.id = filter_ur.role_id WHERE filter_ur.user_id = u.id AND filter_r.nombre = ?)",
      )
      values.push(roleDatabaseNames[role])
    }
    if (active !== undefined) {
      conditions.push("u.is_active = ?")
      values.push(active)
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
    const [rows] = await pool.execute<AccountRow[]>(
      `SELECT u.id, p.nombre AS firstName, p.apellido AS lastName,
         u.email, u.is_active AS active
       FROM users u
       INNER JOIN personas p ON p.id = u.persona_id
       ${where}
       ORDER BY p.apellido, p.nombre, u.id
       LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize],
    )
    const [countRows] = await pool.execute<Array<RowDataPacket & { total: number }>>(
      `SELECT COUNT(*) AS total
       FROM users u
       INNER JOIN personas p ON p.id = u.persona_id
       ${where}`,
      values,
    )
    const rolesByUser = await loadRoles(rows.map((row) => row.id))
    res.json({
      items: rows.map((row) => accountResponse(row, rolesByUser.get(row.id) ?? [])),
      page,
      pageSize,
      totalItems: Number(countRows[0]?.total ?? 0),
    })
  }),
)

router.get(
  "/users/:userId",
  requireAuthentication,
  requireRoles("administrator"),
  asyncRoute(async (req, res) => {
    const id = pathUserId(req)
    if (id === undefined) {
      sendHttpError(res, 404, "NOT_FOUND", "La cuenta solicitada no existe.")
      return
    }

    const [rows] = await pool.execute<AccountRow[]>(
      `SELECT u.id, p.nombre AS firstName, p.apellido AS lastName,
         u.email, u.is_active AS active
       FROM users u
       INNER JOIN personas p ON p.id = u.persona_id
       WHERE u.id = ?
       LIMIT 1`,
      [id],
    )
    const row = rows[0]
    if (!row) {
      sendHttpError(res, 404, "NOT_FOUND", "La cuenta solicitada no existe.")
      return
    }
    const rolesByUser = await loadRoles([id])
    res.json(accountResponse(row, rolesByUser.get(id) ?? []))
  }),
)

const updateAccountSchema = z.object({
  active: z.boolean().optional(),
  roles: z.array(z.enum(contractRoles)).min(1).max(contractRoles.length).optional(),
}).strict()
  .refine((value) => Object.keys(value).length > 0, "Debe indicarse al menos un cambio")
  .refine((value) => !value.roles || new Set(value.roles).size === value.roles.length, "Los roles no pueden repetirse")

router.patch(
  "/users/:userId",
  requireAuthentication,
  requireRoles("administrator"),
  requireCsrfToken,
  asyncRoute(async (req, res) => {
    const id = pathUserId(req)
    if (id === undefined) {
      sendHttpError(res, 404, "NOT_FOUND", "La cuenta solicitada no existe.")
      return
    }
    const parsed = updateAccountSchema.safeParse(req.body)
    if (!parsed.success) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "Los cambios de cuenta no son válidos.")
      return
    }

    const actor = res.locals.auth
    if (!actor) {
      sendHttpError(res, 401, "UNAUTHENTICATED", "Se requiere una sesión válida.")
      return
    }
    const updated = await withTransaction<AccountUpdateResult | undefined>(async (connection) => {
      const [administratorRoleRows] = await connection.execute<Array<RowDataPacket & { id: number }>>(
        "SELECT id FROM roles WHERE nombre = 'administrador' FOR UPDATE",
      )
      if (!administratorRoleRows[0]) throw new Error("The administrator role is not provisioned")

      const [actorRows] = await connection.execute<Array<RowDataPacket & {
        active: number
        personActive: number
        hasAdministratorRole: number
      }>>(
        `SELECT u.is_active AS active, p.activo AS personActive,
           EXISTS (
             SELECT 1 FROM usuarios_roles actor_ur
             WHERE actor_ur.user_id = u.id AND actor_ur.role_id = ?
           ) AS hasAdministratorRole
         FROM users u
         INNER JOIN personas p ON p.id = u.persona_id
         WHERE u.id = ?
         FOR UPDATE`,
        [administratorRoleRows[0].id, actor.databaseId],
      )
      const currentActor = actorRows[0]
      if (!currentActor?.active || !currentActor.personActive || !currentActor.hasAdministratorRole) {
        return { conflict: "ACTOR_NO_LONGER_ADMIN" as const }
      }

      const [accountRows] = await connection.execute<AccountStateRow[]>(
        `SELECT u.id, u.is_active AS active, p.activo AS personActive,
           p.nombre AS firstName, p.apellido AS lastName, u.email
         FROM users u
         INNER JOIN personas p ON p.id = u.persona_id
         WHERE u.id = ?
         FOR UPDATE`,
        [id],
      )
      const account = accountRows[0]
      if (!account) return undefined

      const [currentRoleRows] = await connection.execute<Array<RowDataPacket & { name: string }>>(
        `SELECT r.nombre AS name
         FROM usuarios_roles ur
         INNER JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = ?
         ORDER BY r.nombre`,
        [id],
      )
      const previousRoles = roleValues(currentRoleRows.map((row) => row.name))
      const nextRoles = parsed.data.roles ? [...parsed.data.roles].sort() : previousRoles
      const previousActive = Boolean(account.active)
      const nextActive = parsed.data.active ?? previousActive
      const wasActiveAdministrator =
        previousActive && Boolean(account.personActive) && previousRoles.includes("administrator")
      const remainsActiveAdministrator =
        nextActive && Boolean(account.personActive) && nextRoles.includes("administrator")

      if (
        id === actor.databaseId
        && (!nextActive || !nextRoles.includes("administrator"))
      ) {
        return { conflict: "SELF_ADMIN_CHANGE" as const }
      }

      if (wasActiveAdministrator && !remainsActiveAdministrator) {
        const [countRows] = await connection.execute<Array<RowDataPacket & { total: number }>>(
          `SELECT COUNT(DISTINCT u.id) AS total
           FROM users u
           INNER JOIN personas p ON p.id = u.persona_id
           INNER JOIN usuarios_roles ur ON ur.user_id = u.id
           INNER JOIN roles r ON r.id = ur.role_id
           WHERE u.is_active = TRUE AND p.activo = TRUE AND r.nombre = 'administrador'`,
        )
        if (Number(countRows[0]?.total ?? 0) <= 1) {
          return { conflict: "LAST_ACTIVE_ADMINISTRATOR" as const }
        }
      }

      const rolesChanged = JSON.stringify(previousRoles) !== JSON.stringify(nextRoles)
      const changed = previousActive !== nextActive || rolesChanged
      if (!changed) {
        return {
          id,
          firstName: account.firstName,
          lastName: account.lastName,
          email: account.email,
          active: Number(previousActive),
          roles: previousRoles,
        }
      }

      if (previousActive !== nextActive) {
        await connection.execute("UPDATE users SET is_active = ? WHERE id = ?", [nextActive, id])
      }
      if (rolesChanged) {
        const databaseRoleNames = nextRoles.map((roleName) => roleDatabaseNames[roleName])
        const placeholders = databaseRoleNames.map(() => "?").join(", ")
        const [roleRows] = await connection.execute<Array<RowDataPacket & { id: number; name: string }>>(
          `SELECT id, nombre AS name FROM roles WHERE nombre IN (${placeholders})`,
          databaseRoleNames,
        )
        if (roleRows.length !== databaseRoleNames.length) {
          throw new Error("One or more account roles are not provisioned")
        }
        await connection.execute("DELETE FROM usuarios_roles WHERE user_id = ?", [id])
        for (const roleRow of roleRows) {
          await connection.execute(
            "INSERT INTO usuarios_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)",
            [id, roleRow.id, actor.databaseId],
          )
        }
      }

      await connection.execute<ResultSetHeader>(
        `INSERT INTO auditoria
          (usuario_id, accion, tabla_afectada, registro_id, datos_anteriores, datos_nuevos)
         VALUES (?, 'account.updated', 'users', ?, ?, ?)`,
        [
          actor.databaseId,
          id,
          JSON.stringify({ active: previousActive, roles: previousRoles }),
          JSON.stringify({ active: nextActive, roles: nextRoles }),
        ],
      )

      return {
        id,
        firstName: account.firstName,
        lastName: account.lastName,
        email: account.email,
        active: Number(nextActive),
        roles: nextRoles,
      }
    })

    if (!updated) {
      sendHttpError(res, 404, "NOT_FOUND", "La cuenta solicitada no existe.")
      return
    }
    if ("conflict" in updated) {
      if (updated.conflict === "ACTOR_NO_LONGER_ADMIN") {
        sendHttpError(res, 403, "FORBIDDEN", "La cuenta ya no tiene permisos de administración.")
        return
      }
      const message = updated.conflict === "SELF_ADMIN_CHANGE"
        ? "No podés desactivar tu cuenta ni quitarte el rol de administrador."
        : "No se puede dejar al sistema sin una cuenta administradora activa."
      sendHttpError(res, 409, updated.conflict, message)
      return
    }
    res.json(accountResponse(updated, updated.roles))
  }),
)

const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  actorId: z.string().regex(/^[1-9]\d{0,9}$/).optional(),
  action: z.string().trim().min(1).max(100).optional(),
  resourceId: z.string().regex(/^[1-9]\d{0,9}$/).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: "from no puede ser posterior a to",
})

router.get(
  "/audit-logs",
  requireAuthentication,
  requireRoles("administrator"),
  asyncRoute(async (req, res) => {
    const parsed = auditQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "Los filtros o la paginación no son válidos.")
      return
    }

    const { page, pageSize, actorId, action, resourceId, from, to } = parsed.data
    const conditions = ["tabla_afectada = 'users'"]
    const values: Array<string | number> = []
    if (actorId) {
      conditions.push("usuario_id = ?")
      values.push(Number(actorId))
    }
    if (action) {
      conditions.push("accion = ?")
      values.push(action)
    }
    if (resourceId) {
      conditions.push("registro_id = ?")
      values.push(Number(resourceId))
    }
    if (from) {
      conditions.push("fecha_hora >= CONCAT(?, ' 00:00:00')")
      values.push(from)
    }
    if (to) {
      conditions.push("fecha_hora < DATE_ADD(CONCAT(?, ' 00:00:00'), INTERVAL 1 DAY)")
      values.push(to)
    }
    const where = conditions.join(" AND ")
    const [rows] = await pool.execute<AuditRow[]>(
      `SELECT id, usuario_id AS actorId, accion AS action,
         registro_id AS resourceId, fecha_hora AS occurredAt
       FROM auditoria
       WHERE ${where}
       ORDER BY fecha_hora DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize],
    )
    const [countRows] = await pool.execute<Array<RowDataPacket & { total: number }>>(
      `SELECT COUNT(*) AS total FROM auditoria WHERE ${where}`,
      values,
    )
    res.json({
      items: rows.map((row) => ({
        id: String(row.id),
        actorId: String(row.actorId),
        action: row.action,
        resourceType: "user",
        ...(row.resourceId === null ? {} : { resourceId: String(row.resourceId) }),
        occurredAt: row.occurredAt instanceof Date
          ? row.occurredAt.toISOString()
          : new Date(row.occurredAt).toISOString(),
      })),
      page,
      pageSize,
      totalItems: Number(countRows[0]?.total ?? 0),
    })
  }),
)

export default router
