"use client"

import { useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "@/contexts/SessionContext"
import { getSignInErrorMessage, safeInternalPath } from "@/lib/session"
import { ErrorState, FormField, LoadingState } from "@/components/ui/states"

export default function LoginForm({ nextPath }: { nextPath: string }) {
  const { status, signIn } = useSession()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === "authenticated") router.replace(safeInternalPath(nextPath))
  }, [status, nextPath, router])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
      setPassword("")
      router.replace(safeInternalPath(nextPath))
    } catch (requestError) {
      setError(getSignInErrorMessage(requestError))
    } finally {
      setSubmitting(false)
    }
  }

  if (status === "loading") return <LoadingState label="Comprobando la sesión..." />
  if (status === "authenticated") return <LoadingState label="Redirigiendo a tu panel..." />

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center p-6">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <div className="mb-7">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-700" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Acceso al sistema</h1>
          <p className="mt-1 text-sm text-slate-600">Ingresá con la cuenta provista por el consultorio.</p>
        </div>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          {status === "error" && (
            <ErrorState description="No se pudo comprobar si ya tenés una sesión activa. Podés intentar ingresar nuevamente." />
          )}
          {error && <ErrorState description={error} />}
          <FormField
            id="email"
            label="Email"
            type="email"
            name="email"
            autoComplete="username"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={submitting}
          />
          <FormField
            id="password"
            label="Contraseña"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            maxLength={256}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={submitting}
          />
          <button
            type="submit"
            disabled={submitting || !email.trim() || !password}
            className="rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <p className="mt-6 text-xs leading-relaxed text-slate-500">
          El alta de cuentas y la recuperación de contraseña no están disponibles en esta versión.{" "}
          <Link className="font-medium text-teal-800 underline underline-offset-2" href="/">
            Volver al inicio
          </Link>
        </p>
      </section>
    </div>
  )
}
