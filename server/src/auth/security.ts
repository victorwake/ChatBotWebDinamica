import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"

export type UserRole = "patient" | "doctor" | "administrative" | "administrator"

const roleAliases: Record<string, UserRole> = {
  patient: "patient",
  paciente: "patient",
  doctor: "doctor",
  medico: "doctor",
  medica: "doctor",
  administrative: "administrative",
  administrativo: "administrative",
  administrativa: "administrative",
  administrator: "administrator",
  administrador: "administrator",
}

export function normalizeRole(value: string): UserRole | undefined {
  return roleAliases[value.trim().toLocaleLowerCase("es")]
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString("hex")
}

export function createCsrfToken(secret: string, sessionToken: string): string {
  return createHmac("sha256", secret).update(`csrf:${sessionToken}`).digest("hex")
}

export function csrfTokenMatches(secret: string, sessionToken: string, candidate: string | undefined): boolean {
  if (!candidate || !/^[a-f0-9]{64}$/i.test(candidate)) return false

  const expected = Buffer.from(createCsrfToken(secret, sessionToken), "hex")
  const actual = Buffer.from(candidate, "hex")
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {}

  const cookies: Record<string, string> = {}
  for (const part of header.split(";")) {
    const separator = part.indexOf("=")
    if (separator <= 0) continue

    const name = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (!name || Object.hasOwn(cookies, name)) continue

    try {
      cookies[name] = decodeURIComponent(value)
    } catch {
      continue
    }
  }
  return cookies
}
