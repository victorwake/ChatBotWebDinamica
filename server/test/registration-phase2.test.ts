import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { once } from "node:events"
import test from "node:test"
import type { AddressInfo } from "node:net"
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise"
import { app } from "../src/app"
import { hashSessionToken, parseCookies } from "../src/auth/security"
import { pool } from "../src/db/pool"

const emailEnvironmentKeys = ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "PUBLIC_APP_URL"] as const
type EmailEnvironmentKey = (typeof emailEnvironmentKeys)[number]

function saveEmailEnvironment(): Record<EmailEnvironmentKey, string | undefined> {
  return Object.fromEntries(emailEnvironmentKeys.map((key) => [key, process.env[key]])) as Record<
    EmailEnvironmentKey,
    string | undefined
  >
}

function restoreEmailEnvironment(previous: Record<EmailEnvironmentKey, string | undefined>): void {
  for (const key of emailEnvironmentKeys) {
    const value = previous[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

async function startServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = app.listen(0)
  await once(server, "listening")
  const address = server.address() as AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      if (!server.listening) return
      server.close()
      await once(server, "close")
    },
  }
}

async function getCsrf(baseUrl: string): Promise<{ cookie: string; token: string }> {
  const response = await fetch(`${baseUrl}/api/v1/auth/csrf`)
  assert.equal(response.status, 200)
  const cookie = parseCookies(response.headers.get("set-cookie") ?? undefined).session
  assert.ok(cookie)
  const body = await response.json() as { csrfToken: string }
  return { cookie, token: body.csrfToken }
}

function registrationPayload(email: string, nationalId: string) {
  return {
    firstName: "Paciente",
    lastName: "Synthetic",
    nationalId,
    birthDate: "1990-01-15",
    phone: "+54 11 5555-0101",
    email,
    password: `Registration-${randomUUID()}`,
  }
}

function extractVerificationToken(body: Record<string, unknown>): string {
  const link = String(body.text).match(/https?:\/\/\S+/)?.[0]
  assert.ok(link)
  const verificationUrl = new URL(link)
  assert.equal(verificationUrl.pathname, "/verify-email")
  const token = new URLSearchParams(verificationUrl.hash.slice(1)).get("token")
  assert.ok(token)
  return token
}

function extractVerificationUrl(body: Record<string, unknown>): URL {
  const link = String(body.text).match(/https?:\/\/\S+/)?.[0]
  assert.ok(link)
  return new URL(link)
}

test("patient registration stays closed when Resend is not configured", async () => {
  const previous = saveEmailEnvironment()
  for (const key of emailEnvironmentKeys) delete process.env[key]
  const email = `registration-disabled-${randomUUID()}@example.invalid`
  const nationalId = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const server = await startServer()

  try {
    const csrf = await getCsrf(server.baseUrl)
    const invalidContinuation = await fetch(`${server.baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${csrf.cookie}`,
        "X-CSRF-Token": csrf.token,
      },
      body: JSON.stringify({
        ...registrationPayload(email, nationalId),
        continueTo: "https://example.invalid/appointments/availability",
      }),
    })
    assert.equal(invalidContinuation.status, 422)

    const response = await fetch(`${server.baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${csrf.cookie}`,
        "X-CSRF-Token": csrf.token,
      },
      body: JSON.stringify(registrationPayload(email, nationalId)),
    })
    assert.equal(response.status, 503)
    const [users] = await pool.execute<Array<RowDataPacket & { total: number }>>(
      "SELECT COUNT(*) AS total FROM users WHERE email = ?",
      [email],
    )
    assert.equal(Number(users[0]?.total), 0)
  } finally {
    await server.close()
    restoreEmailEnvironment(previous)
  }
})

