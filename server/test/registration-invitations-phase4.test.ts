import assert from "node:assert/strict"
import test from "node:test"
import type { RowDataPacket } from "mysql2/promise"
import { closeServer, createPhase3Fixture } from "./phase3-fixtures"
import { hashSessionToken, parseCookies } from "../src/auth/security"
import { pool } from "../src/db/pool"

test("administrative patient invitations are private, revocable, one-time, and create patient-only accounts", async () => {
  const fixture = await createPhase3Fixture()
  const { server, baseUrl } = await fixture.startServer()
  const admin = await fixture.login(fixture.administrator, baseUrl)
  const nationalId = `${fixture.suffix.slice(0, 14)}901`
  const email = `phase4-invite-${fixture.suffix}@example.invalid`
  const originalFetch = globalThis.fetch
  const originalEmailEnvironment = {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.RESEND_FROM_EMAIL,
    appUrl: process.env.PUBLIC_APP_URL,
  }
  const sentMessages: Array<{ text: string; subject: string }> = []
  let patientId: number | undefined
  let personaId: number | undefined
  let invitedUserId: number | undefined
  let replaySessionToken: string | undefined

  process.env.RESEND_API_KEY = "test-api-key"
  process.env.RESEND_FROM_EMAIL = "test@example.invalid"
  process.env.PUBLIC_APP_URL = "http://localhost:3000"
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (url !== "https://api.resend.com/emails") return originalFetch(input, init)
    const body = JSON.parse(String(init?.body)) as { text: string; subject: string }
    sentMessages.push(body)
    return new Response(null, { status: 200 })
  }

  try {
    const forbiddenResponse = await fetch(`${baseUrl}/api/v1/auth/registration-invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: (await fixture.login(fixture.patient, baseUrl)).cookie,
        "X-CSRF-Token": admin.csrfToken,
      },
      body: JSON.stringify({
        patient: {
          firstName: "Prueba",
          lastName: "Invitación",
          nationalId,
          birthDate: "1990-01-15",
          phone: "+541155550000",
          email,
        },
      }),
    })
    assert.equal(forbiddenResponse.status, 403)

    const createResponse = await fetch(`${baseUrl}/api/v1/auth/registration-invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: admin.cookie,
        "X-CSRF-Token": admin.csrfToken,
      },
      body: JSON.stringify({
        patient: {
          firstName: "Prueba",
          lastName: "Invitación",
          nationalId,
          birthDate: "1990-01-15",
          phone: "+541155550000",
          email,
        },
      }),
    })
    assert.equal(createResponse.status, 202)
    const acceptedMessage = await createResponse.json() as { message: string }
    assert.equal(acceptedMessage.message, "Si los datos son válidos, se enviarán instrucciones al email indicado.")
    assert.equal(JSON.stringify(acceptedMessage).includes(email), false)
    assert.equal(sentMessages.length, 1)

    const [patients] = await pool.execute<Array<RowDataPacket & { id: number; personaId: number }>>(
      `SELECT pa.id, pa.persona_id AS personaId
       FROM pacientes pa
       INNER JOIN personas p ON p.id = pa.persona_id
       WHERE p.dni = ?`,
      [nationalId],
    )
    assert.equal(patients.length, 1)
    patientId = patients[0].id
    personaId = patients[0].personaId
    const tokenFromMessage = (message: { text: string }) => {
      const link = /https?:\/\/\S+/.exec(message.text)?.[0]
      assert.ok(link)
      return new URLSearchParams(new URL(link).hash.slice(1)).get("token") ?? ""
    }
    const firstToken = tokenFromMessage(sentMessages[0])

    const [storedInvitations] = await pool.execute<Array<RowDataPacket & {
      tokenHash: string
      createdBy: number
      expiresAt: Date | string
    }>>(
      `SELECT token_hash AS tokenHash, created_by AS createdBy, expires_at AS expiresAt
       FROM patient_registration_invitations WHERE patient_id = ?`,
      [patientId],
    )
    assert.equal(storedInvitations.length, 1)
    assert.equal(storedInvitations[0].tokenHash, hashSessionToken(firstToken))
    assert.notEqual(storedInvitations[0].tokenHash, firstToken)
    assert.equal(storedInvitations[0].createdBy, fixture.administrator.userId)
    assert.ok(new Date(storedInvitations[0].expiresAt).getTime() > Date.now())

    const mismatchResponse = await fetch(`${baseUrl}/api/v1/auth/registration-invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: admin.cookie,
        "X-CSRF-Token": admin.csrfToken,
      },
      body: JSON.stringify({
        patientId: String(patientId),
        email: `different-${email}`,
        identityConfirmed: true,
      }),
    })
    assert.equal(mismatchResponse.status, 202)
    assert.equal((await mismatchResponse.json() as { message: string }).message, acceptedMessage.message)
    assert.equal(sentMessages.length, 2)
    assert.equal(sentMessages[1].text.includes("http://") || sentMessages[1].text.includes("https://"), false)

    const csrfResponse = await fetch(`${baseUrl}/api/v1/auth/csrf`)
    const preAuthSession = parseCookies(csrfResponse.headers.get("set-cookie") ?? undefined).session
    const csrfToken = (await csrfResponse.json() as { csrfToken: string }).csrfToken
    assert.ok(preAuthSession)
    const password = "Invitation-Password-123!"
    const accept = (token: string) => fetch(`${baseUrl}/api/v1/auth/accept-invitation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${preAuthSession}`,
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({ token, password }),
    })

    await pool.execute(
      `UPDATE patient_registration_invitations
       SET expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND)
       WHERE patient_id = ? AND token_hash = ?`,
      [patientId, hashSessionToken(firstToken)],
    )
    const expiredResponse = await accept(firstToken)
    assert.equal(expiredResponse.status, 400)
    assert.equal(
      (await expiredResponse.json() as { error: { message: string } }).error.message,
      "La invitación no es válida o ya venció.",
    )

    const resendResponse = await fetch(`${baseUrl}/api/v1/auth/registration-invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: admin.cookie,
        "X-CSRF-Token": admin.csrfToken,
      },
      body: JSON.stringify({
        patientId: String(patientId),
        email,
        identityConfirmed: true,
      }),
    })
    assert.equal(resendResponse.status, 202)
    const secondToken = tokenFromMessage(sentMessages[2])
    assert.notEqual(firstToken, secondToken)
    const [revokedRows] = await pool.execute<Array<RowDataPacket & { revokedAt: Date | string | null }>>(
      `SELECT revoked_at AS revokedAt
       FROM patient_registration_invitations
       WHERE token_hash = ?`,
      [hashSessionToken(firstToken)],
    )
    assert.ok(revokedRows[0]?.revokedAt)

    const revokedResponse = await accept(firstToken)
    assert.equal(revokedResponse.status, 400)
    assert.equal(
      (await revokedResponse.json() as { error: { message: string } }).error.message,
      "La invitación no es válida o ya venció.",
    )
    const acceptedResponse = await accept(secondToken)
    assert.equal(acceptedResponse.status, 200)
    const account = await acceptedResponse.json() as {
      id: string
      email: string
      roles: string[]
      patientId: string
    }
    invitedUserId = Number(account.id)
    assert.equal(account.email, email)
    assert.deepEqual(account.roles, ["patient"])
    assert.equal(account.patientId, String(patientId))
    assert.equal(JSON.stringify(account).includes(password), false)

    const authenticatedCookie = parseCookies(acceptedResponse.headers.get("set-cookie") ?? undefined).session
    assert.ok(authenticatedCookie)
    const currentUserResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Cookie: `session=${authenticatedCookie}` },
    })
    assert.equal(currentUserResponse.status, 200)

    const replayCsrfResponse = await fetch(`${baseUrl}/api/v1/auth/csrf`)
    replaySessionToken = parseCookies(replayCsrfResponse.headers.get("set-cookie") ?? undefined).session
    const replayCsrf = (await replayCsrfResponse.json() as { csrfToken: string }).csrfToken
    const replayResponse = await fetch(`${baseUrl}/api/v1/auth/accept-invitation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${replaySessionToken}`,
        "X-CSRF-Token": replayCsrf,
      },
      body: JSON.stringify({ token: secondToken, password }),
    })
    assert.equal(replayResponse.status, 400)

    const [auditRows] = await pool.execute<Array<RowDataPacket & { action: string; actorId: number; newData: string | null }>>(
      `SELECT accion AS action, usuario_id AS actorId, datos_nuevos AS newData
       FROM auditoria WHERE tabla_afectada = 'pacientes' AND registro_id = ?`,
      [patientId],
    )
    assert.ok(auditRows.some((row) => row.action === "patient.invitation.created" && row.actorId === fixture.administrator.userId))
    assert.ok(auditRows.some((row) => row.action === "patient.invitation.accepted" && row.actorId === invitedUserId))
    assert.equal(JSON.stringify(auditRows).includes(email), false)
    assert.equal(JSON.stringify(auditRows).includes(firstToken), false)
    assert.equal(JSON.stringify(auditRows).includes(secondToken), false)
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(originalEmailEnvironment)) {
      const environmentKey = key === "apiKey" ? "RESEND_API_KEY" : key === "from" ? "RESEND_FROM_EMAIL" : "PUBLIC_APP_URL"
      if (value === undefined) delete process.env[environmentKey]
      else process.env[environmentKey] = value
    }
    await closeServer(server)
    if (patientId !== undefined) {
      await pool.execute(
        "DELETE FROM auditoria WHERE tabla_afectada = 'pacientes' AND registro_id = ?",
        [patientId],
      )
      await pool.execute("DELETE FROM patient_registration_invitations WHERE patient_id = ?", [patientId])
      if (invitedUserId !== undefined) {
        await pool.execute("DELETE FROM auth_sessions WHERE user_id = ?", [invitedUserId])
        await pool.execute("DELETE FROM usuarios_roles WHERE user_id = ?", [invitedUserId])
        await pool.execute("DELETE FROM users WHERE id = ?", [invitedUserId])
      }
      await pool.execute("DELETE FROM pacientes WHERE id = ?", [patientId])
      if (personaId !== undefined) await pool.execute("DELETE FROM personas WHERE id = ?", [personaId])
    }
    if (replaySessionToken) {
      await pool.execute("DELETE FROM auth_sessions WHERE token_hash = ?", [hashSessionToken(replaySessionToken)])
    }
    await fixture.cleanup()
  }
})
