import { Router, type Request, type Response } from "express"
import rateLimit from "express-rate-limit"
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise"
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
import {
  assertVerificationEmailConfigured,
  sendPatientInvitationNotice,
  sendRegistrationNotice,
  VerificationEmailError,
} from "../auth/verification-email"
import { hashPassword, verifyPassword } from "../auth/password"
import type { AuthenticatedUser } from "../auth/types"
import { pool, withTransaction } from "../db/pool"
import { logger } from "../logger"
import { requireAuthentication, requireRoles } from "../middleware/authentication"
import { requireCsrfToken } from "../middleware/csrf-protection"

const router = Router()
const SESSION_COOKIE = "session"
const PREAUTH_TTL_SECONDS = 15 * 60
const SESSION_TTL_SECONDS = 8 * 60 * 60

function isSafeRegistrationContinuation(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) {
    return false
  }

  let url: URL
  try {
    url = new URL(value, "https://app.invalid")
  } catch {
    return false
  }

  if (url.origin !== "https://app.invalid" || url.pathname !== "/appointments/availability" || url.hash) {
    return false
  }

  const allowedParameters = new Set(["from", "to", "doctorId", "specialtyId", "page", "slotId"])
  const seenParameters = new Set<string>()
  for (const [key, parameter] of url.searchParams) {
    if (!allowedParameters.has(key) || seenParameters.has(key)) return false
    seenParameters.add(key)
    if (["doctorId", "specialtyId"].includes(key) && !/^\d+$/.test(parameter)) return false
    if (key === "page" && (!/^\d+$/.test(parameter) || Number(parameter) < 1)) return false
    if (key === "slotId" && !/^[A-Za-z0-9_-]{1,200}$/.test(parameter)) return false
    if (["from", "to"].includes(key) && !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(parameter)) return false
  }

  return true
}

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
}).strict()

const registrationSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  nationalId: z.string().trim().min(5).max(20).regex(/^[0-9 .-]+$/),
  birthDate: z.string().date(),
  phone: z.string().trim().min(5).max(20),
  email: z.string().trim().email().max(254),
  address: z.string().trim().max(300).optional(),
  password: z.string().min(12).max(256),
  continueTo: z.string().max(800).refine(isSafeRegistrationContinuation).optional(),
}).strict().refine(
  ({ nationalId }) => {
    const normalized = nationalId.replace(/\D/g, "")
    return normalized.length >= 5 && normalized.length <= 20
  },
  { path: ["nationalId"], message: "El DNI debe contener entre 5 y 20 dígitos." },
)

const emailVerificationSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()

const invitationProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  nationalId: z.string().trim().min(5).max(20).regex(/^[0-9 .-]+$/),
  birthDate: z.string().date(),
  phone: z.string().trim().min(5).max(20),
  email: z.string().trim().email().max(254),
  address: z.string().trim().max(300).optional(),
}).strict().refine(
  ({ nationalId }) => {
    const normalized = nationalId.replace(/\D/g, "")
    return normalized.length >= 5 && normalized.length <= 20
  },
  { path: ["nationalId"], message: "El DNI debe contener entre 5 y 20 dígitos." },
)

const createInvitationSchema = z.union([
  z.object({
    patientId: z.string().regex(/^\d+$/),
    email: z.string().trim().email().max(254),
    identityConfirmed: z.literal(true),
  }).strict(),
  z.object({ patient: invitationProfileSchema }).strict(),
])

const acceptInvitationSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(12).max(256),
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
  emailVerified: number
  firstName: string
  lastName: string
  patientId: number | null
}

type RoleRow = RowDataPacket & { name: string }

type RegistrationIdentityRow = RowDataPacket & {
  patientId: number | null
  userId: number | null
  email: string | null
  passwordHash: string | null
  emailVerified: number | null
  isActive: number | null
  personActive: number
  roleCount: number
  hasPatientRole: number
  normalizedNationalId: string
  normalizedEmail: string | null
}

type InvitationPatientRow = RowDataPacket & {
  id: number
  personaId: number
  email: string | null
  patientActive: number
  personActive: number
}

type InvitationTokenRow = RowDataPacket & {
  id: number
  patientId: number
  email: string
  expiresAt: Date | string
  consumedAt: Date | string | null
  revokedAt: Date | string | null
}

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

