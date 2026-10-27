import assert from "node:assert/strict"
import test from "node:test"
import { createConsultation, createPhase5Fixture } from "./clinical-phase5-fixtures"

test("medical history is limited to the patient and a treating doctor, not administration", async () => {
  const fixture = await createPhase5Fixture()

  try {
    const doctor = await fixture.login(fixture.doctor, fixture.baseUrl)
    const consultation = await createConsultation(
      fixture,
      doctor.cookie,
      doctor.csrfToken,
    )
    const patientId = String(fixture.patient.patientId)
    const otherPatientId = String(fixture.otherPatient.patientId)

    const doctorHistory = await fetch(
      `${fixture.baseUrl}/api/v1/patients/${patientId}/medical-history`,
      { headers: { Cookie: doctor.cookie } },
    )
    assert.equal(doctorHistory.status, 200)
    const doctorPage = await doctorHistory.json() as { items: Array<{ id: string }> }
    assert.ok(doctorPage.items.some((item) => item.id === consultation.id))

    const unrelatedPatient = await fetch(
      `${fixture.baseUrl}/api/v1/patients/${otherPatientId}/medical-history`,
      { headers: { Cookie: doctor.cookie } },
    )
    assert.equal(unrelatedPatient.status, 404)

    const patient = await fixture.login(fixture.patient, fixture.baseUrl)
    const ownHistory = await fetch(
      `${fixture.baseUrl}/api/v1/patients/${patientId}/medical-history?page=1&pageSize=10`,
      { headers: { Cookie: patient.cookie } },
    )
    assert.equal(ownHistory.status, 200)
    const patientPage = await ownHistory.json() as { items: Array<{ id: string }> }
    assert.ok(patientPage.items.some((item) => item.id === consultation.id))

    const otherHistory = await fetch(
      `${fixture.baseUrl}/api/v1/patients/${otherPatientId}/medical-history`,
      { headers: { Cookie: patient.cookie } },
    )
    assert.equal(otherHistory.status, 403)

    const administrator = await fixture.login(fixture.administrator, fixture.baseUrl)
    const adminHistory = await fetch(
      `${fixture.baseUrl}/api/v1/patients/${patientId}/medical-history`,
      { headers: { Cookie: administrator.cookie } },
    )
    assert.equal(adminHistory.status, 403)

    const doctorList = await fetch(`${fixture.baseUrl}/api/v1/consultations?page=1&pageSize=10`, {
      headers: { Cookie: doctor.cookie },
    })
    assert.equal(doctorList.status, 200)
    const doctorListBody = await doctorList.json() as { items: Array<{ id: string }> }
    assert.ok(doctorListBody.items.some((item) => item.id === consultation.id))
  } finally {
    await fixture.close()
  }
})
