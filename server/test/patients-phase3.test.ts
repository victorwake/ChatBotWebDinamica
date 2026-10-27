import assert from "node:assert/strict"
import test from "node:test"
import type { RowDataPacket } from "mysql2/promise"
import { pool, withTransaction } from "../src/db/pool"
import { closeServer, createPhase3Fixture } from "./phase3-fixtures"

test("phase 3 patient records enforce ownership, support admin search and persist updates", async () => {
  const fixture = await createPhase3Fixture()
  const patientId = fixture.patient.patientId
  assert.ok(patientId)
  const { server, baseUrl } = await fixture.startServer()
  let createdPatientId: number | undefined

  try {
    const anonymousList = await fetch(`${baseUrl}/api/v1/patients`)
    assert.equal(anonymousList.status, 401)

    const patientSession = await fixture.login(fixture.patient, baseUrl)
    const ownProfileResponse = await fetch(
      `${baseUrl}/api/v1/patients/${patientId}`,
      { headers: { Cookie: patientSession.cookie } },
    )
    assert.equal(ownProfileResponse.status, 200)
    const ownProfile = await ownProfileResponse.json() as { id: string; nationalId: string; notes?: string }
    assert.equal(ownProfile.id, String(fixture.patient.patientId))
    assert.equal(ownProfile.nationalId, `${fixture.suffix.slice(0, 14)}001`)
    assert.equal("notes" in ownProfile, false)

    const otherProfileResponse = await fetch(
      `${baseUrl}/api/v1/patients/${fixture.otherPatient.patientId}`,
      { headers: { Cookie: patientSession.cookie } },
    )
    assert.equal(otherProfileResponse.status, 403)

    const restrictedUpdateResponse = await fetch(
      `${baseUrl}/api/v1/patients/${patientId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: patientSession.cookie,
          "X-CSRF-Token": patientSession.csrfToken,
        },
        body: JSON.stringify({ nationalId: "99999999" }),
      },
    )
    assert.equal(restrictedUpdateResponse.status, 422)

    const patientListResponse = await fetch(`${baseUrl}/api/v1/patients`, {
      headers: { Cookie: patientSession.cookie },
    })
    assert.equal(patientListResponse.status, 403)

    const adminSession = await fixture.login(fixture.administrator, baseUrl)
    const searchResponse = await fetch(
      `${baseUrl}/api/v1/patients?search=${encodeURIComponent(fixture.suffix.slice(0, 14))}&page=1&pageSize=10`,
      { headers: { Cookie: adminSession.cookie } },
    )
    assert.equal(searchResponse.status, 200)
    const searchBody = await searchResponse.json() as {
      items: Array<{ id: string; nationalId?: string }>
      totalItems: number
    }
    assert.ok(searchBody.totalItems >= 2)
    assert.ok(searchBody.items.every((item) => !("nationalId" in item)))

    const input = {
      firstName: "Paciente",
      lastName: `Creado ${fixture.suffix.slice(0, 8)}`,
      nationalId: `${fixture.suffix.slice(0, 14)}003`,
      birthDate: "1985-02-03",
      phone: "+541155550011",
    }
    const createResponse = await fetch(`${baseUrl}/api/v1/patients`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminSession.cookie,
        "X-CSRF-Token": adminSession.csrfToken,
      },
      body: JSON.stringify(input),
    })
    assert.equal(createResponse.status, 201)
    const created = await createResponse.json() as { id: string; phone: string }
    createdPatientId = Number(created.id)
    assert.equal(created.phone, input.phone)

    const duplicateResponse = await fetch(`${baseUrl}/api/v1/patients`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminSession.cookie,
        "X-CSRF-Token": adminSession.csrfToken,
      },
      body: JSON.stringify(input),
    })
    assert.equal(duplicateResponse.status, 409)

    const updateResponse = await fetch(
      `${baseUrl}/api/v1/patients/${patientId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: patientSession.cookie,
          "X-CSRF-Token": patientSession.csrfToken,
        },
        body: JSON.stringify({ phone: "+541155550099" }),
      },
    )
    assert.equal(updateResponse.status, 200)
    const updated = await updateResponse.json() as { phone: string }
    assert.equal(updated.phone, "+541155550099")

    const [persisted] = await pool.execute<Array<RowDataPacket & { phone: string }>>(
      `SELECT p.telefono AS phone
       FROM personas p
       INNER JOIN pacientes pa ON pa.persona_id = p.id
       WHERE pa.id = ?`,
      [patientId],
    )
    assert.equal(persisted[0]?.phone, "+541155550099")
  } finally {
    if (createdPatientId) {
      const createdId = createdPatientId
      await withTransaction(async (connection) => {
        const [rows] = await connection.execute<Array<RowDataPacket & { personaId: number }>>(
          "SELECT persona_id AS personaId FROM pacientes WHERE id = ?",
          [createdId],
        )
        await connection.execute("DELETE FROM pacientes WHERE id = ?", [createdId])
        if (rows[0]) await connection.execute("DELETE FROM personas WHERE id = ?", [rows[0].personaId])
      })
    }
    await closeServer(server)
    await fixture.cleanup()
  }
})