async function hasValidPreAuthenticationCsrf(req: Request): Promise<boolean> {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) return false

  const session = await findSession(token)
  return Boolean(
    session
    && session.userId === null
    && csrfTokenMatches(session.csrfSecret, token, req.get("X-CSRF-Token")),
  )
}

async function hasValidSessionCsrf(req: Request): Promise<boolean> {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) return false

  const session = await findSession(token)
  return Boolean(session && csrfTokenMatches(session.csrfSecret, token, req.get("X-CSRF-Token")))
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

const registrationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => {
    sendHttpError(res, 429, "RATE_LIMITED", "Se alcanzó el límite de solicitudes. Esperá antes de volver a intentar.")
  },
})

const emailVerificationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => {
    sendHttpError(res, 429, "RATE_LIMITED", "Se alcanzó el límite de solicitudes. Esperá antes de volver a intentar.")
  },
})

const invitationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => {
    sendHttpError(res, 429, "RATE_LIMITED", "Se alcanzó el límite de solicitudes. Esperá antes de volver a intentar.")
  },
})

const invitationAcceptanceRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => {
    sendHttpError(res, 429, "RATE_LIMITED", "Se alcanzó el límite de solicitudes. Esperá antes de volver a intentar.")
  },
})

const registrationAcceptedMessage =
  "Si los datos pueden registrarse, recibirás instrucciones en el email indicado."
const invitationAcceptedMessage =
  "Si los datos son válidos, se enviarán instrucciones al email indicado."

function isDuplicateEntry(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY"
}

