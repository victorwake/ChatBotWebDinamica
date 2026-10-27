import { Router, type Request, type Response } from "express"
import rateLimit from "express-rate-limit"
import type { RowDataPacket } from "mysql2/promise"
import { z } from "zod"
import { asyncRoute } from "../auth/async-route"
import { sendHttpError } from "../auth/http-error"
import {
  createCsrfToken,
  createOpaqueToken,
  csrfTokenMatches,
  hashSessionToken,
  normalizeRole,
  parseCookies,
  type UserRole,
} from "../auth/security"
import { hashPassword, verifyPassword } from "../auth/password"
import type { AuthenticatedUser } from "../auth/types"
import { pool, withTransaction } from "../db/pool"
import { logger } from "../logger"
import { requireAuthentication } from "../middleware/authentication"
import { requireCsrfToken } from "../middleware/csrf-protection"

const router = Router()
const SESSION_COOKIE = "session"
const PREAUTH_TTL_SECONDS = 15 * 60
const SESSION_TTL_SECONDS = 8 * 60 * 60

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
}).strict()

type SessionRow = RowDataPacket & {
  csrfSecret: string
  userId: number | null
}

type LoginUserRow = RowDataPacket & {
  id: number
  email: string
  passwordHash: string
  isActive: number
  personActive: number
  firstName: string
  lastName: string
  patientId: number | null
}

type RoleRow = RowDataPacket & { name: string }

type CookieOptions = {
  maxAgeSeconds: number
}

function setSessionCookie(res: Response, token: string, options: CookieOptions): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""
  res.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${options.maxAgeSeconds}${secure}`,
  )
}

function clearSessionCookie(res: Response): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""
  res.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`,
  )
}

async function findSession(token: string): Promise<SessionRow | undefined> {
  const [rows] = await pool.execute<SessionRow[]>(
    `SELECT csrf_secret AS csrfSecret, user_id AS userId
     FROM auth_sessions
     WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP(3)`,
    [hashSessionToken(token)],
  )
  return rows[0]
}

async function createPreAuthenticationSession(res: Response): Promise<{ token: string; secret: string }> {
  const token = createOpaqueToken()
  const secret = createOpaqueToken()
  await pool.execute(
    "DELETE FROM auth_sessions WHERE expires_at <= UTC_TIMESTAMP(3)",
  )
  await pool.execute(
    `INSERT INTO auth_sessions (user_id, token_hash, csrf_secret, expires_at)
     VALUES (NULL, ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND))`,
    [hashSessionToken(token), secret, PREAUTH_TTL_SECONDS],
  )
  setSessionCookie(res, token, { maxAgeSeconds: PREAUTH_TTL_SECONDS })
  return { token, secret }
}

const csrfRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => {
    sendHttpError(res, 429, "RATE_LIMITED", "Se alcanzó el límite de solicitudes. Esperá antes de volver a intentar.")
  },
})

router.get("/csrf", csrfRateLimit, asyncRoute(async (req, res) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  const existing = token && /^[a-f0-9]{64}$/i.test(token) ? await findSession(token) : undefined
  const context = existing
    ? { token: token!, secret: existing.csrfSecret }
    : await createPreAuthenticationSession(res)

  res.json({ csrfToken: createCsrfToken(context.secret, context.token) })
}))

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => {
    sendHttpError(res, 429, "RATE_LIMITED", "Se alcanzó el límite de intentos. Esperá antes de volver a intentar.")
  },
})

