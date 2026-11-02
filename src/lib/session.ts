import { apiRequest, ApiError, ApiProtocolError } from "./api"

export type UserRole = "patient" | "doctor" | "administrative" | "administrator"

export type CurrentUser = {
  id: string
  displayName: string
  email: string
  roles: UserRole[]
  patientId?: string
}

export type PatientRegistrationInput = {
  firstName: string
  lastName: string
  nationalId: string
  birthDate: string
  phone: string
  email: string
  address?: string
  password: string
}

export type EmailVerificationInput = {
  token: string
}

export type AcceptPatientInvitationInput = {
  token: string
  password: string
}

export type PatientRegistrationInvitationInput =
  | { patientId: string; email: string; identityConfirmed: true }
  | { patient: PatientInvitationProfileInput }

export type PatientInvitationProfileInput = {
  firstName: string
  lastName: string
  nationalId: string
  birthDate: string
  phone: string
  email: string
  address?: string
}

export type OperationAccepted = {
  message: string
}

const userRoles = new Set([
  "patient",
  "doctor",
  "administrative",
  "administrator",
])

function isCurrentUser(value: unknown): value is CurrentUser {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false

  const user = value as Record<string, unknown>
  return (
    typeof user.id === "string" &&
    typeof user.displayName === "string" &&
    typeof user.email === "string" &&
    Array.isArray(user.roles) &&
    user.roles.length > 0 &&
    user.roles.every((role) => typeof role === "string" && userRoles.has(role)) &&
    (user.patientId === undefined || typeof user.patientId === "string")
  )
}

function parseCurrentUser(value: unknown): CurrentUser {
  if (!isCurrentUser(value)) {
    throw new ApiProtocolError("The authentication API returned an invalid user profile.")
  }
  return value
}

export async function getCurrentUser(signal?: AbortSignal): Promise<CurrentUser> {
  return parseCurrentUser(
    await apiRequest<unknown>("/auth/me", { method: "GET", signal }),
  )
}

export async function signIn(email: string, password: string): Promise<CurrentUser> {
  const response = await apiRequest<unknown>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })

  return parseCurrentUser(response)
}

export async function registerPatientAccount(
  input: PatientRegistrationInput,
  continueTo?: string,
): Promise<OperationAccepted> {
  const response = await apiRequest<unknown>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ ...input, ...(continueTo ? { continueTo } : {}) }),
  })

  if (
    typeof response !== "object"
    || response === null
    || Array.isArray(response)
    || typeof (response as Record<string, unknown>).message !== "string"
  ) {
    throw new ApiProtocolError("The registration API returned an invalid response.")
  }
  return response as OperationAccepted
}

export async function invitePatientRegistration(
  input: PatientRegistrationInvitationInput,
): Promise<OperationAccepted> {
  const response = await apiRequest<unknown>("/auth/registration-invitations", {
    method: "POST",
    body: JSON.stringify(input),
  })

  if (
    typeof response !== "object"
    || response === null
    || Array.isArray(response)
    || typeof (response as Record<string, unknown>).message !== "string"
  ) {
    throw new ApiProtocolError("The invitation API returned an invalid response.")
  }
  return response as OperationAccepted
}

export async function acceptPatientInvitation(token: string, password: string): Promise<CurrentUser> {
  return parseCurrentUser(
    await apiRequest<unknown>("/auth/accept-invitation", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),
  )
}

export async function verifyPatientEmail(token: string): Promise<CurrentUser> {
  return parseCurrentUser(
    await apiRequest<unknown>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  )
}

export async function signOut(): Promise<void> {
  await apiRequest("/auth/logout", {
    method: "POST",
    expectNoContent: true,
  })
}

export function isUnauthenticatedError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401
}

export function safeInternalPath(path: string | null | undefined, fallback = "/dashboard"): string {
  if (
    !path ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    /[\u0000-\u001f]/.test(path)
  ) {
    return fallback
  }
  return path
}

export function registrationContinuationPath(path: string): string | undefined {
  const safePath = safeInternalPath(path, "")
  if (!safePath || (!safePath.startsWith("/appointments/availability?") && safePath !== "/appointments/availability")) {
    return undefined
  }

  const query = safePath.split("?", 2)[1]
  return query && new URLSearchParams(query).has("reschedule") ? undefined : safePath
}

export function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    patient: "Paciente",
    doctor: "Profesional",
    administrative: "Administración",
    administrator: "Administrador del sistema",
  }
  return labels[role]
}

export function getSignInErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "INVALID_CREDENTIALS" || error.status === 401) {
      return "El email o la contraseña no son válidos."
    }
    if (error.code === "RATE_LIMITED" || error.status === 429) {
      return "Se alcanzó el límite de intentos. Esperá un momento antes de volver a probar."
    }
    if (error.code === "CSRF_TOKEN_INVALID" || error.status === 403) {
      return "No se pudo validar la solicitud. Actualizá la página e intentá nuevamente."
    }
  }

  return "No se pudo iniciar sesión. Revisá la conexión e intentá nuevamente."
}

export function getRegistrationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 422) return "Revisá los datos ingresados y corregí los campos indicados."
    if (error.status === 429) return "Se alcanzó el límite de solicitudes. Esperá un momento antes de volver a intentar."
    if (error.status === 503) return "El registro no está disponible temporalmente. Intentá nuevamente más tarde."
    if (error.status === 403) return "No se pudo validar la solicitud. Actualizá la página e intentá nuevamente."
  }
  return "No se pudo procesar el registro. Verificá la conexión e intentá nuevamente."
}

export function getEmailVerificationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return "El enlace no es válido, venció o ya fue utilizado. Solicitá uno nuevo."
    if (error.status === 429) return "Se alcanzó el límite de intentos. Esperá antes de volver a probar."
    if (error.status === 403) return "No se pudo validar la solicitud. Actualizá la página e intentá nuevamente."
  }
  return "No se pudo verificar el email. Revisá la conexión e intentá nuevamente."
}

export function getInvitationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return "La invitación no es válida, venció o ya fue utilizada. Pedí que te envíen una nueva."
    if (error.status === 403) return "No se pudo validar la solicitud. Actualizá la página e intentá nuevamente."
    if (error.status === 409) return "No se pudo procesar la invitación. Verificá la ficha e intentá nuevamente."
    if (error.status === 422) return "Revisá los datos ingresados y corregí los campos indicados."
    if (error.status === 429) return "Se alcanzó el límite de intentos. Esperá antes de volver a probar."
    if (error.status === 503) return "El envío de invitaciones no está disponible temporalmente."
  }
  return "No se pudo procesar la invitación. Verificá la conexión e intentá nuevamente."
}

export function getSessionErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return "La sesión no tiene permiso para consultar este recurso."
  }
  return "No se pudo comprobar la sesión. Verificá la conexión e intentá nuevamente."
}