router.post("/register", registrationRateLimit, asyncRoute(async (req, res) => {
  const parsed = registrationSchema.safeParse(req.body)
  if (!parsed.success) {
    sendHttpError(res, 422, "VALIDATION_ERROR", "Los datos de registro no son válidos.")
    return
  }

  if (!await hasValidPreAuthenticationCsrf(req)) {
    sendHttpError(res, 403, "CSRF_TOKEN_INVALID", "El token CSRF falta o no es válido.")
    return
  }

  try {
    assertVerificationEmailConfigured()
  } catch (error) {
    if (!(error instanceof VerificationEmailError)) throw error
    logger.error("El registro de pacientes no está disponible porque falta la configuración de email", {
      requestId: String(res.locals.requestId ?? "unknown"),
      errorName: error.name,
    })
    sendHttpError(res, 503, "EMAIL_DELIVERY_UNAVAILABLE", "El registro no está disponible temporalmente.")
    return
  }

  const email = parsed.data.email.toLowerCase()
  const nationalId = parsed.data.nationalId.replace(/\D/g, "")
  const passwordHash = await hashPassword(parsed.data.password)
  let notice: { email: string; token?: string; continueTo?: string }

  try {
    notice = await withTransaction(async (connection) => {
      const [existingRows] = await connection.execute<RegistrationIdentityRow[]>(
        `SELECT
           pa.id AS patientId,
           u.id AS userId,
           u.email,
           u.password_hash AS passwordHash,
           u.email_verified AS emailVerified,
           u.is_active AS isActive,
           p.activo AS personActive,
           (SELECT COUNT(*) FROM usuarios_roles ur WHERE ur.user_id = u.id) AS roleCount,
           EXISTS (
             SELECT 1
             FROM usuarios_roles ur
             INNER JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = u.id AND r.nombre = 'paciente'
           ) AS hasPatientRole,
           REGEXP_REPLACE(p.dni, '[^0-9]', '') AS normalizedNationalId,
           LOWER(TRIM(u.email)) AS normalizedEmail
         FROM personas p
         LEFT JOIN pacientes pa ON pa.persona_id = p.id
         LEFT JOIN users u ON u.persona_id = p.id
         WHERE REGEXP_REPLACE(p.dni, '[^0-9]', '') = ?
            OR LOWER(TRIM(u.email)) = ?
         FOR UPDATE`,
        [nationalId, email],
      )

      if (existingRows.length > 0) {
        const sameUnverifiedPatient = existingRows.find((row) =>
          row.patientId !== null
          && row.userId !== null
          && row.normalizedNationalId === nationalId
          && row.normalizedEmail === email
          && row.emailVerified === 0
          && row.isActive === 1
          && row.personActive === 1
          && row.roleCount === 1
          && row.hasPatientRole === 1
          && row.passwordHash !== null,
        )

        if (sameUnverifiedPatient?.passwordHash && sameUnverifiedPatient.userId !== null) {
          const passwordResult = await verifyPassword(parsed.data.password, sameUnverifiedPatient.passwordHash)
          if (passwordResult.valid) {
            const token = createOpaqueToken()
            await connection.execute(
              `UPDATE email_verification_tokens
               SET revoked_at = UTC_TIMESTAMP(3)
               WHERE user_id = ? AND consumed_at IS NULL AND revoked_at IS NULL`,
              [sameUnverifiedPatient.userId],
            )
            await connection.execute(
              `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
               VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 24 HOUR))`,
              [sameUnverifiedPatient.userId, hashSessionToken(token)],
            )
            return { email: sameUnverifiedPatient.email ?? email, token, continueTo: parsed.data.continueTo }
          }
        }

        return { email }
      }

      const [roles] = await connection.execute<Array<RowDataPacket & { id: number }>>(
        "SELECT id FROM roles WHERE nombre = 'paciente' LIMIT 1",
      )
      if (!roles[0]) throw new Error("No está configurado el rol de paciente.")

      const [person] = await connection.execute<ResultSetHeader>(
        `INSERT INTO personas
          (nombre, apellido, dni, fecha_nacimiento, telefono, direccion, email_contacto, activo)
         VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
        [
          parsed.data.firstName,
          parsed.data.lastName,
          nationalId,
          parsed.data.birthDate,
          parsed.data.phone,
          parsed.data.address ?? null,
          email,
        ],
      )
      const [patient] = await connection.execute<ResultSetHeader>(
        "INSERT INTO pacientes (persona_id, activo) VALUES (?, TRUE)",
        [person.insertId],
      )
      const [user] = await connection.execute<ResultSetHeader>(
        `INSERT INTO users (persona_id, email, password_hash, is_active, email_verified)
         VALUES (?, ?, ?, TRUE, FALSE)`,
        [person.insertId, email, passwordHash],
      )
      await connection.execute(
        "INSERT INTO usuarios_roles (user_id, role_id) VALUES (?, ?)",
        [user.insertId, roles[0].id],
      )

      const token = createOpaqueToken()
      await connection.execute(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
         VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 24 HOUR))`,
        [user.insertId, hashSessionToken(token)],
      )

      logger.info("Solicitud de registro de paciente aceptada", {
        requestId: String(res.locals.requestId ?? "unknown"),
        patientId: patient.insertId,
      })
      return { email, token, continueTo: parsed.data.continueTo }
    })
  } catch (error) {
    if (!isDuplicateEntry(error)) throw error
    notice = { email }
  }

  try {
    await sendRegistrationNotice(notice)
  } catch (error) {
    if (!(error instanceof VerificationEmailError)) throw error
    logger.error("Falló el envío de email de registro", {
      requestId: String(res.locals.requestId ?? "unknown"),
      errorName: error.name,
      ...(error.providerStatus === undefined ? {} : { providerStatus: error.providerStatus }),
    })
    sendHttpError(res, 503, "EMAIL_DELIVERY_UNAVAILABLE", "El registro no está disponible temporalmente.")
    return
  }

  res.status(202).json({ message: registrationAcceptedMessage })
}))