router.post("/login", loginRateLimit, asyncRoute(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    sendHttpError(res, 400, "BAD_REQUEST", "Ingresá un email y una contraseña válidos.")
    return
  }

  const sessionToken = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  if (!sessionToken || !/^[a-f0-9]{64}$/i.test(sessionToken)) {
    sendHttpError(res, 403, "CSRF_TOKEN_INVALID", "Obtené un token CSRF antes de iniciar sesión.")
    return
  }

  const preAuthenticationSession = await findSession(sessionToken)
  if (
    !preAuthenticationSession ||
    preAuthenticationSession.userId !== null ||
    !csrfTokenMatches(preAuthenticationSession.csrfSecret, sessionToken, req.get("X-CSRF-Token"))
  ) {
    sendHttpError(res, 403, "CSRF_TOKEN_INVALID", "El token CSRF falta o no es válido.")
    return
  }

  const [users] = await pool.execute<LoginUserRow[]>(
    `SELECT
       u.id,
       u.email,
       u.password_hash AS passwordHash,
       u.is_active AS isActive,
       p.activo AS personActive,
       p.nombre AS firstName,
       p.apellido AS lastName,
       pa.id AS patientId
     FROM users u
     INNER JOIN personas p ON p.id = u.persona_id
     LEFT JOIN pacientes pa ON pa.persona_id = p.id
     WHERE u.email = ?
     LIMIT 1`,
    [parsed.data.email.trim()],
  )
  const account = users[0]
  const passwordResult = await verifyPassword(parsed.data.password, account?.passwordHash)
  if (!account || !passwordResult.valid || !account.isActive || !account.personActive) {
    sendHttpError(res, 401, "INVALID_CREDENTIALS", "Las credenciales no son válidas.")
    return
  }

  const [roleRows] = await pool.execute<RoleRow[]>(
    `SELECT r.nombre AS name
     FROM usuarios_roles ur
     INNER JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ?
     ORDER BY r.nombre`,
    [account.id],
  )
  const roles = [...new Set(roleRows.map(({ name }) => normalizeRole(name)).filter(
    (role): role is UserRole => Boolean(role),
  ))]
  if (roles.length === 0) {
    sendHttpError(res, 401, "INVALID_CREDENTIALS", "Las credenciales no son válidas.")
    return
  }

  const authToken = createOpaqueToken()
  const csrfSecret = createOpaqueToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000)
  const user: AuthenticatedUser = {
    id: String(account.id),
    databaseId: account.id,
    displayName: `${account.firstName} ${account.lastName}`.trim(),
    email: account.email,
    roles,
    ...(account.patientId === null ? {} : { patientId: String(account.patientId) }),
  }

  await withTransaction(async (connection) => {
    if (passwordResult.needsRehash) {
      const newHash = await hashPassword(parsed.data.password)
      await connection.execute(
        "UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = ?",
        [newHash, account.id, account.passwordHash],
      )
    }
    await connection.execute(
      "UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?",
      [account.id],
    )
    await connection.execute(
      "DELETE FROM auth_sessions WHERE token_hash = ?",
      [hashSessionToken(sessionToken)],
    )
    await connection.execute(
      `INSERT INTO auth_sessions (user_id, token_hash, csrf_secret, expires_at)
       VALUES (?, ?, ?, ?)`,
      [account.id, hashSessionToken(authToken), csrfSecret, expiresAt],
    )
  })

  setSessionCookie(res, authToken, { maxAgeSeconds: SESSION_TTL_SECONDS })
  logger.info("Inicio de sesión completado", { userId: user.id, roles: roles.join(",") })
  res.status(200).json({
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    roles: user.roles,
    ...(user.patientId ? { patientId: user.patientId } : {}),
  })
}))

router.get("/me", requireAuthentication, (_req: Request, res: Response) => {
  const user = res.locals.auth
  if (!user) {
    sendHttpError(res, 401, "UNAUTHENTICATED", "Se requiere una sesión válida.")
    return
  }

  res.json({
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    roles: user.roles,
    ...(user.patientId ? { patientId: user.patientId } : {}),
  })
})

router.post(
  "/logout",
  requireAuthentication,
  requireCsrfToken,
  asyncRoute(async (_req, res) => {
    const token = res.locals.sessionToken
    if (!token) {
      sendHttpError(res, 401, "UNAUTHENTICATED", "Se requiere una sesión válida.")
      return
    }

    await pool.execute("DELETE FROM auth_sessions WHERE token_hash = ?", [hashSessionToken(token)])
    clearSessionCookie(res)
    res.status(204).end()
  }),
)

export default router
