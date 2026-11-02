"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "@/contexts/SessionContext"
import { getEmailVerificationErrorMessage, safeInternalPath, verifyPatientEmail } from "@/lib/session"
import { ErrorState, LoadingState, Notification } from "@/components/ui/states"

type VerificationState =
  | { status: "loading" }
  | { status: "success" }
  | { status: "error"; message: string }

export default function EmailVerification() {
  const { acceptAuthenticatedUser } = useSession()
  const router = useRouter()
  const started = useRef(false)
  const [state, setState] = useState<VerificationState>({ status: "loading" })

  useEffect(() => {
    if (started.current) return
    started.current = true

    const token = new URLSearchParams(window.location.hash.slice(1)).get("token")
    const nextPath = safeInternalPath(new URLSearchParams(window.location.search).get("next"))
    window.history.replaceState(window.history.state, "", window.location.pathname)
    if (!token) {
      void Promise.resolve().then(() => {
        setState({
          status: "error",
          message: "El enlace no incluye un token de verificación. Revisá el email recibido.",
        })
      })
      return
    }

    void verifyPatientEmail(token)
      .then((user) => {
        acceptAuthenticatedUser(user)
        setState({ status: "success" })
        if (nextPath !== "/dashboard") router.replace(nextPath)
      })
      .catch((error: unknown) => {
        setState({ status: "error", message: getEmailVerificationErrorMessage(error) })
      })
  }, [acceptAuthenticatedUser, router])

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center p-6">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <h1 className="mb-5 text-xl font-semibold text-slate-900">Verificación de email</h1>
        {state.status === "loading" && <LoadingState label="Verificando el enlace..." />}
        {state.status === "error" && (
          <div className="flex flex-col gap-5">
            <ErrorState description={state.message} />
            <Link className="text-sm font-medium text-teal-800 underline underline-offset-2" href="/register">
              Volver al registro
            </Link>
          </div>
        )}
        {state.status === "success" && (
          <div className="flex flex-col gap-5">
            <Notification>Tu email quedó verificado y ya iniciaste sesión como paciente.</Notification>
            <Link
              href="/dashboard"
              className="rounded-xl bg-teal-700 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              Ir a mi panel
            </Link>
          </div>
        )}
      </section>
    </div>
  )
}