router.post(
  "/registration-invitations",
  invitationRateLimit,
  requireAuthentication,
  requireRoles("administrative", "administrator"),
  requireCsrfToken,
  asyncRoute(async (req, res) => {
    const parsed = createInvitationSchema.safeParse(req.body)
    if (!parsed.success) {
      sendHttpError(res, 422, "VALIDATION_ERROR", "Los datos para la invitación no son válidos.")
      return
    }

    try {
      assertVerificationEmailConfigured()
    } catch (error) {
      if (!(error instanceof VerificationEmailError)) throw error
      logger.error("Las invitaciones de pacientes no están disponibles porque falta la configuración de email", {
        requestId: String(res.locals.requestId ?? "unknown"),
        errorName: error.name,
      })
      sendHttpError(res, 503, "EMAIL_DELIVERY_UNAVAILABLE", "El envío de invitaciones no está disponible temporalmente.")
      return
    }

    const actorId = res.locals.auth?.databaseId
    if (!actorId) {
      sendHttpError(res, 401, "UNAUTHENTICATED", "Se requiere una sesión válida.")
      return
    }

    const requestedEmail = "patient" in parsed.data
      ? parsed.data.patient.email.toLowerCase()
      : parsed.data.email.toLowerCase()
    let notice: { email: string; token?: string }
    let conflict = false

    try {
      const result = await withTransaction(async (connection) => {
        let patientId: number
        let email = requestedEmail
        let identityConfirmed = false

        if ("patient" in parsed.data) {
          const patient = parsed.data.patient
          const nationalId = patient.nationalId.replace(/\D/g, "")
          const [identityRows] = await connection.execute<Array<RowDataPacket & { id: number }>>(
            "SELECT id FROM personas WHERE REGEXP_REPLACE(dni, '[^0-9]', '') = ? FOR UPDATE",
            [nationalId],
          )
          if (identityRows.length > 0) return { conflict: true as const }

          const [accountRows] = await connection.execute<Array<RowDataPacket & { id: number }>>(
            "SELECT id FROM users WHERE LOWER(TRIM(email)) = ? FOR UPDATE",
            [email],
          )
          if (accountRows.length > 0) return { email }

          const [person] = await connection.execute<ResultSetHeader>(
            `INSERT INTO personas
              (nombre, apellido, dni, fecha_nacimiento, telefono, direccion, email_contacto, activo)
             VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
            [
              patient.firstName,
              patient.lastName,
              nationalId,
              patient.birthDate,
              patient.phone,
              patient.address ?? null,
              email,
            ],
          )
          const [createdPatient] = await connection.execute<ResultSetHeader>(
            "INSERT INTO pacientes (persona_id, activo) VALUES (?, TRUE)",
            [person.insertId],
          )
          patientId = createdPatient.insertId
        } else {
          email = parsed.data.email.toLowerCase()
          identityConfirmed = parsed.data.identityConfirmed
          const [patientRows] = await connection.execute<InvitationPatientRow[]>(
            `SELECT
               pa.id,
               pa.persona_id AS personaId,
               p.email_contacto AS email,
               pa.activo AS patientActive,
               p.activo AS personActive
             FROM pacientes pa
             INNER JOIN personas p ON p.id = pa.persona_id
             WHERE pa.id = ?
             FOR UPDATE`,
            [Number(parsed.data.patientId)],
          )
          const patient = patientRows[0]
          if (
            !patient
            || !patient.patientActive
            || !patient.personActive
            || patient.email?.trim().toLowerCase() !== email
          ) {
            return { email }
          }

          const [linkedAccounts] = await connection.execute<Array<RowDataPacket & { id: number }>>(
            "SELECT id FROM users WHERE persona_id = ? FOR UPDATE",
            [patient.personaId],
          )
          const [emailAccounts] = await connection.execute<Array<RowDataPacket & { id: number }>>(
            "SELECT id FROM users WHERE LOWER(TRIM(email)) = ? FOR UPDATE",
            [email],
          )
          if (linkedAccounts.length > 0 || emailAccounts.length > 0) return { email }
          patientId = patient.id
        }

        const token = createOpaqueToken()
        await connection.execute(
          `UPDATE patient_registration_invitations
           SET revoked_at = UTC_TIMESTAMP(3)
           WHERE patient_id = ? AND consumed_at IS NULL AND revoked_at IS NULL`,
          [patientId],
        )
        await connection.execute(
          `INSERT INTO patient_registration_invitations
            (patient_id, email, token_hash, expires_at, created_by)
           VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 24 HOUR), ?)`,
          [patientId, email, hashSessionToken(token), actorId],
        )
        await connection.execute(
          `INSERT INTO auditoria
            (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos, ip_address, user_agent)
           VALUES (?, 'patient.invitation.created', 'pacientes', ?, ?, ?, ?)`,
          [
            actorId,
            patientId,
            JSON.stringify({ identityAndEmailVerified: identityConfirmed }),
            req.ip ?? null,
            req.get("user-agent")?.slice(0, 500) ?? null,
          ],
        )
        return { email, token }
      })

      if ("conflict" in result && result.conflict) {
        conflict = true
        notice = { email: requestedEmail }
      } else {
        notice = result
      }
    } catch (error) {
      if (!isDuplicateEntry(error)) throw error
      conflict = true
      notice = { email: requestedEmail }
    }

    if (conflict) {
      sendHttpError(res, 409, "RESOURCE_CONFLICT", "No se pudo procesar la ficha del paciente.")
      return
    }

    try {
      await sendPatientInvitationNotice(notice.email, notice.token)
    } catch (error) {
      if (!(error instanceof VerificationEmailError)) throw error
      logger.error("Falló el envío de invitación a paciente", {
        requestId: String(res.locals.requestId ?? "unknown"),
        errorName: error.name,
        ...(error.providerStatus === undefined ? {} : { providerStatus: error.providerStatus }),
      })
      sendHttpError(res, 503, "EMAIL_DELIVERY_UNAVAILABLE", "El envío de invitaciones no está disponible temporalmente.")
      return
    }

    res.status(202).json({ message: invitationAcceptedMessage })
  }),
)

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
       u.email_verified AS emailVerified,
       p.activo AS personActive,
       p.nombre AS firstName,
       p.apellido AS lastName,
       pa.id AS patientId
     FROM users u
     INNER JOIN personas p ON p.id = u.persona_id
     LEFT JOIN pacientes pa ON pa.persona_id = p.id
     WHERE LOWER(TRIM(u.email)) = ?
     LIMIT 1`,
    [parsed.data.email.trim().toLowerCase()],
  )
  const account = users[0]
  const passwordResult = await verifyPassword(parsed.data.password, account?.passwordHash)
  if (
    !account
    || !passwordResult.valid
    || !account.isActive
    || !account.personActive
    || !account.emailVerified
  ) {
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

router.post(
  "/accept-invitation",
  invitationAcceptanceRateLimit,
  asyncRoute(async (req, res) => {
    const parsed = acceptInvitationSchema.safeParse(req.body)
    if (!parsed.success) {
      sendHttpError(res, 400, "BAD_REQUEST", "La invitación no es válida o ya venció.")
      return
    }

    if (!await hasValidSessionCsrf(req)) {
      sendHttpError(res, 403, "CSRF_TOKEN_INVALID", "El token CSRF falta o no es válido.")
      return
    }

    const passwordHash = await hashPassword(parsed.data.password)
    const currentSessionToken = parseCookies(req.headers.cookie)[SESSION_COOKIE]
    if (!currentSessionToken) {
      sendHttpError(res, 403, "CSRF_TOKEN_INVALID", "El token CSRF falta o no es válido.")
      return
    }
    const authToken = createOpaqueToken()
    const csrfSecret = createOpaqueToken()
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000)

    let acceptedUser: AuthenticatedUser | undefined
    try {
      acceptedUser = await withTransaction(async (connection) => {
        const [invitationRows] = await connection.execute<InvitationTokenRow[]>(
          `SELECT
             id,
             patient_id AS patientId,
             email,
             expires_at AS expiresAt,
             consumed_at AS consumedAt,
             revoked_at AS revokedAt
           FROM patient_registration_invitations
           WHERE token_hash = ?
           FOR UPDATE`,
          [hashSessionToken(parsed.data.token)],
        )
        const invitation = invitationRows[0]
        if (
          !invitation
          || invitation.consumedAt !== null
          || invitation.revokedAt !== null
          || new Date(invitation.expiresAt).getTime() <= Date.now()
        ) {
          return undefined
        }

        const [patientRows] = await connection.execute<InvitationPatientRow[]>(
          `SELECT
             pa.id,
             pa.persona_id AS personaId,
             p.email_contacto AS email,
             pa.activo AS patientActive,
             p.activo AS personActive
           FROM pacientes pa
           INNER JOIN personas p ON p.id = pa.persona_id
           WHERE pa.id = ?
           FOR UPDATE`,
          [invitation.patientId],
        )
        const patient = patientRows[0]
        if (
          !patient
          || !patient.patientActive
          || !patient.personActive
          || patient.email?.trim().toLowerCase() !== invitation.email.trim().toLowerCase()
        ) {
          return undefined
        }

        const [existingAccounts] = await connection.execute<Array<RowDataPacket & { id: number }>>(
          `SELECT id
           FROM users
           WHERE persona_id = ? OR LOWER(TRIM(email)) = ?
           FOR UPDATE`,
          [patient.personaId, invitation.email.trim().toLowerCase()],
        )
        if (existingAccounts.length > 0) return undefined

        const [patientRoles] = await connection.execute<Array<RowDataPacket & { id: number }>>(
          "SELECT id FROM roles WHERE nombre = 'paciente' LIMIT 1",
        )
        if (!patientRoles[0]) throw new Error("No está configurado el rol de paciente.")

        const [userResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO users (persona_id, email, password_hash, is_active, email_verified)
           VALUES (?, ?, ?, TRUE, TRUE)`,
          [patient.personaId, invitation.email, passwordHash],
        )
        await connection.execute(
          "INSERT INTO usuarios_roles (user_id, role_id) VALUES (?, ?)",
          [userResult.insertId, patientRoles[0].id],
        )
        await connection.execute(
          `UPDATE patient_registration_invitations
           SET consumed_at = UTC_TIMESTAMP(3)
           WHERE id = ?`,
          [invitation.id],
        )
        await connection.execute(
          `UPDATE patient_registration_invitations
           SET revoked_at = UTC_TIMESTAMP(3)
           WHERE patient_id = ? AND id <> ? AND consumed_at IS NULL AND revoked_at IS NULL`,
          [patient.id, invitation.id],
        )
        await connection.execute(
          "DELETE FROM auth_sessions WHERE token_hash = ?",
          [hashSessionToken(currentSessionToken)],
        )
        await connection.execute(
          `INSERT INTO auth_sessions (user_id, token_hash, csrf_secret, expires_at)
           VALUES (?, ?, ?, ?)`,
          [userResult.insertId, hashSessionToken(authToken), csrfSecret, expiresAt],
        )
        await connection.execute(
          `INSERT INTO auditoria
            (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
           VALUES (?, 'patient.invitation.accepted', 'pacientes', ?, ?)`,
          [userResult.insertId, patient.id, JSON.stringify({ invitationAccepted: true })],
        )

        const [personRows] = await connection.execute<Array<RowDataPacket & {
          firstName: string
          lastName: string
        }>>(
          "SELECT nombre AS firstName, apellido AS lastName FROM personas WHERE id = ?",
          [patient.personaId],
        )
        const person = personRows[0]
        if (!person) throw new Error("No se encontró la persona asociada a la invitación.")

        return {
          id: String(userResult.insertId),
          databaseId: userResult.insertId,
          displayName: `${person.firstName} ${person.lastName}`.trim(),
          email: invitation.email,
          roles: ["patient"],
          patientId: String(patient.id),
        }
      })
    } catch (error) {
      if (!isDuplicateEntry(error)) throw error
      acceptedUser = undefined
    }

    if (!acceptedUser) {
      sendHttpError(res, 400, "BAD_REQUEST", "La invitación no es válida o ya venció.")
      return
    }

    setSessionCookie(res, authToken, { maxAgeSeconds: SESSION_TTL_SECONDS })
    logger.info("Invitación de paciente aceptada", { userId: acceptedUser.id })
    res.status(200).json({
      id: acceptedUser.id,
      displayName: acceptedUser.displayName,
      email: acceptedUser.email,
      roles: acceptedUser.roles,
      ...(acceptedUser.patientId ? { patientId: acceptedUser.patientId } : {}),
    })
  }),
)

router.post(
  "/verify-email",
  emailVerificationRateLimit,
  asyncRoute(async (req, res) => {
    const parsed = emailVerificationSchema.safeParse(req.body)
    if (!parsed.success) {
      sendHttpError(res, 400, "BAD_REQUEST", "El enlace de verificación no es válido o ya venció.")
      return
    }

    const preAuthenticationToken = parseCookies(req.headers.cookie)[SESSION_COOKIE]
    if (
      !preAuthenticationToken
      || !/^[a-f0-9]{64}$/i.test(preAuthenticationToken)
    ) {
      sendHttpError(res, 403, "CSRF_TOKEN_INVALID", "Obtené un token CSRF antes de verificar el email.")
      return
    }
    const preAuthenticationSession = await findSession(preAuthenticationToken)
    if (
      !preAuthenticationSession
      || preAuthenticationSession.userId !== null
      || !csrfTokenMatches(
        preAuthenticationSession.csrfSecret,
        preAuthenticationToken,
        req.get("X-CSRF-Token"),
      )
    ) {
      sendHttpError(res, 403, "CSRF_TOKEN_INVALID", "El token CSRF falta o no es válido.")
      return
    }

    const authToken = createOpaqueToken()
    const csrfSecret = createOpaqueToken()
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000)
    const verifiedUser = await withTransaction(async (connection) => {
      const [tokenRows] = await connection.execute<Array<RowDataPacket & {
        id: number
        userId: number
        expiresAt: Date | string
        consumedAt: Date | string | null
        revokedAt: Date | string | null
      }>>(
        `SELECT
           id,
           user_id AS userId,
           expires_at AS expiresAt,
           consumed_at AS consumedAt,
           revoked_at AS revokedAt
         FROM email_verification_tokens
         WHERE token_hash = ?
         FOR UPDATE`,
        [hashSessionToken(parsed.data.token)],
      )
      const verificationToken = tokenRows[0]
      if (
        !verificationToken
        || verificationToken.consumedAt !== null
        || verificationToken.revokedAt !== null
        || new Date(verificationToken.expiresAt).getTime() <= Date.now()
      ) {
        return undefined
      }

      const [userRows] = await connection.execute<LoginUserRow[]>(
        `SELECT
           u.id,
           u.email,
           u.password_hash AS passwordHash,
           u.is_active AS isActive,
           u.email_verified AS emailVerified,
           p.activo AS personActive,
           p.nombre AS firstName,
           p.apellido AS lastName,
           pa.id AS patientId
         FROM users u
         INNER JOIN personas p ON p.id = u.persona_id
         INNER JOIN pacientes pa ON pa.persona_id = p.id
         WHERE u.id = ?
         FOR UPDATE`,
        [verificationToken.userId],
      )
      const account = userRows[0]
      if (
        !account
        || account.emailVerified
        || !account.isActive
        || !account.personActive
      ) {
        return undefined
      }

      const [roleRows] = await connection.execute<RoleRow[]>(
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
      if (roles.length !== 1 || roles[0] !== "patient") return undefined

      await connection.execute(
        "UPDATE users SET email_verified = TRUE WHERE id = ? AND email_verified = FALSE",
        [account.id],
      )
      await connection.execute(
        "UPDATE email_verification_tokens SET consumed_at = UTC_TIMESTAMP(3) WHERE id = ?",
        [verificationToken.id],
      )
      await connection.execute(
        `UPDATE email_verification_tokens
         SET revoked_at = UTC_TIMESTAMP(3)
         WHERE user_id = ? AND id <> ? AND consumed_at IS NULL AND revoked_at IS NULL`,
        [account.id, verificationToken.id],
      )
      await connection.execute(
        "DELETE FROM auth_sessions WHERE token_hash = ?",
        [hashSessionToken(preAuthenticationToken)],
      )
      await connection.execute(
        `INSERT INTO auth_sessions (user_id, token_hash, csrf_secret, expires_at)
         VALUES (?, ?, ?, ?)`,
        [account.id, hashSessionToken(authToken), csrfSecret, expiresAt],
      )

      return {
        id: String(account.id),
        displayName: `${account.firstName} ${account.lastName}`.trim(),
        email: account.email,
        roles,
        ...(account.patientId === null ? {} : { patientId: String(account.patientId) }),
      }
    })

    if (!verifiedUser) {
      sendHttpError(res, 400, "BAD_REQUEST", "El enlace de verificación no es válido o ya venció.")
      return
    }

    setSessionCookie(res, authToken, { maxAgeSeconds: SESSION_TTL_SECONDS })
    logger.info("Email de paciente verificado", { userId: verifiedUser.id })
    res.status(200).json(verifiedUser)
  }),
)

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
