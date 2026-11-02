import assert from "node:assert/strict"
import test from "node:test"
import { createPhase4Fixture, type TestSlot } from "./appointments-phase4-fixtures"

type Session = { cookie: string; csrfToken: string }

async function reserve(baseUrl: string, session: Session, slot: TestSlot): Promise<Response> {
  return fetch(`${baseUrl}/api/v1/appointments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: session.cookie,
      "X-CSRF-Token": session.csrfToken,
    },
    body: JSON.stringify({ slotId: slot.id }),
  })
}

test("concurrent patient bookings on different doctors allow only one overlapping appointment", async () => {
  const fixture = await createPhase4Fixture()

  try {
    const patient = await fixture.login(fixture.patient, fixture.baseUrl)
    const firstDoctorSlots = await fixture.slots(patient.cookie)
    const otherDoctorSlots = await fixture.slotsForDoctor(patient.cookie, fixture.otherDoctorId)
    const firstSlot = firstDoctorSlots[0]
    assert.ok(firstSlot)
    const sameTimeSlot = otherDoctorSlots.find((slot) => slot.startsAt === firstSlot.startsAt)
    assert.ok(sameTimeSlot)

    const responses = await Promise.all([
      reserve(fixture.baseUrl, patient, firstSlot),
      reserve(fixture.baseUrl, patient, sameTimeSlot),
    ])
    assert.deepEqual(responses.map((response) => response.status).sort((a, b) => a - b), [201, 409])
    const conflict = responses.find((response) => response.status === 409)
    assert.ok(conflict)
    assert.equal((await conflict.json() as { error: { code: string } }).error.code, "PATIENT_APPOINTMENT_OVERLAP")
  } finally {
    await fixture.close()
  }
})
