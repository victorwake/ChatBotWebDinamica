import assert from "node:assert/strict"
import test from "node:test"
import { createPhase4Fixture, type TestSlot } from "./appointments-phase4-fixtures"

type Session = { cookie: string; csrfToken: string }

async function reserve(
  baseUrl: string,
  session: Session,
  slot: TestSlot,
): Promise<Response> {
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

test("patient booking blocks overlapping appointments across doctors, but not adjacent or cancelled ones", async () => {
  const fixture = await createPhase4Fixture()

  try {
    const patient = await fixture.login(fixture.patient, fixture.baseUrl)
    const administrator = await fixture.login(fixture.administrator, fixture.baseUrl)
    const firstDoctorSlots = await fixture.slots(patient.cookie)
    const otherDoctorSlots = await fixture.slotsForDoctor(patient.cookie, fixture.otherDoctorId)
    const firstSlot = firstDoctorSlots[0]
    assert.ok(firstSlot)
    const sameTimeSlot = otherDoctorSlots.find((slot) => slot.startsAt === firstSlot.startsAt)
    const adjacentSlot = otherDoctorSlots.find((slot) => slot.startsAt === firstSlot.endsAt)
    assert.ok(sameTimeSlot)
    assert.ok(adjacentSlot)

    const firstBooking = await reserve(fixture.baseUrl, patient, firstSlot)
    assert.equal(firstBooking.status, 201)
    const firstAppointment = await firstBooking.json() as { id: string }

    const pendingConflict = await reserve(fixture.baseUrl, patient, sameTimeSlot)
    assert.equal(pendingConflict.status, 409)
    assert.equal((await pendingConflict.json() as { error: { code: string } }).error.code, "PATIENT_APPOINTMENT_OVERLAP")

    const confirmation = await fetch(
      `${fixture.baseUrl}/api/v1/appointments/${firstAppointment.id}/confirm`,
      {
        method: "POST",
        headers: {
          Cookie: administrator.cookie,
          "X-CSRF-Token": administrator.csrfToken,
        },
      },
    )
    assert.equal(confirmation.status, 200)

    const confirmedConflict = await reserve(fixture.baseUrl, patient, sameTimeSlot)
    assert.equal(confirmedConflict.status, 409)
    assert.equal((await confirmedConflict.json() as { error: { code: string } }).error.code, "PATIENT_APPOINTMENT_OVERLAP")

    const adjacentBooking = await reserve(fixture.baseUrl, patient, adjacentSlot)
    assert.equal(adjacentBooking.status, 201)

    const cancellation = await fetch(
      `${fixture.baseUrl}/api/v1/appointments/${firstAppointment.id}/cancel`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: patient.cookie,
          "X-CSRF-Token": patient.csrfToken,
        },
      },
    )
    assert.equal(cancellation.status, 200)

    const cancelledSlotBooking = await reserve(fixture.baseUrl, patient, sameTimeSlot)
    assert.equal(cancelledSlotBooking.status, 201)
  } finally {
    await fixture.close()
  }
})
