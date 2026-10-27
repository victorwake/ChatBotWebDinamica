"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "@/contexts/SessionContext"
import { Notification } from "@/components/ui/states"

export default function LogoutButton() {
  const { signOut } = useSession()
  const router = useRouter()
  const [error, setError] = useState(false)
  const [pending, setPending] = useState(false)

  async function handleLogout() {
    if (pending) return
    setPending(true)
    setError(false)
    try {
      await signOut()
      router.replace("/login")
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <Notification kind="error">
          No se pudo cerrar la sesión. Intentá nuevamente.
        </Notification>
      )}
      <button
        type="button"
        onClick={() => void handleLogout()}
        disabled={pending}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60"
      >
        {pending ? "Cerrando..." : "Cerrar sesión"}
      </button>
    </div>
  )
}
