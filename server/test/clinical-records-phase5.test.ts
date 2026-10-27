import assert from "node:assert/strict"
import test from "node:test"
import { createConsultation, createPhase5Fixture } from "./clinical-phase5-fixtures"

test("doctor adds diagnoses, treatments and prescriptions and reads them back", async () => {
  const fixture = await createPhase5Fixture()

  try {
    const doctor = await fixture.login(fixture.doctor, fixture.baseUrl)
    const consultation = await createConsultation(
      fixture,
      doctor.cookie,
      doctor.csrfToken,
    )
    const base = `${fixture.baseUrl}/api/v1/consultations/${consultation.id}`
    const write = (path: string, body: unknown) =>
      fetch(`${base}/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: doctor.cookie,
          "X-CSRF-Token": doctor.csrfToken,
        },
        body: JSON.stringify(body),
      })

    const diagnosis = await write("diagnoses", {
      name: "Synthetic diagnosis",
      code: "Z00.0",
      diagnosisDate: new Date().toISOString().slice(0, 10),
      status: "activo",
      notes: "Synthetic diagnosis note",
      primary: true,
    })
    assert.equal(diagnosis.status, 201)

    const treatment = await write("treatments", {
      name: "Synthetic treatment",
      description: "Synthetic description",
      dose: "One unit",
      frequency: "Daily",
      route: "Oral",
      durationDays: 7,
      startDate: new Date().toISOString().slice(0, 10),
      active: true,
    })
    assert.equal(treatment.status, 201)

    const prescription = await write("prescriptions", {
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      generalInstructions: "Synthetic instructions",
      items: [{
        medicationName: "Synthetic medication",
        concentration: "10 mg",
        dose: "One tablet",
        frequency: "Daily",
        duration: "7 days",
        quantityUnits: 7,
        instructions: "Synthetic item instructions",
      }],
    })
    assert.equal(prescription.status, 201)
    const prescriptionBody = await prescription.json() as { number: string }
    assert.ok(prescriptionBody.number.length > 0)

    const detailsResponse = await fetch(base, { headers: { Cookie: doctor.cookie } })
    assert.equal(detailsResponse.status, 200)
    const details = await detailsResponse.json() as {
      diagnoses: Array<{ name: string; primary: boolean }>
      treatments: Array<{ name: string; durationDays: number }>
      prescriptions: Array<{
        number: string
        generalInstructions: string
        items: Array<{ medicationName: string; quantityUnits: number }>
      }>
    }
    assert.deepEqual(
      details.diagnoses.map((item) => [item.name, item.primary]),
      [["Synthetic diagnosis", true]],
    )
    assert.deepEqual(
      details.treatments.map((item) => [item.name, item.durationDays]),
      [["Synthetic treatment", 7]],
    )
    assert.equal(details.prescriptions.length, 1)
    assert.equal(details.prescriptions[0]?.number, prescriptionBody.number)
    assert.equal(details.prescriptions[0]?.generalInstructions, "Synthetic instructions")
    assert.equal(details.prescriptions[0]?.items[0]?.medicationName, "Synthetic medication")
    assert.equal(details.prescriptions[0]?.items[0]?.quantityUnits, 7)

    const patient = await fixture.login(fixture.patient, fixture.baseUrl)
    const patientWrite = await fetch(`${base}/treatments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: patient.cookie,
        "X-CSRF-Token": patient.csrfToken,
      },
      body: JSON.stringify({ name: "forbidden", startDate: new Date().toISOString().slice(0, 10) }),
    })
    assert.equal(patientWrite.status, 403)

    const malformedTreatment = await write("treatments", {
      name: "Invalid treatment",
      startDate: "not-a-date",
    })
    assert.equal(malformedTreatment.status, 422)
  } finally {
    await fixture.close()
  }
})
