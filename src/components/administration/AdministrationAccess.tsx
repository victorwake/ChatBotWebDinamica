"use client"

import type { ReactNode } from "react"
import { EmptyState } from "@/components/ui/states"
import { useSession } from "@/contexts/SessionContext"

export default function AdministrationAccess({ children }: { children: ReactNode }) {
  const { user } = useSession()
  if (!user?.roles.includes("administrator")) {
    return (
      <div className="mx-auto w-full max-w-4xl flex-1 p-6">
        <EmptyState
          title="Acceso restringido"
          description="La gestión de cuentas y auditoría está disponible únicamente para el administrador del sistema."
        />
      </div>
    )
  }
  return children
}
