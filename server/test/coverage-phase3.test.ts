import assert from "node:assert/strict"
import test from "node:test"
import { closeServer, createPhase3Fixture } from "./phase3-fixtures"

test("phase 3 coverage can be added, read and updated by the owner only", async () => {
  const fixture = await createPhase3Fixture()
  const { server, baseUrl } = await fixture.startServer()

  try {
    const anonymousResponse = await fetch(
      `${baseUrl}/api/v1/patients/${fixture.patient.patientId}/coverage`,
    )
    assert.equal(anonymousResponse.status, 401)

    const patientSession = await fixture.login(fixture.patient, baseUrl)
    const input = {
      providerId: String(fixture.providerId),
      memberNumber: `MEM-${fixture.suffix.slice(0, 14)}`,
      relationship: "titular",
      primary: true,
      validFrom: "2026-01-01",
      active: true,
    }
    const createResponse = await fetch(
      `${baseUrl}/api/v1/patients/${fixture.patient.patientId}/coverage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: patientSession.cookie,
          "X-CSRF-Token": patientSession.csrfToken,
        },
        body: JSON.stringify(input),
      },
    )
    assert.equal(createResponse.status, 201)
    const created = await createResponse.json() as { id: string; memberNumber: string }
    assert.equal(created.memberNumber, input.memberNumber)

    const invalidRangeResponse = await fetch(
      `${baseUrl}/api/v1/patients/${fixture.patient.patientId}/coverage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: patientSession.cookie,
          "X-CSRF-Token": patientSession.csrfToken,
        },
        body: JSON.stringify({ ...input, memberNumber: `${input.memberNumber}-invalid`, validUntil: "2025-12-31" }),
      },
    )
    assert.equal(invalidRangeResponse.status, 422)

    const unavailableProviderResponse = await fetch(
      `${baseUrl}/api/v1/patients/${fixture.patient.patientId}/coverage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: patientSession.cookie,
          "X-CSRF-Token": patientSession.csrfToken,
        },
        body: JSON.stringify({ ...input, providerId: "999999999" }),
      },
    )
    assert.equal(unavailableProviderResponse.status, 422)

    const secondPrimaryResponse = await fetch(
      `${baseUrl}/api/v1/patients/${fixture.patient.patientId}/coverage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: patientSession.cookie,
          "X-CSRF-Token": patientSession.csrfToken,
        },
        body: JSON.stringify({ ...input, memberNumber: `${input.memberNumber}-2` }),
      },
    )
    assert.equal(secondPrimaryResponse.status, 409)

    const listResponse = await fetch(
      `${baseUrl}/api/v1/patients/${fixture.patient.patientId}/coverage`,
      { headers: { Cookie: patientSession.cookie } },
    )
    assert.equal(listResponse.status, 200)
    const coverages = await listResponse.json() as Array<{ id: string; providerName: string }>
    assert.ok(coverages.some((coverage) => coverage.id === created.id))
    assert.ok(coverages[0]?.providerName.includes("Fase 3"))

    const updateResponse = await fetch(
      `${baseUrl}/api/v1/patients/${fixture.patient.patientId}/coverage/${created.id}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: patientSession.cookie,
          "X-CSRF-Token": patientSession.csrfToken,
        },
        body: JSON.stringify({ ...input, memberNumber: `${input.memberNumber}-updated`, primary: false }),
      },
    )
    assert.equal(updateResponse.status, 200)
    assert.equal(
      (await updateResponse.json() as { memberNumber: string }).memberNumber,
      `${input.memberNumber}-updated`,
    )

    const otherPatientSession = await fixture.login(fixture.otherPatient, baseUrl)
    const forbiddenResponse = await fetch(
      `${baseUrl}/api/v1/patients/${fixture.patient.patientId}/coverage`,
      { headers: { Cookie: otherPatientSession.cookie } },
    )
    assert.equal(forbiddenResponse.status, 403)

    const doctorSession = await fixture.login(fixture.doctor, baseUrl)
    const doctorForbiddenResponse = await fetch(
      `${baseUrl}/api/v1/patients/${fixture.patient.patientId}/coverage`,
      { headers: { Cookie: doctorSession.cookie } },
    )
    assert.equal(doctorForbiddenResponse.status, 403)

    const administratorSession = await fixture.login(fixture.administrator, baseUrl)
    const adminReadResponse = await fetch(
      `${baseUrl}/api/v1/patients/${fixture.patient.patientId}/coverage`,
      { headers: { Cookie: administratorSession.cookie } },
    )
    assert.equal(adminReadResponse.status, 200)
  } finally {
    await closeServer(server)
    await fixture.cleanup()
  }
})
