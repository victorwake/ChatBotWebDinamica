import assert from "node:assert/strict"
import test from "node:test"
import { createPhase4Fixture } from "./appointments-phase4-fixtures"

test("concurrent reservations for one slot produce exactly one booking", async () => {
  const fixture = await createPhase4Fixture()

  try {
    const patient = await fixture.login(fixture.patient, fixture.baseUrl)
    const otherPatient = await fixture.login(fixture.otherPatient, fixture.baseUrl)
    const slots = await fixture.slots(patient.cookie)
    const slot = slots[0]
    assert.ok(slot)

    const reserve = (session: typeof patient, patientId: string | undefined) =>
      fetch(`${fixture.baseUrl}/api/v1/appointments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: session.cookie,
          "X-CSRF-Token": session.csrfToken,
        },
        body: JSON.stringify({
          slotId: slot.id,
          ...(patientId ? { patientId } : {}),
        }),
      })

    const responses = await Promise.all([
      reserve(patient, undefined),
      reserve(otherPatient, undefined),
    ])
    const statuses = responses.map((response) => response.status).sort((a, b) => a - b)
    assert.deepEqual(statuses, [201, 409])
    const conflictResponse = responses.find((response) => response.status === 409)
    assert.ok(conflictResponse)
    assert.equal((await conflictResponse.json() as { error: { code: string } }).error.code, "SLOT_UNAVAILABLE")

    const refreshedSlots = await fixture.slots(patient.cookie)
    assert.equal(refreshedSlots.some((item) => item.id === slot.id), false)
  } finally {
    await fixture.close()
  }
})
