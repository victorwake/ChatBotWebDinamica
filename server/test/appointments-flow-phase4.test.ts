import assert from "node:assert/strict"
import test from "node:test"
import type { RowDataPacket } from "mysql2/promise"
import { pool } from "../src/db/pool"
import { createPhase4Fixture } from "./appointments-phase4-fixtures"

test("patient books an available slot and admin confirms it with persisted history", async () => {
  const fixture = await createPhase4Fixture()

  try {
    const publicSpecialtiesResponse = await fetch(`${fixture.baseUrl}/api/v1/specialties`)
    assert.equal(publicSpecialtiesResponse.status, 200)
    const publicSpecialties = await publicSpecialtiesResponse.json() as Array<{ id: string; name: string }>
    assert.ok(publicSpecialties.some((specialty) => specialty.id === String(fixture.specialtyId)))

    const publicDoctorsResponse = await fetch(`${fixture.baseUrl}/api/v1/doctors?specialtyId=${fixture.specialtyId}`)
    assert.equal(publicDoctorsResponse.status, 200)
    const publicDoctors = await publicDoctorsResponse.json() as Array<{
      id: string
      displayName: string
      specialty: { id: string; name: string }
    }>
    assert.ok(publicDoctors.some((doctor) =>
      doctor.id === String(fixture.doctorId)
      && doctor.specialty.id === String(fixture.specialtyId)
      && !("email" in doctor)
      && !("phone" in doctor),
    ))

    const anonymous = await fetch(
      `${fixture.baseUrl}/api/v1/appointments/availability?from=${encodeURIComponent(fixture.from)}&to=${encodeURIComponent(fixture.to)}&doctorId=${fixture.doctorId}&pageSize=100`,
    )
    assert.equal(anonymous.status, 200)
    const publicAvailability = await anonymous.json() as {
      items: Array<{ id: string; doctor: { id: string }; startsAt: string; patient?: unknown }>
    }
    assert.ok(publicAvailability.items.some((slot) => slot.doctor.id === String(fixture.doctorId)))
    assert.ok(publicAvailability.items.every((slot) => !("patient" in slot) && !("email" in slot)))

    const patient = await fixture.login(fixture.patient, fixture.baseUrl)
    const invalidRange = await fetch(
      `${fixture.baseUrl}/api/v1/appointments/availability?from=${encodeURIComponent(fixture.from)}&to=${encodeURIComponent(fixture.from)}`,
      { headers: { Cookie: patient.cookie } },
    )
    assert.equal(invalidRange.status, 422)

    const slots = await fixture.slots(patient.cookie)
    assert.ok(slots.length >= 6)
    const slot = slots[0]
    assert.ok(slot)
    assert.equal(slot.doctor.id, String(fixture.doctorId))
    assert.equal(slot.startsAt.slice(0, 10), fixture.date)

    const createResponse = await fetch(`${fixture.baseUrl}/api/v1/appointments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: patient.cookie,
        "X-CSRF-Token": patient.csrfToken,
      },
      body: JSON.stringify({ slotId: slot.id, reason: "Control de prueba" }),
    })
    assert.equal(createResponse.status, 201)
    const created = await createResponse.json() as {
      id: string
      status: string
      patient: { id: string }
      startsAt: string
    }
    assert.equal(created.status, "requested")
    assert.equal(created.patient.id, fixture.patient.patientId?.toString())
    assert.equal(created.startsAt, slot.startsAt)
    assert.ok(createResponse.headers.get("location")?.endsWith(`/appointments/${created.id}`))

    const patientGet = await fetch(
      `${fixture.baseUrl}/api/v1/appointments/${created.id}`,
      { headers: { Cookie: patient.cookie } },
    )
    assert.equal(patientGet.status, 200)
    assert.equal((await patientGet.json() as { id: string }).id, created.id)

    const admin = await fixture.login(fixture.administrator, fixture.baseUrl)
    const confirmResponse = await fetch(
      `${fixture.baseUrl}/api/v1/appointments/${created.id}/confirm`,
      {
        method: "POST",
        headers: {
          Cookie: admin.cookie,
          "X-CSRF-Token": admin.csrfToken,
        },
      },
    )
    assert.equal(confirmResponse.status, 200)
    assert.equal((await confirmResponse.json() as { status: string }).status, "confirmed")

    const repeatedConfirm = await fetch(
      `${fixture.baseUrl}/api/v1/appointments/${created.id}/confirm`,
      {
        method: "POST",
        headers: {
          Cookie: admin.cookie,
          "X-CSRF-Token": admin.csrfToken,
        },
      },
    )
    assert.equal(repeatedConfirm.status, 409)

    const patientList = await fetch(`${fixture.baseUrl}/api/v1/appointments?page=1&pageSize=10`, {
      headers: { Cookie: patient.cookie },
    })
    assert.equal(patientList.status, 200)
    const page = await patientList.json() as { items: Array<{ id: string; status: string }> }
    assert.ok(page.items.some((item) => item.id === created.id && item.status === "confirmed"))

    const [history] = await pool.execute<Array<RowDataPacket & { actions: number }>>(
      "SELECT COUNT(*) AS actions FROM turnos_historial WHERE turno_id = ?",
      [Number(created.id)],
    )
    assert.equal(Number(history[0]?.actions), 2)
  } finally {
    await fixture.close()
  }
})
