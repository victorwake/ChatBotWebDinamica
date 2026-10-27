import { apiRequest, ApiError, ApiProtocolError } from "./api"

export type Page<T> = {
  items: T[]
  page: number
  pageSize: number
  totalItems: number
}

export type PatientSummary = {
  id: string
  firstName: string
  lastName: string
  phone?: string
}

export type Patient = PatientSummary & {
  nationalId: string
  birthDate?: string
  email?: string
  address?: string
}

export type PatientInput = {
  firstName: string
  lastName: string
  nationalId: string
  birthDate: string
  phone: string
  email?: string
  address?: string
}

export type PatientUpdate = {
  phone?: string
  email?: string
  address?: string
}

export type PatientCoverage = {
  id: string
  providerId: string
  providerName: string
  memberNumber: string
  relationship?: "titular" | "beneficiario" | "extension"
  holderNationalId?: string
  holderRelationship?: string
  primary: boolean
  validFrom: string
  validUntil?: string
  active: boolean
}

export type PatientCoverageInput = {
  providerId: string
  memberNumber: string
  relationship?: "titular" | "beneficiario" | "extension"
  holderNationalId?: string
  holderRelationship?: string
  primary?: boolean
  validFrom: string
  validUntil?: string
  active?: boolean
}

export type Specialty = { id: string; name: string }
export type Doctor = {
  id: string
  displayName: string
  specialty: Specialty
}

export type AvailabilitySlot = {
  id: string
  doctor: { id: string; displayName: string }
  specialty: Specialty
  startsAt: string
  endsAt: string
}

export type AppointmentStatus =
  | "requested"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show"

export type Appointment = {
  id: string
  patient: { id: string; displayName: string }
  doctor: { id: string; displayName: string }
  specialty: Specialty
  startsAt: string
  endsAt: string
  status: AppointmentStatus
  reason?: string
  createdAt: string
}

export type AppointmentFilters = {
  from?: string
  to?: string
  status?: AppointmentStatus
  page?: number
  pageSize?: number
}

export type AvailabilityFilters = {
  from: string
  to: string
  doctorId?: string
  specialtyId?: string
  page?: number
  pageSize?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || isString(value)
}

function parsePage<T>(
  value: unknown,
  isItem: (item: unknown) => item is T,
): Page<T> {
  if (
    !isRecord(value)
    || !Array.isArray(value.items)
    || !value.items.every(isItem)
    || !Number.isInteger(value.page)
    || !Number.isInteger(value.pageSize)
    || !Number.isInteger(value.totalItems)
  ) {
    throw new ApiProtocolError("The API returned an invalid paginated response.")
  }
  return value as Page<T>
}

function isPatientSummary(value: unknown): value is PatientSummary {
  return isRecord(value)
    && isString(value.id)
    && isString(value.firstName)
    && isString(value.lastName)
    && isOptionalString(value.phone)
}

function isPatient(value: unknown): value is Patient {
  return isPatientSummary(value)
    && isString((value as Record<string, unknown>).nationalId)
    && isOptionalString((value as Record<string, unknown>).birthDate)
    && isOptionalString((value as Record<string, unknown>).email)
    && isOptionalString((value as Record<string, unknown>).address)
}

function isCoverage(value: unknown): value is PatientCoverage {
  const relationship = isRecord(value) ? value.relationship : undefined
  return isRecord(value)
    && isString(value.id)
    && isString(value.providerId)
    && isString(value.providerName)
    && isString(value.memberNumber)
    && typeof value.primary === "boolean"
    && isString(value.validFrom)
    && typeof value.active === "boolean"
    && (relationship === undefined || relationship === "titular" || relationship === "beneficiario" || relationship === "extension")
    && isOptionalString(value.holderNationalId)
    && isOptionalString(value.holderRelationship)
    && isOptionalString(value.validUntil)
}

function isSpecialty(value: unknown): value is Specialty {
  return isRecord(value) && isString(value.id) && isString(value.name)
}

function isDoctor(value: unknown): value is Doctor {
  return isRecord(value)
    && isString(value.id)
    && isString(value.displayName)
    && isSpecialty(value.specialty)
}

function isAvailabilitySlot(value: unknown): value is AvailabilitySlot {
  return isRecord(value)
    && isString(value.id)
    && isRecord(value.doctor)
    && isString(value.doctor.id)
    && isString(value.doctor.displayName)
    && isSpecialty(value.specialty)
    && isString(value.startsAt)
    && isString(value.endsAt)
}

const appointmentStatuses = new Set<AppointmentStatus>([
  "requested",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
])

function isAppointment(value: unknown): value is Appointment {
  return isRecord(value)
    && isString(value.id)
    && isRecord(value.patient)
    && isString(value.patient.id)
    && isString(value.patient.displayName)
    && isRecord(value.doctor)
    && isString(value.doctor.id)
    && isString(value.doctor.displayName)
    && isSpecialty(value.specialty)
    && isString(value.startsAt)
    && isString(value.endsAt)
    && isString(value.status)
    && appointmentStatuses.has(value.status as AppointmentStatus)
    && isOptionalString(value.reason)
    && isString(value.createdAt)
}

function parseObject<T>(value: unknown, predicate: (item: unknown) => item is T): T {
  if (!predicate(value)) {
    throw new ApiProtocolError("The API returned data that does not match the clinic contract.")
  }
  return value
}