test("registration verifies email once, creates only a patient and avoids identity enumeration", async () => {
  const previous = saveEmailEnvironment()
  process.env.RESEND_API_KEY = "re_test_key"
  process.env.RESEND_FROM_EMAIL = "Consultorio <noreply@example.invalid>"
  process.env.PUBLIC_APP_URL = "http://localhost:3000"

  const originalFetch = globalThis.fetch
  const sentEmails: Array<{ body: Record<string, unknown>; idempotencyKey: string | null }> = []
  globalThis.fetch = async (input, init) => {
    if (String(input) !== "https://api.resend.com/emails") return originalFetch(input, init)
    sentEmails.push({
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      idempotencyKey: new Headers(init?.headers).get("Idempotency-Key"),
    })
    return new Response(
      JSON.stringify(sentEmails.length === 1 ? { message: "provider unavailable" } : { id: "email_test_001" }),
      {
      status: sentEmails.length === 1 ? 503 : 200,
      headers: { "Content-Type": "application/json" },
      },
    )
  }

  const suffix = randomUUID().replaceAll("-", "")
  const email = `registration-${suffix}@example.invalid`
  const nationalId = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const password = `Registration-${randomUUID()}`
  const server = await startServer()
  let userId: number | undefined
  let personaId: number | undefined

  try {
    const csrf = await getCsrf(server.baseUrl)
    const continueTo = "/appointments/availability?from=2026-11-02&to=2026-11-09&slotId=MTIz"
    const payload = { ...registrationPayload(email, nationalId), password, continueTo }
    const failedDelivery = await fetch(`${server.baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${csrf.cookie}`,
        "X-CSRF-Token": csrf.token,
      },
      body: JSON.stringify(payload),
    })
    assert.equal(failedDelivery.status, 503)
    const firstToken = extractVerificationToken(sentEmails[0]?.body ?? {})
    assert.equal(extractVerificationUrl(sentEmails[0]?.body ?? {}).searchParams.get("next"), continueTo)

    const registration = await fetch(`${server.baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${csrf.cookie}`,
        "X-CSRF-Token": csrf.token,
      },
      body: JSON.stringify(payload),
    })
    assert.equal(registration.status, 202)
    const registrationBody = await registration.json()
    assert.deepEqual(registrationBody, {
      message: "Si los datos pueden registrarse, recibirás instrucciones en el email indicado.",
    })
    assert.equal(sentEmails.length, 2)
    assert.deepEqual(sentEmails[1]?.body.to, [email])
    assert.equal(JSON.stringify(registrationBody).includes("token"), false)

    const token = extractVerificationToken(sentEmails[1]?.body ?? {})
    assert.notEqual(token, firstToken)
    assert.equal(extractVerificationUrl(sentEmails[1]?.body ?? {}).searchParams.get("next"), continueTo)

    const [users] = await pool.execute<Array<RowDataPacket & {
      id: number
      personaId: number
      emailVerified: number
      normalizedDni: string
    }>>(
      `SELECT u.id, p.id AS personaId, u.email_verified AS emailVerified,
              REGEXP_REPLACE(p.dni, '[^0-9]', '') AS normalizedDni
       FROM users u
       INNER JOIN personas p ON p.id = u.persona_id
       WHERE u.email = ?`,
      [email],
    )
    assert.equal(users.length, 1)
    userId = users[0]?.id
    personaId = users[0]?.personaId
    assert.ok(userId)
    assert.equal(users[0]?.emailVerified, 0)
    assert.equal(users[0]?.normalizedDni, nationalId)

    const [tokens] = await pool.execute<Array<RowDataPacket & {
      tokenHash: string
      revokedAt: Date | string | null
    }>>(
      `SELECT token_hash AS tokenHash, revoked_at AS revokedAt
       FROM email_verification_tokens
       WHERE user_id = ?
       ORDER BY id`,
      [userId],
    )
    assert.equal(tokens.length, 2)
    assert.equal(tokens[0]?.tokenHash, hashSessionToken(firstToken))
    assert.notEqual(tokens[0]?.tokenHash, firstToken)
    assert.ok(tokens[0]?.revokedAt)
    assert.equal(tokens[1]?.tokenHash, hashSessionToken(token))
    assert.equal(tokens[1]?.revokedAt, null)

    const [expiredUpdate] = await pool.execute<ResultSetHeader>(
      `UPDATE email_verification_tokens
       SET expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND)
       WHERE user_id = ? AND token_hash = ?`,
      [userId, hashSessionToken(token)],
    )
    assert.equal(expiredUpdate.affectedRows, 1)

    const expiredVerification = await fetch(`${server.baseUrl}/api/v1/auth/verify-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${csrf.cookie}`,
        "X-CSRF-Token": csrf.token,
      },
      body: JSON.stringify({ token }),
    })
    assert.equal(expiredVerification.status, 400)

    const renewedRegistration = await fetch(`${server.baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${csrf.cookie}`,
        "X-CSRF-Token": csrf.token,
      },
      body: JSON.stringify(payload),
    })
    assert.equal(renewedRegistration.status, 202)
    const renewedToken = extractVerificationToken(sentEmails[2]?.body ?? {})
    assert.notEqual(renewedToken, token)

    const blockedLogin = await fetch(`${server.baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${csrf.cookie}`,
        "X-CSRF-Token": csrf.token,
      },
      body: JSON.stringify({ email, password }),
    })
    assert.equal(blockedLogin.status, 401)

    const verification = await fetch(`${server.baseUrl}/api/v1/auth/verify-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${csrf.cookie}`,
        "X-CSRF-Token": csrf.token,
      },
      body: JSON.stringify({ token: renewedToken }),
    })
    assert.equal(verification.status, 200)
    const verifiedUser = await verification.json() as {
      id: string
      roles: string[]
      patientId: string
    }
    assert.equal(verifiedUser.id, String(userId))
    assert.deepEqual(verifiedUser.roles, ["patient"])
    assert.ok(verifiedUser.patientId)
    const sessionCookie = parseCookies(verification.headers.get("set-cookie") ?? undefined).session
    assert.ok(sessionCookie)
    assert.equal(JSON.stringify(verifiedUser).includes(renewedToken), false)

    const replayCsrf = await getCsrf(server.baseUrl)
    const replay = await fetch(`${server.baseUrl}/api/v1/auth/verify-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${replayCsrf.cookie}`,
        "X-CSRF-Token": replayCsrf.token,
      },
      body: JSON.stringify({ token: renewedToken }),
    })
    assert.equal(replay.status, 400)

    const duplicateCsrf = await getCsrf(server.baseUrl)
    const duplicate = await fetch(`${server.baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${duplicateCsrf.cookie}`,
        "X-CSRF-Token": duplicateCsrf.token,
      },
      body: JSON.stringify(payload),
    })
    assert.equal(duplicate.status, 202)
    assert.deepEqual(await duplicate.json(), {
      message: "Si los datos pueden registrarse, recibirás instrucciones en el email indicado.",
    })
    assert.equal(sentEmails.length, 4)
    assert.equal(String(sentEmails[3]?.body.text).includes("token="), false)

    const loginCsrf = await getCsrf(server.baseUrl)
    const login = await fetch(`${server.baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${loginCsrf.cookie}`,
        "X-CSRF-Token": loginCsrf.token,
      },
      body: JSON.stringify({ email, password }),
    })
    assert.equal(login.status, 200)
    assert.deepEqual((await login.json() as { roles: string[] }).roles, ["patient"])
  } finally {
    await server.close()
    globalThis.fetch = originalFetch
    restoreEmailEnvironment(previous)
    if (userId && personaId) {
      await pool.execute("DELETE FROM auth_sessions WHERE user_id = ?", [userId])
      await pool.execute("DELETE FROM email_verification_tokens WHERE user_id = ?", [userId])
      await pool.execute("DELETE FROM pacientes WHERE persona_id = ?", [personaId])
      await pool.execute("DELETE FROM users WHERE id = ?", [userId])
      await pool.execute("DELETE FROM personas WHERE id = ?", [personaId])
    }
    await pool.end()
  }
})

test("registration and email verification enforce their rate limits", async () => {
  const server = await startServer()

  try {
    let registrationWasLimited = false
    for (let attempt = 0; attempt < 12 && !registrationWasLimited; attempt += 1) {
      const response = await fetch(`${server.baseUrl}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (response.status === 429) registrationWasLimited = true
      else assert.equal(response.status, 422)
    }
    assert.equal(registrationWasLimited, true)

    let verificationWasLimited = false
    for (let attempt = 0; attempt < 22 && !verificationWasLimited; attempt += 1) {
      const response = await fetch(`${server.baseUrl}/api/v1/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "invalid" }),
      })
      if (response.status === 429) verificationWasLimited = true
      else assert.equal(response.status, 400)
    }
    assert.equal(verificationWasLimited, true)
  } finally {
    await server.close()
  }
})
