import type { UserRole } from "./security"

export type AuthenticatedUser = {
  id: string
  databaseId: number
  displayName: string
  email: string
  roles: UserRole[]
  patientId?: string
}

export type AuthenticatedSession = {
  id: number
  csrfSecret: string
  userId: number
  expiresAt: Date
}
