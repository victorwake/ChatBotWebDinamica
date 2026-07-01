import { mockPatients, type Patient } from "@/data/mockPatients"

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"

async function fetchOrFallback<T>(url: string, mockData: T): Promise<T> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) })
    if (!response.ok) return mockData
    return await response.json()
  } catch {
    return mockData
  }
}

export async function fetchPatients(): Promise<Patient[]> {
  return fetchOrFallback(`${BASE_URL}/patients`, mockPatients)
}

export async function fetchPatientById(id: string): Promise<Patient | null> {
  try {
    const response = await fetch(`${BASE_URL}/patients/${id}`, { signal: AbortSignal.timeout(3000) })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return mockPatients.find((p) => p.id === id) ?? null
  }
}

type LoginPayload = { email: string; password: string }
type LoginResult = { id: string; name: string; email: string } | null

export async function login(payload: LoginPayload): Promise<LoginResult> {
  try {
    const response = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

type AppointmentPayload = { patientId: string; date: string; time: string; reason?: string }
type AppointmentResult = { id: string; patientId: string; date: string; time: string; reason: string }

export async function createAppointment(payload: AppointmentPayload): Promise<AppointmentResult | null> {
  try {
    const response = await fetch(`${BASE_URL}/appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

export async function fetchAppointments(): Promise<AppointmentResult[]> {
  try {
    const response = await fetch(`${BASE_URL}/appointments`, { signal: AbortSignal.timeout(3000) })
    if (!response.ok) return []
    return await response.json()
  } catch {
    return []
  }
}
