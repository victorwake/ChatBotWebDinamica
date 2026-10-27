"use client"

import { useEffect, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ErrorState, LoadingState } from "@/components/ui/states"
import { useSession } from "@/contexts/SessionContext"
import { getSessionErrorMessage } from "@/lib/session"

export default function AuthenticatedGuard({ children }: { children: ReactNode }) {
  const { status, error, refresh } = useSession()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (status === "unauthenticated") {
      const next = encodeURIComponent(pathname)
      router.replace(`/login?next=${next}`)
    }
  }, [status, pathname, router])

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 items-center p-6">
        <LoadingState label="Comprobando la sesión..." />
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 items-center p-6">
        <ErrorState description={getSessionErrorMessage(error)} onRetry={() => void refresh()} />
      </div>
    )
  }

  return children
}
