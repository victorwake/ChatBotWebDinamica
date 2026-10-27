import assert from "node:assert/strict"
import test from "node:test"
import { closeServer, createPhase3Fixture } from "./phase3-fixtures"

test("phase 3 reference data exposes only active specialties and professionals", async () => {
  const fixture = await createPhase3Fixture()
  const { server, baseUrl } = await fixture.startServer()

  try {
    const anonymousResponse = await fetch(`${baseUrl}/api/v1/specialties`)
    assert.equal(anonymousResponse.status, 401)

    const patientSession = await fixture.login(fixture.patient, baseUrl)
    const specialtiesResponse = await fetch(`${baseUrl}/api/v1/specialties`, {
      headers: { Cookie: patientSession.cookie },
    })
    assert.equal(specialtiesResponse.status, 200)
    const specialties = await specialtiesResponse.json() as Array<{ id: string; name: string }>
    assert.ok(specialties.some((specialty) => specialty.id === String(fixture.specialtyId)))

    const doctorsResponse = await fetch(
      `${baseUrl}/api/v1/doctors?specialtyId=${fixture.specialtyId}`,
      { headers: { Cookie: patientSession.cookie } },
    )
    assert.equal(doctorsResponse.status, 200)
    const doctors = await doctorsResponse.json() as Array<{
      id: string
      displayName: string
      specialty: { id: string; name: string }
    }>
    const fixtureDoctor = doctors.find((doctor) => doctor.id === String(fixture.doctorId))
    assert.ok(fixtureDoctor)
    assert.equal(fixtureDoctor.specialty.id, String(fixture.specialtyId))

    const invalidFilterResponse = await fetch(`${baseUrl}/api/v1/doctors?specialtyId=not-a-number`, {
      headers: { Cookie: patientSession.cookie },
    })
    assert.equal(invalidFilterResponse.status, 422)

    const doctorSession = await fixture.login(fixture.doctor, baseUrl)
    const doctorReferenceResponse = await fetch(`${baseUrl}/api/v1/doctors`, {
      headers: { Cookie: doctorSession.cookie },
    })
    assert.equal(doctorReferenceResponse.status, 200)
  } finally {
    await closeServer(server)
    await fixture.cleanup()
  }
})
