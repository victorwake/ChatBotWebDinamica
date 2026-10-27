import assert from "node:assert/strict"
import test from "node:test"
import type { RowDataPacket } from "mysql2/promise"
import { pool } from "../src/db/pool"
import { createPhase5Fixture } from "./clinical-phase5-fixtures"

test("doctor records a consultation, patient reads their own record, and administration is denied", async () => {
  const fixture = await createPhase5Fixture()

  try {
    const anonymous = await fetch(`${fixture.baseUrl}/api/v1/consultations`)
    assert.equal(anonymous.status, 401)

    const doctor = await fixture.login(fixture.doctor, fixture.baseUrl)
    const withoutCsrf = await fetch(`${fixture.baseUrl}/api/v1/consultations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: doctor.cookie },
      body: JSON.stringify({ appointmentId: String(fixture.appointmentId), type: "programada" }),
    })
    assert.equal(withoutCsrf.status, 403)

    const createResponse = await fetch(`${fixture.baseUrl}/api/v1/consultations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: doctor.cookie,
        "X-CSRF-Token": doctor.csrfToken,
      },
      body: JSON.stringify({
        appointmentId: String(fixture.appointmentId),
        type: "programada",
        reason: "Synthetic consultation reason",
        primaryDiagnosis: "Synthetic primary diagnosis",
        observations: "Synthetic clinical note",
        systolicPressure: 120,
        diastolicPressure: 80,
        weight: 72.5,
      }),
    })
    assert.equal(createResponse.status, 201)
    const consultation = await createResponse.json() as {
      id: string
      patient: { id: string }
      doctor: { id: string }
      type: string
      primaryDiagnosis: string
      observations: string
    }
    assert.equal(consultation.patient.id, String(fixture.patient.patientId))
    assert.equal(consultation.doctor.id, String(fixture.doctorId))
    assert.equal(consultation.type, "programada")
    assert.equal(consultation.primaryDiagnosis, "Synthetic primary diagnosis")
    assert.equal(consultation.observations, "Synthetic clinical note")

    const doctorRead = await fetch(
      `${fixture.baseUrl}/api/v1/consultations/${consultation.id}`,
      { headers: { Cookie: doctor.cookie } },
    )
    assert.equal(doctorRead.status, 200)

    const patient = await fixture.login(fixture.patient, fixture.baseUrl)
    const patientRead = await fetch(
      `${fixture.baseUrl}/api/v1/consultations/${consultation.id}`,
      { headers: { Cookie: patient.cookie } },
    )
    assert.equal(patientRead.status, 200)
    const patientDetail = await patientRead.json() as { observations: string }
    assert.equal(patientDetail.observations, "Synthetic clinical note")

    const administrator = await fixture.login(fixture.administrator, fixture.baseUrl)
    const adminRead = await fetch(
      `${fixture.baseUrl}/api/v1/consultations/${consultation.id}`,
      { headers: { Cookie: administrator.cookie } },
    )
    assert.equal(adminRead.status, 403)

    const [appointmentRows] = await pool.execute<Array<RowDataPacket & { status: string }>>(
      "SELECT estado AS status FROM turnos WHERE id = ?",
      [fixture.appointmentId],
    )
    assert.equal(appointmentRows[0]?.status, "atendido")
    const [historyRows] = await pool.execute<Array<RowDataPacket & { count: number }>>(
      "SELECT COUNT(*) AS count FROM turnos_historial WHERE turno_id = ? AND estado_nuevo = 'atendido'",
      [fixture.appointmentId],
    )
    assert.equal(Number(historyRows[0]?.count), 1)
  } finally {
    await fixture.close()
  }
})
