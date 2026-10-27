import type { ReactNode } from "react"
import ApplicationShell from "@/components/layout/ApplicationShell"
import AuthenticatedGuard from "@/components/auth/AuthenticatedGuard"

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return (
    <AuthenticatedGuard>
      <ApplicationShell>{children}</ApplicationShell>
    </AuthenticatedGuard>
  )
}
