"use client"

import { useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "@/contexts/SessionContext"
import {
  registerPatientAccount,
  getRegistrationErrorMessage,
  registrationContinuationPath,
  safeInternalPath,
  type PatientRegistrationInput,
} from "@/lib/session"
import { ErrorState, FormField, LoadingState, Notification } from "@/components/ui/states"

const initialForm: PatientRegistrationInput = {
  firstName: "",
  lastName: "",
  nationalId: "",
  birthDate: "",
  phone: "",
  email: "",
  address: "",
  password: "",
}

export default function PatientRegistrationForm({ nextPath }: { nextPath: string }) {
  const { status } = useSession()
  const router = useRouter()
  const [form, setForm] = useState(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [registrationRequested, setRegistrationRequested] = useState(false)

  useEffect(() => {
    if (status === "authenticated") router.replace(safeInternalPath(nextPath))
  }, [status, nextPath, router])

  function updateField<K extends keyof PatientRegistrationInput>(
    field: K,
    value: PatientRegistrationInput[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(null)
    try {
      await registerPatientAccount({
        ...form,
        email: form.email.trim(),
        ...(form.address?.trim() ? { address: form.address.trim() } : { address: undefined }),
      }, registrationContinuationPath(nextPath))
      setRegistrationRequested(true)
      setForm(initialForm)
    } catch (requestError) {
      setError(getRegistrationErrorMessage(requestError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center p-6">
      <section className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <div className="mb-7">
          <h1 className="text-xl font-semibold text-slate-900">Crear cuenta de paciente</h1>
          <p className="mt-1 text-sm text-slate-600">
            Completá tus datos. Te enviaremos un enlace para verificar tu email.
          </p>
        </div>

        {status === "loading" || status === "authenticated" ? (
          <LoadingState label={status === "authenticated" ? "Redirigiendo a tu panel..." : "Comprobando la sesión..."} />
        ) : registrationRequested ? (
          <div className="flex flex-col gap-5">
            <Notification>
              Si los datos pueden registrarse, recibirás instrucciones en el email indicado.
              Revisá tu bandeja de entrada y correo no deseado.
            </Notification>
            <Link
              href={`/login?next=${encodeURIComponent(safeInternalPath(nextPath))}`}
              className="rounded-xl bg-teal-700 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              Volver al inicio de sesión
            </Link>
          </div>
        ) : (
          <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
            {error && <ErrorState description={error} />}
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                id="firstName"
                label="Nombre"
                name="given-name"
                autoComplete="given-name"
                required
                maxLength={100}
                value={form.firstName}
                onChange={(event) => updateField("firstName", event.target.value)}
                disabled={submitting}
              />
              <FormField
                id="lastName"
                label="Apellido"
                name="family-name"
                autoComplete="family-name"
                required
                maxLength={100}
                value={form.lastName}
                onChange={(event) => updateField("lastName", event.target.value)}
                disabled={submitting}
              />
              <FormField
                id="nationalId"
                label="DNI"
                name="nationalId"
                inputMode="numeric"
                autoComplete="off"
                required
                minLength={5}
                maxLength={20}
                pattern="[0-9 .-]{5,20}"
                hint="Podés incluir puntos o guiones."
                value={form.nationalId}
                onChange={(event) => updateField("nationalId", event.target.value)}
                disabled={submitting}
              />
              <FormField
                id="birthDate"
                label="Fecha de nacimiento"
                name="bday"
                autoComplete="bday"
                type="date"
                required
                value={form.birthDate}
                onChange={(event) => updateField("birthDate", event.target.value)}
                disabled={submitting}
              />
              <FormField
                id="phone"
                label="Teléfono móvil"
                name="tel"
                type="tel"
                autoComplete="tel"
                required
                minLength={5}
                maxLength={20}
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                disabled={submitting}
              />
              <FormField
                id="email"
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                disabled={submitting}
              />
            </div>
            <FormField
              id="address"
              label="Domicilio (opcional)"
              name="street-address"
              autoComplete="street-address"
              maxLength={300}
              value={form.address}
              onChange={(event) => updateField("address", event.target.value)}
              disabled={submitting}
            />
            <FormField
              id="password"
              label="Contraseña"
              name="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={256}
              hint="Usá al menos 12 caracteres."
              value={form.password}
              onChange={(event) => updateField("password", event.target.value)}
              disabled={submitting}
            />
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                required
                checked={consentAccepted}
                onChange={(event) => setConsentAccepted(event.target.checked)}
                disabled={submitting}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              <span>Confirmo que los datos ingresados son correctos y solicito crear una cuenta de paciente.</span>
            </label>
            <button
              type="submit"
              disabled={submitting || !consentAccepted}
              className="rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Enviando solicitud..." : "Crear cuenta"}
            </button>
          </form>
        )}

        <p className="mt-6 text-xs leading-relaxed text-slate-500">
          ¿Ya tenés cuenta?{" "}
          <Link
            className="font-medium text-teal-800 underline underline-offset-2"
            href={`/login?next=${encodeURIComponent(safeInternalPath(nextPath))}`}
          >
            Iniciar sesión
          </Link>
        </p>
      </section>
    </div>
  )
}