function queryString(values: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") query.set(key, String(value))
  }
  const serialized = query.toString()
  return serialized ? `?${serialized}` : ""
}

export function getClinicErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Tu sesión ya no está activa. Volvé a ingresar."
    if (error.status === 403) return "Tu perfil no tiene permiso para realizar esta operación."
    if (error.status === 404) return "El registro solicitado ya no está disponible."
    if (error.status === 409) return "El estado cambió o el horario ya no está disponible. Actualizá los datos e intentá nuevamente."
    if (error.status === 422) return "Revisá los datos ingresados y corregí los campos indicados."
    if (error.status === 429) return "Se alcanzó el límite de solicitudes. Esperá un momento antes de volver a intentar."
  }
  return fallback
}

export async function listPatients(filters: {
  search?: string
  page?: number
  pageSize?: number
} = {}): Promise<Page<PatientSummary>> {
  const response = await apiRequest<unknown>(`/patients${queryString(filters)}`)
  return parsePage(response, isPatientSummary)
}

export async function createPatient(input: PatientInput): Promise<Patient> {
  return parseObject(await apiRequest<unknown>("/patients", {
    method: "POST",
    body: JSON.stringify(input),
  }), isPatient)
}

export async function getPatient(patientId: string): Promise<Patient> {
  return parseObject(await apiRequest<unknown>(`/patients/${encodeURIComponent(patientId)}`), isPatient)
}

export async function updatePatient(patientId: string, input: PatientUpdate): Promise<Patient> {
  return parseObject(await apiRequest<unknown>(`/patients/${encodeURIComponent(patientId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }), isPatient)
}

export async function listPatientCoverages(patientId: string): Promise<PatientCoverage[]> {
  const response: unknown = await apiRequest<unknown>(`/patients/${encodeURIComponent(patientId)}/coverage`)
  if (!Array.isArray(response) || !response.every(isCoverage)) {
    throw new ApiProtocolError("The API returned an invalid patient coverage list.")
  }
  return response
}

export async function addPatientCoverage(
  patientId: string,
  input: PatientCoverageInput,
): Promise<PatientCoverage> {
  return parseObject(await apiRequest<unknown>(
    `/patients/${encodeURIComponent(patientId)}/coverage`,
    { method: "POST", body: JSON.stringify(input) },
  ), isCoverage)
}

export async function updatePatientCoverage(
  patientId: string,
  coverageId: string,
  input: PatientCoverageInput,
): Promise<PatientCoverage> {
  return parseObject(await apiRequest<unknown>(
    `/patients/${encodeURIComponent(patientId)}/coverage/${encodeURIComponent(coverageId)}`,
    { method: "PUT", body: JSON.stringify(input) },
  ), isCoverage)
}

export async function listSpecialties(): Promise<Specialty[]> {
  const response: unknown = await apiRequest<unknown>("/specialties")
  if (!Array.isArray(response) || !response.every(isSpecialty)) {
    throw new ApiProtocolError("The API returned an invalid specialty list.")
  }
  return response
}

export async function listDoctors(specialtyId?: string): Promise<Doctor[]> {
  const response: unknown = await apiRequest<unknown>(
    `/doctors${queryString({ specialtyId })}`,
  )
  if (!Array.isArray(response) || !response.every(isDoctor)) {
    throw new ApiProtocolError("The API returned an invalid doctor list.")
  }
  return response
}

export async function listAvailability(filters: AvailabilityFilters): Promise<Page<AvailabilitySlot>> {
  return parsePage(
    await apiRequest<unknown>(`/appointments/availability${queryString(filters)}`),
    isAvailabilitySlot,
  )
}

export async function listAppointments(filters: AppointmentFilters = {}): Promise<Page<Appointment>> {
  return parsePage(
    await apiRequest<unknown>(`/appointments${queryString(filters)}`),
    isAppointment,
  )
}

export async function createAppointment(input: {
  slotId: string
  patientId?: string
  reason?: string
}): Promise<Appointment> {
  return parseObject(await apiRequest<unknown>("/appointments", {
    method: "POST",
    body: JSON.stringify(input),
  }), isAppointment)
}

export async function getAppointment(appointmentId: string): Promise<Appointment> {
  return parseObject(
    await apiRequest<unknown>(`/appointments/${encodeURIComponent(appointmentId)}`),
    isAppointment,
  )
}

export async function confirmAppointment(appointmentId: string): Promise<Appointment> {
  return parseObject(await apiRequest<unknown>(
    `/appointments/${encodeURIComponent(appointmentId)}/confirm`,
    { method: "POST" },
  ), isAppointment)
}

export async function cancelAppointment(
  appointmentId: string,
  reason?: string,
): Promise<Appointment> {
  return parseObject(await apiRequest<unknown>(
    `/appointments/${encodeURIComponent(appointmentId)}/cancel`,
    { method: "POST", body: reason ? JSON.stringify({ reason }) : undefined },
  ), isAppointment)
}

export async function rescheduleAppointment(
  appointmentId: string,
  input: { slotId: string; reason?: string },
): Promise<Appointment> {
  return parseObject(await apiRequest<unknown>(
    `/appointments/${encodeURIComponent(appointmentId)}/reschedule`,
    { method: "PATCH", body: JSON.stringify(input) },
  ), isAppointment)
}
