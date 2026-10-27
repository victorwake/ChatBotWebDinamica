import { randomUUID } from "node:crypto"
import type { AddressInfo } from "node:net"
import { once } from "node:events"
import type { Server } from "node:http"
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise"
import { app } from "../src/app"
import { hashPassword } from "../src/auth/password"
import { hashSessionToken, parseCookies } from "../src/auth/security"
import { pool, withTransaction } from "../src/db/pool"

export type TestAccount = {
  userId: number
  personaId: number
  patientId?: number
  email: string
  password: string
}

export type Phase3Fixture = {
  suffix: string
  patient: TestAccount
  otherPatient: TestAccount
  administrator: TestAccount
  doctor: TestAccount
  specialtyId: number
  doctorId: number
  providerId: number
  startServer(): Promise<{ server: Server; baseUrl: string }>
  login(account: TestAccount, baseUrl: string): Promise<{ cookie: string; csrfToken: string }>
  cleanup(): Promise<void>
}

export async function createPhase3Fixture(): Promise<Phase3Fixture> {
  const suffix = randomUUID().replaceAll("-", "")
  const createdAccounts: TestAccount[] = []
  let specialtyId = 0
  let doctorId = 0
  let providerId = 0

  const createAccount = async (
    connection: Parameters<Parameters<typeof withTransaction>[0]>[0],
    roleName: string,
    patient: boolean,
    accountSuffix: string,
  ): Promise<TestAccount> => {
    const [roles] = await connection.execute<Array<RowDataPacket & { id: number }>>(
      "SELECT id FROM roles WHERE nombre = ? LIMIT 1",
      [roleName],
    )
    if (!roles[0]) throw new Error(`Missing required database role ${roleName}`)

    const email = `phase3-${accountSuffix}-${suffix}@example.invalid`
    const password = `Phase3-${randomUUID()}`
    const [person] = await connection.execute<ResultSetHeader>(
      `INSERT INTO personas (nombre, apellido, dni, fecha_nacimiento, telefono, email_contacto, activo)
       VALUES (?, ?, ?, '1990-01-15', '+541155550000', ?, TRUE)`,
      ["Fase", accountSuffix, `${suffix.slice(0, 15)}${createdAccounts.length}`, email],
    )
    const passwordHash = await hashPassword(password)
    const [user] = await connection.execute<ResultSetHeader>(
      `INSERT INTO users (persona_id, email, password_hash, is_active, email_verified)
       VALUES (?, ?, ?, TRUE, TRUE)`,
      [person.insertId, email, passwordHash],
    )
    let patientId: number | undefined
    if (patient) {
      const [patientResult] = await connection.execute<ResultSetHeader>(
        "INSERT INTO pacientes (persona_id, activo) VALUES (?, TRUE)",
        [person.insertId],
      )
      patientId = patientResult.insertId
    }
    await connection.execute(
      "INSERT INTO usuarios_roles (user_id, role_id) VALUES (?, ?)",
      [user.insertId, roles[0].id],
    )
    const account = {
      userId: user.insertId,
      personaId: person.insertId,
      ...(patientId === undefined ? {} : { patientId }),
      email,
      password,
    }
    createdAccounts.push(account)
    return account
  }

  const patient = await withTransaction(async (connection) => {
    const account = await createAccount(connection, "paciente", true, "patient")
    await connection.execute(
      "UPDATE personas SET dni = ? WHERE id = ?",
      [`${suffix.slice(0, 14)}001`, account.personaId],
    )
    return account
  })
  const otherPatient = await withTransaction(async (connection) => {
    const account = await createAccount(connection, "paciente", true, "other")
    await connection.execute(
      "UPDATE personas SET dni = ? WHERE id = ?",
      [`${suffix.slice(0, 14)}002`, account.personaId],
    )
    return account
  })
  const administrator = await withTransaction((connection) =>
    createAccount(connection, "administrador", false, "admin"))
  const doctorAccount = await withTransaction((connection) =>
    createAccount(connection, "medico", false, "doctor"))

  await withTransaction(async (connection) => {
    const [specialty] = await connection.execute<ResultSetHeader>(
      "INSERT INTO especialidades (nombre, activa) VALUES (?, TRUE)",
      [`Fase 3 ${suffix.slice(0, 12)}`],
    )
    specialtyId = specialty.insertId
    const [doctor] = await connection.execute<ResultSetHeader>(
      "INSERT INTO medicos (persona_id, especialidad_id, matricula, activo) VALUES (?, ?, ?, TRUE)",
      [doctorAccount.personaId, specialtyId, `P3-${suffix.slice(0, 20)}`],
    )
    doctorId = doctor.insertId
    const [provider] = await connection.execute<ResultSetHeader>(
      "INSERT INTO obras_sociales (nombre, codigo, activa) VALUES (?, ?, TRUE)",
      [`Cobertura Fase 3 ${suffix.slice(0, 12)}`, `P3-${suffix.slice(0, 10)}`],
    )
    providerId = provider.insertId
  })

  return {
    suffix,
    patient,
    otherPatient,
    administrator,
    doctor: doctorAccount,
    specialtyId,
    doctorId,
    providerId,
    async startServer() {
      const server = app.listen(0)
      await once(server, "listening")
      const address = server.address() as AddressInfo
      return { server, baseUrl: `http://127.0.0.1:${address.port}` }
    },
    async login(account, baseUrl) {
      const csrfResponse = await fetch(`${baseUrl}/api/v1/auth/csrf`)
      if (!csrfResponse.ok) throw new Error(`Could not get pre-auth CSRF token: ${csrfResponse.status}`)
      const preAuthSession = parseCookies(csrfResponse.headers.get("set-cookie") ?? undefined).session
      const preAuthCsrf = (await csrfResponse.json() as { csrfToken: string }).csrfToken
      if (!preAuthSession) throw new Error("Missing pre-auth session cookie")

      const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session=${preAuthSession}`,
          "X-CSRF-Token": preAuthCsrf,
        },
        body: JSON.stringify({ email: account.email, password: account.password }),
      })
      if (!response.ok) throw new Error(`Test account login failed: ${response.status}`)
      const sessionCookie = parseCookies(response.headers.get("set-cookie") ?? undefined).session
      if (!sessionCookie) throw new Error("Missing authenticated session cookie")
      const authenticatedCsrfResponse = await fetch(`${baseUrl}/api/v1/auth/csrf`, {
        headers: { Cookie: `session=${sessionCookie}` },
      })
      if (!authenticatedCsrfResponse.ok) {
        throw new Error(`Could not get authenticated CSRF token: ${authenticatedCsrfResponse.status}`)
      }
      const csrfToken = (await authenticatedCsrfResponse.json() as { csrfToken: string }).csrfToken
      return { cookie: `session=${sessionCookie}`, csrfToken }
    },
    async cleanup() {
      await withTransaction(async (connection) => {
        const patientIds = createdAccounts
          .flatMap((account) => account.patientId === undefined ? [] : [account.patientId])
        const appointmentPredicates = ["medico_id = ?"]
        const appointmentValues: number[] = [doctorId]
        if (patientIds.length > 0) {
          appointmentPredicates.push(`paciente_id IN (${patientIds.map(() => "?").join(", ")})`)
          appointmentValues.push(...patientIds)
        }
        const [appointments] = await connection.execute<Array<RowDataPacket & { id: number }>>(
          `SELECT id FROM turnos WHERE ${appointmentPredicates.join(" OR ")}`,
          appointmentValues,
        )
        if (appointments.length > 0) {
          const appointmentIds = appointments.map((appointment) => appointment.id)
          const appointmentPlaceholders = appointmentIds.map(() => "?").join(", ")
          await connection.execute(
            `DELETE FROM turnos_historial WHERE turno_id IN (${appointmentPlaceholders})`,
            appointmentIds,
          )
          await connection.execute(
            `DELETE FROM turnos WHERE id IN (${appointmentPlaceholders})`,
            appointmentIds,
          )
        }
        for (const account of createdAccounts) {
          await connection.execute("DELETE FROM auth_sessions WHERE user_id = ?", [account.userId])
          if (account.patientId) {
            await connection.execute(
              "DELETE FROM pacientes_obras_sociales WHERE paciente_id = ?",
              [account.patientId],
            )
            await connection.execute("DELETE FROM pacientes WHERE id = ?", [account.patientId])
          }
          await connection.execute("DELETE FROM users WHERE id = ?", [account.userId])
        }
        if (doctorId) await connection.execute("DELETE FROM medicos WHERE id = ?", [doctorId])
        if (providerId) await connection.execute("DELETE FROM obras_sociales WHERE id = ?", [providerId])
        if (specialtyId) await connection.execute("DELETE FROM especialidades WHERE id = ?", [specialtyId])
        for (const account of createdAccounts) {
          await connection.execute("DELETE FROM personas WHERE id = ?", [account.personaId])
        }
      })
      await pool.end()
    },
  }
}

export async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return
  server.close()
  await once(server, "close")
}

export async function revokeTestSession(cookie: string): Promise<void> {
  const token = parseCookies(cookie).session
  if (token) {
    await pool.execute("DELETE FROM auth_sessions WHERE token_hash = ?", [hashSessionToken(token)])
  }
}
