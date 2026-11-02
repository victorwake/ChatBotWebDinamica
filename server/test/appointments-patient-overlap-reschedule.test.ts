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

test("rescheduling cannot create an overlapping appointment for the same patient", async () => {
  const fixture = await createPhase4Fixture()

  try {
    const patient = await fixture.login(fixture.patient, fixture.baseUrl)
    const primaryDoctorSlots = await fixture.slots(patient.cookie)
    const otherDoctorSlots = await fixture.slotsForDoctor(patient.cookie, fixture.otherDoctorId)
    const firstSlot = primaryDoctorSlots[0]
    assert.ok(firstSlot)
    const nonOverlappingSlot = otherDoctorSlots.find((slot) => slot.startsAt > firstSlot.endsAt)
    const overlappingSlot = otherDoctorSlots.find((slot) => slot.startsAt === firstSlot.startsAt)
    assert.ok(nonOverlappingSlot)
    assert.ok(overlappingSlot)

    const firstBooking = await reserve(fixture.baseUrl, patient, firstSlot)
    assert.equal(firstBooking.status, 201)
    const firstAppointment = await firstBooking.json() as { id: string }
    const secondBooking = await reserve(fixture.baseUrl, patient, nonOverlappingSlot)
    assert.equal(secondBooking.status, 201)
    const secondAppointment = await secondBooking.json() as { id: string }

    const reschedule = await fetch(
      `${fixture.baseUrl}/api/v1/appointments/${secondAppointment.id}/reschedule`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: patient.cookie,
          "X-CSRF-Token": patient.csrfToken,
        },
        body: JSON.stringify({ slotId: overlappingSlot.id }),
      },
    )
    assert.equal(reschedule.status, 409)
    assert.equal((await reschedule.json() as { error: { code: string } }).error.code, "PATIENT_APPOINTMENT_OVERLAP")

    const unchangedAppointment = await fetch(
      `${fixture.baseUrl}/api/v1/appointments/${secondAppointment.id}`,
      { headers: { Cookie: patient.cookie } },
    )
    assert.equal(unchangedAppointment.status, 200)
    assert.equal((await unchangedAppointment.json() as { id: string; startsAt: string }).startsAt, nonOverlappingSlot.startsAt)
    assert.notEqual(firstAppointment.id, secondAppointment.id)
  } finally {
    await fixture.close()
  }
})
