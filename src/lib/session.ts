import { apiRequest, ApiError, ApiProtocolError } from "./api"

export type UserRole = "patient" | "doctor" | "administrative" | "administrator"

export type CurrentUser = {
  id: string
  displayName: string
  email: string
  roles: UserRole[]
  patientId?: string
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

export function getSessionErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return "La sesión no tiene permiso para consultar este recurso."
  }
  return "No se pudo comprobar la sesión. Verificá la conexión e intentá nuevamente."
}
