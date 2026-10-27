import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "../src/lib/api"
import {
  addConsultationDiagnosis,
  addConsultationTreatment,
  createConsultation,
  createConsultationPrescription,
  createAppointment,
  createPatient,
  getConsultation,
  getClinicErrorMessage,
  listAppointments,
  listAvailability,
  listDoctors,
  listPatients,
  listPatientMedicalHistory,
  listConsultations,
  listSpecialties,
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

  it("loads the documented specialty and doctor references, including specialty filtering", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api/v1")
    const specialties = [{ id: "sp_2", name: "Clínica" }]
    const doctors = [{
      id: "doc_4",
      displayName: "Dra. Ejemplo",
      specialty: specialties[0],
    }]
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(specialties))
      .mockResolvedValueOnce(Response.json(doctors))
    vi.stubGlobal("fetch", fetchMock)

    await expect(listSpecialties()).resolves.toEqual(specialties)
    await expect(listDoctors("sp_2")).resolves.toEqual(doctors)

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:4000/api/v1/specialties")
    expect(fetchMock.mock.calls[1][0]).toBe("http://localhost:4000/api/v1/doctors?specialtyId=sp_2")
  })

  it("rejects malformed professional reference data", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api/v1")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([
      { id: "doc_4", displayName: "Missing specialty" },
    ])))

    await expect(listDoctors()).rejects.toThrow(/invalid doctor list/i)
  })

  it("loads authorized clinical pages and encodes medical-history filters", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api/v1")
    const consultation = {
      id: "consult_8",
      appointmentId: "apt_55",
      patient: { id: "pat_12", displayName: "Ana Ejemplo" },
      doctor: { id: "doc_4", displayName: "Dra. Ejemplo" },
      specialty: { id: "sp_2", name: "Clínica" },
      consultationDate: "2026-10-27T13:00:00.000Z",
      type: "control",
      primaryDiagnosis: "Control anual",
    }
    const page = { items: [consultation], page: 1, pageSize: 20, totalItems: 1 }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(page))
      .mockResolvedValueOnce(Response.json(page))
      .mockResolvedValueOnce(Response.json({
        ...consultation,
        diagnoses: [],
        treatments: [],
        prescriptions: [],
      }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(listConsultations({ page: 1, pageSize: 20 })).resolves.toEqual(page)
    await expect(listPatientMedicalHistory("pat/12", {
      from: "2026-01-01",
      to: "2027-01-01",
      page: 1,
      pageSize: 20,
    })).resolves.toEqual(page)
    await expect(getConsultation("consult_8")).resolves.toMatchObject({
      id: "consult_8",
      diagnoses: [],
      treatments: [],
      prescriptions: [],
    })

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:4000/api/v1/consultations?page=1&pageSize=20")
    expect(fetchMock.mock.calls[1][0]).toBe(
      "http://localhost:4000/api/v1/patients/pat%2F12/medical-history?from=2026-01-01&to=2027-01-01&page=1&pageSize=20",
    )
    expect(fetchMock.mock.calls[2][0]).toBe("http://localhost:4000/api/v1/consultations/consult_8")
  })

  it("creates clinical records and entries with CSRF and validates response shapes", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api/v1")
    const createdConsultation = {
      id: "consult_8",
      appointmentId: "apt_55",
      patient: { id: "pat_12", displayName: "Ana Ejemplo" },
      doctor: { id: "doc_4", displayName: "Dra. Ejemplo" },
      specialty: { id: "sp_2", name: "Clínica" },
      consultationDate: "2026-10-27T13:00:00.000Z",
      diagnoses: [],
      treatments: [],
      prescriptions: [],
    }
    const diagnosis = {
      id: "diag_1",
      name: "Control",
      diagnosisDate: "2026-10-27",
      primary: true,
    }
    const treatment = {
      id: "treat_1",
      name: "Reposo",
      startDate: "2026-10-27",
      active: true,
    }
    const prescription = {
      id: "rx_1",
      number: "RX-001",
      issueDate: "2026-10-27",
      validUntil: "2026-11-27",
      items: [{
        id: "item_1",
        medicationName: "Medicamento",
        dose: "1 unidad",
        frequency: "Cada 8 horas",
      }],
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ csrfToken: "c".repeat(32) }))
      .mockResolvedValueOnce(Response.json(createdConsultation, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ csrfToken: "d".repeat(32) }))
      .mockResolvedValueOnce(Response.json(diagnosis, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ csrfToken: "e".repeat(32) }))
      .mockResolvedValueOnce(Response.json(treatment, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ csrfToken: "f".repeat(32) }))
      .mockResolvedValueOnce(Response.json(prescription, { status: 201 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(createConsultation({
      appointmentId: "apt_55",
      type: "control",
      primaryDiagnosis: "Control anual",
      systolicPressure: 120,
    })).resolves.toEqual(createdConsultation)
    await expect(addConsultationDiagnosis("consult_8", diagnosis)).resolves.toEqual(diagnosis)
    await expect(addConsultationTreatment("consult_8", treatment)).resolves.toEqual(treatment)
    await expect(createConsultationPrescription("consult_8", {
      validUntil: "2026-11-27",
      items: [{ medicationName: "Medicamento", dose: "1 unidad", frequency: "Cada 8 horas" }],
    })).resolves.toEqual(prescription)

    expect(fetchMock.mock.calls[1][0]).toBe("http://localhost:4000/api/v1/consultations")
    expect(fetchMock.mock.calls[1][1].headers.get("X-CSRF-Token")).toBe("c".repeat(32))
    expect(fetchMock.mock.calls[3][0]).toBe("http://localhost:4000/api/v1/consultations/consult_8/diagnoses")
    expect(fetchMock.mock.calls[5][0]).toBe("http://localhost:4000/api/v1/consultations/consult_8/treatments")
    expect(fetchMock.mock.calls[7][0]).toBe("http://localhost:4000/api/v1/consultations/consult_8/prescriptions")
  })

  it("rejects clinical responses that do not match the API contract", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api/v1")
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        items: [{ id: "consult_8", patient: {} }],
        page: 1,
        pageSize: 20,
        totalItems: 1,
      }))
      .mockResolvedValueOnce(Response.json({
        id: "consult_8",
        patient: { id: "pat_12", displayName: "Ana Ejemplo" },
        doctor: { id: "doc_4", displayName: "Dra. Ejemplo" },
        specialty: { id: "sp_2", name: "Clínica" },
        consultationDate: "2026-10-27T13:00:00.000Z",
      }))
      .mockResolvedValueOnce(Response.json({
        error: {
          code: "FORBIDDEN",
          message: "No autorizado",
          requestId: "req_1",
        },
      }, { status: 403 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(listConsultations()).rejects.toThrow(/invalid paginated response/i)
    await expect(getConsultation("consult_8")).rejects.toThrow(/clinic contract/i)
    await expect(listPatientMedicalHistory("pat_12")).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" })
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
