import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "../src/lib/api"
import {
  createAppointment,
  createPatient,
  getClinicErrorMessage,
  listAppointments,
  listAvailability,
  listPatients,
} from "../src/lib/clinic"

const patientSummary = {
  id: "pat_12",
  firstName: "Ana",
  lastName: "Ejemplo",
  phone: "+54 11 5555-0101",
}

const appointment = {
  id: "apt_55",
  patient: { id: "pat_12", displayName: "Ana Ejemplo" },
  doctor: { id: "doc_4", displayName: "Dra. Ejemplo" },
  specialty: { id: "sp_2", name: "Clínica" },
  startsAt: "2026-11-02T13:00:00.000Z",
  endsAt: "2026-11-02T13:30:00.000Z",
  status: "requested",
  reason: "Control",
  createdAt: "2026-10-27T13:00:00.000Z",
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("clinic API contract", () => {
  it("uses the versioned patient list route and validates pagination", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api/v1")
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      items: [patientSummary],
      page: 2,
      pageSize: 20,
      totalItems: 21,
    }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(listPatients({ search: "Ana Ejemplo", page: 2, pageSize: 20 })).resolves.toEqual({
      items: [patientSummary],
      page: 2,
      pageSize: 20,
      totalItems: 21,
    })
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:4000/api/v1/patients?search=Ana+Ejemplo&page=2&pageSize=20",
    )
    expect(fetchMock.mock.calls[0][1].credentials).toBe("include")
  })

  it("rejects malformed patient-list responses instead of presenting empty data", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api/v1")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      items: [{ id: "p1", firstName: "Missing surname" }],
      page: 1,
      pageSize: 20,
      totalItems: 1,
    })))

    await expect(listPatients()).rejects.toThrow(/invalid paginated response/i)
  })

  it("sends a fresh CSRF token before creating a patient", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api/v1")
    const createdPatient = { ...patientSummary, nationalId: "12345678", birthDate: "1990-01-15" }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ csrfToken: "c".repeat(32) }))
      .mockResolvedValueOnce(Response.json(createdPatient, { status: 201 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(createPatient({
      firstName: "Ana",
      lastName: "Ejemplo",
      nationalId: "12345678",
      birthDate: "1990-01-15",
      phone: "+54 11 5555-0101",
    })).resolves.toEqual(createdPatient)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe("http://localhost:4000/api/v1/patients")
    expect(fetchMock.mock.calls[1][1].method).toBe("POST")
    expect(fetchMock.mock.calls[1][1].headers.get("X-CSRF-Token")).toBe("c".repeat(32))
  })

  it("queries availability with offset-bearing dates and reads appointment pages", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api/v1")
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        items: [{
          id: "slot_9",
          doctor: { id: "doc_4", displayName: "Dra. Ejemplo" },
          specialty: { id: "sp_2", name: "Clínica" },
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
        }],
        page: 1,
        pageSize: 50,
        totalItems: 1,
      }))
      .mockResolvedValueOnce(Response.json({
        items: [appointment],
        page: 1,
        pageSize: 20,
        totalItems: 1,
      }))
    vi.stubGlobal("fetch", fetchMock)

    await listAvailability({
      from: "2026-11-02T00:00:00-03:00",
      to: "2026-11-09T00:00:00-03:00",
      specialtyId: "sp_2",
    })
    await expect(listAppointments({ status: "requested", page: 1 })).resolves.toMatchObject({
      items: [appointment],
      totalItems: 1,
    })

    expect(fetchMock.mock.calls[0][0]).toContain("/appointments/availability?from=")
    expect(fetchMock.mock.calls[0][0]).toContain("specialtyId=sp_2")
    expect(fetchMock.mock.calls[1][0]).toBe(
      "http://localhost:4000/api/v1/appointments?status=requested&page=1",
    )
  })

  it("creates an appointment with CSRF and leaves the server response authoritative", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api/v1")
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ csrfToken: "c".repeat(32) }))
      .mockResolvedValueOnce(Response.json(appointment, { status: 201 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(createAppointment({
      slotId: "slot_9",
      patientId: "pat_12",
      reason: "Control",
    })).resolves.toEqual(appointment)

    expect(fetchMock.mock.calls[1][0]).toBe("http://localhost:4000/api/v1/appointments")
    expect(fetchMock.mock.calls[1][1].method).toBe("POST")
    expect(fetchMock.mock.calls[1][1].headers.get("X-CSRF-Token")).toBe("c".repeat(32))
    expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify({
      slotId: "slot_9",
      patientId: "pat_12",
      reason: "Control",
    }))
  })

  it("explains booking conflicts without treating a stale slot as reserved", () => {
    expect(getClinicErrorMessage(
      new ApiError(409, "SLOT_UNAVAILABLE", "slot taken"),
      "No se pudo reservar.",
    )).toMatch(/horario ya no está disponible/i)
  })
})
