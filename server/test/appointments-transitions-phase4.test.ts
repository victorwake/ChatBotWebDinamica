import assert from "node:assert/strict"
import test from "node:test"
import { createPhase4Fixture } from "./appointments-phase4-fixtures"

test("appointment ownership, rescheduling and cancellation enforce valid transitions", async () => {
  const fixture = await createPhase4Fixture()

  try {
    const patient = await fixture.login(fixture.patient, fixture.baseUrl)
    const slots = await fixture.slots(patient.cookie)
    assert.ok(slots.length >= 2)
    const first = slots[0]
    const next = slots[1]
    assert.ok(first && next)

    const foreignPatientBooking = await fetch(`${fixture.baseUrl}/api/v1/appointments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: patient.cookie,
        "X-CSRF-Token": patient.csrfToken,
      },
      body: JSON.stringify({ slotId: first.id, patientId: fixture.otherPatient.patientId?.toString() }),
    })
    assert.equal(foreignPatientBooking.status, 403)

    const createResponse = await fetch(`${fixture.baseUrl}/api/v1/appointments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: patient.cookie,
        "X-CSRF-Token": patient.csrfToken,
      },
      body: JSON.stringify({ slotId: first.id }),
    })
    assert.equal(createResponse.status, 201)
    const created = await createResponse.json() as { id: string; startsAt: string }

    const otherPatient = await fixture.login(fixture.otherPatient, fixture.baseUrl)
    const foreignGet = await fetch(
      `${fixture.baseUrl}/api/v1/appointments/${created.id}`,
      { headers: { Cookie: otherPatient.cookie } },
    )
    assert.equal(foreignGet.status, 403)

    const reschedule = await fetch(
      `${fixture.baseUrl}/api/v1/appointments/${created.id}/reschedule`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: patient.cookie,
          "X-CSRF-Token": patient.csrfToken,
        },
        body: JSON.stringify({ slotId: next.id, reason: "Cambio de horario" }),
      },
    )
    assert.equal(reschedule.status, 200)
    const updated = await reschedule.json() as { startsAt: string; status: string }
    assert.equal(updated.startsAt, next.startsAt)
    assert.equal(updated.status, "requested")

    const cancel = await fetch(
      `${fixture.baseUrl}/api/v1/appointments/${created.id}/cancel`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: patient.cookie,
          "X-CSRF-Token": patient.csrfToken,
        },
        body: JSON.stringify({ reason: "No puedo asistir" }),
      },
    )
    assert.equal(cancel.status, 200)
    assert.equal((await cancel.json() as { status: string }).status, "cancelled")

    const repeatedCancel = await fetch(
      `${fixture.baseUrl}/api/v1/appointments/${created.id}/cancel`,
      {
        method: "POST",
        headers: {
          Cookie: patient.cookie,
          "X-CSRF-Token": patient.csrfToken,
        },
      },
    )
    assert.equal(repeatedCancel.status, 409)

    const admin = await fixture.login(fixture.administrator, fixture.baseUrl)
    const adminCreate = await fetch(`${fixture.baseUrl}/api/v1/appointments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: admin.cookie,
        "X-CSRF-Token": admin.csrfToken,
      },
      body: JSON.stringify({ slotId: first.id, patientId: fixture.patient.patientId?.toString() }),
    })
    assert.equal(adminCreate.status, 201)
    const bookedForPatient = await adminCreate.json() as { id: string; patient: { id: string } }
    assert.equal(bookedForPatient.patient.id, fixture.patient.patientId?.toString())
  } finally {
    await fixture.close()
  }
})
