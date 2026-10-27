import { apiRequest, ApiError, ApiProtocolError } from "./api"
import type { Page } from "./clinic"
import type { UserRole } from "./session"

export type Account = {
  id: string
  displayName: string
  email: string
  active: boolean
  roles: UserRole[]
}

export type AccountFilters = {
  search?: string
  role?: UserRole
  active?: boolean
  page?: number
  pageSize?: number
}

export type AccountUpdate = {
  active?: boolean
  roles?: UserRole[]
}

export type AuditLog = {
  id: string
  actorId: string
  action: string
  resourceType: "user"
  resourceId?: string
  occurredAt: string
}

export type AuditLogFilters = {
  actorId?: string
  action?: string
  resourceId?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

const userRoles = new Set<UserRole>([
  "patient",
  "doctor",
  "administrative",
  "administrator",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && userRoles.has(value as UserRole)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}

function isAccount(value: unknown): value is Account {
  return isRecord(value)
    && hasOnlyKeys(value, ["id", "displayName", "email", "active", "roles"])
    && typeof value.id === "string"
    && typeof value.displayName === "string"
    && typeof value.email === "string"
    && typeof value.active === "boolean"
    && Array.isArray(value.roles)
    && value.roles.every(isUserRole)
}

function isAuditLog(value: unknown): value is AuditLog {
  return isRecord(value)
    && hasOnlyKeys(value, ["id", "actorId", "action", "resourceType", "resourceId", "occurredAt"])
    && typeof value.id === "string"
    && typeof value.actorId === "string"
    && typeof value.action === "string"
    && value.resourceType === "user"
    && (value.resourceId === undefined || typeof value.resourceId === "string")
    && typeof value.occurredAt === "string"
}

function queryString(values: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") query.set(key, String(value))
  }
  const serialized = query.toString()
  return serialized ? `?${serialized}` : ""
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
    throw new ApiProtocolError("The administration API returned an invalid paginated response.")
  }
  return value as Page<T>
}

function parseObject<T>(value: unknown, predicate: (item: unknown) => item is T): T {
  if (!predicate(value)) {
    throw new ApiProtocolError("The administration API returned data that does not match the contract.")
  }
  return value
}

export function getAdministrationErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Tu sesión ya no está activa. Volvé a ingresar."
    if (error.status === 403) return "Solo el administrador del sistema puede acceder a esta sección."
    if (error.status === 404) return "La cuenta solicitada ya no existe."
    if (error.code === "SELF_ADMIN_CHANGE") return "No podés desactivar tu cuenta ni quitarte el rol de administrador."
    if (error.code === "LAST_ACTIVE_ADMINISTRATOR") return "No se puede dejar al sistema sin una cuenta administradora activa."
    if (error.code === "ACTOR_NO_LONGER_ADMIN") return "Tu cuenta ya no tiene permisos de administración. Actualizá la sesión."
    if (error.status === 409) return "El estado de la cuenta cambió. Actualizá la información e intentá nuevamente."
    if (error.status === 422) return "Los filtros o cambios enviados no son válidos."
    if (error.status === 429) return "Se alcanzó el límite de solicitudes. Esperá un momento antes de volver a intentar."
  }
  return fallback
}

export async function listAccounts(filters: AccountFilters = {}): Promise<Page<Account>> {
  return parsePage(
    await apiRequest<unknown>(`/users${queryString(filters)}`),
    isAccount,
  )
}

export async function getAccount(userId: string): Promise<Account> {
  return parseObject(
    await apiRequest<unknown>(`/users/${encodeURIComponent(userId)}`),
    isAccount,
  )
}

export async function updateAccount(userId: string, input: AccountUpdate): Promise<Account> {
  return parseObject(
    await apiRequest<unknown>(`/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
    isAccount,
  )
}

export async function listAuditLogs(filters: AuditLogFilters = {}): Promise<Page<AuditLog>> {
  return parsePage(
    await apiRequest<unknown>(`/audit-logs${queryString(filters)}`),
    isAuditLog,
  )
}
