"use client"

import { useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "@/contexts/SessionContext"
import { ErrorState, FormField, LoadingState, Notification } from "@/components/ui/states"
import { acceptPatientInvitation, getInvitationErrorMessage } from "@/lib/session"

type InvitationState =
  | { status: "loading" }
  | { status: "ready"; token: string; message?: string }
  | { status: "success" }
  | { status: "error"; message: string }

export default function PatientInvitationAcceptance() {
  const { acceptAuthenticatedUser } = useSession()
  const router = useRouter()
  const [state, setState] = useState<InvitationState>({ status: "loading" })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token")
    window.history.replaceState(window.history.state, "", window.location.pathname)
    if (token) {
      void Promise.resolve().then(() => setState({ status: "ready", token }))
    } else {
      void Promise.resolve().then(() => {
        setState({
          status: "error",
          message: "El enlace no incluye una invitación. Revisá el email recibido.",
        })
      })
    }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (state.status !== "ready" || busy) return
    const data = new FormData(event.currentTarget)
    const password = String(data.get("password") ?? "")
    const confirmation = String(data.get("passwordConfirmation") ?? "")
    if (password !== confirmation) {
      setState({ ...state, message: "Las contraseñas no coinciden." })
      return
    }

    setBusy(true)
    setState({ status: "ready", token: state.token })
    try {
      const user = await acceptPatientInvitation(state.token, password)
      acceptAuthenticatedUser(user)
      setState({ status: "success" })
      router.replace("/dashboard")
    } catch (error) {
      setState({ ...state, message: getInvitationErrorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center p-6">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <h1 className="mb-2 text-xl font-semibold text-slate-900">Activar cuenta de paciente</h1>
        <p className="mb-5 text-sm text-slate-600">Elegí una contraseña para completar la activación.</p>
        {state.status === "loading" && <LoadingState label="Comprobando la invitación..." />}
        {state.status === "error" && (
          <div className="flex flex-col gap-5">
            <ErrorState description={state.message} />
            <Link className="text-sm font-medium text-teal-800 underline underline-offset-2" href="/login">
              Ir al inicio de sesión
            </Link>
          </div>
        )}
        {state.status === "success" && (
          <div className="flex flex-col gap-5">
            <Notification>La cuenta quedó activada y ya iniciaste sesión.</Notification>
            <Link href="/dashboard" className="rounded-xl bg-teal-700 px-4 py-3 text-center text-sm font-semibold text-white">
              Ir a mi panel
            </Link>
          </div>
        )}
        {state.status === "ready" && (
          <form className="flex flex-col gap-5" onSubmit={submit}>
            {state.message && <ErrorState description={state.message} />}
            <FormField
              id="password"
              label="Contraseña"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={256}
              disabled={busy}
            />
            <FormField
              id="passwordConfirmation"
              label="Repetir contraseña"
              name="passwordConfirmation"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={256}
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Activando..." : "Activar cuenta"}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}
