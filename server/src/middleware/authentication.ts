import type { Request, RequestHandler } from "express"
import type { RowDataPacket } from "mysql2/promise"
import { asyncRoute } from "../auth/async-route"
import { sendHttpError } from "../auth/http-error"
import { hashSessionToken, normalizeRole, parseCookies, type UserRole } from "../auth/security"
import type { AuthenticatedUser } from "../auth/types"
import { pool } from "../db/pool"

const SESSION_COOKIE = "session"

type SessionUserRow = RowDataPacket & {
  userId: number
  email: string
  firstName: string
  lastName: string
  isActive: number
  personActive: number
  patientId: number | null
  roleName: string | null
  csrfSecret: string
}

declare global {
  namespace Express {
    interface Locals {
      auth?: AuthenticatedUser
      sessionToken?: string
      csrfSecret?: string
    }
  }
}

export async function resolveSession(token: string): Promise<{
  user: AuthenticatedUser
  csrfSecret: string
} | undefined> {
  const [rows] = await pool.execute<SessionUserRow[]>(
    `SELECT
       u.id AS userId,
       u.email,
       p.nombre AS firstName,
       p.apellido AS lastName,
       u.is_active AS isActive,
       p.activo AS personActive,
       pa.id AS patientId,
       r.nombre AS roleName,
       s.csrf_secret AS csrfSecret
     FROM auth_sessions s
     INNER JOIN users u ON u.id = s.user_id
     INNER JOIN personas p ON p.id = u.persona_id
     LEFT JOIN pacientes pa ON pa.persona_id = p.id
     LEFT JOIN usuarios_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3)`,
    [hashSessionToken(token)],
  )

  if (rows.length === 0 || !rows[0].isActive || !rows[0].personActive) return undefined

  const row = rows[0]
  const roles = [...new Set(rows.map((item) => item.roleName && normalizeRole(item.roleName)).filter(
    (role): role is UserRole => Boolean(role),
  ))]
  if (roles.length === 0) return undefined

  return {
    user: {
      id: String(row.userId),
      databaseId: row.userId,
      displayName: `${row.firstName} ${row.lastName}`.trim(),
      email: row.email,
      roles,
      ...(row.patientId === null ? {} : { patientId: String(row.patientId) }),
    },
    csrfSecret: row.csrfSecret,
  }
}

export const requireAuthentication: RequestHandler = (req, res, next) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
    sendHttpError(res, 401, "UNAUTHENTICATED", "Se requiere una sesión válida.")
    return
  }

  void resolveSession(token)
    .then((session) => {
      if (!session) {
        sendHttpError(res, 401, "UNAUTHENTICATED", "Se requiere una sesión válida.")
        return
      }

      res.locals.auth = session.user
      res.locals.sessionToken = token
      res.locals.csrfSecret = session.csrfSecret
      next()
    })
    .catch(next)
}

export function requireRoles(...allowedRoles: UserRole[]): RequestHandler {
  return (req: Request, res, next) => {
    const user = res.locals.auth
    if (!user) {
      sendHttpError(res, 401, "UNAUTHENTICATED", "Se requiere una sesión válida.")
      return
    }
    if (!allowedRoles.some((role) => user.roles.includes(role))) {
      sendHttpError(res, 403, "FORBIDDEN", "No tenés permiso para realizar esta operación.")
      return
    }
    next()
  }
}

export function requirePatientSelfOrRoles(
  patientIdParameter: string,
  ...allowedRoles: UserRole[]
): RequestHandler {
  return (req, res, next) => {
    const user = res.locals.auth
    if (!user) {
      sendHttpError(res, 401, "UNAUTHENTICATED", "Se requiere una sesión válida.")
      return
    }

    if (allowedRoles.some((role) => user.roles.includes(role))) {
      next()
      return
    }

    const requestedPatientId = req.params[patientIdParameter]
    if (
      user.roles.includes("patient")
      && typeof requestedPatientId === "string"
      && user.patientId === requestedPatientId
    ) {
      next()
      return
    }

    sendHttpError(res, 403, "FORBIDDEN", "No tenés permiso para acceder a este recurso.")
  }
}
