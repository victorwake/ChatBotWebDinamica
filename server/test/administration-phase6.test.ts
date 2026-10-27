import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise"
import { closeServer, createPhase3Fixture } from "./phase3-fixtures"
import { hashPassword } from "../src/auth/password"
import { pool, withTransaction } from "../src/db/pool"

test("administrator manages account access and reads minimized audit events", async () => {
  const fixture = await createPhase3Fixture()
  const { server, baseUrl } = await fixture.startServer()
  const managedUserId = fixture.otherPatient.userId
  const accountIds = [
    fixture.patient.userId,
    fixture.otherPatient.userId,
    fixture.administrator.userId,
    fixture.doctor.userId,
  ]
  let administrativeUserId: number | undefined
  let administrativePersonaId: number | undefined

  try {
    const administrativeSuffix = randomUUID().replaceAll("-", "")
    const administrativeEmail = `phase6-staff-${administrativeSuffix}@example.invalid`
    const administrativePassword = `Phase6-${randomUUID()}`
    const administrativeAccount = await withTransaction(async (connection) => {
      const [roles] = await connection.execute<Array<RowDataPacket & { id: number }>>(
        "SELECT id FROM roles WHERE nombre = 'administrativo' LIMIT 1",
      )
      assert.ok(roles[0], "the administrative role must be provisioned")
      const [person] = await connection.execute<ResultSetHeader>(
        `INSERT INTO personas (nombre, apellido, dni, email_contacto, activo)
         VALUES ('Fase 6', 'Personal', ?, ?, TRUE)`,
        [`P6${administrativeSuffix.slice(0, 18)}`, administrativeEmail],
      )
      const [user] = await connection.execute<ResultSetHeader>(
        `INSERT INTO users (persona_id, email, password_hash, is_active, email_verified)
         VALUES (?, ?, ?, TRUE, TRUE)`,
        [person.insertId, administrativeEmail, await hashPassword(administrativePassword)],
      )
      await connection.execute(
        "INSERT INTO usuarios_roles (user_id, role_id) VALUES (?, ?)",
        [user.insertId, roles[0].id],
      )
      return { userId: user.insertId, personaId: person.insertId }
    })
    administrativeUserId = administrativeAccount.userId
    administrativePersonaId = administrativeAccount.personaId

    const administrator = await fixture.login(fixture.administrator, baseUrl)
    const accountsResponse = await fetch(`${baseUrl}/api/v1/users?page=1&pageSize=10`, {
      headers: { Cookie: administrator.cookie },
    })
    assert.equal(accountsResponse.status, 200)
    const accounts = await accountsResponse.json() as {
      items: Array<{ id: string; email: string; active: boolean; roles: string[] }>
      totalItems: number
    }
    assert.ok(accounts.totalItems >= 4)
    assert.ok(accounts.items.some((account) => account.id === String(managedUserId)))
    assert.equal(JSON.stringify(accounts).includes("password_hash"), false)

    const patient = await fixture.login(fixture.patient, baseUrl)
    const deniedList = await fetch(`${baseUrl}/api/v1/users`, {
      headers: { Cookie: patient.cookie },
    })
    assert.equal(deniedList.status, 403)
    const administrative = await fixture.login({
      ...administrativeAccount,
      email: administrativeEmail,
      password: administrativePassword,
    }, baseUrl)
    const deniedAdministration = await fetch(`${baseUrl}/api/v1/users`, {
      headers: { Cookie: administrative.cookie },
    })
    assert.equal(deniedAdministration.status, 403)
    const deniedAudit = await fetch(`${baseUrl}/api/v1/audit-logs`, {
      headers: { Cookie: administrative.cookie },
    })
    assert.equal(deniedAudit.status, 403)

    const missingCsrf = await fetch(`${baseUrl}/api/v1/users/${managedUserId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: administrator.cookie,
      },
      body: JSON.stringify({ active: false }),
    })
    assert.equal(missingCsrf.status, 403)

    const updateResponse = await fetch(`${baseUrl}/api/v1/users/${managedUserId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: administrator.cookie,
        "X-CSRF-Token": administrator.csrfToken,
      },
      body: JSON.stringify({ active: false, roles: ["doctor"] }),
    })
    assert.equal(updateResponse.status, 200)
    const updatedAccount = await updateResponse.json() as {
      id: string
      active: boolean
      roles: string[]
    }
    assert.equal(updatedAccount.id, String(managedUserId))
    assert.equal(updatedAccount.active, false)
    assert.deepEqual(updatedAccount.roles, ["doctor"])

    const detailResponse = await fetch(`${baseUrl}/api/v1/users/${managedUserId}`, {
      headers: { Cookie: administrator.cookie },
    })
    assert.equal(detailResponse.status, 200)
    assert.deepEqual(await detailResponse.json(), updatedAccount)

    const auditResponse = await fetch(
      `${baseUrl}/api/v1/audit-logs?resourceId=${managedUserId}&action=account.updated`,
      { headers: { Cookie: administrator.cookie } },
    )
    assert.equal(auditResponse.status, 200)
    const audit = await auditResponse.json() as {
      items: Array<{
        actorId: string
        action: string
        resourceType: string
        resourceId: string
        occurredAt: string
      }>
    }
    assert.ok(audit.items.length >= 1)
    assert.equal(audit.items[0]?.actorId, String(fixture.administrator.userId))
    assert.equal(audit.items[0]?.action, "account.updated")
    assert.equal(audit.items[0]?.resourceType, "user")
    assert.equal(audit.items[0]?.resourceId, String(managedUserId))
    assert.ok(Number.isFinite(Date.parse(audit.items[0]?.occurredAt ?? "")))
    assert.equal(JSON.stringify(audit).includes(fixture.otherPatient.email), false)
    assert.equal(JSON.stringify(audit).includes("password"), false)

    const selfDeactivation = await fetch(
      `${baseUrl}/api/v1/users/${fixture.administrator.userId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: administrator.cookie,
          "X-CSRF-Token": administrator.csrfToken,
        },
        body: JSON.stringify({ active: false }),
      },
    )
    assert.equal(selfDeactivation.status, 409)
    assert.equal(
      (await selfDeactivation.json() as { error: { code: string } }).error.code,
      "SELF_ADMIN_CHANGE",
    )
  } finally {
    await closeServer(server)
    const testAccountIds = [
      ...accountIds,
      ...(administrativeUserId === undefined ? [] : [administrativeUserId]),
    ]
    const placeholders = testAccountIds.map(() => "?").join(", ")
    if (testAccountIds.length > 0) {
      await pool.execute(
        `DELETE FROM auditoria
         WHERE usuario_id IN (${placeholders})
            OR (tabla_afectada = 'users' AND registro_id IN (${placeholders}))`,
        [...testAccountIds, ...testAccountIds],
      )
    }
    if (administrativeUserId !== undefined) {
      await pool.execute("DELETE FROM auth_sessions WHERE user_id = ?", [administrativeUserId])
      await pool.execute("DELETE FROM users WHERE id = ?", [administrativeUserId])
    }
    if (administrativePersonaId !== undefined) {
      await pool.execute("DELETE FROM personas WHERE id = ?", [administrativePersonaId])
    }
    await fixture.cleanup()
  }
})
