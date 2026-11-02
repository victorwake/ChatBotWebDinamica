import assert from "node:assert/strict"
import test from "node:test"
import { closeServer, createPhase3Fixture } from "./phase3-fixtures"

test("public reference data exposes only active specialties and professionals", async () => {
  const fixture = await createPhase3Fixture()
  const { server, baseUrl } = await fixture.startServer()

  try {
    const anonymousResponse = await fetch(`${baseUrl}/api/v1/specialties`)
    assert.equal(anonymousResponse.status, 200)
    const anonymousSpecialties = await anonymousResponse.json() as Array<{ id: string; name: string }>
    assert.ok(anonymousSpecialties.some((specialty) =>
      specialty.id === String(fixture.specialtyId)
      && specialty.name === `Neurología Fase 3 ${fixture.suffix.slice(0, 12)}`,
    ))

    const anonymousDoctorsResponse = await fetch(
      `${baseUrl}/api/v1/doctors?specialtyId=${fixture.specialtyId}`,
    )
    assert.equal(anonymousDoctorsResponse.status, 200)
    const anonymousDoctors = await anonymousDoctorsResponse.json() as Array<{
      id: string
      displayName: string
      specialty: { id: string; name: string }
    }>
    assert.ok(anonymousDoctors.some((doctor) =>
      doctor.id === String(fixture.doctorId)
      && doctor.displayName === "Lucía Benítez"
      && doctor.specialty.name === `Neurología Fase 3 ${fixture.suffix.slice(0, 12)}`
      && !("email" in doctor)
      && !("phone" in doctor),
    ))

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
