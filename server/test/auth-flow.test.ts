import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { once } from "node:events"
import test from "node:test"
import type { AddressInfo } from "node:net"
import express from "express"
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise"
import bcrypt from "bcryptjs"
import { app } from "../src/app"
import { hashPassword } from "../src/auth/password"
import { hashSessionToken, normalizeRole, parseCookies } from "../src/auth/security"
import { pool, withTransaction } from "../src/db/pool"
import {
  requireAuthentication,
  requirePatientSelfOrRoles,
  requireRoles,
} from "../src/middleware/authentication"

test("patient login creates a cookie session, exposes current user and logout revokes it", async () => {
  const suffix = randomUUID().replaceAll("-", "")
  const email = `auth-test-${suffix}@example.invalid`
  const password = `Phase2-${randomUUID()}`
  const dni = String(Date.now()).slice(-8) + suffix.slice(0, 4)
  let personaId: number | undefined
  let userId: number | undefined
  let preAuthToken: string | undefined
  let sessionToken: string | undefined
  const additionalAccounts: Array<{
    personaId: number
    userId: number
    email: string
    password: string
    roleName: string
    expectedRole: string
  }> = []
  const additionalPreAuthTokens: string[] = []
  const additionalSessionTokens: string[] = []
  const server = app.listen(0)

  try {
    await once(server, "listening")
    const address = server.address() as AddressInfo
    const baseUrl = `http://127.0.0.1:${address.port}`

    await withTransaction(async (connection) => {
      const [roleRows] = await connection.execute<Array<RowDataPacket & { id: number }>>(
        "SELECT id FROM roles WHERE nombre = 'paciente' LIMIT 1",
      )
      assert.ok(roleRows[0], "the patient role must be provisioned")

      const [personaResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO personas (nombre, apellido, dni, email_contacto, activo)
         VALUES ('Postman', 'Auth Test', ?, ?, TRUE)`,
        [dni, email],
      )
      personaId = personaResult.insertId
      const passwordHash = await hashPassword(password)
      const [userResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO users (persona_id, email, password_hash, is_active, email_verified)
         VALUES (?, ?, ?, TRUE, TRUE)`,
        [personaId, email, passwordHash],
      )
      userId = userResult.insertId
      await connection.execute(
        "INSERT INTO pacientes (persona_id, activo) VALUES (?, TRUE)",
        [personaId],
      )
      await connection.execute(
        "INSERT INTO usuarios_roles (user_id, role_id) VALUES (?, ?)",
        [userId, roleRows[0].id],
      )

      const staffRoles = [
        { roleName: "medico", expectedRole: "doctor" },
        { roleName: "administrativo", expectedRole: "administrative" },
        { roleName: "administrador", expectedRole: "administrator" },
      ]
      for (const [index, role] of staffRoles.entries()) {
        const staffEmail = `auth-test-${role.expectedRole}-${suffix}@example.invalid`
        const staffPassword = `Phase2-${role.expectedRole}-${randomUUID()}`
        const staffDni = `${dni.slice(0, 8)}${index + 1}`
        const [staffRolesRows] = await connection.execute<Array<RowDataPacket & { id: number }>>(
          "SELECT id FROM roles WHERE nombre = ? LIMIT 1",
          [role.roleName],
        )
        assert.ok(staffRolesRows[0], `the ${role.roleName} role must be provisioned`)
        const [staffPersona] = await connection.execute<ResultSetHeader>(
          `INSERT INTO personas (nombre, apellido, dni, email_contacto, activo)
           VALUES ('Postman', ?, ?, ?, TRUE)`,
          [role.expectedRole, staffDni, staffEmail],
        )
        const staffHash = await hashPassword(staffPassword)
        const [staffUser] = await connection.execute<ResultSetHeader>(
          `INSERT INTO users (persona_id, email, password_hash, is_active, email_verified)
           VALUES (?, ?, ?, TRUE, TRUE)`,
          [staffPersona.insertId, staffEmail, staffHash],
        )
        await connection.execute(
          "INSERT INTO usuarios_roles (user_id, role_id) VALUES (?, ?)",
          [staffUser.insertId, staffRolesRows[0].id],
        )
        additionalAccounts.push({
          personaId: staffPersona.insertId,
          userId: staffUser.insertId,
          email: staffEmail,
          password: staffPassword,
          ...role,
        })
      }
    })

    const csrfResponse = await fetch(`${baseUrl}/api/v1/auth/csrf`)
    assert.equal(csrfResponse.status, 200)
    const preAuthCookie = csrfResponse.headers.get("set-cookie")
    assert.ok(preAuthCookie?.includes("HttpOnly"))
    assert.ok(preAuthCookie?.includes("SameSite=Lax"))
    preAuthToken = parseCookies(preAuthCookie ?? undefined)["session"]
    assert.ok(preAuthToken)
    const preAuthCsrf = (await csrfResponse.json() as { csrfToken: string }).csrfToken
    assert.equal(preAuthCsrf.length, 64)

    const rejectedCsrf = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${preAuthToken}`,
        "X-CSRF-Token": "invalid",
      },
      body: JSON.stringify({ email, password }),
    })
    assert.equal(rejectedCsrf.status, 403)

    const invalidCredentials = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${preAuthToken}`,
        "X-CSRF-Token": preAuthCsrf,
      },
      body: JSON.stringify({ email, password: "incorrect-password" }),
    })
    assert.equal(invalidCredentials.status, 401)
    assert.equal((await invalidCredentials.json() as { error: { code: string } }).error.code, "INVALID_CREDENTIALS")

    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session=${preAuthToken}`,
        "X-CSRF-Token": preAuthCsrf,
      },
      body: JSON.stringify({ email, password }),
    })
    assert.equal(loginResponse.status, 200)
    const authCookie = loginResponse.headers.get("set-cookie")
    assert.ok(authCookie?.includes("HttpOnly"))
    sessionToken = parseCookies(authCookie ?? undefined)["session"]
    assert.ok(sessionToken)
    assert.notEqual(sessionToken, preAuthToken)

    const loginBody = await loginResponse.json() as {
      id: string
      displayName: string
      email: string
      roles: string[]
      patientId: string
    }
    assert.equal(loginBody.id, String(userId))
    assert.equal(loginBody.displayName, "Postman Auth Test")
    assert.equal(loginBody.email, email)
    assert.deepEqual(loginBody.roles, ["patient"])
    assert.ok(loginBody.patientId)
    assert.equal(JSON.stringify(loginBody).includes(sessionToken), false)

    const meResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Cookie: `session=${sessionToken}` },
    })
    assert.equal(meResponse.status, 200)
    assert.deepEqual(await meResponse.json(), loginBody)

    const roleProbe = express()
    roleProbe.get("/patient", requireAuthentication, requireRoles("patient"), (_req, res) => res.sendStatus(204))
    roleProbe.get("/doctor", requireAuthentication, requireRoles("doctor"), (_req, res) => res.sendStatus(204))
    roleProbe.get("/administrative", requireAuthentication, requireRoles("administrative"), (_req, res) => res.sendStatus(204))
    roleProbe.get("/administrator", requireAuthentication, requireRoles("administrator"), (_req, res) => res.sendStatus(204))
    roleProbe.get(
      "/patients/:patientId",
      requireAuthentication,
      requirePatientSelfOrRoles("patientId", "administrative", "administrator"),
      (_req, res) => res.sendStatus(204),
    )
    const roleServer = roleProbe.listen(0)
    await once(roleServer, "listening")
    const roleBaseUrl = `http://127.0.0.1:${(roleServer.address() as AddressInfo).port}`
    try {
      const patientAccess = await fetch(`${roleBaseUrl}/patient`, {
        headers: { Cookie: `session=${sessionToken}` },
      })
      assert.equal(patientAccess.status, 204)
      const forbiddenAccess = await fetch(`${roleBaseUrl}/administrator`, {
        headers: { Cookie: `session=${sessionToken}` },
      })
      assert.equal(forbiddenAccess.status, 403)
      const ownerAccess = await fetch(`${roleBaseUrl}/patients/${loginBody.patientId}`, {
        headers: { Cookie: `session=${sessionToken}` },
      })
      assert.equal(ownerAccess.status, 204)
      const otherPatientAccess = await fetch(`${roleBaseUrl}/patients/another-patient`, {
        headers: { Cookie: `session=${sessionToken}` },
      })
      assert.equal(otherPatientAccess.status, 403)

      for (const account of additionalAccounts) {
        const roleCsrfResponse = await fetch(`${baseUrl}/api/v1/auth/csrf`)
        const roleCookie = roleCsrfResponse.headers.get("set-cookie")
        const rolePreAuthToken = parseCookies(roleCookie ?? undefined)["session"]
        additionalPreAuthTokens.push(rolePreAuthToken)
        const roleCsrf = (await roleCsrfResponse.json() as { csrfToken: string }).csrfToken
        const roleLoginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session=${rolePreAuthToken}`,
            "X-CSRF-Token": roleCsrf,
          },
          body: JSON.stringify({ email: account.email, password: account.password }),
        })
        assert.equal(roleLoginResponse.status, 200)
        const roleSessionToken = parseCookies(roleLoginResponse.headers.get("set-cookie") ?? undefined)["session"]
        assert.ok(roleSessionToken)
        additionalSessionTokens.push(roleSessionToken)
        const roleLoginBody = await roleLoginResponse.json() as { id: string; roles: string[] }
        assert.equal(roleLoginBody.id, String(account.userId))
        assert.deepEqual(roleLoginBody.roles, [account.expectedRole])

        const expectedRoleAccess = await fetch(`${roleBaseUrl}/${account.expectedRole}`, {
          headers: { Cookie: `session=${roleSessionToken}` },
        })
        assert.equal(expectedRoleAccess.status, 204)
        const patientOnlyAccess = await fetch(`${roleBaseUrl}/patient`, {
          headers: { Cookie: `session=${roleSessionToken}` },
        })
        assert.equal(patientOnlyAccess.status, 403)
        const privilegedPatientAccess = await fetch(`${roleBaseUrl}/patients/${loginBody.patientId}`, {
          headers: { Cookie: `session=${roleSessionToken}` },
        })
        assert.equal(
          privilegedPatientAccess.status,
          account.expectedRole === "doctor" ? 403 : 204,
        )

        const staffCsrfResponse = await fetch(`${baseUrl}/api/v1/auth/csrf`, {
          headers: { Cookie: `session=${roleSessionToken}` },
        })
        const staffCsrf = (await staffCsrfResponse.json() as { csrfToken: string }).csrfToken
        const staffLogout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
          method: "POST",
          headers: {
            Cookie: `session=${roleSessionToken}`,
            "X-CSRF-Token": staffCsrf,
          },
        })
        assert.equal(staffLogout.status, 204)
      }
    } finally {
      roleServer.close()
      await once(roleServer, "close")
    }

    const csrfAfterLogin = await fetch(`${baseUrl}/api/v1/auth/csrf`, {
      headers: { Cookie: `session=${sessionToken}` },
    })
    assert.equal(csrfAfterLogin.status, 200)
    const authenticatedCsrf = (await csrfAfterLogin.json() as { csrfToken: string }).csrfToken
    const logoutResponse = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        Cookie: `session=${sessionToken}`,
        "X-CSRF-Token": authenticatedCsrf,
      },
    })
    assert.equal(logoutResponse.status, 204)
    assert.ok(logoutResponse.headers.get("set-cookie")?.includes("Max-Age=0"))

    const revokedSessionResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Cookie: `session=${sessionToken}` },
    })
    assert.equal(revokedSessionResponse.status, 401)
  } finally {
    if (server.listening) {
      server.close()
      await once(server, "close")
    }
    await withTransaction(async (connection) => {
      if (preAuthToken) {
        await connection.execute("DELETE FROM auth_sessions WHERE token_hash = ?", [hashSessionToken(preAuthToken)])
      }
      if (sessionToken) {
        await connection.execute("DELETE FROM auth_sessions WHERE token_hash = ?", [hashSessionToken(sessionToken)])
      }
      for (const token of additionalPreAuthTokens) {
        await connection.execute("DELETE FROM auth_sessions WHERE token_hash = ?", [hashSessionToken(token)])
      }
      for (const token of additionalSessionTokens) {
        await connection.execute("DELETE FROM auth_sessions WHERE token_hash = ?", [hashSessionToken(token)])
      }
      if (personaId) {
        await connection.execute("DELETE FROM pacientes WHERE persona_id = ?", [personaId])
      }
      if (userId) {
        await connection.execute("DELETE FROM users WHERE id = ?", [userId])
      }
      for (const account of additionalAccounts) {
        await connection.execute("DELETE FROM users WHERE id = ?", [account.userId])
      }
      if (personaId) {
        await connection.execute("DELETE FROM personas WHERE id = ?", [personaId])
      }
      for (const account of additionalAccounts) {
        await connection.execute("DELETE FROM personas WHERE id = ?", [account.personaId])
      }
    })
    await pool.end()
  }
})

test("Spanish database roles map to contract roles", () => {
  assert.equal(normalizeRole("paciente"), "patient")
  assert.equal(normalizeRole("medico"), "doctor")
  assert.equal(normalizeRole("administrativo"), "administrative")
  assert.equal(normalizeRole("administrador"), "administrator")
  assert.equal(normalizeRole("otro"), undefined)
})

test("legacy bcrypt password hashes verify and are marked for Argon2id migration", async () => {
  const hash = await bcrypt.hash("migration-test-password", 4)
  const { verifyPassword } = await import("../src/auth/password")
  assert.deepEqual(await verifyPassword("migration-test-password", hash), {
    valid: true,
    needsRehash: true,
  })
  assert.deepEqual(await verifyPassword("wrong-password", hash), {
    valid: false,
    needsRehash: false,
  })
})
